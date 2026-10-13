"""Boards with draws, stand-alone draws, assent records and the command line, with fictitious data."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import pytest

from pv_verify import chain, draws, methods
from pv_verify.board import verify_assent, verify_board, verify_tie_draw
from pv_verify.canonical import hj_hex, load_json
from pv_verify.cli import main

CASES = Path(__file__).resolve().parents[3] / "spec" / "cases"
VOTING_ID = "11" * 16  # differs from the corpus boards
SEED = bytes(range(32))
ROUND = 33026212
SIGNATURE = "9791658769c0476a1f88d6b08366504f486ce0a883e4fb17e19b666f39e34f138bb4c480d84f57378d5e9d6694996f92"
PROFILE = {"type": "profile", "version": 1, "id": "example", "profile_version": "0.1.0", "timezone": "Europe/Madrid", "assent_min_days": 2}


def ts(unix: int) -> str:
    return datetime.fromtimestamp(unix, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def draw_doc(items: list[str], purpose: str, rule: dict[str, Any] | None) -> dict[str, Any]:
    rnd = draws.randomness(bytes.fromhex(SIGNATURE))
    sigma = draws.sigma(SEED, rnd)
    d = {
        "commitment": draws.commitment(SEED).hex(),
        "drand": {"chain_hash": draws.CHAIN_HASH, "randomness": rnd.hex(), "round": ROUND, "signature": SIGNATURE},
        "items": items,
        "order": draws.shuffle(sigma, items)[0],
        "purpose": purpose,
        "seed": SEED.hex(),
        "sigma": sigma.hex(),
        "type": "draw",
        "version": 1,
        "voting_id": VOTING_ID,
    }
    if rule is not None:
        d["round_rule"] = rule
    return d


def board_fixture(timing: str) -> dict[str, Any]:
    """A manual limited-vote voting with a real drand round for its tie-break order."""
    params = {"candidates": ["c1", "c2", "c3"], "seats": 2, "minimum": 0}
    tallies = {
        "c1": {"marked": 3, "unmarked": 3},
        "c2": {"marked": 2, "unmarked": 4},
        "c3": {"marked": 0, "unmarked": 6},
        "status": {"abstain": 0, "blank": 1, "marked": 5},
    }
    counters = {"issued": None, "members": 12, "present": 6, "proxies": 1, "received": 6, "rights": 7, "session_members": 12, "session_present": 6}
    rules = {
        "electorate_filter": None, "method": "limited_vote", "min_attendance": None, "mode": "manual", "params": params,
        "profile": {"hash": hj_hex(PROFILE), "id": "example", "version": "0.1.0"}, "quorum": [1, 3], "timing": timing,
    }
    t = draws.round_time(ROUND)
    closed_at = ts(t if timing == "final_link" else t - 30)
    rule = None if timing == "final_link" else {"after": closed_at, "delay_seconds": 30}
    draw = draw_doc(params["candidates"], "tiebreak_order", rule)
    candidates = {"candidates": [{"id": c, "name": "Example " + c} for c in params["candidates"]], "posts": [], "type": "candidates", "version": 1, "voting_id": VOTING_ID}
    quorum = {"forced": None, **methods.quorum(rules, counters)}
    board = {
        "candidates_hash": hj_hex(candidates), "cells": None, "closed_at": closed_at, "counters": counters, "draw": draw, "key": None,
        "opened_at": "2023-01-01T00:00:00Z", "participation": None, "quorum": quorum,
        "result": methods.limited_vote(params, tallies, draw["order"]), "roll_call_hash": None, "rules": rules,
        "rules_hash": hj_hex(rules), "status": "closed", "tallies": tallies, "title": "Example committee", "type": "board",
        "version": 1, "voting_id": VOTING_ID,
    }
    opening = {
        "closes_at": closed_at if timing == "final_link" else None, "draw_commitment": draw["commitment"],
        "draw_round": ROUND if timing == "final_link" else None, "key": None, "opened_at": board["opened_at"], "quorum": quorum,
        "rules": rules, "rules_hash": board["rules_hash"], "title": board["title"], "type": "opening", "version": 1, "voting_id": VOTING_ID,
    }
    return {"opening": opening, "board": board, "candidates": candidates}


def verify(f: dict[str, Any]) -> dict[str, Any]:
    return verify_board(f["opening"], f["board"], chain.build([f["board"]]), f["candidates"])


@pytest.mark.parametrize("timing", ["final_link", "live"])
def test_board_with_draw(timing: str) -> None:
    f = board_fixture(timing)
    assert verify(f) == {"valid": True, "result": f["board"]["result"]}


def set_signature(f: dict[str, Any]) -> None:
    # A valid-looking but wrong signature: same randomness check is kept consistent.
    d = f["board"]["draw"]
    sig = bytes.fromhex(SIGNATURE)
    sig = sig[:-1] + bytes([sig[-1] ^ 1])
    d["drand"]["signature"] = sig.hex()
    d["drand"]["randomness"] = draws.randomness(sig).hex()


MUTATIONS: list[tuple[str, str, Callable[[dict[str, Any]], None], str]] = [
    ("seed", "final_link", lambda f: f["board"]["draw"].update(seed="ff" * 32), "commitment_mismatch"),
    ("forged beacon", "final_link", set_signature, "drand_invalid"),
    ("round", "final_link", lambda f: (f["board"]["draw"]["drand"].update(round=ROUND + 1), f["opening"].update(draw_round=ROUND + 1)), "drand_invalid"),
    ("round rule in final link", "final_link", lambda f: f["board"]["draw"].update(round_rule={"after": f["board"]["closed_at"], "delay_seconds": 30}), "round_mismatch"),
    ("live delay", "live", lambda f: f["board"]["draw"]["round_rule"].update(delay_seconds=0), "round_mismatch"),
    ("order", "live", lambda f: f["board"]["draw"]["order"].reverse(), "order_mismatch"),
    ("tallies", "live", lambda f: f["board"]["tallies"]["c3"].update(marked=1, unmarked=5), "tallies_mismatch"),
    ("candidates", "live", lambda f: f["candidates"].update(title="x"), "candidates_mismatch"),
    ("closing time", "final_link", lambda f: f["opening"].update(closes_at="2027-01-01T00:00:00Z"), "opening_mismatch"),
    ("float", "live", lambda f: f["board"]["counters"].update(members=1.5), "format_invalid"),
]


@pytest.mark.parametrize("name,timing,mutate,error", MUTATIONS, ids=[m[0] for m in MUTATIONS])
def test_board_mutations(name: str, timing: str, mutate: Callable[[dict[str, Any]], None], error: str) -> None:
    f = board_fixture(timing)
    mutate(f)
    try:
        records = chain.build([f["board"]])
    except ValueError:
        records = []
    assert verify_board(f["opening"], f["board"], records, f["candidates"]) == {"error": error}


def tie_draw() -> dict[str, Any]:
    after = ts(draws.round_time(ROUND) - 30)
    d = draw_doc(["c1", "c2"], "tie", {"after": after, "delay_seconds": 30})
    d["spots"] = 1
    d["winners"] = d["order"][:1]
    return d


def test_tie_draw() -> None:
    assert verify_tie_draw(tie_draw()) is None
    d = tie_draw()
    d["winners"] = d["order"][1:]
    assert verify_tie_draw(d) == "order_mismatch"
    d = tie_draw()
    d["round_rule"]["after"] = ts(draws.round_time(ROUND))
    assert verify_tie_draw(d) == "round_mismatch"
    d = tie_draw()
    d["spots"] = 2
    assert verify_tie_draw(d) == "format_invalid"


def assent_record(**changes: Any) -> dict[str, Any]:
    a = {
        "closes_at": "2027-03-12T22:59:00Z", "electorate_filter": None, "members": 45, "objections": 0, "outcome": "approved",
        "profile": {"hash": hj_hex(PROFILE), "id": "example", "version": "0.1.0"}, "sent_at": "2027-03-10T09:00:00Z",
        "title": "Example proposal", "type": "assent", "version": 1, "voting_id": VOTING_ID,
    }
    return {**a, **changes}


def test_assent() -> None:
    assert verify_assent(assent_record()) is None
    assert verify_assent(assent_record(), PROFILE) is None
    assert verify_assent(assent_record(closes_at="2027-03-12T22:58:59Z"), PROFILE) == "deadline_too_early"
    assert verify_assent(assent_record(objections=1)) == "result_mismatch"
    assert verify_assent(assent_record(), {**PROFILE, "assent_min_days": 3}) == "profile_mismatch"
    assert verify_assent(assent_record(members=-1)) == "format_invalid"


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def repository(tmp: Path) -> Path:
    case = load_json((CASES / "board-001.json").read_text(encoding="utf-8"))["input"]
    f = board_fixture("live")
    docs = {
        "2027/03/10/a.board.json": case["board"],
        "2027/03/10/b.board.json": f["board"],
        "2027/03/10/tie.draw.json": tie_draw(),
        "2027/03/12/assent.assent.json": assent_record(),
    }
    for p, d in docs.items():
        write(tmp / p, d)
    write(tmp / "2027/03/10/a.opening.json", case["opening"])
    write(tmp / "2027/03/10/b.opening.json", f["opening"])
    write(tmp / "2027/03/10/b.candidates.json", f["candidates"])
    records = [{**r, "path": p} for r, p in zip(chain.build(list(docs.values())), docs)]
    write(tmp / "chain.json", {"records": records, "type": "chain", "version": 1})
    write(tmp / "receipt.json", case["receipt"])
    write(tmp / "profile.json", PROFILE)
    return tmp


def test_cli_accepts_a_valid_repository(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = repository(tmp_path)
    code = main([str(root), "--receipt", str(root / "receipt.json"), "--profile", str(root / "profile.json")])
    out = capsys.readouterr().out
    assert code == 0, out
    assert "receipt_checked" in out and "manual_count" in out and "all checks passed" in out


def test_cli_reports_a_tampered_document(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = repository(tmp_path)
    path = root / "2027/03/10/b.board.json"
    board = load_json(path.read_text(encoding="utf-8"))
    board["title"] = "Changed"
    write(path, board)
    assert main([str(root), "--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["chain"] == {"error": "chain_mismatch", "index": 1}
    assert report["documents"][1]["error"] == "chain_mismatch"


def test_cli_without_chain(tmp_path: Path) -> None:
    assert main([str(tmp_path)]) == 2


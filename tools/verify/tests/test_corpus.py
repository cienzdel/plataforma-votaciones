"""The shared case corpus of spec/cases (spec/cases/README.md)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from pv_verify import assent, chain, draws, methods
from pv_verify.board import cell_id, verify_board
from pv_verify.canonical import hj_hex, jcs, jcs_text, load_json, unhex

CASES = Path(__file__).resolve().parents[3] / "spec" / "cases"
ALL = [load_json(p.read_text(encoding="utf-8")) for p in sorted(CASES.glob("*.json"))]


def run_draw(i: dict[str, Any]) -> dict[str, Any]:
    seed = unhex(i["seed"])
    if draws.commitment(seed).hex() != i["commitment"]:
        return {"error": "commitment_mismatch"}
    signature = unhex(i["drand"]["signature"])
    assert draws.verify_beacon(i["drand"]["round"], signature)
    rnd = draws.randomness(signature)
    sigma = draws.sigma(seed, rnd)
    order, blocks = draws.shuffle(sigma, i["items"])
    return {"randomness": rnd.hex(), "sigma": sigma.hex(), "order": order, "prng_blocks": blocks}


def run(kind: str, i: dict[str, Any]) -> Any:
    if kind == "quorum":
        return methods.quorum(i["rules"], i["counters"])
    if kind == "method":
        r = methods.result(i["method"], i["params"], i["tallies"], i["counters"], i.get("tiebreak_order"))
        if "vacancy" in i:
            r["vacancy_next"] = methods.vacancy_next(r, i["vacancy"]["post"], i["vacancy"]["leaving"])
        return r
    if kind == "round":
        r = draws.round_at(i["t"])
        return {"round": r, "round_time": draws.round_time(r)}
    if kind in ("draw", "draw_error"):
        return run_draw(i)
    if kind == "cell_id":
        return {"id": cell_id(unhex(i["s"]), unhex(i["voting_id"]), i["cell"]).hex()}
    if kind == "jcs":
        return {"jcs_text": jcs_text(i["value"]), "jcs_utf8_hex": jcs(i["value"]).hex(), "hash": hj_hex(i["value"])}
    if kind == "chain":
        return {"records": chain.build(i["documents"])}
    if kind == "chain_error":
        return chain.first_error(i["records"], i["documents"])
    if kind == "assent_deadline":
        return {"min_closes_at": assent.min_close(i["sent_at"], i["timezone"], i["min_days"])}
    if kind == "assent_outcome":
        return {"outcome": assent.outcome(i["objections_at_close"])}
    if kind in ("board", "board_error"):
        return verify_board(i["opening"], i["board"], i["chain"]["records"], i.get("candidates"), i.get("receipt"))
    raise AssertionError(f"unknown kind {kind}")


def test_corpus_size() -> None:
    assert len(ALL) == 87


@pytest.mark.parametrize("case", ALL, ids=[c["id"] for c in ALL])
def test_case(case: dict[str, Any]) -> None:
    assert run(case["kind"], case["input"]) == case["expected"]

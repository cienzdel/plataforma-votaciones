"""Verification of a whole data repository (spec/formats.md §9.1, spec/protocol.md §10.2)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from . import chain
from .board import receipt_valid, verify_assent, verify_board, verify_tie_draw
from .canonical import ProfileError, hj_hex, load_json

BOARD_SUFFIX = ".board.json"
# A record path is relative to the root, in plain segments: no absolute, drive, UNC or ".." form.
SAFE_PATH = re.compile(r"[0-9A-Za-z_-]+(?:/[0-9A-Za-z_-]+)*(?:\.[0-9A-Za-z_-]+)*\.json")
MAX_BYTES = 16 * 1024 * 1024


class Unreadable(ValueError):
    pass


def _load(root: Path, relative: str) -> Any:
    """Reads a JSON document that must be a regular file under the root, at most MAX_BYTES."""
    if type(relative) is not str or not SAFE_PATH.fullmatch(relative):
        raise Unreadable("path_invalid")
    base = root.resolve()
    path = (base / relative).resolve()
    if not path.is_relative_to(base) or not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise Unreadable("document_unreadable")
    try:
        return load_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, ProfileError):
        raise Unreadable("document_unreadable") from None


def _try_load(root: Path, relative: str) -> Any:
    try:
        return _load(root, relative)
    except Unreadable:
        return None


def _sibling(relative: str, suffix: str) -> str:
    return relative[: -len(BOARD_SUFFIX)] + suffix


def verify_repository(root: Path, profiles: list[Any] = (), receipts: list[Any] = ()) -> dict[str, Any]:
    """
    Verifies the chain file and every document in it, and every receipt given. Returns
    {"chain": error or None, "documents": [{"path", "type", "error", "notes"}], "receipts": [{"voting_id", "error"}]}.
    """
    by_hash = {hj_hex(p): p for p in profiles}
    chain_file = _load(root, "chain.json")
    records = chain_file["records"]
    entries: list[dict[str, Any]] = []
    documents: list[Any] = []
    boards: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}  # voting_id -> (board, entry), earlier in the chain
    draws: set[str] = set()
    for record in records:
        relative = record.get("path") if type(record) is dict else None
        entry: dict[str, Any] = {"path": relative if type(relative) is str else "?", "type": None, "error": None, "notes": []}
        entries.append(entry)
        try:
            doc = _load(root, relative)
        except Unreadable as e:
            entry["error"] = str(e)
            documents.append(None)
            continue
        documents.append(doc)
        kind = doc.get("type") if type(doc) is dict else None
        entry["type"] = kind if kind in ("board", "draw", "assent") else None
        if kind == "board":
            voting_id = doc.get("voting_id")
            entry.update(_board(root, relative, doc, records, by_hash))
            if type(voting_id) is str:
                # A board is published once (spec/formats.md §9.1).
                if voting_id in boards:
                    entry["error"] = entry["error"] or "duplicate_voting"
                else:
                    boards[voting_id] = (doc, entry)
        elif kind == "draw":
            entry["error"] = verify_tie_draw(doc) or _tie_binding(doc, boards, draws) or _tie_commitment(root, relative, doc, entry)
        elif kind == "assent":
            profile = by_hash.get(doc.get("profile", {}).get("hash")) if type(doc.get("profile")) is dict else None
            entry["error"] = verify_assent(doc, profile)
            if profile is None:
                entry["notes"].append("deadline_not_checked")
        else:
            entry["error"] = "format_invalid"
    return {
        "chain": chain.first_error(records, [d for d in documents]),
        "documents": entries,
        "receipts": [_receipt(r, boards) for r in receipts],
    }


def _tie_binding(d: dict[str, Any], boards: dict[str, tuple[dict[str, Any], dict[str, Any]]], draws: set[str]) -> str | None:
    """A stand-alone tie draw follows its board, which ended in draw_required over the same items (spec/draws.md §6)."""
    voting_id = d.get("voting_id")
    board = boards.get(voting_id) if type(voting_id) is str else None
    result = board[0].get("result") if board is not None else None
    ok = board is not None and board[1]["error"] is None and voting_id not in draws and type(result) is dict
    ok = ok and result.get("outcome") == "draw_required" and sorted(d["items"]) == sorted(result.get("tied") or []) and d["spots"] == result.get("spots")
    if type(voting_id) is str:
        draws.add(voting_id)
    return None if ok else "draw_unbound"


def _tie_commitment(root: Path, relative: str, d: dict[str, Any], entry: dict[str, Any]) -> str | None:
    """The commitment and round published before the round existed, if found, are the draw's (spec/draws.md §6)."""
    if not relative.endswith(".tie.draw.json"):
        return None
    notice = _try_load(root, relative[: -len(".draw.json")] + ".commitment.json")
    if notice is None:
        entry["notes"].append("commitment_not_published")
        return None
    expected = {"after": d["round_rule"]["after"], "commitment": d["commitment"], "items": d["items"], "round": d["drand"]["round"], "spots": d["spots"], "type": "draw_commitment", "version": 1, "voting_id": d["voting_id"]}
    return None if notice == expected else "draw_unbound"


def _profile_error(rules: dict[str, Any], profile: dict[str, Any]) -> bool:
    """The rules must be the profile's: its id and version, a quorum it defines and one of its degrees."""
    degrees = {d.get("id") for d in profile.get("degrees", []) if type(d) is dict}
    ref = rules["profile"]
    return not (
        ref.get("id") == profile.get("id")
        and ref.get("version") == profile.get("profile_version")
        and rules["quorum"] in profile.get("quorum", [])
        and (rules["electorate_filter"] is None or rules["electorate_filter"] in degrees)
    )


def _board(root: Path, relative: str, board: Any, records: list[Any], by_hash: dict[str, Any]) -> dict[str, Any]:
    notes = []
    opening = _try_load(root, _sibling(relative, ".opening.json"))
    candidates = None
    if board.get("candidates_hash") is not None:
        candidates = _try_load(root, _sibling(relative, ".candidates.json"))
        if candidates is None:
            notes.append("candidates_table_missing")
    roll_call = None
    if board.get("roll_call_hash") is not None:
        roll_call = _try_load(root, _sibling(relative, ".roll_call.json"))
        if roll_call is None:
            notes.append("roll_call_missing")
    report = verify_board(opening, board, records, candidates, roll_call=roll_call)
    if "error" in report:
        return {"error": report["error"], "notes": notes}
    rules = board["rules"]
    # The profile the rules name: given with --profile, or published in the repository.
    profile_hash = rules["profile"].get("hash")
    profile = by_hash.get(profile_hash)
    if profile is None and type(profile_hash) is str and re.fullmatch(r"[0-9a-f]{64}", profile_hash):
        published = _try_load(root, f"profiles/{profile_hash}.json")
        profile = published if published is not None and hj_hex(published) == profile_hash else None
    if profile is None:
        notes.append("profile_not_checked")
    elif _profile_error(rules, profile):
        return {"error": "profile_mismatch", "notes": notes}
    if board["quorum"]["forced"] is not None:
        notes.append("forced_opening")
    if rules["mode"] in ("manual", "paper"):
        notes.append("manual_count")
    if board["status"] == "annulled":
        notes.append("annulled")
    return {"error": None, "notes": notes}


def _receipt(r: Any, boards: dict[str, tuple[dict[str, Any], dict[str, Any]]]) -> dict[str, Any]:
    """Every receipt gets its own verdict; one that matches no verified board fails (spec/protocol.md §10.1)."""
    voting_id = r.get("voting_id") if type(r) is dict else None
    found = boards.get(voting_id) if type(voting_id) is str else None
    if found is None:
        error = "receipt_unmatched"
    elif found[1]["error"] is not None:
        error = "board_invalid"
    else:
        board = found[0]
        error = None if board["rules"]["mode"] == "secret" and receipt_valid(board, r) else "receipt_mismatch"
    return {"voting_id": voting_id if type(voting_id) is str else "?", "error": error}

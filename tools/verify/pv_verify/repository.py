"""Verification of a whole data repository (spec/formats.md §9.1)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from . import chain
from .board import verify_assent, verify_board, verify_tie_draw
from .canonical import ProfileError, hj_hex, load_json

BOARD_SUFFIX = ".board.json"


def _load(path: Path) -> Any:
    return load_json(path.read_text(encoding="utf-8"))


def _sibling(path: Path, suffix: str) -> Path:
    return path.with_name(path.name[: -len(BOARD_SUFFIX)] + suffix)


def verify_repository(root: Path, profiles: list[Any] = (), receipts: list[Any] = ()) -> dict[str, Any]:
    """
    Verifies the chain file and every document in it. Returns {"chain": error or None,
    "documents": [{"path", "type", "error", "notes"}]}.
    """
    by_hash = {hj_hex(p): p for p in profiles}
    chain_file = _load(root / "chain.json")
    records = chain_file["records"]
    entries = []
    documents = []
    for record in records:
        path = root / record["path"]
        entry: dict[str, Any] = {"path": record["path"], "type": None, "error": None, "notes": []}
        entries.append(entry)
        try:
            doc = _load(path)
        except (OSError, ValueError, ProfileError):
            entry["error"] = "document_unreadable"
            documents.append(None)
            continue
        documents.append(doc)
        kind = doc.get("type") if type(doc) is dict else None
        entry["type"] = kind
        if kind == "board":
            entry.update(_board(path, doc, records, receipts))
        elif kind == "draw":
            entry["error"] = verify_tie_draw(doc)
        elif kind == "assent":
            profile = by_hash.get(doc.get("profile", {}).get("hash"))
            entry["error"] = verify_assent(doc, profile)
            if profile is None:
                entry["notes"].append("deadline_not_checked")
        else:
            entry["error"] = "format_invalid"
    return {"chain": chain.first_error(records, [d for d in documents]), "documents": entries}


def _board(path: Path, board: Any, records: list[Any], receipts: list[Any]) -> dict[str, Any]:
    notes = []
    try:
        opening = _load(_sibling(path, ".opening.json"))
    except (OSError, ValueError, ProfileError):
        opening = None
    candidates = None
    if board.get("candidates_hash") is not None:
        try:
            candidates = _load(_sibling(path, ".candidates.json"))
        except (OSError, ValueError, ProfileError):
            notes.append("candidates_table_missing")
    if board.get("roll_call_hash") is not None:
        try:
            if hj_hex(_load(_sibling(path, ".roll_call.json"))) != board["roll_call_hash"]:
                return {"error": "roll_call_mismatch", "notes": notes}
        except (OSError, ValueError, ProfileError):
            notes.append("roll_call_missing")
    receipt = next((r for r in receipts if type(r) is dict and r.get("voting_id") == board.get("voting_id")), None)
    report = verify_board(opening, board, records, candidates, receipt)
    if "error" not in report:
        rules = board["rules"]
        if board["quorum"]["forced"] is not None:
            notes.append("forced_opening")
        if rules["mode"] in ("manual", "paper"):
            notes.append("manual_count")
        if board["status"] == "annulled":
            notes.append("annulled")
        if receipt is not None:
            notes.append("receipt_checked")
    return {"error": report.get("error"), "notes": notes}

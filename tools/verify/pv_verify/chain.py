"""Hash chain (spec/formats.md §9)."""

from __future__ import annotations

from typing import Any

from .canonical import hj_hex

GENESIS_PREV = "0" * 64


def record_hash(board: str, prev: str) -> str:
    return hj_hex({"board": board, "prev": prev})


def build(documents: list[Any]) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for d in documents:
        prev = records[-1]["record_hash"] if records else GENESIS_PREV
        board = hj_hex(d)
        records.append({"board": board, "prev": prev, "record_hash": record_hash(board, prev)})
    return records


def first_error(records: list[dict[str, Any]], documents: list[Any] | None = None) -> dict[str, Any] | None:
    """
    The first broken record, as {"error", "index"}, or None. Within a record the document hash is
    checked first, then `prev`, then `record_hash`.
    """
    if documents is not None and len(documents) != len(records):
        return {"error": "chain_mismatch", "index": min(len(documents), len(records))}
    for i, r in enumerate(records):
        if documents is not None and r.get("board") != hj_hex(documents[i]):
            return {"error": "chain_mismatch", "index": i}
        if r.get("prev") != (records[i - 1].get("record_hash") if i else GENESIS_PREV):
            return {"error": "prev_mismatch", "index": i}
        if r.get("record_hash") != record_hash(r.get("board"), r.get("prev")):
            return {"error": "chain_mismatch", "index": i}
    return None

"""Command line: python -m pv_verify <data repository> [--profile FILE]... [--receipt FILE]... [--json]."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .canonical import load_json
from .repository import verify_repository


def shown(text: str) -> str:
    """Published data printed as text: control and non-printable characters are escaped, so that a
    document cannot forge or hide a line of the report."""
    return "".join(c if c.isprintable() else json.dumps(c)[1:-1] for c in text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pv_verify", description="Independent verifier of the voting platform's data repository.")
    parser.add_argument("repository", type=Path, help="folder with chain.json and the published documents")
    parser.add_argument("--profile", type=Path, action="append", default=[], help="profile document, to check rules and assent deadlines")
    parser.add_argument("--receipt", type=Path, action="append", default=[], help="a voter's receipt, to check that the vote was counted")
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    args = parser.parse_args(argv)

    read = lambda p: load_json(p.read_text(encoding="utf-8"))  # noqa: E731
    try:
        report = verify_repository(args.repository, [read(p) for p in args.profile], [read(p) for p in args.receipt])
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(f"cannot read the repository: {shown(str(e))}", file=sys.stderr)
        return 2

    failed = report["chain"] is not None or any(d["error"] for d in report["documents"]) or any(r["error"] for r in report["receipts"])
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for d in report["documents"]:
            status = "ERROR " + d["error"] if d["error"] else "ok"
            notes = f" ({', '.join(d['notes'])})" if d["notes"] else ""
            print(f"{status:30} {d['type'] or '?':8} {shown(d['path'])}{notes}")
        for i, r in enumerate(report["receipts"], 1):
            print(f"receipt {i}: " + (f"ERROR {r['error']}" if r["error"] else "ok, the vote is on the board") + f" (voting {shown(r['voting_id'])})")
        chain = report["chain"]
        print("chain: " + ("ok" if chain is None else f"ERROR {chain['error']} at record {chain['index']}"))
        print("RESULT: " + ("FAILED" if failed else "all checks passed"))
    return 1 if failed else 0

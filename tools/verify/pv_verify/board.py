"""Universal verification of boards, draws and assent records (spec/protocol.md §10)."""

from __future__ import annotations

from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from . import assent, chain, draws, methods
from .canonical import H, ProfileError, hj_hex, is_hex, jcs_text, same, tag, unhex
from .methods import SpecError, is_count, is_fraction, is_id, require

BOARD_MEMBERS = {
    "candidates_hash", "cells", "closed_at", "counters", "draw", "key", "opened_at", "participation", "quorum",
    "result", "roll_call_hash", "rules", "rules_hash", "status", "tallies", "title", "type", "version", "voting_id",
}
RULES_MEMBERS = {"electorate_filter", "method", "min_attendance", "mode", "params", "profile", "quorum", "timing"}
COUNTERS = {"issued", "members", "present", "proxies", "received", "rights", "session_members", "session_present"}
DRAW_MEMBERS = {"commitment", "drand", "items", "order", "purpose", "seed", "sigma", "type", "version", "voting_id"}
MODES = ("secret", "roll_call", "manual", "paper")
PSS = padding.PSS(mgf=padding.MGF1(hashes.SHA384()), salt_length=48)


class Failure(Exception):
    """A failed check, with its error code (spec/cases/README.md)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def check(condition: bool, code: str) -> None:
    if not condition:
        raise Failure(code)


def cell_id(s: bytes, voting_id: bytes, cell: str) -> bytes:
    """id_c = H(tag("pv/cell/v1") ‖ s ‖ voting_id ‖ utf8(c)) (spec/formats.md §2.4)."""
    return H(tag("pv/cell/v1"), s, voting_id, cell.encode("utf-8"))


def load_key(public_key: str) -> rsa.RSAPublicKey | None:
    """An rsaEncryption SPKI with a 3072-bit modulus and exponent 65537, in canonical DER."""
    try:
        der = unhex(public_key)
        key = serialization.load_der_public_key(der)
    except ValueError:
        return None
    canonical = isinstance(key, rsa.RSAPublicKey) and key.public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    ) == der
    if not canonical or key.key_size != 3072 or key.public_numbers().e != 65537:
        return None
    return key


def signature_valid(key: rsa.RSAPublicKey, token: bytes, sig: bytes) -> bool:
    try:
        key.verify(sig, token, PSS, hashes.SHA384())
        return True
    except InvalidSignature:
        return False


# --- format (step 1)


def _members(v: Any, names: set[str]) -> bool:
    return type(v) is dict and set(v) == names


def _pairs(v: Any, a: int, b: int | None) -> bool:
    return type(v) is list and all(
        type(p) is list and len(p) == 2 and is_hex(p[0], a) and (type(p[1]) is str if b is None else is_hex(p[1], b)) for p in v
    )


def _threshold(v: Any) -> bool:
    return _members(v, {"met", "required"}) and is_count(v["required"]) and type(v["met"]) is bool


def _reason(v: Any) -> bool:
    return _members(v, {"reason"}) and type(v["reason"]) is str


def check_draw_format(d: Any, purpose: str) -> None:
    require(type(d) is dict, "draw")
    extra = {"round_rule"} if "round_rule" in d else set()
    if purpose == "tie":
        extra |= {"spots", "winners"}
    require(_members(d, DRAW_MEMBERS | extra) and d["type"] == "draw" and d["version"] == 1 and d["purpose"] == purpose, "draw")
    require(all(is_hex(d[k], 32) for k in ("commitment", "seed", "sigma")) and is_hex(d["voting_id"], 16), "draw hashes")
    require(type(d["items"]) is list and type(d["order"]) is list and all(type(x) is str for x in d["items"]), "draw items")
    r = d["drand"]
    require(_members(r, {"chain_hash", "randomness", "round", "signature"}), "drand")
    require(is_hex(r["chain_hash"], 32) and is_hex(r["randomness"], 32) and is_hex(r["signature"], 48) and is_count(r["round"]), "drand")
    rule = d.get("round_rule")
    require(rule is None or (_members(rule, {"after", "delay_seconds"}) and assent.is_timestamp(rule["after"]) and is_count(rule["delay_seconds"])), "round rule")


def check_format(b: Any) -> tuple[dict[str, tuple[str, ...]], list[str]]:
    """Step 1. Returns the cell spec and the candidate ids. Raises SpecError or ProfileError."""
    jcs_text(b)
    require(type(b) is dict and b.get("type") == "board" and b.get("version") == 1, "board")
    annulled = b.get("status") == "annulled"
    require(b.get("status") in ("closed", "annulled"), "status")
    require(set(b) == BOARD_MEMBERS | ({"annulment"} if annulled else set()), "board members")
    require(is_hex(b["voting_id"], 16) and type(b["title"]) is str and is_hex(b["rules_hash"], 32), "board ids")
    require(_reason(b["annulment"]) and b["result"] is None if annulled else type(b["result"]) is dict, "result")
    require(assent.is_timestamp(b["opened_at"]) and assent.is_timestamp(b["closed_at"]), "times")

    r = b["rules"]
    require(_members(r, RULES_MEMBERS) and r["method"] in methods.METHODS and r["mode"] in MODES, "rules")
    require(r["timing"] in ("live", "final_link") and is_fraction(r["quorum"]), "rules")
    require(r["min_attendance"] is None or is_fraction(r["min_attendance"]), "min_attendance")
    require(r["electorate_filter"] is None or is_id(r["electorate_filter"]), "electorate_filter")
    p = r["profile"]
    require(_members(p, {"hash", "id", "version"}) and is_hex(p["hash"], 32) and type(p["id"]) is str and type(p["version"]) is str, "profile")
    candidates = methods.candidates_of(r["method"], r["params"])
    spec = methods.cell_spec(r["method"], r["params"])

    secret = r["mode"] == "secret"
    c = b["counters"]
    require(_members(c, COUNTERS) and all(is_count(c[n]) or (n == "issued" and not secret and c[n] is None) for n in COUNTERS), "counters")
    q = b["quorum"]
    require(_members(q, {"forced", "met", "min_attendance", "required"}) and _threshold({"met": q["met"], "required": q["required"]}), "quorum")
    require((q["min_attendance"] is None or _threshold(q["min_attendance"])) and (q["forced"] is None or _reason(q["forced"])), "quorum")
    if secret:
        k = b["key"]
        require(_members(k, {"fingerprint", "public_key"}) and is_hex(k["public_key"]) and is_hex(k["fingerprint"], 32), "key")
        require(_pairs(b["participation"], 80, 384), "participation")
        require(type(b["cells"]) is dict and all(_pairs(v, 32, None) for v in b["cells"].values()), "cells")
    else:
        require(b["key"] is None and b["participation"] is None and b["cells"] is None, "not secret")
    t = b["tallies"]
    require(type(t) is dict and set(t) == set(spec), "tallies")
    for cell, values in spec.items():
        methods.tally(t, cell, values)
    needs = r["method"] in ("posts", "limited_vote")
    if b["draw"] is not None:
        check_draw_format(b["draw"], "tiebreak_order")
    require(b["draw"] is not None or annulled if needs else b["draw"] is None, "draw presence")
    require(b["candidates_hash"] is None if r["method"] == "yes_no" else is_hex(b["candidates_hash"], 32), "candidates_hash")
    require(is_hex(b["roll_call_hash"], 32) if r["mode"] == "roll_call" else b["roll_call_hash"] is None, "roll_call_hash")
    return spec, candidates


# --- draws (step 9 and stand-alone draws)


def check_draw(d: dict[str, Any], items: list[str], expected_round: int, check_beacon: bool = True) -> None:
    """Commitment, drand beacon, round, σ and order of a draw document."""
    check(sorted(d["items"]) == sorted(items) and len(set(items)) == len(items), "order_mismatch")
    seed = unhex(d["seed"])
    check(draws.commitment(seed).hex() == d["commitment"], "commitment_mismatch")
    r = d["drand"]
    signature = unhex(r["signature"])
    check(r["chain_hash"] == draws.CHAIN_HASH and draws.randomness(signature).hex() == r["randomness"], "drand_invalid")
    check(not check_beacon or draws.verify_beacon(r["round"], signature), "drand_invalid")
    check(r["round"] == expected_round, "round_mismatch")
    sigma = draws.sigma(seed, unhex(r["randomness"]))
    check(sigma.hex() == d["sigma"] and draws.shuffle(sigma, d["items"])[0] == d["order"], "order_mismatch")


def _live_round(rule: dict[str, Any] | None, after: str) -> int:
    check(rule is not None and rule["after"] == after and rule["delay_seconds"] == draws.LIVE_DELAY, "round_mismatch")
    return draws.round_at(assent.unix(after) + draws.LIVE_DELAY)


def verify_tie_draw(d: Any, check_beacon: bool = True) -> str | None:
    """A stand-alone draw for an in-room tie (spec/draws.md §6). Returns the error code or None."""
    try:
        try:
            jcs_text(d)
            check_draw_format(d, "tie")
            spots, rule = d["spots"], d.get("round_rule")
            require(is_count(spots) and 1 <= spots < len(d["items"]) and rule is not None, "tie draw")
        except (SpecError, ProfileError, TypeError):
            raise Failure("format_invalid") from None
        expected = draws.round_at(assent.unix(rule["after"]) + rule["delay_seconds"])
        check(rule["delay_seconds"] == draws.LIVE_DELAY, "round_mismatch")
        check_draw(d, d["items"], expected, check_beacon)
        check(d["winners"] == d["order"][:spots], "order_mismatch")
    except Failure as f:
        return f.code
    return None


def verify_assent(a: Any, profile: dict[str, Any] | None = None) -> str | None:
    """An assent record (spec/formats.md §8). The deadline is checked when the profile is given."""
    names = {"closes_at", "electorate_filter", "members", "objections", "outcome", "profile", "sent_at", "title", "type", "version", "voting_id"}
    try:
        ok = _members(a, names) and a["type"] == "assent" and a["version"] == 1 and is_hex(a["voting_id"], 16)
        ok = ok and is_count(a["members"]) and is_count(a["objections"]) and assent.is_timestamp(a["sent_at"]) and assent.is_timestamp(a["closes_at"])
        if not ok:
            return "format_invalid"
        if a["outcome"] != assent.outcome(a["objections"]):
            return "result_mismatch"
        if profile is not None:
            if hj_hex(profile) != a["profile"]["hash"]:
                return "profile_mismatch"
            minimum = assent.min_close(a["sent_at"], profile["timezone"], profile["assent_min_days"])
            if assent.unix(a["closes_at"]) < assent.unix(minimum):
                return "deadline_too_early"
    except (KeyError, TypeError, ValueError):
        return "format_invalid"
    return None


# --- board


def receipt_valid(b: dict[str, Any], r: Any) -> bool:
    """Individual verification of a receipt (spec/protocol.md §10.1)."""
    try:
        vote = {k: r[k] for k in ("answers", "s", "sig", "token", "voting_id")}
        if r["type"] != "receipt" or r["voting_id"] != b["voting_id"] or hj_hex(vote) != r["ack"]:
            return False
        if [r["token"], r["sig"]] not in b["participation"]:
            return False
        s, vid = unhex(r["s"]), unhex(r["voting_id"])
        return all([cell_id(s, vid, c).hex(), v] in b["cells"].get(c, []) for c, v in r["answers"].items())
    except (KeyError, TypeError, ValueError, AttributeError, ProfileError):
        return False


def verify_board(
    opening: Any,
    board: Any,
    records: list[dict[str, Any]],
    candidates: Any = None,
    receipt: Any = None,
    check_beacon: bool = True,
) -> dict[str, Any]:
    """
    Runs the checks of spec/protocol.md §10.2 in order and returns {"valid": True, "result"} or
    {"error": code} for the first failing check, plus "universal_valid": True when only the
    receipt fails.
    """
    try:
        try:
            spec, cand_ids = check_format(board)
        except (SpecError, ProfileError):
            raise Failure("format_invalid") from None
        b = board
        r = b["rules"]
        check(hj_hex(r) == b["rules_hash"], "rules_hash_mismatch")

        # 2. Opening notice
        draw = b["draw"]
        o = opening if type(opening) is dict else {}
        ok = o.get("type") == "opening" and o.get("voting_id") == b["voting_id"]
        ok = ok and all(same(o.get(k), b[k]) for k in ("rules", "rules_hash", "key", "quorum"))
        ok = ok and o.get("draw_commitment", 0) == (draw["commitment"] if draw else None)
        if r["timing"] == "final_link":
            ok = ok and o.get("closes_at") == b["closed_at"] and o.get("draw_round", 0) == (draw["drand"]["round"] if draw else None)
        else:
            ok = ok and o.get("closes_at", 0) is None and o.get("draw_round", 0) is None
        check(ok, "opening_mismatch")

        # 3–5. Key, participation and cells
        secret = r["mode"] == "secret"
        c = b["counters"]
        if secret:
            key = load_key(b["key"]["public_key"])
            check(H(unhex(b["key"]["public_key"])).hex() == b["key"]["fingerprint"] and key is not None, "key_invalid")
            assert key is not None
            tokens = [t for t, _ in b["participation"]]
            for token, sig in b["participation"]:
                check(signature_valid(key, unhex(token), unhex(sig)), "invalid_signature")
                check(token[64:96] == b["voting_id"], "token_voting_id_mismatch")
            check(len(set(tokens)) == len(tokens), "duplicate_token")
            check(tokens == sorted(tokens), "participation_unsorted")
            cells = b["cells"]
            ok = set(cells) == set(spec)
            for cell, values in spec.items():
                ids = [i for i, _ in cells.get(cell, [])]
                ok = ok and len(ids) == len(tokens) and ids == sorted(set(ids)) and all(v in values for _, v in cells[cell])
            check(ok, "cells_invalid")

        # 6. Tallies
        if secret:
            derived = {cell: {v: sum(1 for _, x in b["cells"][cell] if x == v) for v in values} for cell, values in spec.items()}
            ok = same(derived, b["tallies"])
        else:
            ok = all(sum(t.values()) == c["received"] for t in b["tallies"].values())
        if r["method"] == "limited_vote":
            ok = ok and methods.limited_vote_consistent(r["params"], b["tallies"])
        check(ok, "tallies_mismatch")

        # 7. Counters
        ok = c["rights"] == c["present"] + c["proxies"]
        if secret:
            ok = ok and c["received"] == len(b["participation"]) and c["received"] <= c["issued"] <= c["rights"]
        else:
            ok = ok and c["received"] <= c["rights"]
        if r["electorate_filter"] is None:
            ok = ok and c["members"] == c["session_members"] and c["present"] == c["session_present"]
        check(ok, "counters_inconsistent")

        # 8. Quorum
        q = methods.quorum(r, c)
        met = q["met"] and (q["min_attendance"] is None or q["min_attendance"]["met"])
        published = {k: v for k, v in b["quorum"].items() if k != "forced"}
        check(same(published, q) and (met or b["quorum"]["forced"] is not None), "quorum_mismatch")

        # 9. Draw
        if draw is not None:
            check(draw["voting_id"] == b["voting_id"], "order_mismatch")
            if r["timing"] == "final_link":
                check("round_rule" not in draw, "round_mismatch")
                expected = draws.round_at(assent.unix(b["closed_at"]))
            else:
                expected = _live_round(draw.get("round_rule"), b["closed_at"])
            check_draw(draw, cand_ids, expected, check_beacon)

        # 10. Result
        if b["status"] == "closed":
            expected_result = methods.result(r["method"], r["params"], b["tallies"], c, draw["order"] if draw else None)
            check(same(expected_result, b["result"]), "result_mismatch")

        # 11. Candidates
        if candidates is not None:
            ok = hj_hex(candidates) == b["candidates_hash"]
            listed = {x.get("id") for x in candidates.get("candidates", [])}
            posts = {x.get("id") for x in candidates.get("posts", [])}
            ok = ok and set(cand_ids) <= listed and set(r["params"].get("posts", [])) <= posts
            check(ok, "candidates_mismatch")

        # 12. Chain
        check(any(rec.get("board") == hj_hex(b) for rec in records), "chain_mismatch")
        error = chain.first_error(records)
        if error is not None:
            raise Failure(error["error"])
    except Failure as f:
        return {"error": f.code}

    if receipt is not None and not (board["rules"]["mode"] == "secret" and receipt_valid(board, receipt)):
        return {"error": "receipt_mismatch", "universal_valid": True}
    return {"valid": True, "result": board["result"]}

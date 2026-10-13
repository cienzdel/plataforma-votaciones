"""Quorum, counting methods and ballot cells (spec/methods.md, spec/formats.md §3).

Every function raises SpecError when its input does not follow the specification.
"""

from __future__ import annotations

import re
from typing import Any

_ID = re.compile(r"[a-z][a-z0-9-]{0,31}")
RESERVED = {"for", "against", "blank", "abstain", "against_all", "marked", "unmarked", "status"}
METHODS = ("yes_no", "single_winner", "posts", "limited_vote")
YES_NO = ("for", "against", "blank", "abstain")
POSTS = ("for", "against", "abstain")
STATUS = ("marked", "blank", "abstain")
MARKS = ("marked", "unmarked")
BASES = ("cast", "present", "present_plus_proxies", "members")


class SpecError(ValueError):
    """An input that does not follow the specification."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SpecError(message)


def is_count(v: Any) -> bool:
    return type(v) is int and v >= 0


def is_fraction(f: Any) -> bool:
    return type(f) is list and len(f) == 2 and all(type(x) is int for x in f) and 0 <= f[0] <= f[1] and f[1] > 0


def is_id(v: Any) -> bool:
    return type(v) is str and _ID.fullmatch(v) is not None and v not in RESERVED


def id_list(v: Any, what: str) -> list[str]:
    require(type(v) is list and len(v) > 0 and all(is_id(x) for x in v) and len(set(v)) == len(v), f"invalid {what}")
    return v


# --- thresholds and quorum (§1)


def ceil_frac(n: int, f: list[int]) -> int:
    require(is_count(n) and is_fraction(f), "invalid fraction")
    p, q = f
    return (n * p + q - 1) // q


def meets(x: int, n: int, f: list[int]) -> bool:
    require(is_count(n) and is_fraction(f), "invalid fraction")
    return x * f[1] >= n * f[0]


def quorum(rules: dict[str, Any], counters: dict[str, Any]) -> dict[str, Any]:
    def threshold(f: list[int]) -> dict[str, Any]:
        required = ceil_frac(counters["session_members"], f)
        return {"required": required, "met": counters["session_present"] >= required}

    ma = rules.get("min_attendance")
    return {**threshold(rules["quorum"]), "min_attendance": None if ma is None else threshold(ma)}


# --- parameters


def candidates_of(method: str, params: dict[str, Any]) -> list[str]:
    """Validates the parameters of a method and returns its candidate ids."""
    require(type(params) is dict, "invalid params")
    if method == "yes_no":
        require(params.get("base") in BASES, "invalid base")
        rule = params.get("rule")
        require(rule in ("simple", "absolute") or is_fraction(rule), "invalid rule")
        return []
    if method == "single_winner":
        cands = id_list(params.get("candidates"), "candidates")
        stage = params.get("stage")
        require(stage in ("first", "qualify", "runoff"), "invalid stage")
        require(stage != "runoff" or len(cands) == 2, "a run-off has two candidates")
        if stage == "qualify":
            spots = params.get("spots")
            require(is_count(spots) and 1 <= spots < len(cands), "invalid spots")
        require(is_count(params.get("attempt")) and is_count(params.get("repetitions")), "invalid attempt")
        require(params.get("against_all_blocks") in (None, True, False), "invalid against_all_blocks")
        return cands
    if method == "posts":
        posts = id_list(params.get("posts"), "posts")
        raw = params.get("candidates")
        require(type(raw) is list and len(raw) > 0, "invalid candidates")
        for c in raw:
            require(type(c) is dict and is_id(c.get("id")), "invalid candidate")
            prefs = id_list(c.get("preferences"), "preferences")
            require(all(v in posts for v in prefs), "unknown post")
        return id_list([c["id"] for c in raw], "candidates")
    if method == "limited_vote":
        cands = id_list(params.get("candidates"), "candidates")
        seats = params.get("seats")
        require(is_count(seats) and seats >= 1, "invalid seats")
        require(is_count(params.get("minimum")), "invalid minimum")
        return cands
    raise SpecError("unknown method")


def cell_spec(method: str, params: dict[str, Any]) -> dict[str, tuple[str, ...]]:
    """Cell keys and allowed values (spec/formats.md §3)."""
    cands = candidates_of(method, params)
    if method == "yes_no":
        return {"q": YES_NO}
    if method == "single_winner":
        return {"choice": (*cands, "blank", "against_all", "abstain")}
    if method == "posts":
        return {f"{c['id']}@{v}": POSTS for c in params["candidates"] for v in c["preferences"]}
    return {"status": STATUS, **{c: MARKS for c in cands}}


def tally(tallies: dict[str, Any], cell: str, values: tuple[str, ...]) -> dict[str, int]:
    t = tallies.get(cell)
    require(type(t) is dict and set(t) == set(values) and all(is_count(x) for x in t.values()), f"invalid tally {cell}")
    return t


def order_index(order: list[str] | None, ids: list[str]) -> dict[str, int]:
    require(order is not None, "a tie-break order is required")
    require(sorted(order) == sorted(ids) and len(set(order)) == len(order), "the order is not a permutation")
    return {c: i for i, c in enumerate(order)}


# --- yes_no (§2)


def yes_no(params: dict[str, Any], tallies: dict[str, Any], c: dict[str, Any]) -> dict[str, Any]:
    candidates_of("yes_no", params)
    t = tally(tallies, "q", YES_NO)
    f, a, b = t["for"], t["against"], t["blank"]
    cast = f + a + b
    base = {"cast": cast, "present": c["present"], "present_plus_proxies": c["present"] + c["proxies"], "members": c["members"]}[
        params["base"]
    ]
    rule = params["rule"]
    if rule == "simple":
        ok = f > a
    elif rule == "absolute":
        ok = 2 * f > base
    else:
        ok = meets(f, base, rule)
    return {**t, "cast": cast, "base": base, "outcome": "approved" if ok else "rejected"}


# --- single_winner (§3)


def _select(cands: list[str], votes: dict[str, int], k: int, attempt: int, reps: int) -> dict[str, Any]:
    if len(cands) <= k:
        return {"outcome": "qualified", "qualified": list(cands)}
    ranked = sorted((votes[c] for c in cands), reverse=True)
    t = ranked[k - 1]
    if ranked[k] < t:
        return {"outcome": "qualified", "qualified": [c for c in cands if votes[c] >= t]}
    qualified = [c for c in cands if votes[c] > t]
    return {
        "outcome": "repeat" if attempt < reps else "draw_required",
        "qualified": qualified,
        "tied": [c for c in cands if votes[c] == t],
        "spots": k - len(qualified),
    }


def single_winner(params: dict[str, Any], tallies: dict[str, Any]) -> dict[str, Any]:
    cands = candidates_of("single_winner", params)
    t = tally(tallies, "choice", (*cands, "blank", "against_all", "abstain"))
    votes = {c: t[c] for c in cands}
    cast = sum(votes.values()) + t["blank"] + t["against_all"]
    res = {"cast": cast, "tallies": {k: v for k, v in t.items() if k != "abstain"}}
    stage, attempt, reps = params["stage"], params["attempt"], params["repetitions"]
    if stage == "first":
        if len(cands) == 1:
            c = cands[0]
            return {**res, "outcome": "elected", "elected": c} if votes[c] > t["against_all"] else {**res, "outcome": "vacant"}
        for c in cands:
            if 2 * votes[c] > cast:
                return {**res, "outcome": "elected", "elected": c}
        s = _select(cands, votes, 2, attempt, reps)
        if s["outcome"] == "qualified":
            s["outcome"] = "runoff"
        return {**res, **s}
    if stage == "qualify":
        return {**res, **_select(cands, votes, params["spots"], attempt, reps)}
    a, b = cands
    if params.get("against_all_blocks") is True and t["against_all"] > votes[a] and t["against_all"] > votes[b]:
        return {**res, "outcome": "vacant"}
    if votes[a] != votes[b]:
        return {**res, "outcome": "elected", "elected": a if votes[a] > votes[b] else b}
    return {**res, "outcome": "repeat" if attempt < reps else "draw_required", "qualified": [], "tied": [a, b], "spots": 1}


# --- posts (§4)


def posts(params: dict[str, Any], tallies: dict[str, Any], order: list[str] | None) -> dict[str, Any]:
    ids = candidates_of("posts", params)
    pos = order_index(order, ids)
    prefs = {c["id"]: c["preferences"] for c in params["candidates"]}

    def T(c: str, v: str) -> dict[str, int]:
        return tally(tallies, f"{c}@{v}", POSTS)

    def eligible(c: str, v: str) -> bool:
        return T(c, v)["for"] > T(c, v)["against"]

    def key(c: str, v: str) -> tuple[int, int, int]:
        return (-T(c, v)["for"], T(c, v)["against"], pos[c])

    held: dict[str, str | None] = {v: None for v in params["posts"]}
    nxt = {c: 0 for c in ids}
    free = [c for c in sorted(ids, key=pos.get) if any(eligible(c, v) for v in prefs[c])]
    while free:
        c = free.pop(0)
        while nxt[c] < len(prefs[c]) and not eligible(c, prefs[c][nxt[c]]):
            nxt[c] += 1
        if nxt[c] == len(prefs[c]):
            continue
        v = prefs[c][nxt[c]]
        nxt[c] += 1
        h = held[v]
        if h is None:
            held[v] = c
        elif key(c, v) < key(h, v):
            free.append(h)
            held[v] = c
        else:
            free.append(c)

    ranking = {}
    for v in params["posts"]:
        applied = [c for c in ids if v in prefs[c]]
        ordered = sorted(applied, key=lambda c: (not eligible(c, v), *key(c, v)))
        ranking[v] = [{"cand": c, **T(c, v), "eligible": eligible(c, v)} for c in ordered]
    holders = {c for c in held.values() if c is not None}
    return {"assignment": held, "ranking": ranking, "unassigned": [c for c in sorted(ids, key=pos.get) if c not in holders]}


def vacancy_next(result: dict[str, Any], post: str, leaving: str) -> str | None:
    """Later vacancy helper (spec/methods.md §4, informative)."""
    require(post in result["ranking"], "unknown post")
    others = {c for v, c in result["assignment"].items() if v != post and c is not None}
    for r in result["ranking"][post]:
        if r["eligible"] and r["cand"] != leaving and r["cand"] not in others:
            return r["cand"]
    return None


# --- limited_vote (§5)


def limited_vote(params: dict[str, Any], tallies: dict[str, Any], order: list[str] | None) -> dict[str, Any]:
    cands = candidates_of("limited_vote", params)
    pos = order_index(order, cands)
    m = params["seats"]
    votes = {c: tally(tallies, c, MARKS)["marked"] for c in cands}
    status = tally(tallies, "status", STATUS)
    ranked = sorted(cands, key=lambda c: (-votes[c], pos[c]))
    reaching = [c for c in ranked if votes[c] >= params["minimum"]]
    return {
        "k": max(1, m - 1),
        "ranking": [{"cand": c, "votes": votes[c]} for c in ranked],
        "elected": reaching[:m],
        "substitutes": reaching[m:],
        "vacant_seats": m - len(reaching[:m]),
        "marked_ballots": status["marked"],
        "blank": status["blank"],
        "abstain": status["abstain"],
    }


def limited_vote_consistent(params: dict[str, Any], tallies: dict[str, Any]) -> bool:
    cands = candidates_of("limited_vote", params)
    k = max(1, params["seats"] - 1)
    marked = tally(tallies, "status", STATUS)["marked"]
    votes = [tally(tallies, c, MARKS)["marked"] for c in cands]
    return all(v <= marked for v in votes) and marked <= sum(votes) <= k * marked


def result(method: str, params: dict[str, Any], tallies: dict[str, Any], counters: dict[str, Any], order: list[str] | None) -> dict[str, Any]:
    if method == "yes_no":
        return yes_no(params, tallies, counters)
    if method == "single_winner":
        return single_winner(params, tallies)
    if method == "posts":
        return posts(params, tallies, order)
    if method == "limited_vote":
        return limited_vote(params, tallies, order)
    raise SpecError("unknown method")

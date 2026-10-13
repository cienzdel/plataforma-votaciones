# Counting methods

> **Status: draft 0.1, pending review by a second person (milestone H2).** Normative. RFC 2119 key words apply as in [`formats.md`](formats.md).

Each method is a pure function from **tallies** ([`formats.md`](formats.md) §3), **counters** (§5 there), **parameters** and, where needed, a **tie-break order** to a **result** object. All arithmetic is on integers; no division is ever rounded except where a ceiling is written explicitly. The catalogue is closed ([ADR-0009](../PLAN/adr/0009-catalogo-metodos-y-perfil.md)); the interpretations behind each rule are listed in [ADR-0023](../PLAN/adr/0023-interpretaciones-reglas.md).

## 1. Common definitions

### 1.1 Fractions and thresholds

A fraction is `[p, q]` with integers `0 ≤ p ≤ q`, `q > 0`.

- `ceil_frac(n, [p, q]) = ⌈n·p / q⌉ = (n·p + q − 1) div q`, for `n ≥ 0`.
- `meets(x, n, [p, q])` ⇔ `x·q ≥ n·p` (equivalently `x ≥ ceil_frac(n, [p, q])`).

### 1.2 Quorum and minimum attendance

Checked when a voting opens, on the attendance snapshot:

- `quorum.required = ceil_frac(session_members, rules.quorum)`; `quorum.met` ⇔ `session_present ≥ quorum.required`.
- If `rules.min_attendance` is not `null`: `required = ceil_frac(session_members, rules.min_attendance)` and `met` ⇔ `session_present ≥ required`.
- Proxy votes never count towards either.
- If either is not met, the voting opens only if the officials force it, and `quorum.forced` carries the reason. The method result is computed as usual; the verifier reports the forced opening.

### 1.3 Votes cast and bases

For `yes_no`: `cast = for + against + blank`. For `single_winner`: `cast = Σ candidates + blank + against_all`. Abstentions are never cast.

The **base** of a threshold is a parameter:

| `base` | Value |
|---|---|
| `cast` | `cast` |
| `present` | `counters.present` |
| `present_plus_proxies` | `counters.present + counters.proxies` (= `counters.rights`) |
| `members` | `counters.members` |

### 1.4 Ranking with a tie-break order

A **tie-break order** is a permutation of the candidate ids produced by a draw ([`draws.md`](draws.md)); earlier means preferred. When a method sorts "by key, then by tie-break order", ties on the key are resolved by position in that order. A method that needs a tie-break order and does not have one MUST fail.

## 2. `yes_no`

**Parameters.** `base` (§1.3) and `rule`:

| `rule` | Approved if |
|---|---|
| `"simple"` | `for > against` (the base is ignored and SHOULD be `cast`) |
| `"absolute"` | `2·for > base` |
| `[p, q]` | `meets(for, base, [p, q])`, i.e. `q·for ≥ p·base` |

**Result.**

```json
{ "against": 9, "abstain": 3, "base": 24, "blank": 5, "cast": 24, "for": 10, "outcome": "approved" }
```

`outcome` is `approved` or `rejected`. A tie under `simple` is `rejected`.

Presets of the Pleno profile (informative): censure motion = `absolute` on `present_plus_proxies` with `min_attendance [1, 2]`; reform of the regulations = `[2, 3]` on `present_plus_proxies` with `min_attendance [1, 3]`. The base `present_plus_proxies` for these two is pending confirmation by the Pleno.

## 3. `single_winner`

Used for one position and, with slates as candidates, for slate elections ([`protocol.md`](protocol.md) §9 describes the sequence of votings). Elections of positions are live only.

**Parameters.**

| Parameter | Type | Meaning |
|---|---|---|
| `candidates` | array of ids | Candidates (or slates) on the ballot, in display order. |
| `stage` | string | `first`, `qualify` or `runoff`. |
| `spots` | integer | `qualify` only: how many places in the run-off are being decided. |
| `attempt` | integer | 0 for the first voting of a stage; `n` for its `n`-th repetition after a tie. |
| `repetitions` | integer | Repetitions allowed before a draw (1 in the Pleno profile). |
| `against_all_blocks` | boolean | `runoff` only: if true, the position stays vacant when `against_all` exceeds both candidates (false in the Pleno profile). |
| `subject` | string | `person` or `slate`. Informative. |

Let `votes(c)` be the tally of candidate `c`, and `n = len(candidates)`.

### 3.1 Stage `first`

1. **One candidate (`n = 1`).** `elected` if `votes(c) > against_all`; otherwise `vacant` (a tie is `vacant`).
2. **Several candidates (`n ≥ 2`).**
   1. If some `c` has `2·votes(c) > cast`, it is `elected` (at most one can).
   2. Otherwise two candidates go to a run-off: apply **select(2)** (§3.4) to all candidates.

### 3.2 Stage `qualify`

A repetition of a tie that prevented deciding who goes to the run-off. The ballot contains only the tied candidates. Apply **select(`spots`)** to them.

### 3.3 Stage `runoff`

Exactly two candidates.

1. If `against_all_blocks` and `against_all > votes(a)` and `against_all > votes(b)`: `vacant`.
2. If one has more votes: `elected`.
3. On a tie: if `attempt < repetitions`, outcome `repeat` (a new `runoff` between the same two with `attempt + 1`); otherwise `draw_required` among both for 1 spot.

### 3.4 select(k)

Sort the candidates by `votes` descending. Let `t` be the votes of the `k`-th candidate.

- If no other candidate outside the top `k` has `t` votes (that is, the `(k+1)`-th has fewer, or there are only `k`), the top `k` are `qualified`.
- Otherwise, the candidates with more than `t` votes are `qualified`; those with exactly `t` votes are `tied` and compete for `spots = k − len(qualified)`. If `attempt < repetitions`, the outcome is `repeat` (a `qualify` voting among `tied` with `attempt + 1`); otherwise `draw_required`.

Candidates with zero votes take part like any other.

### 3.5 Result

```json
{ "cast": 29, "outcome": "runoff", "qualified": ["c1", "c2"], "tallies": { "against_all": 0, "blank": 2, "c1": 12, "c2": 9, "c3": 6 } }
```

| `outcome` | Extra members |
|---|---|
| `elected` | `elected`: id |
| `vacant` | — |
| `runoff` | `qualified`: 2 ids (from `first`) |
| `qualified` | `qualified`: ids (from `qualify`) |
| `repeat` | `qualified`: ids already through (may be empty), `tied`: ids, `spots`: integer |
| `draw_required` | `qualified`, `tied`, `spots`, as above |

Lists of ids (`qualified`, `tied`) follow the order of `candidates`. Every result also carries `cast` and `tallies` (the tally of the `choice` cell without `abstain`). For `first` with `n ≥ 2`, select(2) yielding exactly two qualified gives `runoff`. A `draw_required` outcome is resolved by a stand-alone draw over `tied` ([`draws.md`](draws.md) §6), whose first `spots` ids win.

## 4. `posts` (committee posts by deferred acceptance)

All posts are voted at once. For each post, every candidate who applied to it gets `for`, `against` or `abstain` from each ballot.

**Parameters.**

| Parameter | Type | Meaning |
|---|---|---|
| `posts` | array of ids | Posts, in display order. |
| `candidates` | array of `{"id", "preferences"}` | `preferences`: the posts the candidate applied to, most preferred first. Non-empty, no repeats, all in `posts`. |

A tie-break order over all candidate ids is required.

**Definitions.** For candidate `c` and post `v` in `c`'s preferences: `for(c,v)`, `against(c,v)`, `abstain(c,v)` from the tally of cell `c@v`.

- `c` is **eligible** in `v` ⇔ `for(c,v) > against(c,v)`.
- **Ranking in `v`**: eligible candidates sorted by `for` descending, then `against` ascending, then tie-break order. `better_v(a, b)` means `a` comes before `b`.

**Algorithm** (candidate-proposing deferred acceptance):

```
for each candidate c: next[c] ← 0; held_by[v] ← none for each post v
free ← candidates with at least one eligible post, in tie-break order
while free is not empty:
    c ← first of free; remove c from free
    advance next[c] until preferences[c][next[c]] is a post where c is eligible, or the list ends
    if the list ended: continue            # c stays unassigned
    v ← preferences[c][next[c]]; next[c] ← next[c] + 1
    if held_by[v] is none:            held_by[v] ← c
    else if better_v(c, held_by[v]):  append held_by[v] to free; held_by[v] ← c
    else:                             append c to free
```

The final `held_by` is the assignment. Because the rankings are strict, the result is the candidate-optimal stable matching and does not depend on the order in which free candidates propose; processing them in tie-break order only makes the procedure reproducible step by step.

**Result.**

```json
{
  "assignment": { "comms": "c2", "sports": null },
  "ranking": {
    "comms": [ { "abstain": 1, "against": 3, "cand": "c2", "eligible": true, "for": 20 } ],
    "sports": []
  },
  "unassigned": ["c4"]
}
```

- `assignment[v]`: holder id, or `null` if the post is **vacant**.
- `ranking[v]`: every candidate who applied to `v`, eligible ones first in ranking order, then non-eligible ones by `for` descending, `against` ascending and tie-break order. This full classification is kept for later vacancies.
- `unassigned`: candidates holding no post, in tie-break order.

**Properties** (checked with property-based tests): nobody holds two posts; each post has at most one holder; every holder is eligible in their post; the assignment is stable (no candidate `c` and post `v` such that `c` is eligible in `v`, prefers `v` to their own post or holds none, and `v` is vacant or `better_v(c, held_by[v])`); the result does not depend on the order of the input arrays.

**Later vacancy** (informative helper): when the holder of `v` leaves, the post is offered to the first candidate in `ranking[v]` who is eligible, is not the outgoing holder and holds no other post at that moment. If there is none, the post stays vacant.

## 5. `limited_vote`

Several seats; each voter marks up to `k` candidates. With one seat, this is plurality voting.

**Parameters.**

| Parameter | Type | Meaning |
|---|---|---|
| `candidates` | array of ids | Candidates, in display order. |
| `seats` | integer ≥ 1 | Seats `m`. |
| `minimum` | integer ≥ 0 | Minimum votes to be elected or substitute (0 in the Pleno profile). |

`k = max(1, m − 1)`. A tie-break order over the candidates is required. Ties at any position are resolved by that order, without repeating the voting.

**Algorithm.**

1. `votes(c)` = tally of `marked` in cell `c`.
2. Sort the candidates by `votes` descending, then tie-break order.
3. Discard those with `votes < minimum`.
4. The first `m` of the remaining are `elected`; the rest are `substitutes`, in order. If fewer than `m` remain, the missing seats are `vacant_seats = m − len(elected)`.

**Result.**

```json
{
  "abstain": 2, "blank": 1, "elected": ["c1", "c3"], "k": 1, "marked_ballots": 27,
  "ranking": [ { "cand": "c1", "votes": 14 }, { "cand": "c3", "votes": 9 }, { "cand": "c2", "votes": 9 } ],
  "substitutes": ["c2"], "vacant_seats": 0
}
```

`ranking` lists every candidate in the order of step 2, including those under the minimum. `marked_ballots`, `blank` and `abstain` come from the `status` cell.

**Aggregate consistency** (verifier): for each candidate `votes(c) ≤ marked_ballots`, and `marked_ballots ≤ Σ votes ≤ k·marked_ballots`.

## 6. Degree-restricted votings

When `rules.electorate_filter` is a degree id, only members of that degree are in the electorate and only they may be candidates. A proxy counts if the **person who delegated** belongs to the degree, even if the delegate does not ([ADR-0012](../PLAN/adr/0012-delegacion-de-voto.md)). The counters `members`, `present`, `proxies` and `rights` refer to the restricted electorate; `session_members` and `session_present` (used for quorum) do not.

## 7. Assent

Not a ballot. A proposal is sent to the electorate; it is approved if nobody objects in time.

- **Minimum closing time.** Let `d` be the calendar date of `sent_at` in the profile's `timezone`. Then `closes_at` MUST be at or after 23:59:00 local time on the date `d + N` days, where `N = assent_min_days` (2 in the Pleno profile), converted to UTC. The officials MAY choose a later time.
- Members can object, and withdraw their objection, until `closes_at`. Proxies do not apply.
- `outcome = approved` if `objections = 0` at `closes_at`; otherwise `next_plenary`.
- Matters in the profile's `assent_excluded` cannot be decided by assent; the officials confirm this when creating it.

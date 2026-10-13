# Case corpus

> **Status: draft 0.1, pending review by a second person (milestone H2).**

Every file in this folder is one test case. Both the TypeScript core (`packages/core`) and the independent Python verifier (`tools/verify`) MUST produce exactly the `expected` value of every case ([ADR-0020](../../PLAN/adr/0020-pruebas-y-verificacion.md)). The `explanation` field says in plain language why the expected result is right, so that a reviewer can check each case without running anything.

## File format

```json
{
  "id": "yes_no-002",
  "kind": "method",
  "title": "Simple majority, tie",
  "explanation": "10 for and 10 against is not 'more for than against', so it is rejected.",
  "input": { "…": "…" },
  "expected": { "…": "…" }
}
```

The file name is `<id>.json`. Files are UTF-8, end with a newline and are formatted for reading; they are not canonical JSON (only the values inside are hashed when a case says so).

## Kinds

| `kind` | `input` | `expected` | Spec |
|---|---|---|---|
| `quorum` | `rules` (`quorum`, `min_attendance`), `counters` | `{required, met, min_attendance}` | [`methods.md`](../methods.md) §1.2 |
| `method` | `method`, `params`, `tallies`, `counters`, optional `tiebreak_order`, `electorate_filter`, `vacancy` (`{post, leaving}`) | The method's result object; with `vacancy`, an extra member `vacancy_next` (id or `null`) | [`methods.md`](../methods.md) §2–§5 |
| `round` | `t` (Unix seconds) | `{round, round_time}` | [`draws.md`](../draws.md) §1 |
| `draw` | `seed`, `commitment`, `drand: {round, signature}`, `items` | `{randomness, sigma, order, prng_blocks}`; `prng_blocks` is the number of hash blocks consumed | [`draws.md`](../draws.md) §2–§4 |
| `draw_error` | as `draw` | `{error}` | |
| `cell_id` | `s`, `voting_id`, `cell` | `{id}` | [`formats.md`](../formats.md) §2.4 |
| `jcs` | `value` | `{jcs_text, jcs_utf8_hex, hash}` | [`formats.md`](../formats.md) §1.3 |
| `chain` | `documents` | `{records}` | [`formats.md`](../formats.md) §9 |
| `chain_error` | `documents`, `records` | `{error, index}` | |
| `assent_deadline` | `sent_at`, `timezone`, `min_days` | `{min_closes_at}` | [`methods.md`](../methods.md) §7 |
| `assent_outcome` | `objections_at_close` | `{outcome}` | [`methods.md`](../methods.md) §7 |
| `board` | `opening`, `board`, `chain`, optional `receipt` | `{valid: true, result}` | [`protocol.md`](../protocol.md) §10 |
| `board_error` | as `board` | `{error}`; `universal_valid: true` when only the receipt check fails | |

## Error codes

When a case expects an error, `error` is the code of the **first** check that fails, in the order of [`protocol.md`](../protocol.md) §10.2. A verifier MAY report further errors but MUST report this one first.

| Step (§10.2) | Codes |
|---|---|
| 1. Format | `format_invalid`, `rules_hash_mismatch` |
| 2. Opening notice | `opening_mismatch` |
| 3. Key | `key_invalid` |
| 4. Participation | `invalid_signature`, `token_voting_id_mismatch`, `duplicate_token`, `participation_unsorted` |
| 5. Cells | `cells_invalid` |
| 6. Tallies | `tallies_mismatch` |
| 7. Counters | `counters_inconsistent` |
| 8. Quorum | `quorum_mismatch` |
| 9. Draw | `commitment_mismatch`, `drand_invalid`, `round_mismatch`, `order_mismatch` |
| 10. Result | `result_mismatch` |
| 11. Candidates | `candidates_mismatch` |
| 12. Chain | `chain_mismatch`, `prev_mismatch` |
| Receipt (§10.1) | `receipt_mismatch` |

Checks outside a single board, reported by the verifier of a whole data repository ([`formats.md`](../formats.md) §9.1):

| Document | Codes |
|---|---|
| Stand-alone draw ([`draws.md`](../draws.md) §6) | `format_invalid`, then the codes of step 9 |
| Assent record ([`formats.md`](../formats.md) §8) | `format_invalid`, `result_mismatch` (outcome does not follow from `objections`), `profile_mismatch`, `deadline_too_early` (only when the profile is available) |
| Any document | `document_unreadable`, `roll_call_mismatch` |

## Coverage

| Area | Cases |
|---|---|
| Quorum and minimum attendance | `quorum-001` … `quorum-007` |
| Yes/no, all rules and bases | `yes_no-001` … `yes_no-011` |
| Single winner: one candidate, first round, ties, repetitions, run-off, "against all", slates | `single_winner-001` … `single_winner-019` |
| Committee posts: preferences, displacement chains, ties, vacant posts, later vacancy | `posts-001` … `posts-010` |
| Limited vote and plurality: ties, minimum, vacant seats, degree filter | `limited_vote-001` … `limited_vote-008` |
| drand rounds and draws (real quicknet round 33026212) | `round-001` … `round-003`, `draw-001` … `draw-004` |
| Cell ids, canonical JSON, hash chain | `cell_id-*`, `jcs-*`, `chain-*` |
| Assent deadlines (including both daylight-saving changes) and outcome | `assent-001` … `assent-006` |
| Complete boards with real RSA-3072 blind signatures, and tampered copies | `board-001` … `board-009` |
| Boards without signatures (manual, roll call), tie-break draws on real round 33026212 (final link and live), annulment before the draw, and tampered copies | `board-010` … `board-017` |

## How the expected values were produced

- **Methods, quorum and assent:** the intended outcome of each case was written by hand from the specification, and a throwaway reference script recomputed the full result object and asserted that it matched. The script is not part of the repository: the corpus is checked for real when the two implementations of H3 and H4 must both agree with it.
- **Byte-level vectors** (`jcs`, `cell_id`, `round`, `draw`, `chain`): computed with Python and recomputed independently with Node; all values matched.
- **Boards `board-010` … `board-017`:** generated with the Python verifier's test fixtures and checked with both implementations.
- **Boards `board-001` … `board-009`:** generated with the real protocol flow (`@cloudflare/blindrsa-ts` on the client side, OpenSSL raw RSA on the server side), with every signature checked as standard RSASSA-PSS. Hashes, cells, tallies, counters, results and receipts were rechecked with Python.

If a reviewer finds a case they disagree with, the case is wrong until proven otherwise: open an issue citing its `id`.

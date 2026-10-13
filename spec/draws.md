# Verifiable draws

> **Status: draft 0.1, pending review by a second person (milestone H2).** Normative. RFC 2119 key words apply as in [`formats.md`](formats.md). Design decision: [ADR-0015](../PLAN/adr/0015-sorteos-verificables.md).

A draw turns a list of ids into an order that neither the officials nor any third party can choose. It combines a secret seed committed in advance by the officials with a future round of the public drand beacon.

Draws are used for:

- the **tie-break order** of a voting whose method needs one (`posts`, `limited_vote`), and
- **in-room ties** that persist after the allowed repetitions (`draw_required` in `single_winner`).

## 1. drand network

The network is **quicknet**. Its parameters are fixed here so that verification needs no network access except to fetch the round (values checked on 2026-10-13, see [`PLAN/h1-pruebas-de-concepto.md`](../PLAN/h1-pruebas-de-concepto.md)):

| Parameter | Value |
|---|---|
| `chain_hash` | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| `public_key` (G2) | `83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a` |
| `scheme` | `bls-unchained-g1-rfc9380` |
| `genesis_time` | `1692803367` |
| `period` | `3` seconds |

Endpoints (any of them; rounds are identical): `https://api.drand.sh/v2/beacons/quicknet/rounds/<R>`, `https://api2.drand.sh/v2/beacons/quicknet/rounds/<R>`.

- **Round time:** `time(R) = genesis_time + (R − 1)·period`.
- **First round at or after `t`** (Unix seconds, `t > genesis_time`): `round_at(t) = ⌈(t − genesis_time) / period⌉ + 1`.
- **Randomness:** `randomness_R = H(signature_R)`, where `signature_R` is the 48-byte compressed G1 signature.
- **Verification:** the signature is a BLS signature on G1 over the message `H(u64be(R))`, verified with the G2 public key above and the hash-to-curve suite of RFC 9380 with domain separation tag `BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_`. **[to be verified]** The DST string against a reference implementation, during milestone H4.

## 2. Commitment

1. The officials' browser draws a 32-byte `seed` from a CSPRNG. It is kept by the officials until the reveal.
2. `commitment = H(tag("pv/draw-commit/v1") ‖ seed)` is published together with the rule that fixes the round `R` (§5, §6), **before** round `R` exists.

## 3. Final seed

After round `R` is available, the seed is revealed and:

```
σ = H( tag("pv/draw-seed/v1") ‖ seed ‖ randomness_R )
```

A verifier MUST check `H(tag("pv/draw-commit/v1") ‖ seed) = commitment` and the drand signature of round `R`. If drand is unavailable, the draw waits: `R` is fixed and can be fetched later from any endpoint. The seed alone is never used.

## 4. Deriving an order

**Uniform integers.** A counter `ctr` starts at 0 for each draw.

```
uniform(n):                        # 1 ≤ n < 2^32
    limit ← 2^64 − (2^64 mod n)
    loop:
        block ← H( tag("pv/draw-prng/v1") ‖ σ ‖ u64be(ctr) ); ctr ← ctr + 1
        x ← first 8 bytes of block as an unsigned big-endian integer
        if x < limit: return x mod n
```

**Shuffle** (Fisher–Yates, from the end):

```
items ← the ids sorted ascending by their UTF-8 bytes
for i from len(items) − 1 down to 1:
    j ← uniform(i + 1)
    swap items[i] and items[j]
order ← items
```

`order[0]` is the most preferred. With one item, `order` is that item and no block is consumed.

## 5. Tie-break order of a voting

- **Commitment:** the officials commit when the voting is created; the commitment is published in the opening notice ([`formats.md`](formats.md) §12) when the voting opens.
- **Round.** `R` MUST be fixed in public before it exists, so that nobody can choose it after seeing the tallies:
  - `final_link`: the closing time `closes_at` is fixed at opening, so `R = round_at(closes_at)` is computed then and published in the opening notice as `draw_round`.
  - `live`: when the officials close the voting, the server fixes `R = round_at(closed_at + 30 s)` and the projection screen shows the commitment and `R` before round `R` exists, as for in-room ties (§6). The draw document records `round_rule: {"after": closed_at, "delay_seconds": 30}`.
- **Items:** every candidate id of the voting.
- **Document:** embedded in the board as `draw`:

```json
{
  "commitment": "…",
  "drand": { "chain_hash": "52db…e971", "randomness": "…", "round": 33026212, "signature": "…" },
  "items": ["c1", "c2", "c3"],
  "order": ["c3", "c1", "c2"],
  "purpose": "tiebreak_order",
  "seed": "…",
  "sigma": "…",
  "type": "draw",
  "version": 1,
  "voting_id": "…"
}
```

The verifier MUST check `R = round_at(closes_at)` against the opening notice (`final_link`), or `R = round_at(after + delay_seconds)` with `after = closed_at` (`live`).

**Security consideration.** `closed_at` is reported by the server. If `R` were derived from it after the fact, an operator who also knows the seed (an official who is also the technical administrator, a combination allowed by [ADR-0025](../PLAN/adr/0025-roles-y-publicacion.md)) could report a later `closed_at` and choose among several already published rounds after seeing the tallies. Fixing `R` in public before it exists removes that choice: for `final_link` the opening notice fixes it; for `live` the room sees it on the projection screen. In a live voting where nobody looks at the screen, the risk remains; it is documented in the threat model.

## 6. In-room ties

- **When:** a `single_winner` voting ends in `draw_required`. The officials commit, the platform shows the commitment and `R = round_at(now + 30 s)` on the projection screen and publishes them, and the draw is computed once round `R` exists.
- **Items:** the `tied` ids. **Winners:** the first `spots` ids of `order`.
- **Document:** a stand-alone draw document, appended to the hash chain ([`formats.md`](formats.md) §9). Same members as §5, with `purpose: "tie"`, `voting_id` of the voting that ended in the tie, `round_rule: {"after": "<RFC 3339 time of the commitment>", "delay_seconds": 30}`, `spots` and `winners`.

The verifier MUST check `R = round_at(after + delay_seconds)`. Because the commitment and `R` are shown in the room before `R` exists, the choice of round cannot be manipulated.

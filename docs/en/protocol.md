> 🇪🇸 [Español](../es/protocolo.md)

# Secret ballot protocol

> 🚧 **Draft.** Describes the **intended** behaviour; the platform is not implemented yet. Statements marked [to be verified] are not confirmed.

The normative specification is in [`spec/`](../../spec/). This document summarises it.

## 1. One-sentence idea

The voter obtains from the server a **blind signature** on a random number the server never sees. They then cast the vote with that number and its signature over a channel that carries no identity. The server knows *who* received a credential, but not *which token* belongs to whom.

## 2. Parameters

| Item | Value |
|---|---|
| Scheme | RSA Blind Signatures, [RFC 9474](https://www.rfc-editor.org/rfc/rfc9474.html), variant `RSABSSA-SHA384-PSS-Randomized` |
| Key | 3072-bit RSA, **one per vote**, generated at opening and destroyed at closing |
| Library | [`@cloudflare/blindrsa-ts`](https://github.com/cloudflare/blindrsa-ts) in the browser (blind, finalize) and on the server (key generation, verification); the server's blind signature (RSASP1) uses OpenSSL through Node's `node:crypto`, with the input and output checks of RFC 9474 §4.3 (blindrsa-ts has no published formal audit) |
| Hash and serialisation | SHA-256 over [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) canonical JSON (JCS) |
| Client randomness | `crypto.getRandomValues` (WebCrypto) |

Notation: `H` = SHA-256 and `‖` = concatenation.

## 3. Steps

```mermaid
sequenceDiagram
  autonumber
  participant V as Voter's browser
  participant P as GitHub Pages
  participant S as API (issuance)
  participant R as API (reception, separate subdomain)
  Note over S: Officials open: attendance snapshot, quorum, key pair
  S->>P: Publish fingerprint H(public key) (end-of-session link)
  V->>S: Fetch public key
  V->>P: Compare fingerprint
  V->>V: msg = vote_id ‖ 32 random bytes; Blind(msg)
  V->>S: blinded_msg + session
  S->>S: Present? Rights left? Sign (idempotent)
  S-->>V: blind_sig
  V->>V: Finalize → (msg, sig); store credential
  V->>V: Fill ballot; generate s; id_c = H(s ‖ vote_id ‖ c)
  V->>R: (msg, sig, s, answers), no cookies or session
  R->>R: Valid signature, unspent token, valid ballot
  R-->>V: Acknowledgement → receipt
  Note over S,R: Closing: key destroyed, bulletin board published
```

1. **Preparation.** The officials define the method, parameters, options and electorate (degree filter). The effective rules are published with their hash (`rules_hash`). If a tie-break order is needed, the officials commit to a seed (see §6). A vote is never edited: it can only be annulled, with a public reason.
2. **Opening.**
   - The **attendance snapshot** is frozen: the people present and their voting rights (their own plus valid proxies).
   - Quorum is checked. If it is missing, the officials may force the opening with a reason that is published.
   - The key pair is generated and its fingerprint published. For end-of-session votes, the vote does not open until the fingerprint is visible on GitHub Pages.
3. **Bulk issuance.**
   - At opening, every present member's browser automatically requests one credential per voting right.
   - It stores the blinding data **before** sending it, so it can retry.
   - The server returns the same signature for the same blinded message (idempotency) and never signs more messages than rights.
4. **Casting.**
   - After the ballot review, the browser generates a ballot secret `s` and sends the ballot to the reception subdomain with `credentials: "omit"`.
   - The server checks the signature, that the token belongs to this vote and that it is unspent, and stores the vote **without time or order**.
5. **Receipt.** `(msg, sig, s, answers)` is stored in the browser and can be downloaded. **Showing it reveals the vote.**
6. **Closing.**
   - Live votes are closed manually by the officials; end-of-session votes close automatically at the time fixed at opening, which cannot be brought forward.
   - The private key is destroyed and the result computed.
   - The **bulletin board** is published and appended to the **hash chain**.
   - Each member is e-mailed the record hash and how many credentials were issued in their name.
   - `s` and the grouped ballots are deleted.

## 4. Public bulletin board

| Field | Content |
|---|---|
| `participation` | `(msg, sig)` pairs sorted by `msg`. Anyone verifies them as standard RSA-PSS signatures. |
| `cells` | For each cell `c` (e.g. "candidate X for post Y"), a list of `(id_c, value)` sorted by `id_c`. Each list has as many entries as `participation`. |
| `counters` | Members, present, proxies exercised, rights (D), credentials issued (E) and votes (V). V ≤ E ≤ D must hold. |
| `rules`, `rules_hash` | Effective rules (profile + parameters). |
| `quorum`, `forced` | Required and actual quorum; reason for a forced opening, if any. |
| `draw` | Commitment, drand round, seed and tie-break order. |
| `result` | Output of the counting method. |
| `candidates_hash` | Hash of the id→name table, published separately. |

**Why disaggregated:** publishing each token's full ballot would let a rare combination of choices act as a "signature" for vote buying. The `id_c` values depend on `s`, which only the voter knows, so nobody else can put a ballot back together. They cannot depend on the token, because the token is public.

## 5. Hash chain

`record_hash = H(JCS({prev: previous_hash, board: H(JCS(board))}))`. The `record_hash` is e-mailed to the whole electorate and published in the public data repository. Rewriting an old result would require altering both.

## 6. Draws

1. The officials publish `H(seed)` and a future round `R` of the public [drand](https://drand.love/developer/http-api) beacon is fixed (quicknet network; one round every 3 seconds).
2. After round `R`, the seed is revealed and `σ = H(seed ‖ randomness_R)` is computed.
3. The order is obtained with Fisher–Yates over ids in canonical order, using `H(σ ‖ i)` in counter mode with rejection sampling.

If drand does not respond, we wait: the round is fixed and can be fetched from any mirror.

## 7. Modes without blind signatures

- **Electronic roll-call:** who voted what is published.
- **Show of hands and paper:** the officials enter per-cell totals. The result is labelled "manual count", with no cryptographic verification, and goes through the same methods.
- A vote never mixes modes.

## 8. Counting methods (summary)

| Method | Rule |
|---|---|
| Yes/no | Configurable threshold: simple (for > against), absolute (2·for > base) or fraction (for ≥ ⌈p·base/q⌉). Base: cast, present, present + proxies or members. Blank votes count as cast; abstentions do not. |
| Single-winner | One candidate: elected if for > against-all. Several: absolute majority of votes cast; otherwise a run-off between the top two. Ties are re-voted once, then drawn. Live only, with an assistant that proposes the next vote. |
| Slates | As single-winner. If no slate is elected, positions are elected one by one. |
| Committee posts | Each cell accepts for, against or abstain. Eligible if for > against. Assignment by deferred acceptance (Gale–Shapley, candidate-proposing) following declared preferences. Tie-break: fewer votes against, then the drawn order. |
| Limited vote | Mark up to max(1, seats − 1) candidates. The most voted win and the next ones are substitutes. Ties: drawn order. |
| Single seat | Plurality: the most voted candidate wins. |
| Assent | Approved if nobody objects by the deadline (at least the end of the 2nd calendar day after sending). |

Details and edge cases: [`PLAN/PLAN.md` §7](../../PLAN/PLAN.md) and [ADR-0023](../../PLAN/adr/0023-interpretaciones-reglas.md) (Spanish).

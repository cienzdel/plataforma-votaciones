# Protocol

> **Status: draft 0.1, pending review by a second person (milestone H2).** Normative. RFC 2119 key words apply as in [`formats.md`](formats.md). A plain-language summary is in [`docs/en/protocol.md`](../docs/en/protocol.md) and [`docs/es/protocolo.md`](../docs/es/protocolo.md); the reasons for each choice are in [`PLAN/adr/`](../PLAN/adr/) and the threat model in [`PLAN/modelo-amenazas.md`](../PLAN/modelo-amenazas.md).

## 1. Parties and channels

| Party | Role |
|---|---|
| **Voter's browser** | Runs the web client served by GitHub Pages. Blinds, finalises, builds ballots, keeps receipts. |
| **Officials** (`mesa`) | Create, open, close and annul votings; record attendance and proxies. Authenticated with a session. |
| **Session service** | Login codes, sessions, census, attendance, proxies. |
| **Issuance service** | Holds the signing key of each open voting and signs blinded messages. Requires a session. |
| **Reception service** | Receives ballots. Served from a **separate origin** (subdomain); accepts no session, sets no cookies and logs nothing. |
| **Data repository** | Public git repository, served by GitHub Pages, where opening notices, boards, draws, candidate tables and the chain are published. |

The three services run in one process on the same machine and share only the set of spent tokens ([ADR-0004](../PLAN/adr/0004-desacople-emision-envio.md)). The session travels in an `Authorization: Bearer <token>` header, never in a cookie. All channels use TLS. Requests to the reception service MUST be made with `credentials: "omit"` and without the session header.

## 2. Logging requirements

These apply to every component on the voting machine, including the TLS proxy ([ADR-0018](../PLAN/adr/0018-sin-registros.md)):

- No access logs. No IP address, user agent, header or request time is stored anywhere.
- The reception service MUST NOT write any log line, metric or database column that contains or is derived from time or arrival order. Its tables have the token as primary key and no row ids (SQLite `WITHOUT ROWID`).
- Error logs, if any, MUST NOT contain identifiers, tokens, ballots or request bodies.

## 3. Creating a voting

1. The officials define: title, method and parameters ([`methods.md`](methods.md)), candidates and posts with their ids, `electorate_filter`, `mode`, `timing`. The server assigns `voting_id` (16 random bytes). `rules` and `rules_hash` ([`formats.md`](formats.md) §4) are built when the voting opens (§4), with the quorum of the call in force.
2. If the method needs a tie-break order, the officials' browser creates a seed and sends the server only its `commitment` ([`draws.md`](draws.md) §2).
3. From now on the voting cannot be edited; what the officials defined is the only input to the rules. It can only be annulled, with a reason that is published.

## 4. Opening

1. **Attendance snapshot.** The server freezes the list of present members who pass the filter and, for each, their number of voting rights: 1 plus one per valid proxy from a member who passes the filter. The counters `session_members`, `session_present`, `members`, `present`, `proxies` and `rights` are fixed now. For `final_link`, the snapshot is the attendance when the session was closed (profile parameter).
2. **Quorum.** The server computes `quorum` ([`methods.md`](methods.md) §1.2). If it is not met, the officials can force the opening with a reason.
3. **Key** (`secret` mode). The issuance service generates a fresh RSA key pair ([`formats.md`](formats.md) §2.1). The private key is stored encrypted with the environment's master key, so it survives a restart.
4. **Opening notice.** The server publishes the opening notice ([`formats.md`](formats.md) §12) in the data repository.
   - For `final_link`, the voting MUST NOT accept requests until the opening notice is served by GitHub Pages.
   - For `live`, the officials choose whether to wait for it ([ADR-0008](../PLAN/adr/0008-consistencia-clave-publica.md)). The officials' screen enables "Open" when Pages serves the notice, instead of using a fixed delay.
5. For `final_link`, the closing time `closes_at` is fixed now and cannot be brought forward. It goes in the opening notice together with the drand round of the tie-break draw.

## 5. Credential issuance (`secret` mode)

As soon as the voting opens, the browser of every member in the snapshot who is logged in requests one credential for each of their rights `j = 0 … rights − 1`. Because everyone does so at the same moment, the time of issuance carries little information.

**Client**, for each right `j`:

1. Fetch the public key from the API and the opening notice from GitHub Pages with `cache: "no-store"`. Compute `H(SPKI)` and compare it with the reference: the opening notice on Pages if it is available (always for `final_link`), otherwise the opening notice served by the API. On mismatch, stop and show an error.
2. Draw `r` (32 bytes) and set `msg = voting_id ‖ r`.
3. Run RFC 9474 `Prepare(msg)` → `token` (80 bytes, [`formats.md`](formats.md) §2.2) and `Blind(pk, token)` → `blinded_msg`, `inv`.
4. Store `{voting_id, j, token, inv, blinded_msg}` in local storage **before** sending anything.
5. Send:

   ```
   POST /issue
   Authorization: Bearer <session>
   { "blinded_msg": "<hex, 384 B>", "right": j, "voting_id": "<hex>" }
   ```

6. On `{"blind_sig": "<hex>"}`, run `Finalize(pk, token, blind_sig, inv)` → `sig`, verify `sig` over `token`, and store the credential `(token, sig)`. On a network error, retry with the same stored `blinded_msg`.

**Issuance service** checks, in this order, and answers with an error otherwise:

1. The session is valid and its member is in the snapshot of this voting.
2. The voting is open and in `secret` mode.
3. `0 ≤ right < rights` of that member.
4. If an issuance already exists for `(voting, member, right)`:
   - with the same `H(blinded_msg)`: return the stored `blind_sig` (idempotent);
   - with a different one: reject (`409`). A lost credential is not replaced.
5. `blinded_msg` is 384 bytes and, as an integer, smaller than the modulus `n`.
6. `blind_sig = RSASP1(sk, blinded_msg)`, computed with OpenSSL ([ADR-0002](../PLAN/adr/0002-libreria-variante-clave.md)).
7. `RSAVP1(pk, blind_sig)` MUST equal `blinded_msg`; otherwise return an internal error and do not store anything (RFC 9474 §4.3).
8. Store `(voting, member, right, H(blinded_msg), blind_sig)` and return `{"blind_sig": "<hex>"}`.

The service never sees `token`, `r` or `inv`. By the blindness property of RFC 9474, the stored `blinded_msg` is statistically independent of the token that will later be published.

## 6. Casting

**Client.**

1. The voter fills in the ballot; the client shows a summary and asks for confirmation.
2. Draw `s` (32 bytes). Build the vote object:

   ```json
   { "answers": { "<cell key>": "<value>" }, "s": "<hex>", "sig": "<hex>", "token": "<hex>", "voting_id": "<hex>" }
   ```

3. Store it in local storage, then send it with `POST /cast` to the **reception origin**, with `credentials: "omit"` and no session header.
4. On `{"ack": "<hex>"}`, check `ack = HJ(vote object)` and store the receipt ([`formats.md`](formats.md) §10). Offer it as a file, with the warning that showing it reveals the vote.
5. On a network error, retry with the same vote object until the voting closes.

A member with proxies gets one separate ballot per right ("Your vote", "Proxy vote of …"), each with its own credential and receipt.

**Reception service** checks, and answers with an error otherwise:

1. The voting exists, is open and is in `secret` mode.
2. `token` is 80 bytes and `token[32:48] = voting_id`.
3. `sig` is a valid RSASSA-PSS signature over `token` with the key of this voting.
4. `s` is 32 bytes.
5. `answers` contains exactly the cells of the voting, each with an allowed value, and satisfies the method's ballot rules ([`formats.md`](formats.md) §3).
6. If `token` is already spent:
   - with an identical vote object: return the same `ack` (idempotent);
   - otherwise reject (`409`).
7. Store the vote under `token` and mark the token as spent, **without time or order**. Return `{"ack": hex(HJ(vote object))}`.

The service MUST NOT accept a session header or set cookies, and the response MUST NOT depend on who sent it.

## 7. Closing and publication

1. **Close.** Live votings are closed by the officials; `final_link` votings close automatically at the fixed time. From now on `/issue` and `/cast` reject requests for this voting.
2. **Destroy the key.** The private key is deleted and `destroyed_at` recorded. This cannot be verified from outside ([ADR-0003](../PLAN/adr/0003-ciclo-de-vida-de-claves.md)).
3. **Draw.** If the method needs a tie-break order, take `R` from the opening notice (`final_link`), or fix `R = round_at(closed_at + 30 s)` and show it with the commitment on the projection screen (`live`). Once round `R` exists, the officials reveal the seed and the draw is computed ([`draws.md`](draws.md) §5).
4. **Board.** Build the board ([`formats.md`](formats.md) §5):
   - `participation`: `[token, sig]` of every stored vote, sorted by token;
   - for each cell `c`: the pairs `[id_c, answers[c]]`, with `id_c` computed from each vote's `s` ([`formats.md`](formats.md) §2.4), sorted by `id_c`;
   - `tallies` from the cells, `counters` (with `issued` = number of issuances and `received` = number of votes), `quorum`, `draw`, `result` from the method, `candidates_hash`.
5. **Chain.** Append the board to the chain ([`formats.md`](formats.md) §9).
6. **Publish** the board, the candidates table and the updated chain file to the data repository in one commit, and show them in the public view.
7. **Notify.** Send every member of the electorate an e-mail with the voting title, the `record_hash` and "N credentials were issued in your name" ([ADR-0007](../PLAN/adr/0007-deteccion-votos-fabricados.md)). Members who were not present receive N = 0.
8. **Erase.** Delete `s` and the grouped votes; keep only the spent tokens. Run `VACUUM` with `secure_delete` on, and make the encrypted backup.

An **annulled** voting is closed in the same way, with `status: "annulled"`, the reason and `result: null`.

## 8. Other modes

- **`roll_call`.** Members vote with their session; no credentials. The board has `participation`, `cells` and `key` set to `null`, `tallies` computed from the named votes, and `roll_call_hash` of the roll-call list ([`formats.md`](formats.md) §7), which is published beside it.
- **`manual` and `paper`.** The officials enter the tallies. The board has `participation`, `cells` and `key` set to `null`; the result is labelled as a manual count in the interface. These boards go through the same methods and the same chain, but their tallies cannot be verified cryptographically.
- A voting never mixes modes.

## 9. Sequence of elections (informative)

The officials' assistant proposes the next voting from each `single_winner` result; the officials confirm. The verifier checks each voting on its own and does not check this sequence.

1. If slates were submitted, a `single_winner` voting among the slates (`subject: "slate"`), with run-off, repetitions and draws as for a person.
2. If no slate is elected, or for the positions the elected slate does not cover: one `single_winner` voting per position, in the order of the profile.
3. `runoff` → a `runoff` voting between `qualified`. `repeat` → a `qualify` (or `runoff`) voting among `tied` with `attempt + 1`. `draw_required` → an in-room draw ([`draws.md`](draws.md) §6).
4. A person elected to a position is withdrawn from the following ones; the officials can undo this with a recorded reason.

## 10. Verification

### 10.1 Individual (in the browser)

After the board is published, the client takes each receipt and checks that:

- `[token, sig]` is in `participation`;
- for each cell `c`, `[H(tag("pv/cell/v1") ‖ s ‖ voting_id ‖ utf8(c)), answers[c]]` is in `cells[c]`;
- the board's key fingerprint equals the one the client checked when it obtained the credential.

### 10.2 Universal (`tools/verify`)

Given the data repository, the verifier MUST check, for every board:

1. **Format:** the board conforms to [`formats.md`](formats.md), and `rules_hash = HJ(rules)`.
2. **Opening notice:** the board's `rules`, `rules_hash`, `key`, `quorum`, draw commitment and (for `final_link`) draw round and closing time equal those of the opening notice.
3. **Key** (`secret`): `fingerprint = H(DER)`, modulus of 3072 bits, exponent 65537.
4. **Participation** (`secret`): every `sig` is a valid RSASSA-PSS signature over its `token`; every `token[32:48] = voting_id`; no token appears twice; the list is sorted.
5. **Cells** (`secret`): every cell of the method is present; every list has exactly `len(participation)` entries, is sorted by `id_c` and has no repeated `id_c`; every value is allowed.
6. **Tallies:** equal to the counts derived from `cells` (`secret`), and consistent with the method's aggregate rules ([`methods.md`](methods.md) §5).
7. **Counters:** `rights = present + proxies`; `received = len(participation)` (`secret`); `received ≤ issued ≤ rights` (`secret`) or `received ≤ rights` (other modes); for unrestricted votings, `members = session_members` and `present = session_present`.
8. **Quorum:** `required` and `met` (and minimum attendance) recomputed from `rules` and the counters; if not met, `forced` is present. A forced opening is reported, not treated as an error.
9. **Draw:** commitment, drand signature, round rule, `σ` and `order` ([`draws.md`](draws.md)).
10. **Result:** recomputed with [`methods.md`](methods.md) from `tallies`, counters, `params` and the draw order, and equal to `result`.
11. **Candidates:** if the candidates table is available, `candidates_hash` matches it and every id in the rules appears in it.
12. **Chain:** every `record_hash` and every `prev` link ([`formats.md`](formats.md) §9).

It MUST also check every stand-alone draw and assent record in the chain, and SHOULD check a receipt given by the user (§10.1).

What the verifier cannot check is listed in the threat model: that the key was destroyed, that the server did not correlate requests in real time, and that the manual tallies are true.

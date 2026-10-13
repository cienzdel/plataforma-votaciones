> 🇪🇸 [Español](../es/modelo-amenazas.md)

# Threat model

> 🚧 **Draft.** Describes the **intended** design; the platform is not implemented yet. This is a translation of [`PLAN/modelo-amenazas.md`](../../PLAN/modelo-amenazas.md); if they differ, the Spanish plan prevails. Statements marked [to be verified] are not confirmed. This document describes what the system does **not** protect with the same detail as what it does.

## 1. Summary for non-specialists

- **What is achieved:** if someone later obtains the database, the backups or the published data, they cannot tell how each person voted. Each voter can check that their vote was counted as cast. Anyone can recompute the result with an independent tool.
- **What is not achieved:** whoever administers the server *while voting is open* could, acting in bad faith and modifying the server, try to link people and votes through timing or IP addresses. Nor can anyone stop a person from showing their receipt (and thus their vote) to someone else, or from voting while being watched.
- **What depends on you:** reading the e-mail sent when each vote closes ("N credentials were issued in your name") and speaking up if it looks wrong, and not sharing your receipt.

## 2. Scope and assumptions

- **System:**
  - the web interface, served by GitHub Pages;
  - the API on an ephemeral VM;
  - the SQLite database;
  - the public data repository;
  - outgoing e-mail;
  - the drand beacon;
  - the verification CLI.
- **Electorate:** 40–60 people, one instance per body.
- **Trust assumptions:**
  1. The RSA primitive and SHA-256 are secure. The implementations are correct: `@cloudflare/blindrsa-ts` in the browser (it has no published formal audit) and OpenSSL for the server's signature.
  2. The interface the voter runs is the one built from the public repository, verifiable through GitHub attestations. GitHub must be trusted as a platform.
  3. Each member's mailbox is controlled only by that member.
  4. The voter's browser and device are not compromised.
  5. `crypto.getRandomValues` randomness in the browser is adequate.
  6. drand (League of Entropy) is not compromised by a majority of its nodes at once.

## 3. Assets and properties

| Property | Meaning |
|---|---|
| **Secrecy** | Nobody can link a person to the content of their vote. |
| **Uniqueness** | Each voting right yields at most one counted vote. |
| **Integrity** | Votes are not added, altered or removed without detection. |
| **Individual verifiability** | Each voter checks their vote is on the board as cast. |
| **Universal verifiability** | Anyone recomputes the result from published data. |
| **Rule fidelity** | The published rules (profile + parameters) are applied, and nothing else. |
| **Electorate privacy** | Personal data is not published beyond what is necessary. |
| **Availability** | Voting is possible during the voting period. |

## 4. Attackers

### A1. Technical administration and officials (even when the same people)

**Capabilities:** they control the VM, the deployed code, the database, the master key, the signing keys while the vote is open, outgoing e-mail, the electorate list, attendance, proxies, and opening and closing.

- **Protected:**
  - **Secrecy against later analysis:** the database does not link person and token; credentials are issued in bulk; no time, IP or order is stored; grouped ballots are deleted at closing.
  - **Detectable integrity:** public counters V ≤ E ≤ D, a personal e-mail with the number of credentials issued, a hash chain anchored by e-mail and in a public repository, and individual verification with the receipt.
  - **Rules:** `rules_hash` is published; forced openings and annulments carry a public reason.
  - **Interface:** it is not served by the VM.
- **NOT protected:**
  - **Real-time correlation:** an operator who modifies the server or captures traffic on the VM can match the time or IP of issuance with that of reception. The code running on the VM **cannot be attested**.
  - **Key tagging in live votes:** unless the officials wait for the fingerprint to be published on Pages, a malicious VM can give each person a different key and recognise their votes.
  - **Unreported ghost credentials:** signing extra credentials in the name of present members who do not vote is detected only if those members read the notice and react; a malicious VM may also skip sending the notices.
  - **Key destruction:** not verifiable.
  - **Full ballots before closing:** known to the server (without identity).
  - **Fake attendance or proxies:** detectable only through proxy e-mails, the nominal minutes and observation of the room, not through cryptography.
  - **Assisted access:** the officials could impersonate someone; the notification e-mail makes it detectable.
  - **Suppressed publication:** whoever controls the VM can prevent publication.
- **Additional mitigations:**
  - Public code under the EUPL.
  - Deployment through GitHub Actions with approval and a log.
  - Fingerprint on Pages for end-of-session votes.
  - `record_hash` e-mailed to the whole electorate.
  - A recommendation to separate officials and technical administration when possible.

### A2. Stolen database or backup (read-only, no live control)

- **Protected:**
  - **Secrecy:** issuance records hold only blinded messages, independent of the final token [to be verified, see §6]; votes carry no time or order; `s` and grouped ballots are deleted at closing.
  - **Keys of closed votes:** destroyed.
  - **Backups:** encrypted with age, with the private key kept offline.
- **NOT protected:**
  - **Personal data** of the electorate (names, e-mails, degrees, attendance, proxies, objections) from a decrypted copy or a running VM.
  - **Votes open at that moment:** the encrypted private key plus the master key in the VM environment would allow signing.
  - **Order residues** in SQLite files [to be verified]; mitigated with `secure_delete` and `VACUUM`.

### A3. Another voter (including a proxy holder)

- **Protected:**
  - **Uniqueness:** a per-person credential cap, single-use tokens and a per-vote signature check.
  - **Others' secrecy:** public data cannot rebuild other people's ballots.
  - **Impersonation:** nobody can vote as another person without access to their mailbox.
- **NOT protected:**
  - **Proxy votes:** the proxy holder knows the content of the vote they cast (inherent and accepted).
  - **Small groups and unanimity:** the result reveals each vote.
  - **Inference by elimination** in very small restricted electorates.

### A4. Network observer

- **Protected:**
  - **Content:** protected by TLS.
  - **Direct linkage:** casting carries no session and goes to another subdomain.
- **NOT protected:**
  - **Traffic analysis:** an observer can learn *that* and *when* a device voted, not *what*; combined with A1, they can correlate.
  - **Availability:** a denial of service on the room's network can prevent voting.
- **Mitigations:** bulk issuance, a hash-sorted board, shared NAT on the room's network and paper fallback.

### A5. Providers (VM provider, GitHub, Google, drand)

| Provider | What it could do | What limits it |
|---|---|---|
| VM provider | The same as A1 at the infrastructure level. | Contract and EU jurisdiction [DPA to be verified]; ephemeral VM. |
| GitHub | Serve a tampered interface, or alter the data repository or the fingerprint. | Third-party-verifiable build attestations, the e-mailed `record_hash` and independent clones of the archive. |
| Google (e-mail) | Read access codes and notices, or not deliver them. | E-mails never contain voting credentials; SMTP fallback. |
| drand | Bias draws only if colluding with the officials. | Prior commitment by the officials, a round fixed in public before it exists and a verifiable BLS signature. Residual risk: in a live vote, if nobody checks the round shown on screen at closing, someone who knows the seed and controls the server could choose among several rounds already seen. |

### A6. Coercer or vote buyer

- **Protected:**
  - **Combination "signatures":** the disaggregated board prevents identifying a ballot by a rare combination of choices in the public data.
- **NOT protected:**
  - **Receipts:** the receipt lets a voter **prove** their vote; the scheme is not receipt-free.
  - **In-person coercion:** voting while being watched.
  - **No re-voting:** there is no way to undo a coerced vote.

### A7. External Internet attacker

- **Protected:**
  - **Access:** single-use codes valid for 10 minutes with 5 attempts, and rate limiting.
  - **Vote tampering:** requires valid signed credentials.
  - **Interface:** security headers, CodeQL and Dependabot.
- **NOT protected:**
  - **Denial of service** against the VM during a live vote. The plan is to resume if the service returns within 10 minutes; otherwise, annul the vote and repeat it on paper.

## 5. Summary table

✔ = protected · ◐ = detectable or partial · ✘ = not protected

| Property \ Attacker | A1 Admin/officials | A2 Stolen DB | A3 Voter | A4 Network | A5 Provider | A6 Coercion | A7 External |
|---|---|---|---|---|---|---|---|
| Secrecy | ◐ (later ✔; real-time ✘) | ✔ | ✔ (except unanimity or proxy) | ◐ | ◐ | ✘ | ✔ |
| Uniqueness | ◐ (ghosts detectable) | ✔ | ✔ | ✔ | ◐ | n/a | ✔ |
| Integrity | ◐ (detectable) | ✔ | ✔ | ✔ | ◐ (detectable) | n/a | ✔ |
| Electorate privacy | ✘ | ✘ | ✔ | ✔ | ◐ | n/a | ✔ |
| Availability | ✘ | n/a | ✔ | ✘ | ✘ | n/a | ✘ |

## 6. Cryptographic caveats [to be verified]

1. **Blindness under malicious keys.** RSA blindness is proven for well-formed keys. We must review the security considerations of RFC 9474 and recent literature on RSA blindness with keys chosen by a malicious signer, and decide whether the client should validate the key. Until then, this is an **open risk**.
2. **No published formal audit** of blindrsa-ts. Partial mitigation: RFC test vectors and cross-verification with Python `cryptography`.
3. **Side channels** in server-side JS big-integer arithmetic. The risk is bounded by per-vote keys, but has not been evaluated.
4. **Randomness quality** on old mobile devices: WebCrypto is trusted.

## 7. What the system does NOT protect (consolidated)

1. Against a bad-faith VM administrator **during** voting: correlation by time or IP, key tagging in live votes without waiting for Pages, and skipped notices.
2. Code running on the VM: it cannot be proven.
3. Destruction of private keys: it cannot be verified.
4. Receipts (the vote can be proven to others) and in-person coercion.
5. Proxy votes: the proxy holder knows their content.
6. Unanimity and very small groups: the result reveals the votes.
7. Paper and manual counts: they have no cryptographic verification.
8. Electorate personal data, against whoever controls the VM or a decrypted copy.
9. Availability against denial of service and provider outages.
10. A lost token means a lost vote; there is no reissue.
11. A compromised voter device can alter or reveal the vote.
12. Procedural fraud by the officials (fake attendance or proxies) is detectable only by non-cryptographic means.

## 8. Accepted process risks

- No external review is required before first use (open invitation only).
- The dry run is done only by the development team.
- Rotating secrets at handover is optional.
- The University is not informed before first use; the data controller and legal basis remain [to be verified].
- The code repository lives in a personal account.
- All instance accounts can be recovered through the body's institutional e-mail.

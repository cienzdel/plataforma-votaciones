# Changelog

Todos los cambios relevantes se documentan aquí · All notable changes are documented here.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added
- Planning documents: plan, architecture decision records and threat model (`PLAN/`).
- Documentation skeleton in Spanish and English (`README`, `docs/`).
- Licences (EUPL-1.2 for code, CC BY-SA 4.0 for documentation), security policy, contributing guide, code of conduct, issue and pull request templates.
- H1 proof-of-concept results (`PLAN/h1-pruebas-de-concepto.md`): drand quicknet parameters, VM billing, RSA-3072 performance and GitHub Pages latency; guide to test Gmail API with the council's account.
- Normative specification draft 0.1 in English (`spec/`): formats, protocol, counting methods and verifiable draws, plus a corpus of 87 cases including complete bulletin boards with real RSA-3072 blind signatures and tampered copies.
- pnpm workspace and `packages/core` (milestone H3): canonical JSON, quorum, the four counting methods, assent deadlines, verifiable draws, hash chain, ballot cells and universal board verification. Passes the whole corpus with 100% branch coverage and property-based tests.
- Independent Python verifier `tools/verify` (milestone H4), written from `spec/`: checks a whole data repository (boards, opening notices, candidates tables, stand-alone draws, assent records, receipts and the chain), including the drand BLS signature. Passes the whole corpus.
- Base API `apps/api` (milestone H5): login by e-mail code and assisted login, census import from CSV, the `mesa` role with a public log by alias, meetings with first and second call, attendance, proxy votes and the attendance snapshot, e-mail through Gmail API or SMTP. Integration tests on in-memory SQLite.
- Secret votings in `apps/api` (milestone H6): RSA-3072 keys per voting encrypted at rest, blind signatures with OpenSSL, the attendance snapshot, the opening notice, reception on its own origin without session, time or order, closing with key destruction, the board, the hash chain, publication to the data repository (GitHub or a local folder), notices with the number of credentials issued, and erasure of the grouped ballots. Methods `yes_no` and `single_winner`; the others need draws and arrive later.
- Web interface `apps/web` (milestone H7):
  - voter view with anonymous credentials obtained in the browser, one ballot per right, review, downloadable receipt and individual check of the board;
  - officials' view and projection view;
  - Spanish and English, about 98 KB against a 200 KB budget;
  - Playwright test of the full flow with axe (WCAG 2.2 AA) on every screen.
- E-mail and publication to a local folder, for development and browser tests.
- Test that reception writes only the ballot and the spent token, with no log, cookie, time or order, and end-to-end test where `tools/verify` accepts the data repository published by the API.
- Fictitious example profile `profiles/example.json` for development and tests.
- Layout of the data repository (`spec/formats.md` §9.1) and error codes for stand-alone draws and assent records.

### Changed
- The server's blind signature uses OpenSSL (`node:crypto`) instead of the JavaScript big-integer code in blindrsa-ts, which took ~0.9 s per signature (ADR-0002).
- The rules of a voting are fixed when it opens, not when it is created, since they include the quorum of the call in force (`spec/formats.md` §4, `spec/protocol.md` §3).
- `packages/core` imports use `.ts` extensions, so Node runs the core and the API without a build step.
- The drand domain separation tag is confirmed against a real round (`spec/draws.md` §1).
- Canonical JSON member names may contain `-` and `@`, which tallies keyed by ids and cell keys need (`spec/formats.md` §1.3). No hash of the corpus changes.
- The drand round of a tie-break draw is fixed in public before it exists, instead of being derived from the closing time reported by the server (ADR-0015).

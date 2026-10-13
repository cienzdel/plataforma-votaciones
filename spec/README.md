# `spec`

> **Borrador 0.1, pendiente de revisión por una segunda persona** (hito H2) · **Draft 0.1, pending review by a second person** (milestone H2).

**ES** · Especificación normativa del protocolo, de los formatos, de los métodos de recuento y de los sorteos, más el corpus de casos que deben pasar tanto el núcleo TypeScript como el verificador Python. Está escrita **en inglés** para que haya un único texto normativo; el resumen divulgativo en español está en [`docs/es/protocolo.md`](../docs/es/protocolo.md). Si la especificación y cualquier otro documento discrepan, manda la especificación.

**EN** · Normative specification of the protocol, formats, counting methods and draws, plus the case corpus that both the TypeScript core and the Python verifier must pass. It is written in English so that there is a single normative text. If this specification and any other document disagree, the specification prevails.

## Contents

| Document | What it defines |
|---|---|
| [`formats.md`](formats.md) | Notation, restricted canonical JSON, tokens, cell ids, ballots, rules, bulletin board, candidates table, hash chain, receipt, profile, opening notice. |
| [`protocol.md`](protocol.md) | Parties, logging requirements, creation, opening, credential issuance, casting, closing, publication, other modes and the verification checklist. |
| [`methods.md`](methods.md) | Quorum and thresholds, `yes_no`, `single_winner`, `posts`, `limited_vote`, degree filters and assent. |
| [`draws.md`](draws.md) | drand quicknet parameters, commitment, seed derivation, shuffle, tie-break orders and in-room ties. |
| [`cases/`](cases/) | 95 cases: methods, quorum, draws, byte-level vectors and complete boards in every mode. |

## Versioning

The specification has a version (`0.1` now). Every JSON document carries `version: 1`. A change that alters any hash or result of an existing case is a new major version of the document type and is recorded in [`CHANGELOG.md`](../CHANGELOG.md).

## Open points

1. **Base `present_plus_proxies`** for censure and reform: pending confirmation by the Pleno ([ADR-0023](../PLAN/adr/0023-interpretaciones-reglas.md)).
2. **Review:** H2 is complete only when a second person has reviewed this specification and the corpus. Comments are welcome as issues.

## Differences from the plan

The specification refines some formulas of [`PLAN/PLAN.md`](../PLAN/PLAN.md) §6 and §8; the intent is unchanged.

- The token published on the board is the RFC 9474 **prepared message** (`prefix ‖ voting_id ‖ r`, 80 bytes), not `voting_id ‖ r`: the signature covers the 32-byte random prefix, so verifiers need it.
- Hashes of raw bytes use a **domain-separation prefix** (`tag("pv/cell/v1")`, `tag("pv/draw-commit/v1")`, …) so that a value computed for one purpose can never be valid for another.
- An **opening notice** is published when a voting opens; it carries the key, the rules and the draw commitment that the board must match.
- The drand round of a tie-break order is **fixed in public before it exists** (in the opening notice, or on the projection screen when a live voting closes), instead of being derived afterwards from the reported closing time ([`draws.md`](draws.md) §5, amendment to [ADR-0015](../PLAN/adr/0015-sorteos-verificables.md)).
- The server's blind signature uses OpenSSL (amendment to [ADR-0002](../PLAN/adr/0002-libreria-variante-clave.md) after milestone H1).

Decisión de diseño · Design decision: [0020-pruebas-y-verificacion.md](../PLAN/adr/0020-pruebas-y-verificacion.md)

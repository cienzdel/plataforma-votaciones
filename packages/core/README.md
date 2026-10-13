# `packages/core`

**ES** · Núcleo puro, sin E/S, que implementa la especificación de [`spec/`](../../spec/): JSON canónico, quorum y umbrales con aritmética entera, los métodos de recuento (sí/no, uninominal y bloques, vocalías, voto limitado y mayoría relativa), plazos del asentimiento, sorteos verificables, cadena de hashes, casillas de la papeleta y verificación universal del tablón. Funciona en Node y en el navegador. Pasa todo el corpus de [`spec/cases/`](../../spec/cases/) con el 100 % de cobertura de ramas y pruebas de propiedades (fast-check).

**EN** · Pure core with no I/O that implements the specification in [`spec/`](../../spec/): canonical JSON, integer quorum and thresholds, the counting methods (yes/no, single-winner and slates, committee posts, limited vote and plurality), assent deadlines, verifiable draws, hash chain, ballot cells and universal board verification. Runs in Node and in the browser. Passes the whole corpus in [`spec/cases/`](../../spec/cases/) with 100% branch coverage and property-based tests (fast-check).

## Uso · Usage

```sh
pnpm install
pnpm --filter @pv/core test        # Vitest + coverage (100% required)
pnpm --filter @pv/core typecheck
```

| Module | Spec |
|---|---|
| `jcs.ts`, `bytes.ts`, `time.ts` | `formats.md` §1 |
| `signature.ts` | `formats.md` §2.1, §2.3 (verification with WebCrypto) |
| `ballot.ts` | `formats.md` §2.4, §3, §10 |
| `quorum.ts`, `fraction.ts`, `methods/` | `methods.md` §1–§5 |
| `assent.ts` | `methods.md` §7 |
| `draw.ts` | `draws.md` |
| `chain.ts` | `formats.md` §9 |
| `board.ts` | `protocol.md` §10 |

## Límites · Limits

- **ES** · El núcleo no verifica la firma BLS de drand: comprueba que `randomness = H(signature)`, la regla de la ronda, `σ` y el orden. La firma BLS la comprueba el verificador Python ([`tools/verify`](../../tools/verify/)).
- **EN** · The core does not verify the drand BLS signature: it checks `randomness = H(signature)`, the round rule, `σ` and the order. The BLS signature is checked by the Python verifier ([`tools/verify`](../../tools/verify/)).
- **ES** · Los plazos del asentimiento usan los datos de zonas horarias del entorno (`Intl`). · **EN** · Assent deadlines use the runtime's time-zone data (`Intl`).
- **ES** · No se implementa ninguna primitiva criptográfica: SHA-256 viene de `@noble/hashes` y RSA-PSS de WebCrypto. · **EN** · No cryptographic primitive is implemented here: SHA-256 comes from `@noble/hashes` and RSA-PSS from WebCrypto.

Decisión de diseño · Design decision: [0009-catalogo-metodos-y-perfil.md](../../PLAN/adr/0009-catalogo-metodos-y-perfil.md), [0020-pruebas-y-verificacion.md](../../PLAN/adr/0020-pruebas-y-verificacion.md)

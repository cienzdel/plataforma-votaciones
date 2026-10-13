# `tools/verify`

**ES** · Verificador independiente (CLI en Python), escrito a partir de [`spec/`](../../spec/) y no del código TypeScript. Comprueba un repositorio de datos completo ([`spec/formats.md`](../../spec/formats.md) §9.1):

- en cada tablón, los pasos de [`spec/protocol.md`](../../spec/protocol.md) §10.2: firmas RSA-PSS, casillas, totales, contadores, quorum, sorteo (con la firma BLS de drand), resultado, tabla de candidaturas y cadena;
- los sorteos sueltos, los asentimientos y, si se le dan, los comprobantes de votantes.

Pasa todo el corpus de [`spec/cases/`](../../spec/cases/).

**EN** · Independent verifier (Python CLI), written from [`spec/`](../../spec/) rather than from the TypeScript code. It checks a whole data repository ([`spec/formats.md`](../../spec/formats.md) §9.1):

- for every board, the steps of [`spec/protocol.md`](../../spec/protocol.md) §10.2: RSA-PSS signatures, cells, tallies, counters, quorum, draw (including the drand BLS signature), result, candidates table and chain;
- stand-alone draws, assent records and, when given, voters' receipts.

It passes the whole corpus in [`spec/cases/`](../../spec/cases/).

## Uso · Usage

```sh
pip install ./tools/verify
python -m pv_verify <data-repository> [--receipt receipt.json]... [--profile profile.json]... [--json]
```

Códigos de salida · Exit codes: `0` todo correcto · all checks passed; `1` algún fallo · some check failed; `2` no se puede leer el repositorio · the repository cannot be read.

## Desarrollo · Development

```sh
cd tools/verify
python -m venv .venv
.venv/Scripts/python -m pip install cryptography==50.0.2 py_ecc==8.0.0 tzdata==2026.5 pytest==9.1.1   # .venv/bin/python on Linux/macOS
.venv/Scripts/python -m pytest
```

| Module | Spec |
|---|---|
| `canonical.py` | `formats.md` §1 |
| `methods.py` | `methods.md` §1–§5, `formats.md` §3 |
| `assent.py` | `methods.md` §7 |
| `draws.py` | `draws.md` |
| `chain.py` | `formats.md` §9 |
| `board.py` | `protocol.md` §10 |
| `repository.py`, `cli.py` | `formats.md` §9.1 |

- **ES** · No implementa primitivas criptográficas. RSA-PSS viene de `cryptography`. La firma de drand se verifica con las operaciones de BLS12-381 de `py_ecc` (hash-to-curve RFC 9380 y emparejamientos), del mismo modo que la propia librería verifica sus firmas sobre G2.
- **EN** · No cryptographic primitive is implemented here. RSA-PSS comes from `cryptography`. The drand signature is verified with `py_ecc`'s BLS12-381 operations (RFC 9380 hash-to-curve and pairings), in the same way the library verifies its own G2 signatures.

Decisión de diseño · Design decision: [0020-pruebas-y-verificacion.md](../../PLAN/adr/0020-pruebas-y-verificacion.md)

# Cómo contribuir · Contributing

> 🇪🇸 Español primero · 🇬🇧 English below

## Español

¡Gracias por tu interés! Este proyecto busca que cualquiera pueda comprobar que una votación es secreta y que su recuento es correcto. Por eso la claridad importa tanto como el código.

### Antes de empezar

- Lee el [README](README.md), el [protocolo](docs/es/protocolo.md) y el [modelo de amenazas](docs/es/modelo-amenazas.md).
- Las decisiones de diseño están en [`PLAN/`](PLAN/PLAN.md) y en sus [registros de decisión (ADR)](PLAN/adr/). Para cambiar una decisión, abre primero un *issue* que explique el motivo.
- Los fallos de seguridad **no** se comunican por *issues*: ver [SECURITY.md](SECURITY.md).
- Aplica el [código de conducta](CODE_OF_CONDUCT.md).

### Reglas del repositorio

- **Idiomas:** el código, los identificadores, los comentarios y los mensajes de commit van en inglés. La documentación pública va en español e inglés; si cambias una, actualiza la otra o indícalo en la PR.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`…).
- **DCO:** cada commit lleva `Signed-off-by:` (`git commit -s`), que certifica el [Developer Certificate of Origin](https://developercertificate.org/).
- **Pull requests:**
  - `main` está protegida;
  - hace falta al menos **1 revisión** y la CI en verde;
  - los cambios en `packages/core`, en `spec/` o en cualquier parte criptográfica requieren **2 revisiones**.
- **Criptografía:** está prohibido implementar primitivas criptográficas propias. Solo se usan librerías mantenidas (ver [ADR-0002](PLAN/adr/0002-libreria-variante-clave.md)).
- **Datos:** nunca subas datos personales, correos reales, nombres de miembros, claves, tokens ni credenciales. Los ejemplos usan datos ficticios.
- **Alcance:** no añadas funcionalidades que no estén en el plan aprobado sin un *issue* y una decisión previos.
- **Versionado:** [SemVer](https://semver.org/lang/es/). Los cambios visibles se anotan en [CHANGELOG.md](CHANGELOG.md).

### Licencia de las contribuciones

Al contribuir aceptas que tu código se publique con [EUPL-1.2](LICENSE) y tu documentación con [CC BY-SA 4.0](docs/LICENSE).

## English

Thank you for your interest! This project aims to let anyone check that a vote is secret and its count is correct, so clarity matters as much as code.

### Before you start

- Read the [README](README.en.md), the [protocol](docs/en/protocol.md) and the [threat model](docs/en/threat-model.md).
- Design decisions live in [`PLAN/`](PLAN/PLAN.md) (in Spanish) and its [ADRs](PLAN/adr/). To change a decision, first open an issue explaining why.
- Security issues must **not** be reported in public issues: see [SECURITY.md](SECURITY.md).
- The [code of conduct](CODE_OF_CONDUCT.en.md) applies.

### Repository rules

- **Languages:** code, identifiers, comments and commit messages are in English. Public documentation is in Spanish and English; if you change one, update the other or say so in the PR.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/).
- **DCO:** every commit carries `Signed-off-by:` (`git commit -s`), certifying the [Developer Certificate of Origin](https://developercertificate.org/).
- **Pull requests:**
  - `main` is protected;
  - at least **1 review** and green CI are required;
  - changes to `packages/core`, `spec/` or anything cryptographic need **2 reviews**.
- **Cryptography:** implementing cryptographic primitives ourselves is forbidden. We only use maintained libraries (see [ADR-0002](PLAN/adr/0002-libreria-variante-clave.md)).
- **Data:** never commit personal data, real e-mail addresses, member names, keys, tokens or credentials. Examples use fictitious data.
- **Scope:** do not add features outside the approved plan without a prior issue and decision.
- **Versioning:** [SemVer](https://semver.org/). User-visible changes go into [CHANGELOG.md](CHANGELOG.md).

### Licensing of contributions

By contributing you agree that your code is published under [EUPL-1.2](LICENSE) and your documentation under [CC BY-SA 4.0](docs/LICENSE).

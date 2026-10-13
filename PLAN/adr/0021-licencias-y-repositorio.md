# ADR-0021: Licencias y gobierno del repositorio

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El repositorio es público para que cualquiera audite. Importa que quien despliegue una versión modificada tenga que publicar su código.

## Decisión

- **Código:** EUPL-1.2. Es copyleft, cubre el uso en red, tiene texto oficial con validez en español y es compatible con GPL y AGPL.
- **Documentación:** CC BY-SA 4.0.
- **Convenciones:**
  - Conventional Commits en inglés y versiones SemVer.
  - CHANGELOG con el formato Keep a Changelog.
  - GitHub Releases con atestación de procedencia.
- **CI** en cada PR: lint, tipos, pruebas con cobertura del núcleo, vectores del RFC, corpus en TS y Python, Playwright con axe, prueba «sin registros», CodeQL y Dependabot.
- **Seguridad:** reporte privado de vulnerabilidades de GitHub, sin correos en el repositorio.
- **Comunidad:** Contributor Covenant 2.1 en español e inglés. PR con `main` protegida, al menos 1 revisión (2 en el núcleo y la criptografía) y DCO.
- **Documentación:** Markdown en GitHub, sin web aparte.
- **Alojamiento:** cuenta personal de GitHub (decisión de la Comisión).

## Alternativas descartadas

- **AGPL-3.0:** garantía equivalente, pero sin texto oficial en español.
- **MIT:** permitiría desplegar versiones modificadas cerradas.
- **Organización de GitHub para el repositorio de código:** se prefirió la rapidez de una cuenta personal.

## Consecuencias

- El repositorio de código depende de una persona. El despliegue y los datos viven en una cuenta asociada al correo del órgano ([ADR-0022](0022-operacion-y-relevo.md)).
- Exigir 2 revisiones puede ser difícil con pocas personas; si no hay dos revisores, el cambio espera.

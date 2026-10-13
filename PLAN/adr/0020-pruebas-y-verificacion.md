# ADR-0020: Pruebas y verificación independiente

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El objetivo es que cualquiera pueda comprobar el resultado sin fiarse de nuestro código.

## Decisión

- **Herramientas:** Vitest, fast-check (propiedades) y Playwright con axe.
- **Cobertura:** 100 % de ramas en `packages/core`; sin umbral fuera del núcleo.
- **Criptografía:** vectores de prueba de RFC 9474 y verificación cruzada de las firmas con la librería `cryptography` de Python.
- **Corpus JSON** compartido en `spec/cases` (entrada, reglas, resultado esperado y explicación en lenguaje llano), que ejecutan el núcleo TS y la CLI de Python.
- **CLI de verificación** en Python, escrita a partir de `spec/` y no del código TS. Recalcula firmas, contadores, totales, métodos, sorteos (drand incluido) y la cadena.
- **Revisión externa:** convocatoria abierta, sin exigirla antes del primer uso (decisión de la Comisión).
- **Simulacro:** solo con el equipo de desarrollo (decisión de la Comisión).

## Alternativas descartadas

- **CLI en TypeScript reutilizando el núcleo:** reproduciría sus propios errores.
- **Exigir una revisión externa antes del uso:** se prefirió no condicionar la fecha.
- **Simulacro con miembros reales:** más logística.

## Consecuencias

- Dos implementaciones independientes deben coincidir en todo el corpus.
- **Riesgos aceptados:** uso sin revisión independiente previa y un simulacro que puede no detectar problemas de uso reales. Se indican en el README y en el modelo de amenazas.

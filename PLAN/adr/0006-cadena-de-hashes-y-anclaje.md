# ADR-0006: Cadena de hashes y anclaje externo

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Un operador con acceso total podría reescribir resultados antiguos y regenerar todos los hashes.

## Decisión

- Formato: SHA-256 sobre JSON canónico RFC 8785 (JCS).
- Cada votación cerrada genera `record_hash = H(JCS({prev, board: H(JCS(tablón))}))`.
- Anclajes:
  1. El `record_hash` se envía por correo a todo el censo de la votación al cerrar.
  2. El tablón y la cadena se publican como commits en un repositorio de datos público, cuyo historial tiene fecha y vive fuera de la VM.
- La cadena sigue a través de los relevos de Comisión sin cortes.

## Alternativas descartadas

- **Solo la cadena, sin anclaje:** se podría regenerar entera.
- **Sellado de tiempo de terceros (RFC 3161, OpenTimestamps):** otra dependencia; se podría añadir más adelante.

## Consecuencias

- Reescribir el historial exigiría alterar los buzones de todo el censo y el historial público de git.
- La CLI recalcula la cadena completa.
- JCS hace que los hashes sean reproducibles byte a byte en cualquier lenguaje.

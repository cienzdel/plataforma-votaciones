# ADR-0015: Sorteos verificables con compromiso y baliza drand

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Hacen falta sorteos para deshacer empates persistentes y para el orden único de desempate (vocalías, voto limitado). Ni la mesa ni ningún tercero debe poder elegir el resultado.

## Decisión

- **Compromiso:** la mesa publica `H(semilla)` y se fija una ronda futura `R` de drand (red quicknet, firmas BLS verificables; drand.love/developer/http-api).
  - Para el orden de desempate de una votación, `R` se fija en público antes de que exista (enmienda del 2026-10-13, hito H2). En el enlace final, `R` es la primera ronda con hora ≥ la hora de cierre fijada al abrir, y se publica en el aviso de apertura. En directo, al cerrar se fija `R` unos 30 s después y se muestra en la proyección junto con el compromiso. La semilla se compromete al crear la votación.
  - Para un empate en la sala, `R` es una ronda unos 30 s después.
- **Resultado:** `σ = H(semilla ‖ ρ_R)`, y después Fisher–Yates sobre los ids en orden canónico con `H(σ ‖ i)` en modo contador y muestreo por rechazo.
- **Fallo de drand:** se espera, porque la ronda es fija y recuperable de cualquier espejo. Nunca se usa solo la semilla de la mesa.

## Alternativas descartadas

- **Solo compromiso y revelación de la mesa:** la mesa puede escoger la semilla que le convenga.
- **Solo drand:** sería una dependencia total de un tercero.
- **Ordenar por `H(σ ‖ id)`:** igual de válido, pero se prefirió un procedimiento de barajado estándar.

## Consecuencias

- Antes de la enmienda, `R` se derivaba de la hora de cierre que declara el servidor: quien conociera la semilla y controlara el servidor podía declarar un cierre posterior y elegir entre varias rondas ya vistas. Fijar `R` en público antes de que exista elimina esa elección ([`spec/draws.md`](../../spec/draws.md) §5).

- Ninguna de las partes controla el resultado por sí sola.
- La CLI verifica la firma BLS de la ronda y el orden.
- Comprobado en H1: periodo de 3 s, `chain_hash` `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, esquema `bls-unchained-g1-rfc9380` ([resultados](../h1-pruebas-de-concepto.md#1-drand-quicknet)). La clave pública y el `chain_hash` se fijan en `spec/` para verificar sin red.

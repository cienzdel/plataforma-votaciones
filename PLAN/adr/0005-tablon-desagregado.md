# ADR-0005: Tablón público desagregado por casilla

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Publicar la papeleta completa de cada token permitiría usar combinaciones raras (p. ej., en vocalías con muchas casillas) como «firma» para comprar o coaccionar votos. Publicar solo totales impediría que cada persona compruebe su voto.

## Decisión

El tablón de una votación cerrada contiene:

- `participation`: los pares `(token, firma)`, que cualquiera puede verificar.
- Por cada casilla `c`, una lista `(id_c, valor)` ordenada por `id_c`, con `id_c = H(s ‖ voting_id ‖ c)`. `s` es un secreto aleatorio de 32 bytes que genera el cliente para esa papeleta.
- Contadores, reglas, resultado y sorteo.

Cada lista de casilla tiene tantas entradas como `participation`; la abstención cuenta como un valor. El comprobante del votante es `(token, firma, s, respuestas)`. Tras publicar, el servidor borra `s` y las papeletas agrupadas.

**El id no puede derivarse del token**, que es público: si lo hiciera, cualquiera reconstruiría las papeletas completas.

## Alternativas descartadas

- **Papeleta completa por token:** facilita la compra de votos mediante combinaciones identificables.
- **Solo totales y lista de tokens:** nadie podría comprobar que su voto concreto se contó bien.

## Consecuencias

- Cualquiera recalcula totales y algoritmos, porque los métodos solo necesitan totales por casilla.
- Cada votante comprueba sus casillas, y terceros no pueden reconstruir combinaciones.
- El servidor conoce las papeletas completas, sin identidad, hasta el cierre.
- Quien tenga el comprobante de otra persona puede ver su voto (no hay resistencia a recibos). Se avisa en la interfaz.
- En las votaciones sí/no, el tablón desagregado equivale a la papeleta completa.

# ADR-0010: Votaciones en directo y enlace final

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El Reglamento prevé que las votaciones en línea se abran al terminar la sesión, con un plazo anunciado. Sin embargo, la elección de cargos es secuencial (bloques, cargo a cargo, segunda vuelta, desempates) y no cabe en un único enlace.

## Decisión

- Se admiten votaciones **en directo** (la mesa abre y cierra durante la sesión) y en el **enlace final** (cierre automático a la hora fijada al abrir, que no se puede acortar).
- La **elección de cargos** (bloques e individuales) **solo se hace en directo**, con un asistente que propone la siguiente votación.
- Vocalías, voto limitado y sí/no pueden ir en cualquiera de los dos modos.
- Una votación no se edita nunca. La mesa puede anularla con un motivo que se publica, junto con su tablón, y crear otra.
- Los resultados se publican automáticamente al cerrar.

## Alternativas descartadas

- **Solo el enlace final:** los cargos tendrían que hacerse en papel o con varias rondas de enlace.
- **Rondas sucesivas de enlace para los cargos:** alargan el proceso durante días.
- **Publicar los resultados tras validarlos la mesa:** permitiría retrasar un resultado incómodo.

## Consecuencias

- En directo, el anonimato por metadatos es más débil (menos tiempo y menos actividad que sirva de cobertura); se documenta.
- Hacer los cargos solo en directo se aparta de la posibilidad que abre el Reglamento de votarlos en línea al término de la sesión. Se documenta como decisión de diseño.
- Quien participa por vía telemática puede votar las votaciones electrónicas en directo si la mesa lo ha registrado como presente.

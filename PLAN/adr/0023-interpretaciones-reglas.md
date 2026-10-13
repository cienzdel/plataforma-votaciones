# ADR-0023: Interpretaciones de las reglas de votación

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El texto del Reglamento deja huecos que el software tiene que resolver de forma determinista. Cada interpretación queda documentada para que el Pleno pueda confirmarla o corregirla.

## Decisión

| Hueco | Interpretación adoptada (perfil del Pleno) |
|---|---|
| Base de «mayoría de presentes» con votos delegados | Presentes + delegados ejercidos (parámetro). **[POSPUESTO]** a la confirmación del Pleno. |
| Redondeo | «Más de la mitad» es estricto. «Dos tercios» y quorums usan ≥ con techo. Aritmética entera. |
| Candidatura única con empate | No elegida; el cargo queda sin cubrir. |
| «De persistir» el empate | Tras 1 repetición (parámetro), se sortea. |
| Empate por el paso a la segunda vuelta | Se repite entre las empatadas para ese puesto y, si persiste, se sortea. |
| «En contra de todas» supera a ambas en la segunda vuelta | Gana la más votada (literal). Parámetro para otros órganos. |
| Bloques con varias candidaturas | Mismo método que un cargo, con segunda vuelta. |
| Persona ya elegida para un cargo anterior | Se retira de los siguientes; la mesa puede deshacerlo con un motivo. |
| Elección de un solo puesto (representantes, delegación de titulación) | Mayoría relativa: gana la más votada (decisión de la Comisión). |
| Empates en el voto limitado (último puesto y suplentes) | Orden de desempate sorteado, sin repetir la votación (decisión de la Comisión). Se aparta de la regla general de empates. |
| Mínimo de votos en el voto limitado | Ninguno (parámetro). |
| Vacante posterior de vocalía | Siguiente candidatura elegible, con el orden del recuento original. |
| Abstención explícita | Existe en todas las papeletas secretas y no cuenta como emitida. |
| Voto delegado en una votación restringida a una titulación | Cuenta la titulación de quien delega. |
| Presentes en el enlace final | Los del momento de levantar la sesión (parámetro). |
| Cargos en línea al término de la sesión | No se ofrece: los cargos se eligen solo en directo. |

## Alternativas descartadas

Cada hueco tenía alternativas razonables, recogidas en el registro de la entrevista. Se eligieron la lectura literal o la opción más simple de verificar, salvo donde la Comisión decidió otra cosa.

## Consecuencias

- Las interpretaciones son parámetros del perfil siempre que es posible, y otros órganos pueden ajustarlas.
- El acuerdo del Pleno que apruebe la plataforma debería incluir esta tabla ([ADR-0024](0024-encaje-institucional.md)).

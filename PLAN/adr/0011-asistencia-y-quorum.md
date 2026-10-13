# ADR-0011: Asistencia, foto de presentes y quorum

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El quorum debe existir en el momento de cada votación. Los votos delegados no cuentan para el quorum, y solo votan los presentes y quienes ejercen votos delegados.

## Decisión

- **Asistencia:** la registra solo la mesa (entradas y salidas, presencial o telemática), como eventos con hora. La telemática se marca al comprobar en la videollamada que la persona está conectada.
- **Foto de presentes:** al abrir cada votación se congela la lista de presentes y sus derechos de voto, que son el censo y la base del quorum de esa votación. En el enlace final, la foto por defecto es la del momento de levantar la sesión (parámetro: «presente en algún momento»).
- **Total de miembros:** se congela al abrir la sesión. Corregir el censo con la sesión abierta exige forzarlo con un motivo registrado.
- **Convocatorias:** la segunda la activa la mesa con un botón que se habilita tras N minutos (15 en el perfil). Los umbrales son 1/3 y 1/4, y se calculan como presentes ≥ ⌈miembros·p/q⌉.
- **Sin quorum:** la plataforma avisa y la mesa puede forzar la apertura con un motivo que se publica junto al resultado.
- **Publicación:** totales en la web; la lista nominal solo en la exportación para el acta.
- **Titulación:** las votaciones restringidas filtran el censo por titulación. Los requisitos académicos adicionales no se guardan.

## Alternativas descartadas

- **Código rotatorio en la sala:** se descartó; la lista de la mesa es más fiable.
- **Botón «salgo» para el miembro:** incoherente con un registro llevado por la mesa.
- **Bloquear la apertura sin quorum:** un error de registro podría paralizar la sesión.

## Consecuencias

- Depende de la diligencia de la mesa. Los forzados quedan publicados.
- Los eventos de asistencia son datos personales y siguen la retención de [ADR-0019](0019-rgpd.md).

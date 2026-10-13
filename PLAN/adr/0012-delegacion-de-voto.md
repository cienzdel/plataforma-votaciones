# ADR-0012: Delegación de voto

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Un miembro puede delegar su voto en otro, con un tope por persona. El voto delegado cuenta en todas las votaciones, incluidas las secretas y las en línea, pero no para el quorum.

## Decisión

- La mesa registra la delegación, recibida por el canal que fije la convocatoria. Solo se guarda «justificada: sí»; el motivo no.
- Tope configurable (2 en el perfil), comprobado al registrar.
- Se envía un correo a quien delega y a la persona delegada al registrar o suspender la delegación.
- Vale para toda la sesión, enlace final incluido.
- Si quien delegó llega, la delegación se suspende para las votaciones que se abran después.
- Los votos delegados siguen la presencia de la persona delegada.
- En las votaciones restringidas a una titulación cuenta la titulación de quien delega.
- La persona delegada recibe **papeletas separadas** («Tu voto» y «Voto delegado de …»), cada una con su credencial y su comprobante.

## Alternativas descartadas

- **Formulario de autoservicio con aceptación:** más trabajo y no es necesario.
- **Papeleta con peso:** revelaría en el tablón quién tiene delegaciones e impediría votar distinto en cada una.
- **Guardar el motivo de la ausencia:** podría ser un dato de categoría especial (art. 9 del RGPD).

## Consecuencias

- La persona delegada conoce el voto delegado; es un riesgo aceptado e inherente.
- Una delegación falsa introducida por la mesa es detectable gracias a los correos.

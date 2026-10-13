# ADR-0025: Roles, anulación y publicación automática

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Pocas personas voluntarias y el objetivo de que nadie pueda manipular reglas ni resultados sin que se vea.

## Decisión

- Un único rol con permisos, **mesa** (1–3 personas), que crea, abre, cierra y anula votaciones y registra asistencia, delegaciones y censo.
- La primera persona de mesa se fija en la configuración del despliegue; después la mesa asigna y retira el rol, y se publica un registro con el alias de cargo.
- La **administración técnica puede coincidir con la mesa**. Es un riesgo documentado.
- Las personas sin voto no tienen cuenta. Todo lo auditable es público y no hay un rol de auditoría con privilegios.
- Las votaciones no se editan; se anulan con un motivo público.
- Los resultados se publican automáticamente al cerrar.
- La petición de voto secreto la decide la mesa y la plataforma muestra el umbral como ayuda. Votaciones no secretas: nominales electrónicas o de recuento manual.

## Alternativas descartadas

- **Rol de solo secretaría:** depende de una sola persona.
- **Rol de auditoría con acceso interno:** ampliaría quién ve datos personales.
- **Edición mientras no haya votos:** abre una ventana para cambiar las reglas sin que se vea.

## Consecuencias

- Concentrar mesa y administración técnica en las mismas personas les da capacidad de correlacionar en tiempo real ([`modelo-amenazas.md`](../modelo-amenazas.md)).

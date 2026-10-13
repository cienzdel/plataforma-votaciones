# ADR-0009: Catálogo cerrado de métodos y perfil de reglas versionado

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

La herramienta debe servir al Pleno y, si es posible, a otros órganos. Por eso no puede citar artículos concretos ni fijar en el código las reglas de un solo reglamento. Al mismo tiempo, unas reglas totalmente libres serían imposibles de auditar.

## Decisión

- Un **catálogo cerrado** de métodos probados:
  - sí/no con umbral;
  - uninominal con segunda vuelta;
  - candidaturas en bloque;
  - asignación de vocalías por aceptación diferida;
  - voto limitado;
  - mayoría relativa;
  - asentimiento.
- Cada método tiene parámetros acotados: base, regla, asistencia mínima, repeticiones antes del sorteo, bloqueo por «en contra de todas», mínimo de votos y opciones visibles.
- Un **perfil** versionado por órgano (`profiles/*.json`, en el repositorio de despliegue) fija los quorums por convocatoria, el tope de delegaciones, los plazos, las materias excluidas del asentimiento, los textos y el nombre del órgano.
- Cada resultado publica las **reglas efectivas** (perfil + parámetros), serializadas con JCS, y su `rules_hash`.
- La interfaz describe los métodos con nombres genéricos (p. ej., «mayoría absoluta con segunda vuelta»), sin citar artículos.

## Alternativas descartadas

- **Reglas fijas en el código para el Pleno:** sería más simple, pero no reutilizable.
- **Motor de reglas declarativo (DSL o JSON libre):** demasiado difícil de auditar y probar.

## Consecuencias

- Las combinaciones de parámetros amplían la superficie de errores, lo que exige un corpus de casos amplio ([ADR-0020](0020-pruebas-y-verificacion.md)).
- Un cambio de reglas no puede pasar inadvertido, porque cambia el `rules_hash`.
- El perfil del Pleno se marca como «basado en texto pendiente de ratificación» hasta que el Reglamento se ratifique.

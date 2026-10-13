# ADR-0018: Sin registros de acceso ni metadatos de los votos

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Con un electorado pequeño, la hora, la IP o el orden de llegada pueden revelar quién emitió cada voto.

## Decisión

- El proxy no lleva registro de acceso. La aplicación solo registra errores, sin IP, user-agent, token ni identidad.
- La limitación de intentos se hace en memoria.
- Las tablas de votos y tokens gastados son `WITHOUT ROWID`, con clave en el token y sin columnas de tiempo ni autoincrementales.
- Tras el cierre se borran las papeletas agrupadas y el secreto `s`, y se ejecuta `VACUUM` con `secure_delete`.
- La CI incluye una prueba que falla si el endpoint de recepción escribe registros o guarda campos temporales.

## Alternativas descartadas

- **Registros de acceso solo en la autenticación:** vincularían IP, identidad y hora cerca de la votación.

## Consecuencias

- Se pierde capacidad de diagnosticar incidentes y de detectar ataques por fuerza bruta.
- **[por verificar]** Los residuos de orden en archivos de SQLite (WAL, páginas). Se documentan.
- Nada impide a un operador malicioso activar registros en su VM. Por eso este límite figura en el modelo de amenazas.

# ADR-0016: Stack tecnológico

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Lo mantendrán estudiantes que cambian cada curso. La librería criptográfica elegida es TypeScript. La página debe ser ligera para la mala cobertura de la sala.

## Decisión

- **TypeScript** en todo el proyecto.
- **Servidor:** Hono sobre **Node.js LTS**.
- **Cliente:** Preact con Vite, con un presupuesto de 200 KB.
- **Base de datos:** SQLite con Drizzle ORM.
- **Monorepo** pnpm: `packages/core` (puro, sin E/S), `apps/api`, `apps/web`, `spec/`, `tools/verify` (Python), `infra/`, `profiles/`, `docs/` y `PLAN/`.

## Alternativas descartadas

- **SvelteKit:** ligero, pero con más convenciones propias.
- **Next.js:** pesado para el presupuesto y acoplado en la práctica a Vercel.
- **PostgreSQL en la VM:** innecesario para unas 60 personas y un servicio más que mantener.
- **Bun o Deno:** menos conocidos o menos maduros para este equipo.

## Consecuencias

- Hono y Drizzle permiten el plan B (Render + Neon con PostgreSQL) sin reescribir la lógica.
- SQLite simplifica las copias de seguridad, pero exige cuidar los artefactos de orden ([ADR-0018](0018-sin-registros.md)).

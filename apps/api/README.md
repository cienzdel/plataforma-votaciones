# `apps/api`

**ES** · API del servidor (Hono sobre Node.js, SQLite con Drizzle). Hito H5: acceso por código de correo y acceso asistido, censo desde CSV, rol de mesa con registro público por alias de cargo, sesiones con primera y segunda convocatoria, asistencia, delegaciones y foto de presentes, y correo por Gmail API o SMTP. La emisión de credenciales y la recepción de votos llegan en H6. No hay registro de peticiones: no se guarda IP, navegador, cabeceras ni hora de acceso ([ADR-0018](../../PLAN/adr/0018-sin-registros.md)).

**EN** · Server API (Hono on Node.js, SQLite with Drizzle). Milestone H5: login by e-mail code and assisted login, census from CSV, the `mesa` role with a public log by position alias, meetings with first and second call, attendance, proxy votes and the attendance snapshot, and e-mail through Gmail API or SMTP. Credential issuance and vote reception arrive in H6. There is no request log: no IP, browser, header or access time is stored ([ADR-0018](../../PLAN/adr/0018-sin-registros.md)).

## Uso · Usage

```sh
pnpm --filter @pv/api test         # integration tests on in-memory SQLite
pnpm --filter @pv/api typecheck
PV_DB=data.db PV_PROFILE=../../profiles/example.json PV_WEB_ORIGIN=http://localhost:5173 \
PV_FIRST_OFFICIAL_EMAIL=mesa@example.org PV_FIRST_OFFICIAL_NAME="Persona Mesa" PV_MAIL=memory \
pnpm --filter @pv/api start        # Node ≥ 23.6 runs the TypeScript directly
```

Las variables de entorno están descritas en · Environment variables are described in [`src/server.ts`](src/server.ts). `PV_MAIL=memory` no envía correos: solo para desarrollo · does not send e-mail: development only.

## Rutas · Routes

| Route | Who | What |
|---|---|---|
| `POST /auth/code`, `POST /auth/session` | anyone | Request a login code; exchange it for a 12-hour bearer session. |
| `GET /auth/me`, `POST /auth/logout` | member | |
| `POST /auth/assisted-code` | mesa | Code for a person whose identity was checked face to face; recorded and notified. |
| `GET /census`, `POST /census/import` | mesa | CSV `name,email,degrees` (degrees separated by `;`); `dry_run`; `reason` while a meeting is open. |
| `GET /roles/log` | anyone | Public log of role changes, by alias. |
| `GET /roles`, `POST /roles`, `DELETE /roles/:memberId` | mesa | 1–3 officials. |
| `GET /meetings`, `GET /meetings/:id` | member | Officials also see attendance and proxies. |
| `POST /meetings`, `…/open`, `…/second-call`, `…/close` | mesa | |
| `POST /meetings/:id/attendance` | mesa | Entry or exit, in person or remote. |
| `POST /meetings/:id/delegations`, `DELETE …/delegations/:fromId` | mesa | Proxy votes (ADR-0012). |

Decisión de diseño · Design decision: [0004-desacople-emision-envio.md](../../PLAN/adr/0004-desacople-emision-envio.md), [0013-autenticacion-codigo-correo.md](../../PLAN/adr/0013-autenticacion-codigo-correo.md), [0016-stack.md](../../PLAN/adr/0016-stack.md)

# `apps/web`

**ES** · Interfaz web (Preact + Vite), que GitHub Actions compilará y GitHub Pages servirá con atestación de procedencia (hito H9). Hito H7:
- **Votante:** acceso por código, credenciales anónimas pedidas automáticamente al abrir (cegado y finalización RSA en el navegador con blindrsa-ts), una papeleta por derecho, revisión antes de enviar, comprobante descargable y comprobación individual en el tablón al cerrar.
- **Mesa:** sesión, asistencia, delegaciones, votaciones, censo, rol de mesa y acceso asistido.
- **Proyección:** vista para la pantalla de la sala.

Español e inglés, móvil primero y WCAG 2.2 AA. Pesa unos 116 KB sin comprimir, con un presupuesto de 200 KB.

**EN** · Web interface (Preact + Vite), to be built by GitHub Actions and served by GitHub Pages with build provenance attestation (milestone H9). Milestone H7:
- **Voter:** login by code, anonymous credentials requested automatically when a voting opens (RSA blinding and finalisation in the browser with blindrsa-ts), one ballot per right, review before sending, downloadable receipt and individual check against the board after closing.
- **Officials:** meeting, attendance, proxy votes, votings, census, the officials' role and assisted login.
- **Projection:** a view for the room's screen.

Spanish and English, mobile first and WCAG 2.2 AA. About 116 KB uncompressed, against a 200 KB budget.

## Uso · Usage

```sh
pnpm --filter @pv/web dev          # development server; needs the API (apps/api) running
pnpm --filter @pv/web test         # build + size budget (200 KB)
pnpm --filter @pv/web e2e          # Playwright + axe: officials and three voters, one with a proxy vote
```

`public/config.json` indica las direcciones de la API, de la recepción y del repositorio de datos en Pages · gives the addresses of the API, the reception origin and the data repository on Pages. En producción lo genera el despliegue · In production the deployment writes it.

Decisión de diseño · Design decision: [0017-despliegue-vm-efimera-pages.md](../../PLAN/adr/0017-despliegue-vm-efimera-pages.md)

# `infra`

**ES** · Despliegue de la máquina de votación ([ADR-0017](../PLAN/adr/0017-despliegue-vm-efimera-pages.md), [ADR-0022](../PLAN/adr/0022-operacion-y-relevo.md)): una VM efímera en Hetzner que se enciende antes de cada sesión y se apaga después, con la API y un proxy TLS sin registros. La interfaz vive en GitHub Pages y el archivo público en un repositorio de datos aparte. Aquí no hay secretos: viven en el entorno «production» de GitHub.

**EN** · Deployment of the voting machine: an ephemeral Hetzner VM started before each meeting and stopped afterwards, with the API and a TLS proxy that keeps no logs. The web client lives on GitHub Pages and the public archive in a separate data repository. No secrets here: they live in GitHub's "production" environment.

| File | What |
|---|---|
| `api.Dockerfile` | API image: Node.js 24 LTS runs the TypeScript directly; production dependencies only. |
| `compose.yaml` | API + Caddy. Docker logging driver `none` for both; read-only API container. |
| `Caddyfile` | Two origins (session API and reception) with Let's Encrypt; no access log; client address removed from forwarded headers. |
| `cloud-init.yaml` | First boot: Docker, age, git; SSH keys only; volatile system journal. |
| `scripts/hetzner.sh` | `up` (from the newest snapshot, or fresh Ubuntu) and `down` (shutdown, snapshot, delete). |
| `scripts/deploy.sh` | Copies the deployed commit to the VM, writes `.env` and the profile, starts the stack. |
| `scripts/backup.sh` | SQLite online backup, encrypted with age to the offline keys. |
| `env.example` | Every variable the VM needs, with fictitious values. |

Workflows in [`.github/workflows`](../.github/workflows/): `up.yml`, `down.yml`, `pages.yml` (build with provenance attestation), `ci.yml`, `codeql.yml`.

## Puesta en marcha · Setup (once)

Todas las cuentas se registran con el correo institucional del órgano (ADR-0022) · All accounts use the body's institutional e-mail.

1. **Hetzner:** a project, and an API token with read/write access to it → secret `HCLOUD_TOKEN`.
2. **Data repository:** a public repository with GitHub Pages enabled → variables `PV_DATA_REPOSITORY` (`owner/name`) and `PV_PAGES_URL`; a fine-grained token limited to that repository with *Contents: read and write* → secret `PV_DATA_TOKEN`.
3. **Backup repository:** a **private** repository → variable `PV_BACKUP_REPOSITORY`; a fine-grained token limited to it with *Contents: read and write* → secret `PV_BACKUP_TOKEN`.
4. **age keys:** two people of the Commission each run `age-keygen -o key.txt` on their own computer and keep the file offline. Their public keys (`age1…`), one per line → variable `AGE_RECIPIENTS`.
5. **Deploy key:** `ssh-keygen -t ed25519 -N "" -f deploy` → secret `DEPLOY_SSH_KEY` (the private file). The public key is derived when needed.
6. **Master key:** `openssl rand -hex 32` → secret `PV_MASTER_KEY`. Losing it makes the open votings' keys unreadable; it is not needed for closed ones.
7. **E-mail:** `PV_MAIL` = `gmail` (secrets `PV_GMAIL_CLIENT_ID`, `PV_GMAIL_CLIENT_SECRET`, `PV_GMAIL_REFRESH_TOKEN`) or `smtp` (variables `PV_SMTP_HOST`, `PV_SMTP_PORT`; secrets `PV_SMTP_USER`, `PV_SMTP_PASSWORD`); variable `PV_MAIL_FROM`.
8. **Other variables:** `ACME_EMAIL`, `PV_WEB_ORIGIN` (the Pages URL of this repository), `PV_FIRST_OFFICIAL_EMAIL`, `PV_FIRST_OFFICIAL_NAME`, `PV_PROFILE_FILE` (a file in `profiles/`).
9. **GitHub environment "production":** with required reviewers (1–3 officials). Pages source: GitHub Actions.

## Uso · Usage

- **Encender · Start:** run the **Up** workflow and approve it. It creates the VM (from the last snapshot, so the data are back), deploys the commit, waits for HTTPS and publishes the web client with the new API addresses.
- **Apagar · Stop:** run **Down** when nothing is open (assents included). It stores an encrypted backup in the backup repository, snapshots the VM (keeping the two newest snapshots) and deletes it; the web client then says the platform is off.

## Restaurar una copia · Restoring a backup

```sh
age --decrypt --identity key.txt --output pv.db pv-<date>.db.age
# on the VM, with the stack stopped:
docker compose -f infra/compose.yaml cp pv.db api:/data/pv.db
```

## Probado · Tested

- **ES** · En local con Docker, sin ninguna cuenta externa:
  - la imagen se construye;
  - Caddy enruta los dos orígenes y Docker no guarda registros;
  - una sesión con votación secreta real (firmas ciegas) pasa por el proxy;
  - el ciclo «arrancar → sesión → parar → arrancar» conserva los datos;
  - `tools/verify` acepta lo publicado;
  - `backup.sh` cifra con age, no deja copias en claro y la copia se restaura con la integridad comprobada;
  - actionlint y shellcheck revisan flujos y scripts.
- **EN** · Locally with Docker, without any external account:
  - the image builds;
  - Caddy routes both origins and Docker keeps no logs;
  - a session with a real secret voting (blind signatures) goes through the proxy;
  - the start → session → stop → start cycle keeps the data;
  - `tools/verify` accepts what was published;
  - `backup.sh` encrypts with age, leaves no plaintext copy, and the backup restores with its integrity checked;
  - actionlint and shellcheck check the workflows and scripts.

**Sin probar · Not tested** (needs the accounts above): `hetzner.sh`, `deploy.sh`, `cloud-init.yaml`, the workflows on GitHub, Let's Encrypt on sslip.io names. **[por verificar · to be verified]**:
- the hcloud CLI version pinned in the workflows and the server type name (`cx22`);
- the major versions of the GitHub actions;
- whether `sslip.io` is in the Public Suffix List, which affects Let's Encrypt rate limits.

Decisión de diseño · Design decision: [0017-despliegue-vm-efimera-pages.md](../PLAN/adr/0017-despliegue-vm-efimera-pages.md), [0022-operacion-y-relevo.md](../PLAN/adr/0022-operacion-y-relevo.md)

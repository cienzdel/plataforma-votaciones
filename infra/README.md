# `infra`

**ES** · Despliegue de la máquina de votación ([ADR-0017](../PLAN/adr/0017-despliegue-vm-efimera-pages.md), [ADR-0022](../PLAN/adr/0022-operacion-y-relevo.md)): una VM que se enciende antes de cada sesión y se apaga después, con la API y un proxy TLS sin registros. La interfaz vive en GitHub Pages y el archivo público en un repositorio de datos aparte. Aquí no hay secretos: viven en el entorno «production» de GitHub.

**EN** · Deployment of the voting machine: a VM started before each meeting and stopped afterwards, with the API and a TLS proxy that keeps no logs. The web client lives on GitHub Pages and the public archive in a separate data repository. No secrets here: they live in GitHub's "production" environment.

| File | What |
|---|---|
| `api.Dockerfile` | API image: Node.js 24 LTS runs the TypeScript directly; production dependencies only. |
| `compose.yaml` | API + Caddy. Docker logging driver `none` for both; read-only API container. |
| `Caddyfile` | Two origins (session API and reception) with Let's Encrypt; no access log; client address removed from forwarded headers. |
| `cloud-init.yaml` | First boot: Docker, age, git; SSH keys only; volatile system journal. |
| `scripts/oracle.sh` | Free default: `up` starts the Oracle VM (creating it the first time) and `down` stops it; its disk keeps the data. |
| `scripts/hetzner.sh` | Paid option: `up` (from the newest snapshot, or fresh Ubuntu) and `down` (shutdown, snapshot, delete). |
| `scripts/deploy.sh` | Copies the deployed commit to the VM, writes `.env` and the profile, starts the stack. |
| `scripts/backup.sh` | SQLite online backup, encrypted with age to the offline keys. |
| `env.example` | Every variable the VM needs, with fictitious values. |

Workflows in [`.github/workflows`](../.github/workflows/): `up.yml`, `down.yml`, `pages.yml` (build with provenance attestation), `ci.yml`, `codeql.yml`.

## Proveedor · Provider

La variable `PV_PROVIDER` elige el proveedor · The variable `PV_PROVIDER` chooses the provider ([ADR-0017](../PLAN/adr/0017-despliegue-vm-efimera-pages.md)):

| | `oracle` (por defecto · default) | `hetzner` |
|---|---|---|
| **ES** coste · **EN** cost | Gratis («Always Free») · Free | De pago, por horas · Paid, hourly [precio por verificar · price to be verified] |
| Empresa · Company | Oracle (EE. UU. · US) | Hetzner (UE · EU) |
| Datos · Data | Región de la UE elegida al registrarse · EU region chosen at sign-up | UE · EU |
| Entre sesiones · Between meetings | VM parada; su disco guarda los datos · VM stopped; its disk keeps the data | VM borrada; instantánea · VM deleted; snapshot |

> ⚠️ **ES** · **Avisos de la opción gratuita.** Oracle es una empresa de EE. UU.: aunque los datos estén en una región de la UE, la ley de EE. UU. (CLOUD Act) puede obligarla a darles acceso. El registro pide probablemente una tarjeta para verificar la identidad, sin cobrar [por verificar]. Oracle puede parar una VM gratuita que pase 7 días casi sin uso, sin borrarla. La capacidad Arm gratuita no está garantizada y las condiciones pueden cambiar. **Si la delegación o la facultad lo financian, se recomienda Hetzner** (`PV_PROVIDER=hetzner`): empresa y jurisdicción de la UE. Cambiar es reversible; ver «Cambiar de proveedor».
>
> ⚠️ **EN** · **Caveats of the free option.** Oracle is a US company: even with the data in an EU region, US law (CLOUD Act) can compel it to give access. Sign-up probably asks for a card to verify identity, without charging [to be verified]. Oracle may stop a free VM that stays almost idle for 7 days, without deleting it. Free Arm capacity is not guaranteed and the terms may change. **If the delegation or the faculty can fund it, Hetzner is recommended** (`PV_PROVIDER=hetzner`): EU company and jurisdiction. Switching is reversible; see "Switching provider".

### Cambiar de proveedor · Switching provider

1. Run **Down** on the current provider: it leaves an encrypted backup in the backup repository.
2. Set `PV_PROVIDER` and the new provider's secrets (below), then run **Up**: it creates an empty VM.
3. Restore the backup into it ("Restoring a backup"). The public archive and the chain do not change.

## Puesta en marcha · Setup (once)

Todas las cuentas se registran con el correo institucional del órgano (ADR-0022) · All accounts use the body's institutional e-mail.

1. **VM provider**, one of:
   - **Oracle (free):** sign up choosing an **EU home region** (e.g. Madrid or Frankfurt) → variable `OCI_REGION`. In the console:
     - create a VCN with internet connectivity and add ingress rules for TCP 80 and 443 to its public subnet's security list → variables `OCI_SUBNET_OCID` and `OCI_AVAILABILITY_DOMAIN` (and `OCI_COMPARTMENT_OCID` only if you use a compartment other than the root one, the tenancy);
     - add an API key to your user → secrets `OCI_USER_OCID`, `OCI_TENANCY_OCID`, `OCI_FINGERPRINT` and `OCI_PRIVATE_KEY`.
   - **Hetzner (paid):** a project and an API token with read/write access to it → secret `HCLOUD_TOKEN`; variable `PV_PROVIDER=hetzner`.
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

**Sin probar · Not tested** (needs the accounts above): `oracle.sh`, `hetzner.sh`, `deploy.sh`, `cloud-init.yaml`, the workflows on GitHub, Let's Encrypt on sslip.io names. **[por verificar · to be verified]**:
- the hcloud and OCI CLI versions pinned in the workflows, and the Hetzner server type name (`cx22`);
- Oracle's free Arm capacity: the first creation can fail with "Out of host capacity" or 429; on each attempt `oracle.sh` tries Arm 2 OCPU/12 GB, Arm 1 OCPU/6 GB and then the AMD micro (1 GB, with 2 GB of swap), retrying every 5 minutes for an hour (`PV_LAUNCH_ATTEMPTS`); whether the micro is enough for a real plenary is [to be verified];
- whether Oracle keeps the VM's public IPv4 across stop and start (`up` works either way: it publishes the current address);
- the major versions of the GitHub actions;
- whether `sslip.io` is in the Public Suffix List, which affects Let's Encrypt rate limits.

Decisión de diseño · Design decision: [0017-despliegue-vm-efimera-pages.md](../PLAN/adr/0017-despliegue-vm-efimera-pages.md), [0022-operacion-y-relevo.md](../PLAN/adr/0022-operacion-y-relevo.md)

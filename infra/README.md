# `infra`

> 🚧 Vacío: el código llegará en las fases de implementación · Empty: code will arrive during implementation.

**ES** · Scripts `up` y `down` para crear y destruir la VM efímera (adaptador Hetzner primero), cloud-init, Docker Compose, proxy sin registros de acceso y flujos de GitHub Actions con aprobación. Sin secretos: viven en el entorno «production» de GitHub.

**EN** · `up`/`down` scripts that create and destroy the ephemeral VM (Hetzner adapter first), cloud-init, Docker Compose, a proxy without access logs and GitHub Actions workflows with approval. No secrets here: they live in GitHub's 'production' environment.

Decisión de diseño · Design decision: [0022-operacion-y-relevo.md](../PLAN/adr/0022-operacion-y-relevo.md)

# ADR-0017: VM efímera en la UE, interfaz y archivo en GitHub Pages

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Requisito clave: nadie debe guardar la IP ni la hora de los votos. En las plataformas gestionadas, los registros de la propia plataforma escapan a nuestro control. El coste debe ser nulo o mínimo y pagarse solo cuando se usa. Fuentes consultadas en octubre de 2026:

- Render: el servicio gratuito se duerme tras 15 min sin actividad, y la base de datos gratuita caduca a los 30 días (render.com/docs/free).
- Neon: plan gratuito con 0,5 GB y 100 horas de cómputo al mes (neon.com/faqs/free-plan-limits-and-quotas).
- Cloudflare Workers: el plan gratuito limita la CPU a 10 ms por invocación (developers.cloudflare.com/workers/platform/pricing).
- Hetzner: factura por horas con tope mensual según fuentes secundarias, y subió precios en abril de 2026 [por verificar en hetzner.com/cloud].

## Decisión

- **API** en una VM de la UE (Hetzner al principio, con un adaptador por proveedor), creada con `up` antes de un pleno o de un asentimiento a partir de una instantánea, y destruida con `down` después, que deja una instantánea.
- Proxy TLS **sin registros de acceso**, certificado de Let's Encrypt y un nombre gratuito sobre la IP (tipo sslip.io). Al arrancar, la nueva URL de la API se publica en la configuración servida por Pages, sin IP fija.
- **Interfaz** compilada en GitHub Actions desde el repositorio público y servida por **GitHub Pages**, con atestación de procedencia.
- **Archivo público** (tablones, cadena, huellas, sorteos) en un **repositorio de datos público** aparte, en el que la VM escribe con un token de grano fino limitado a ese repositorio.
- `up` y `down` se ejecutan con GitHub Actions manuales y aprobación ([ADR-0022](0022-operacion-y-relevo.md)), mediante la CLI del proveedor, cloud-init y Docker Compose.
- **Plan B**, si no se consigue pagar solo por uso: Render (Frankfurt) + Neon (UE), gratis, asumiendo los registros de plataforma [por verificar].

## Alternativas descartadas

- **VM siempre encendida:** unos 5 €/mes durante todo el año.
- **Cloudflare Workers en el plan gratuito:** los 10 ms de CPU por invocación son probablemente insuficientes para RSA-3072 en JS [por verificar].
- **Oracle Cloud Always Free:** exige tarjeta y Oracle podría reclamar instancias ociosas [por verificar].
- **Todo en la VM, interfaz incluida:** la VM podría servir un JavaScript manipulado.
- **Interfaz y datos en el mismo repositorio:** el token de la VM podría alterar la interfaz publicada.

## Consecuencias

- El votante ejecuta código cuya procedencia puede comprobar. El código que corre en la VM, en cambio, no se puede atestiguar.
- La verificación pública sigue disponible con la VM apagada.
- Hay dependencias de GitHub (Pages, Actions, repositorio de datos) y del proveedor de la VM.
- Como la interfaz y la API están en orígenes distintos, la sesión va en una cabecera y hace falta CORS.

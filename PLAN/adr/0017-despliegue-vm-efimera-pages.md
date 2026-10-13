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

## Enmienda (2026-10-13, hito H9): opción gratuita por defecto

- El proveedor se elige por instancia con la variable `PV_PROVIDER`:
  - **`oracle` (por defecto, gratuito):** una VM «Always Free» de Oracle Cloud (Arm, hasta 2 OCPU y 12 GB) en la región de origen de la cuenta, que se elige en la UE al registrarla. Se crea una vez y luego solo se arranca y se para; su disco conserva los datos. Mantiene el mismo diseño sin registros, porque la VM es nuestra.
  - **`hetzner` (de pago, recomendado si lo financia la delegación o la facultad):** VM efímera de una empresa de la UE, creada desde una instantánea y destruida después.
- **Avisos de la opción gratuita**, que se muestran en la documentación de despliegue:
  - Oracle es una empresa de EE. UU., sujeta a leyes que pueden obligarla a dar acceso a datos aunque estén en la UE (CLOUD Act);
  - el registro pide probablemente una tarjeta para verificar la identidad, sin cobrar [por verificar];
  - Oracle puede parar una VM gratuita que pase 7 días casi sin uso, sin borrarla;
  - la capacidad Arm gratuita no está garantizada;
  - las condiciones gratuitas pueden cambiar.
- Se descartan como opción gratuita Render y Neon. El servicio gratuito de Render no tiene disco persistente, se duerme a los 15 minutos y pierde sus archivos, y su base de datos gratuita caduca a los 30 días (render.com/docs/free). Además obligaría a pasar a Postgres y añadiría registros de plataforma fuera de nuestro control. Tampoco sirven Fly.io (sin plan gratuito para cuentas nuevas) ni Koyeb y Northflank (sin disco persistente confirmado).

## Alternativas descartadas

- **VM siempre encendida:** unos 5 €/mes durante todo el año.
- **Cloudflare Workers en el plan gratuito:** los 10 ms de CPU por invocación son probablemente insuficientes para RSA-3072 en JS [por verificar].
- **Oracle Cloud Always Free:** exige tarjeta y Oracle podría reclamar instancias ociosas [por verificar]. *Revisado en la enmienda: pasa a ser la opción gratuita por defecto.*
- **Todo en la VM, interfaz incluida:** la VM podría servir un JavaScript manipulado.
- **Interfaz y datos en el mismo repositorio:** el token de la VM podría alterar la interfaz publicada.

## Consecuencias

- El votante ejecuta código cuya procedencia puede comprobar. El código que corre en la VM, en cambio, no se puede atestiguar.
- La verificación pública sigue disponible con la VM apagada.
- Hay dependencias de GitHub (Pages, Actions, repositorio de datos) y del proveedor de la VM.
- Como la interfaz y la API están en orígenes distintos, la sesión va en una cabecera y hace falta CORS.

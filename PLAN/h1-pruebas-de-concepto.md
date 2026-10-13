# H1: pruebas de concepto de riesgos

> Estado: **completado salvo la prueba de Gmail** (pendiente 1), que requiere la cuenta del órgano. Resultados del hito H1 de [`PLAN.md`](PLAN.md) (sección 11), que resuelve los pendientes técnicos 1, 3, 4 y 5 de la sección 12. Fecha de las mediciones: 2026-10-13. Las cifras de rendimiento dependen del equipo; se indica cuál se usó en cada caso.

## Resumen

| Pendiente | Resultado | Estado |
|---|---|---|
| 3. Periodo de drand quicknet | 3 s, cadena `52db9ba7…e971`, esquema `bls-unchained-g1-rfc9380`. | Resuelto |
| 4a. Facturación de la VM (Hetzner) | Por horas con tope mensual; la VM apagada se sigue cobrando; la IPv4 primaria se cobra aparte aunque no esté asignada. Precios concretos: [por verificar en la consola]. | Resuelto en lo esencial |
| 4b. Rendimiento de RSA-3072 en JS | Cliente: válido. Servidor: **`blindSign` de blindrsa-ts tarda ~0,9 s por firma y bloquea el proceso**. Hay una alternativa con OpenSSL ~225 veces más rápida y con resultado idéntico. | **Requiere decisión** |
| 5. Retraso de GitHub Pages | 22–38 s de `push` a contenido servido (6 medidas). El navegador puede cachear 10 min: hay que pedir con `no-store`. | Resuelto |
| 1. Gmail API con la cuenta del órgano | No se puede probar sin la cuenta. Guía en la sección 5. | Pendiente de quien custodie la cuenta |

## 1. drand quicknet

Consulta a `https://api.drand.sh/v2/beacons/quicknet/info` y a `https://api2.drand.sh/…` (respuestas idénticas):

| Campo | Valor |
|---|---|
| `period` | 3 |
| `genesis_time` | 1692803367 |
| `chain_hash` | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| `scheme` | `bls-unchained-g1-rfc9380` |
| `public_key` | `83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a` |

Comprobación: la ronda devuelta por `/rounds/latest` coincidió con `⌊(ahora − genesis_time) / 3⌋ + 1`, así que la ronda de una hora dada se calcula sin consultar la red. El esquema es *unchained*: cada ronda se verifica sola con la clave pública, sin la anterior. `drand.cloudflare.com` respondió 404 en la ruta v2; los espejos válidos se fijan en `spec/`.

Consecuencia para [ADR-0015](adr/0015-sorteos-verificables.md): se elimina el «[por verificar]». La clave pública y el `chain_hash` se fijan en el perfil o en `spec/` para que el verificador no dependa de la red al validar.

## 2. Facturación de la VM (Hetzner)

Fuente oficial: docs.hetzner.com/cloud/billing/faq (consultada el 2026-10-13).

- Se factura **por horas, redondeando hacia arriba, con un tope mensual**; si se borra la VM antes de fin de mes, solo se pagan las horas.
- **Una VM apagada se sigue cobrando** hasta que se borra. Por eso `down` debe borrarla tras crear la instantánea, como ya prevé [ADR-0017](adr/0017-despliegue-vm-efimera-pages.md).
- Las **instantáneas** se cobran por GB y mes sobre el tamaño comprimido. Fuentes secundarias dan ~0,0143 $/GB/mes; [por verificar en la consola].
- La **IPv4 primaria se cobra aparte, también sin asignar**. `down` debe borrar también la IP (no se reserva IP fija, así que encaja con el plan). La IPv6 es gratuita.
- La web de precios carga las cifras con JavaScript y no se pudieron leer; los planes compartidos más pequeños en la UE son CPX02 (1 vCPU, 1 GB) y CPX12 (1 vCPU, 2 GB) en FSN1, NBG1 y HEL1. **[por verificar]** precio por hora y tope mensual tras las subidas de 2026, en la consola de Hetzner antes de H9.

## 3. Rendimiento de blindrsa-ts (RSA-3072, RSABSSA-SHA384-PSS-Randomized)

`@cloudflare/blindrsa-ts` 0.4.6, Node 26.7.0, Intel Core i7-1355U (portátil). 60 iteraciones salvo donde se indica.

| Operación | Dónde | Media | Máximo |
|---|---|---|---|
| `generateKey` (3072) | Servidor | 118 ms (n = 5) | 209 ms |
| `blind` | Cliente | 59 ms | 75 ms |
| `blindSign` (librería) | Servidor | **897 ms** | 1093 ms |
| `finalize` | Cliente | 13 ms | 21 ms |
| `verify` | Cualquiera | 0,3 ms | 1,9 ms |
| 60 × `blind` + `blindSign` lanzadas a la vez | Servidor | **57 s en total** | — |

Las 60 firmas fueron válidas.

**Cliente en un móvil modesto (aproximación).** Chrome con la CPU limitada a 6× (la referencia habitual de DevTools para un móvil de gama baja), 20 iteraciones de `blind`: media 382 ms, mediana 290 ms, máximo 844 ms. No es una medida en un móvil real, pero indica que el cegado cabe en menos de un segundo. **[por verificar]** en un móvil Android de gama baja real durante H7.

### Problema: la firma ciega en el servidor

`blindSign` calcula `m^d mod n` con la aritmética de enteros de SJCL en JavaScript puro (`lib/src/util.js`, función `rsasp1`), sin el atajo CRT (el código lo marca como `TODO`). WebCrypto no expone la operación RSA «en bruto», así que la librería solo la delega en el entorno nativo en Cloudflare Workers (`supportRSARAW`). Consecuencias en Node:

- **~0,9 s por credencial y bloqueo del bucle de eventos**: mientras firma, la API no atiende nada más. Si 60 personas piden su credencial a la vez al abrir una votación, la última espera ~1 minuto en este portátil; en una vCPU compartida será más.
- La exponenciación de SJCL no está diseñada para ser de tiempo constante. El riesgo práctico es bajo (cada persona obtiene 1–3 firmas por votación y la clave se destruye al cerrar), pero es una debilidad que hay que documentar si se mantiene.

### Alternativa medida: RSASP1 con OpenSSL (`node:crypto`)

`crypto.privateDecrypt({ key, padding: RSA_NO_PADDING }, blindedMsg)` es exactamente RSASP1 (`m^d mod n`), ejecutado por OpenSSL con CRT y con las protecciones contra canales laterales de OpenSSL (cegado RSA interno).

| | Media | Máximo | Resultado |
|---|---|---|---|
| OpenSSL `RSA_NO_PADDING` | **3,96 ms** | 10,6 ms | 60/60 **idénticos byte a byte** a `blindSign` de la librería; 60/60 `finalize` + `verify` válidos |

No es una primitiva propia: es la operación RSA de OpenSSL. Pero hay que replicar fuera de la librería las comprobaciones de `blindSign` (que el mensaje cegado sea menor que `n` y verificar la firma con la clave pública antes de devolverla, como pide RFC 9474 §4.3). Esto afecta a [ADR-0002](adr/0002-libreria-variante-clave.md) y se plantea como decisión.

### Hallazgo durante H2: no pasar `Buffer` de Node a la librería

Al generar los vectores de `spec/cases/` (2026-10-13), blindrsa-ts 0.4.6 falló cuando el mensaje o la firma eran un `Buffer` de Node en lugar de un `Uint8Array` normal: `blind` y `finalize` lanzan `invalid signature` y `verify` devuelve `false` con una firma válida. Con `Uint8Array` (aunque sean vistas con desplazamiento) funciona. La causa probable es que `Buffer.prototype.slice` devuelve una vista y no una copia. **Regla para H3:** convertir siempre con `new Uint8Array(x)` antes de llamar a la librería, y cubrirlo con una prueba. Pendiente de comunicarlo a los mantenedores de la librería.

Cloudflare Workers sigue descartado ([ADR-0017](adr/0017-despliegue-vm-efimera-pages.md)): aunque allí la firma es nativa, el plan gratuito no cambia el resto de motivos (registros de plataforma).

## 4. Retraso de publicación en GitHub Pages

Repositorio público desechable (`pvt-pages-poc`), publicación desde rama (`main`, raíz). Medida: tiempo desde `git push` hasta que la URL sirve el contenido nuevo (consulta con parámetro anticaché cada 2 s).

| Ronda | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `push` → contenido servido | 22 s | 22 s | 22 s | 38 s | 35 s | 29 s |

- Mediana ~26 s, máximo 38 s. La compilación de Pages informó de 20–37 s por despliegue.
- En las 6 rondas, la URL **sin** parámetro anticaché ya servía el contenido nuevo: la CDN de GitHub se purga al desplegar.
- Pero las respuestas llevan `Cache-Control: max-age=600`, así que **un navegador que ya haya pedido el archivo puede usar su copia durante 10 minutos**. El cliente debe pedir la huella de la clave y la configuración con `fetch(url, { cache: "no-store" })`.
- Medida desde una sola ubicación (España), en una franja horaria y con un dominio propio sobre Pages; con poca carga en GitHub. Es una referencia, no una garantía.

Consecuencia: la espera de «~1 min» que la mesa puede decidir hacer en directo antes de abrir ([ADR-0008](adr/0008-consistencia-clave-publica.md)) es razonable. Se propone que la interfaz de la mesa no la fije por tiempo, sino que compruebe que Pages ya sirve la huella y entonces habilite «Abrir».

## 5. Guía: prueba de Gmail API con la cuenta del órgano

La hace quien custodie la cuenta institucional del Consejo. No requiere código de la plataforma: basta con el [OAuth Playground](https://developers.google.com/oauthplayground) de Google. Anota cada resultado en la tabla del final.

1. **Crear el proyecto.** Con la cuenta del órgano, entra en console.cloud.google.com y crea un proyecto (p. ej., `consejo-votaciones-correo`). Si el Workspace de la Universidad no deja crear proyectos, anótalo y para aquí: es el primer motivo para el plan B.
2. **Activar la API.** «APIs y servicios» → «Biblioteca» → *Gmail API* → Habilitar.
3. **Pantalla de consentimiento** («Google Auth Platform» → «Público»):
   - Si se ofrece el tipo **Interno**, elígelo: solo pueden autorizar cuentas del propio Workspace. **[por verificar]** que con «Interno» el token de actualización no caduca a los 7 días.
   - Si solo se ofrece **Externo**, en estado «Prueba» los tokens de actualización caducan a los 7 días (developers.google.com/health/setup); habría que pasarlo a «En producción», y `gmail.send` puede exigir verificación de Google. Anótalo.
   - Ámbito único: `https://www.googleapis.com/auth/gmail.send`.
4. **Credenciales.** «Clientes» → Crear cliente OAuth → «Aplicación web» → URI de redirección autorizada: `https://developers.google.com/oauthplayground`. Guarda el ID y el secreto **fuera del repositorio**.
5. **Autorizar.** En el OAuth Playground, engranaje → «Use your own OAuth credentials» → pega el ID y el secreto. En el paso 1 escribe el ámbito `gmail.send` y autoriza con la cuenta del órgano. Si aparece «Esta app está bloqueada» o «Acceso restringido por el administrador», anótalo con el texto exacto: indica que el Workspace limita las apps de terceros.
6. **Enviar.** En el paso 3, `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` con cuerpo `{"raw": "<mensaje RFC 2822 en base64url>"}`. Envía un mensaje de prueba a una dirección `@unizar.es` personal y a una de Gmail.
7. **Comprobar.** En cada buzón: ¿llegó?, ¿a la bandeja de entrada o a spam? En «Mostrar original», ¿SPF, DKIM y DMARC dicen PASS?
8. **Revocar.** Al terminar, revoca el token en myaccount.google.com/permissions y, si no se va a usar, borra el proyecto.

| Comprobación | Resultado |
|---|---|
| Se puede crear un proyecto en Google Cloud | |
| Tipo de app disponible (Interno / Externo) | |
| La autorización de `gmail.send` no está bloqueada por el administrador | |
| Llega a `@unizar.es` (bandeja / spam) | |
| Llega a Gmail (bandeja / spam) | |
| SPF / DKIM / DMARC | |

Si falla cualquiera de las tres primeras filas, se pasa al plan B (SMTP con Brevo, [ADR-0014](adr/0014-transporte-de-correo.md)).

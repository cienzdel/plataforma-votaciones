# Modelo de amenazas

> Estado: **borrador pendiente de aprobación**. Completa [`PLAN.md`](PLAN.md). Las afirmaciones marcadas con **[por verificar]** no están confirmadas. Este documento describe con el mismo detalle lo que el sistema protege y lo que **no** protege.

## 1. Resumen para quien no es especialista

- **Lo que sí se consigue:** si alguien obtiene más tarde la base de datos, las copias de seguridad o los datos publicados, no puede saber qué votó cada persona. Cada votante puede comprobar que su voto se contó tal como lo emitió. Cualquiera puede recalcular el resultado con una herramienta independiente.
- **Lo que no se consigue:** quien administra el servidor *mientras se vota* podría, si actúa de mala fe y modifica el servidor, intentar relacionar personas y votos a partir de la hora o la IP. Tampoco se puede impedir que alguien enseñe su comprobante (y con él su voto) a otra persona, ni que alguien vote mientras otra persona le mira.
- **Lo que depende de ti:** leer el correo que llega al cerrar cada votación («se emitieron N credenciales a tu nombre») y avisar si no cuadra, y no compartir tu comprobante.

## 2. Alcance y supuestos

- **Sistema:**
  - La interfaz web, servida por GitHub Pages.
  - La API en una VM efímera.
  - La base de datos SQLite.
  - El repositorio público de datos.
  - El correo saliente.
  - La baliza drand.
  - La CLI de verificación.
- **Electorado:** 40–60 personas, una sola instancia por órgano.
- **Supuestos de confianza:**
  1. La primitiva RSA y SHA-256 son seguras. Las implementaciones son correctas: `@cloudflare/blindrsa-ts` en el navegador (no tiene auditoría formal publicada) y OpenSSL para la firma del servidor.
  2. La interfaz que ejecuta el votante es la compilada desde el repositorio público, comprobable con las atestaciones de GitHub. Hay que confiar en GitHub como plataforma.
  3. El buzón de correo de cada miembro solo lo controla ese miembro.
  4. El navegador y el dispositivo del votante no están comprometidos.
  5. La aleatoriedad de `crypto.getRandomValues` en el navegador es adecuada.
  6. drand (League of Entropy) no está comprometida por la mayoría de sus nodos a la vez.

## 3. Activos y propiedades

| Propiedad | Significado |
|---|---|
| **Secreto** | No se puede relacionar una persona con el contenido de su voto. |
| **Unicidad** | Cada derecho de voto produce como mucho un voto contado. |
| **Integridad** | No se añaden, alteran ni eliminan votos sin que se detecte. |
| **Verificabilidad individual** | Cada votante comprueba que su voto está en el tablón tal como lo emitió. |
| **Verificabilidad universal** | Cualquiera recalcula el resultado a partir de los datos publicados. |
| **Fidelidad a las reglas** | Se aplican las reglas publicadas (perfil + parámetros) y nada más. |
| **Privacidad del censo** | Los datos personales no se publican más allá de lo necesario. |
| **Disponibilidad** | Se puede votar durante el plazo. |

## 4. Atacantes considerados

### A1. Administración técnica y mesa (incluso cuando son las mismas personas)

**Capacidades:** controlan la VM, el código desplegado, la base de datos, la clave maestra, las claves de firma mientras la votación está abierta, el correo saliente, el censo, la asistencia, las delegaciones y la apertura y el cierre.

| | |
|---|---|
| **Protege** | **Secreto frente a un análisis posterior:** la base de datos no relaciona persona y token; las credenciales se emiten en bloque; no se guardan hora, IP ni orden; las papeletas agrupadas se borran al cierre. **Integridad detectable:** contadores públicos V ≤ E ≤ D, aviso personal de credenciales emitidas, cadena de hashes anclada por correo y en el repositorio público, verificación individual con el comprobante. **Reglas:** `rules_hash` publicado; forzados y anulaciones con motivo público. **Interfaz:** no la sirve la VM. |
| **NO protege** | **Correlación en tiempo real:** un operador que modifique el servidor o capture tráfico en la VM puede asociar la hora o la IP de emisión con la hora o la IP de recepción. El código que corre en la VM **no se puede atestiguar**. **Etiquetado de clave en directo:** si no se espera a publicar la huella en Pages, una VM maliciosa puede dar a cada persona una clave distinta y reconocer sus votos ([ADR-0008](adr/0008-consistencia-clave-publica.md)). **Credenciales fantasma no denunciadas:** firmar credenciales de más a nombre de presentes que no votan solo se detecta si esas personas leen el aviso y reaccionan; una VM maliciosa puede, además, no enviar los avisos. **Destrucción de claves:** no es verificable. **Papeletas completas antes del cierre:** el servidor las conoce (sin identidad). **Asistencia y delegaciones falsas:** la mesa podría registrar presentes ficticios o delegaciones falsas; se detectaría por los correos de delegación, el acta nominal y la observación de la sala, no por la criptografía. **Acceso asistido:** la mesa podría suplantar a alguien; el aviso por correo lo hace detectable. **Censura de la publicación:** la mesa podría no publicar; el cierre automático y la publicación automática lo dificultan, pero quien controla la VM puede impedirlo. |
| **Mitigaciones adicionales** | El código es público con licencia EUPL. Despliegue mediante GitHub Actions con aprobación y registro. Huella en Pages para el enlace final. Correo con el `record_hash` a todo el censo. Recomendación de separar personas entre mesa y administración técnica cuando sea posible. |

### A2. Base de datos o copia de seguridad comprometida (lectura, sin control en vivo)

**Capacidades:** leer SQLite o una copia descifrada después de los hechos.

| | |
|---|---|
| **Protege** | **Secreto:** `issuance` solo contiene mensajes cegados, independientes del token final [por verificar la salvedad de la sección 6]; los votos no tienen hora ni orden; `s` y las papeletas agrupadas se borran al cierre. **Claves de votaciones cerradas:** destruidas. Las copias están cifradas con age y la clave privada está fuera de línea. |
| **NO protege** | **Datos personales del censo** (nombres, correos, titulaciones, asistencia, delegaciones, oposiciones) si se obtiene una copia descifrada o la VM en marcha. **Votaciones abiertas en ese momento:** la clave privada cifrada y la clave maestra en el entorno de la VM permitirían firmar credenciales si se obtienen ambas. **Residuos de orden** en archivos de SQLite (WAL, páginas libres) [por verificar]; se mitigan con `secure_delete` y `VACUUM`. |
| **Mitigaciones** | Retención mínima ([ADR-0019](adr/0019-rgpd.md)), VM efímera, cifrado de copias, clave maestra separada de la base de datos. |

### A3. Otro votante (incluida la persona delegada)

**Capacidades:** una sesión válida, sus propias credenciales y acceso a los datos públicos.

| | |
|---|---|
| **Protege** | **Unicidad:** tope de credenciales por derechos, tokens de un solo uso y comprobación de la firma por votación. **Secreto ajeno:** los datos públicos no permiten reconstruir papeletas ajenas (tablón desagregado con un id derivado de un secreto que solo tiene cada votante). **No puede votar por otra persona** sin acceder a su buzón. |
| **NO protege** | **Voto delegado:** la persona delegada conoce el contenido del voto que ejerce (inherente y aceptado). **Grupos pequeños y unanimidad:** si todas las personas votan igual, o en votaciones restringidas con muy pocas personas, el resultado revela cada voto. **Inferencias por exclusión** en votaciones con censo muy reducido. |
| **Mitigaciones** | Se publican totales por casilla, no combinaciones. *Propuesta, no decidida en la entrevista:* avisar en la interfaz cuando el censo de una votación sea muy pequeño (umbral del perfil). |

### A4. Observador de red

**Capacidades:** ver el tráfico de la wifi de la sala, de la red del proveedor o de Internet. El tráfico va cifrado con TLS.

| | |
|---|---|
| **Protege** | **Contenido** de credenciales y votos (TLS). **Asociación directa:** el envío del voto no lleva sesión ni cookies y va a otro subdominio. |
| **NO protege** | **Análisis de tráfico:** quien vea que un dispositivo concreto contacta con el subdominio de recepción en un momento dado sabe *que* votó y *cuándo*, no *qué*. Con acceso además al servidor (A1), puede correlacionar. **Disponibilidad:** un ataque de denegación de servicio en la red de la sala puede impedir votar. |
| **Mitigaciones** | Emisión en bloque, tablón ordenado por hash, NAT compartido de la red de la sala y recurso al modo papel. |

### A5. Proveedores (proveedor de la VM, GitHub, Google, drand)

| Proveedor | Qué podría hacer | Qué lo limita |
|---|---|---|
| Proveedor de la VM | Lo mismo que A1 a nivel de infraestructura: leer memoria y disco, o capturar tráfico. | Contrato y jurisdicción de la UE [por verificar el DPA]. VM efímera. |
| GitHub | Servir una interfaz manipulada, alterar el repositorio de datos o la huella publicada. | Atestaciones de compilación verificables por terceros, correo con `record_hash` al censo y clones independientes del archivo. |
| Google (correo) | Leer códigos de acceso y avisos, o no entregarlos. | Los correos no contienen credenciales de voto. Plan B con SMTP. |
| drand | Sesgar sorteos solo si colabora con la mesa. | Compromiso previo de la mesa, ronda fijada en público antes de que exista y firma BLS verificable. Riesgo residual: en una votación en directo, si nadie mira la ronda proyectada al cerrar, quien conozca la semilla y controle el servidor podría elegir entre varias rondas ya vistas. |

### A6. Coaccionador o comprador de votos

| | |
|---|---|
| **Protege** | **Firmas en combinaciones:** el tablón desagregado impide identificar una papeleta concreta por una combinación rara de casillas a partir de los datos públicos. |
| **NO protege** | **Recibos:** el comprobante (`token`, `s`, respuestas) permite **demostrar** el voto a quien lo pida; el esquema no es resistente a recibos. **Coacción presencial:** votar con alguien mirando la pantalla. Ambas se aceptan y se documentan. No hay revoto que permita deshacer un voto coaccionado. |
| **Mitigaciones** | Aviso visible de que enseñar el comprobante revela el voto. Recomendación de votar en privado. |

### A7. Atacante externo en Internet

| | |
|---|---|
| **Protege** | **Acceso:** códigos de un solo uso con 10 min de vida y 5 intentos, y limitación de intentos en memoria. **Manipulación de votos:** requiere credenciales firmadas válidas. **Interfaz:** cabeceras de seguridad (CSP) y dependencias revisadas por CodeQL y Dependabot. |
| **NO protege** | **Denegación de servicio** contra la VM durante una votación en directo (no hay CDN ni mitigación de DDoS en el plan elegido). Plan: reanudar si vuelve en 10 min o menos; si no, anular y repetir en papel. |
| **Mitigaciones** | La VM solo está encendida durante las sesiones y la URL de la API cambia en cada arranque. |

## 5. Tabla resumen

✔ = protegido · ◐ = detectable o parcial · ✘ = no protegido

| Propiedad \ Atacante | A1 Admin/mesa | A2 BD robada | A3 Votante | A4 Red | A5 Proveedor | A6 Coacción | A7 Externo |
|---|---|---|---|---|---|---|---|
| Secreto | ◐ (análisis posterior ✔; tiempo real ✘) | ✔ | ✔ (salvo unanimidad o delegado) | ◐ | ◐ | ✘ | ✔ |
| Unicidad | ◐ (fantasmas detectables) | ✔ | ✔ | ✔ | ◐ | n/a | ✔ |
| Integridad | ◐ (detectable) | ✔ | ✔ | ✔ | ◐ (detectable) | n/a | ✔ |
| Privacidad del censo | ✘ | ✘ | ✔ | ✔ | ◐ | n/a | ✔ |
| Disponibilidad | ✘ | n/a | ✔ | ✘ | ✘ | n/a | ✘ |

## 6. Salvedades criptográficas [por verificar]

1. **Ceguera ante claves maliciosas.** La ceguera de RSA se demuestra para claves bien formadas. Hay que revisar las consideraciones de seguridad de RFC 9474 y la literatura reciente sobre la ceguera de RSA con claves elegidas por un firmante malicioso, y decidir si el cliente debe validar la clave (p. ej., exponente y tamaño) o exigir una prueba de buena formación. Hasta entonces, se trata como **riesgo abierto**.
2. **Implementación sin auditoría formal publicada** (blindrsa-ts). Mitigación parcial: vectores de prueba del RFC y verificación cruzada con `cryptography` en Python.
3. **Canales laterales** en la aritmética de enteros grandes de JS en el servidor (tiempos de firma). El riesgo está acotado porque las claves duran una sola votación, pero no se ha evaluado.
4. **Calidad de la aleatoriedad** en dispositivos móviles antiguos: se confía en WebCrypto.

## 7. Lo que el sistema NO protege (lista consolidada)

1. Frente a quien administra la VM y actúa de mala fe **durante** la votación: correlación por hora o IP, etiquetado de clave en directo sin espera a Pages y omisión de avisos.
2. Código que corre en la VM: no se puede demostrar cuál es.
3. Destrucción de las claves privadas: no se puede verificar.
4. Recibos: el comprobante permite demostrar el voto. Coacción presencial.
5. Voto delegado: la persona delegada conoce su contenido.
6. Unanimidad y grupos muy pequeños: el resultado revela los votos.
7. Votaciones en papel y de recuento manual: no tienen verificación criptográfica.
8. Datos personales del censo frente a quien controle la VM o una copia descifrada.
9. Disponibilidad frente a ataques de denegación de servicio y caídas del proveedor.
10. Token perdido: el voto se pierde, sin reemisión.
11. Dispositivo del votante comprometido: puede alterar o revelar el voto.
12. Procedimiento: la mesa puede registrar asistencia o delegaciones falsas; solo se detecta por medios no criptográficos (correos, acta, observación).

## 8. Riesgos de proceso aceptados

- No se exige una revisión externa antes del primer uso (convocatoria abierta).
- El simulacro lo hace solo el equipo de desarrollo.
- Cambiar los secretos en el relevo es opcional.
- No se informa a la Universidad antes del primer uso; el responsable del tratamiento y la base jurídica quedan [por verificar].
- El repositorio de código está en una cuenta personal.
- Dependencia del correo institucional del órgano para recuperar todas las cuentas de la instancia.

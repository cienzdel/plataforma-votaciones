> 🇬🇧 [English](../en/protocol.md)

# Protocolo de votación secreta

> 🚧 **Borrador.** Describe el funcionamiento **previsto**; la plataforma aún no está implementada. Las afirmaciones marcadas con [por verificar] no están confirmadas.

La especificación normativa, en inglés, está en [`spec/`](../../spec/). Este documento la resume.

## 1. Idea en una frase

Quien vota obtiene del servidor una **firma ciega** sobre un número aleatorio que el servidor nunca ve. Después emite el voto con ese número y su firma por un canal que no lleva su identidad. El servidor sabe *quién* recibió una credencial, pero no *qué token* corresponde a cada persona.

## 2. Parámetros

| Elemento | Valor |
|---|---|
| Esquema | RSA Blind Signatures, [RFC 9474](https://www.rfc-editor.org/rfc/rfc9474.html), variante `RSABSSA-SHA384-PSS-Randomized` |
| Clave | RSA de 3072 bits, **una por votación**, generada al abrir y destruida al cerrar |
| Librería | [`@cloudflare/blindrsa-ts`](https://github.com/cloudflare/blindrsa-ts) en el navegador (cegar, finalizar) y en el servidor (generar claves, verificar); la firma ciega del servidor (RSASP1) usa OpenSSL a través de `node:crypto` de Node, con las comprobaciones de entrada y salida de RFC 9474 §4.3 (blindrsa-ts no tiene auditoría formal publicada) |
| Hash y serialización | SHA-256 sobre JSON canónico [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JCS) |
| Aleatoriedad del cliente | `crypto.getRandomValues` (WebCrypto) |

Notación: `H` = SHA-256 y `‖` = concatenación.

## 3. Pasos

```mermaid
sequenceDiagram
  autonumber
  participant V as Navegador del votante
  participant P as GitHub Pages
  participant S as API (emisión)
  participant R as API (recepción, otro subdominio)
  Note over S: La mesa abre: foto de presentes, quorum, par de claves
  S->>P: Publica huella H(clave pública) (enlace final)
  V->>S: Obtiene la clave pública
  V->>P: Compara la huella
  V->>V: msg = id_votación ‖ 32 bytes aleatorios; Blind(msg)
  V->>S: blinded_msg + sesión
  S->>S: ¿Presente? ¿Le quedan derechos? Firma (idempotente)
  S-->>V: blind_sig
  V->>V: Finalize → (msg, sig); guarda la credencial
  V->>V: Rellena la papeleta; genera s; id_c = H(s ‖ id_votación ‖ c)
  V->>R: (msg, sig, s, respuestas), sin cookies ni sesión
  R->>R: Firma válida, token no gastado, papeleta válida
  R-->>V: Acuse → comprobante
  Note over S,R: Cierre: se destruye la clave y se publica el tablón
```

1. **Preparación.** La mesa define el método, los parámetros, las opciones y el censo (filtro de titulación). Las reglas efectivas se publican con su hash (`rules_hash`). Si hay orden de desempate, la mesa compromete una semilla (ver §6). Una votación no se edita: solo se anula, con un motivo público.
2. **Apertura.**
   - Se congela la **foto de presentes**: las personas presentes y sus derechos de voto (el suyo más las delegaciones vigentes).
   - Se comprueba el quorum. Si falta, la mesa puede forzar la apertura con un motivo que se publica.
   - Se genera el par de claves y se publica la huella. En las votaciones del enlace final, la votación no se abre hasta que la huella es visible en GitHub Pages.
3. **Emisión en bloque.**
   - Al abrir, el navegador de cada persona presente pide automáticamente una credencial por cada derecho de voto.
   - Guarda los datos del cegado **antes** de enviarlos, para poder reintentar.
   - El servidor devuelve la misma firma si recibe el mismo mensaje cegado (idempotencia) y nunca firma más mensajes que derechos.
4. **Voto.**
   - Tras revisar la papeleta, el navegador genera un secreto de papeleta `s` y la envía al subdominio de recepción con `credentials: "omit"`.
   - El servidor comprueba la firma, que el token pertenece a esa votación y que no está gastado, y guarda el voto **sin hora ni orden**.
5. **Comprobante.** `(msg, sig, s, respuestas)` se guarda en el navegador y se puede descargar. **Enseñarlo revela el voto.**
6. **Cierre.**
   - En directo, la mesa cierra a mano; en el enlace final, el cierre es automático a la hora fijada al abrir, que no se puede acortar.
   - Se destruye la clave privada y se calcula el resultado.
   - Se publica el **tablón** y se añade a la **cadena de hashes**.
   - Se envía por correo a cada miembro el hash del registro y cuántas credenciales se emitieron a su nombre.
   - Se borran `s` y las papeletas agrupadas.

## 4. Tablón público

| Campo | Contenido |
|---|---|
| `participation` | Pares `(msg, sig)` ordenados por `msg`. Cualquiera verifica las firmas como RSA-PSS estándar. |
| `cells` | Para cada casilla `c` (p. ej., «candidatura X en la vocalía Y»), lista de `(id_c, valor)` ordenada por `id_c`. Cada lista tiene tantas entradas como `participation`. |
| `counters` | Miembros, presentes, delegados ejercidos, derechos (D), credenciales emitidas (E) y votos (V). Debe cumplirse V ≤ E ≤ D. |
| `rules`, `rules_hash` | Reglas efectivas (perfil + parámetros). |
| `quorum`, `forced` | Quorum exigido y real; motivo de un forzado, si lo hubo. |
| `draw` | Compromiso, ronda drand, semilla y orden de desempate. |
| `result` | Salida del método de recuento. |
| `candidates_hash` | Hash de la tabla id→nombre, que se publica aparte. |

**Por qué está desagregado:** si se publicara la papeleta completa de cada token, una combinación rara de casillas podría servir de «firma» para comprar votos. Los ids `id_c` dependen de `s`, que solo conoce quien vota, así que nadie más puede volver a juntar las casillas de una papeleta. No pueden depender del token, porque el token es público.

## 5. Cadena de hashes

`record_hash = H(JCS({prev: hash_anterior, board: H(JCS(tablón))}))`. El `record_hash` se envía por correo a todo el censo y se publica en el repositorio público de datos. Reescribir un resultado antiguo exigiría alterar ambos.

## 6. Sorteos

1. La mesa publica `H(semilla)` y se fija una ronda futura `R` de la baliza pública [drand](https://drand.love/developer/http-api) (red quicknet; una ronda cada 3 segundos).
2. Tras la ronda `R` se revela la semilla y se calcula `σ = H(semilla ‖ aleatoriedad_R)`.
3. El orden se obtiene con Fisher–Yates sobre los ids en orden canónico, usando `H(σ ‖ i)` en modo contador con muestreo por rechazo.

Si drand no responde, se espera: la ronda es fija y se puede obtener de cualquier espejo.

## 7. Modalidades sin firmas ciegas

- **Nominal electrónica:** se publica quién votó qué.
- **Mano alzada y papel:** la mesa introduce los totales por casilla. El resultado se marca como «recuento manual», sin verificación criptográfica, y pasa por los mismos métodos.
- Una votación nunca mezcla modalidades.

## 8. Métodos de recuento (resumen)

| Método | Regla |
|---|---|
| Sí/no | Umbral configurable: simple (a favor > en contra), absoluta (2·a favor > base) o fracción (a favor ≥ ⌈p·base/q⌉). Base: emitidos, presentes, presentes + delegados o miembros. El voto en blanco cuenta como emitido; la abstención, no. |
| Uninominal | Con una candidatura: elegida si a favor > en contra de todas. Con varias: mayoría absoluta de los emitidos; si nadie la alcanza, segunda vuelta entre las dos más votadas. Los empates se repiten una vez y, si persisten, se sortean. Solo en directo, con un asistente que propone la siguiente votación. |
| Bloques | Como el uninominal. Si ningún bloque resulta elegido, los cargos se eligen uno a uno. |
| Vocalías | Cada casilla admite a favor, en contra o abstención. Es elegible quien tiene más votos a favor que en contra. Asignación por aceptación diferida (Gale–Shapley, propuesta por las candidaturas) según las preferencias declaradas. Desempate: menos votos en contra y después el orden sorteado. |
| Voto limitado | Se marcan hasta máx(1, puestos − 1) candidaturas. Ganan las más votadas y las siguientes quedan como suplentes. Empates: orden sorteado. |
| Un puesto | Mayoría relativa: gana la más votada. |
| Asentimiento | Se aprueba si al cierre (mínimo, el final del 2.º día natural tras el envío) nadie se opone. |

Los detalles y casos límite están en [`PLAN/PLAN.md` §7](../../PLAN/PLAN.md) y en [ADR-0023](../../PLAN/adr/0023-interpretaciones-reglas.md).

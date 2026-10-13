# ADR-0002: Librería, variante y tamaño de clave

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Está prohibido implementar primitivas criptográficas propias. El cegado se hace en el navegador, así que hace falta una implementación en JS o WASM. Candidatas revisadas en octubre de 2026 (ninguna con auditoría formal publicada que se haya podido encontrar):

| Candidata | Lenguaje | Notas |
|---|---|---|
| `@cloudflare/blindrsa-ts` | TypeScript | Cloudflare; uno de los autores del RFC trabaja allí. Soporta las 4 variantes y pasa los vectores de prueba del RFC. github.com/cloudflare/blindrsa-ts |
| `cloudflare/circl` `blindsign/blindrsa` | Go | Cloudflare; RFC 9474. CIRCL ha tenido CVE corregidos en otros módulos. pkg.go.dev/github.com/cloudflare/circl/blindsign/blindrsa |
| `blind-rsa-signatures` | Rust (+WASM) | Crate de F. Denis, coautor del RFC. lib.rs/crates/blind-rsa-signatures |

## Decisión

- Librería: **`@cloudflare/blindrsa-ts`** en el navegador (preparar, cegar, finalizar) y en el servidor (generar claves y verificar).
- **Firma ciega en el servidor con OpenSSL** (`node:crypto`, `privateDecrypt` con `RSA_NO_PADDING`, que es RSASP1). Antes de firmar se comprueba que el mensaje cegado es menor que `n`; después, que la firma verifica con la clave pública, como pide RFC 9474 §4.3. Una prueba exige que el resultado sea idéntico byte a byte al de `blindSign` de la librería. Enmienda del 2026-10-13 tras el hito H1 ([resultados](../h1-pruebas-de-concepto.md#3-rendimiento-de-blindrsa-ts-rsa-3072-rsabssa-sha384-pss-randomized)).
- Variante: **RSABSSA-SHA384-PSS-Randomized**.
- Módulo RSA de **3072 bits**.

## Alternativas descartadas

- **Go CIRCL en el servidor:** daría dos implementaciones independientes que interoperan, pero obligaría a mantener dos lenguajes.
- **`blindSign` de la librería en el servidor:** usa aritmética en JavaScript puro (SJCL) sin CRT. Tarda ~0,9 s por firma, bloquea el proceso y no está pensada para ser de tiempo constante. Ejecutarla en un *worker thread* evitaría el bloqueo, pero no la lentitud.
- **Rust + WASM:** la barrera de entrada es alta para el relevo de estudiantes.
- **Variantes Deterministic o PSSZERO:** serían seguras porque el token tiene alta entropía, pero no aportan nada aquí. La variante Randomized es la más conservadora.
- **2048 o 4096 bits:** 2048 es el mínimo actual; 4096 da un margen mayor con un coste algo más alto. 3072 equivale a unos 128 bits de seguridad (NIST SP 800-57).

## Consecuencias

- Un solo lenguaje en todo el proyecto.
- El tamaño de la clave afecta a la infalsificabilidad, no al anonimato.
- Se documenta que la librería no tiene auditoría formal publicada.
- Para no depender de una sola implementación, la CI verifica las firmas producidas con la librería `cryptography` de Python ([ADR-0020](0020-pruebas-y-verificacion.md)).
- Rendimiento medido en H1: generar una clave de 3072 bits ~0,1 s; firmar con OpenSSL ~4 ms; cegar en el navegador ~60 ms en un portátil y <1 s con la CPU limitada a 6×. **[por verificar]** el cegado en un móvil real de gama baja (H7).
- blindrsa-ts falla si recibe un `Buffer` de Node en lugar de un `Uint8Array` (detectado en H2, ver [resultados de H1](../h1-pruebas-de-concepto.md)); el código convierte siempre las entradas.
- La firma del servidor depende de OpenSSL (incluido en Node), una dependencia mantenida y muy revisada; el código propio se limita a las comprobaciones de entrada y salida, cubiertas por pruebas.

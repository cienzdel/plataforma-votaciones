# ADR-0001: Firmas ciegas RSA (RFC 9474) para las votaciones secretas

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El órgano necesita votaciones secretas con anonimato, unicidad y recuento verificable, para un electorado de 40–60 personas, con coste mínimo y mantenido por estudiantes. Se valoraron tres familias: firmas ciegas, cifrado homomórfico con custodios (estilo Helios o Belenios) y tarjetas físicas con QR repartidas en la sala.

## Decisión

Las votaciones secretas electrónicas usan **firmas ciegas RSA según RFC 9474**:

1. Quien vota se autentica.
2. Obtiene una firma ciega sobre un token aleatorio.
3. Emite el voto con el token sin cegar y su firma por un canal que no lleva su identidad.

El servidor sabe quién recibió una credencial, pero no qué token corresponde a cada persona.

## Alternativas descartadas

- **Cifrado homomórfico con custodios (Helios/Belenios):** ofrece garantías más fuertes frente a un servidor malicioso, pero exige custodios de claves en cada votación, ceremonias de descifrado y mucha más complejidad de operación y explicación. Es poco realista con personas voluntarias que cambian cada curso.
- **Tarjetas QR físicas:** dependen de la logística de imprimir y repartir tarjetas, no sirven para votar a distancia en el enlace final y tienen sus propios riesgos de trazabilidad.

## Consecuencias

- El protocolo es sencillo de explicar: «el servidor firma sin ver lo que firma».
- La firma final es RSA-PSS estándar: cualquiera puede verificarla con cualquier librería.
- El anonimato depende de no correlacionar metadatos (hora, IP, orden) entre la emisión y el envío. Hace falta desacoplarlos ([ADR-0004](0004-desacople-emision-envio.md)) y no guardar registros ([ADR-0018](0018-sin-registros.md)).
- Quien opera el servidor puede, en principio, emitir credenciales de más. Eso se detecta con contadores públicos y avisos personales ([ADR-0007](0007-deteccion-votos-fabricados.md)), no se impide.
- No hay resistencia a recibos: el comprobante permite demostrar el voto propio a un tercero.

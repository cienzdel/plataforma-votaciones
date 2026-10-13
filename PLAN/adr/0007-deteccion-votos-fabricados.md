# ADR-0007: Detección de votos fabricados por el servidor

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Quien controla la clave de firma puede firmarse credenciales de más y votar con ellas. Con firmas ciegas eso no se puede impedir criptográficamente; hay que hacerlo detectable.

## Decisión

- Cada tablón publica: miembros, presentes, delegados ejercidos, derechos en la foto (D), credenciales emitidas (E) y votos recibidos (V). Debe cumplirse **V ≤ E ≤ D**.
- Al cerrar, cada miembro del censo de la votación recibe un correo personal: «se emitieron N credenciales a tu nombre en la votación X».
- Las credenciales emitidas tienen un tope por persona igual a su número de derechos, y la emisión es idempotente por mensaje cegado.

## Alternativas descartadas

- **Solo contadores públicos:** no detectan una credencial fantasma a nombre de una persona presente que no votó.
- **Lista nominal pública de credenciales:** publicaría quién participó en cada votación secreta.

## Consecuencias

- Una credencial fantasma solo pasa inadvertida si la persona afectada no lee el aviso o no reacciona.
- Una VM comprometida podría no enviar los avisos. Su ausencia, sumada al hash en el correo, es en sí una señal; se documenta.
- El aviso revela a cada persona solo sus propios datos.

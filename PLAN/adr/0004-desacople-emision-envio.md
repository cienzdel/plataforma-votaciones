# ADR-0004: Desacople entre la emisión de la credencial y el envío del voto

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Con 40–60 personas, la hora, la IP o el orden de llegada pueden bastar para relacionar a quien pidió una credencial con el voto que llega poco después. Las soluciones fuertes (relays OHTTP, Tor) no están disponibles gratis ni son razonables para este público.

## Decisión

- **Emisión en bloque:** al abrir la votación, los clientes de todas las personas presentes piden sus credenciales a la vez, sin que nadie pulse nada.
- **Envío sin identidad:** el voto se envía a un subdominio de recepción distinto, con `credentials: "omit"`, sin cabecera de sesión ni cookies.
- **Sin metadatos:** no se guardan hora, IP ni orden de llegada ([ADR-0018](0018-sin-registros.md)). Mientras la votación está abierta solo se publica un contador; el tablón se publica al cierre, ordenado por hash.
- Emisión y recepción son módulos de la misma aplicación que solo comparten la lista de tokens gastados.

## Alternativas descartadas

- **Retraso aleatorio en el cliente:** si se cierra la pestaña, el voto se pierde, y las votaciones en directo duran minutos.
- **Pedir la credencial al pulsar «votar»:** la correlación temporal entre petición y voto sería casi directa.
- **Dos despliegues separados:** solo aportan algo si los operan personas distintas, que no es el caso.

## Consecuencias

- Frente a quien lea la base de datos o las copias después, el voto no se puede relacionar con la persona.
- Frente a un **operador malicioso en tiempo real** (que modifique el servidor o capture tráfico en la VM), la correlación por hora o IP sigue siendo posible. Se documenta como límite.
- Quien inicia sesión tarde pide su credencial fuera del bloque y su hora de emisión es más distinguible.
- Una red compartida en la sala (NAT de la wifi) reduce, pero no elimina, el valor de la IP.

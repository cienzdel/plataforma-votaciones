# ADR-0003: Una clave por votación, generada al abrir y destruida al cerrar

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Una clave de firma comprometida permite fabricar credenciales. Además, una clave que sirva para varias votaciones permitiría reutilizar tokens entre ellas.

## Decisión

- Cada votación tiene su propio par de claves.
- El servicio de firma lo genera al abrir la votación y guarda la clave privada cifrada con una clave maestra del entorno, para que sobreviva a un reinicio de la VM.
- La clave privada se destruye al cerrar y se registra `destroyed_at`.
- El mensaje firmado es `voting_id ‖ 32 bytes aleatorios`, como defensa en profundidad por si alguna vez se reutilizara una clave.

## Alternativas descartadas

- **Una clave por sesión:** menos claves, pero cada una vive más tiempo y su compromiso afecta a todas las votaciones de la sesión.
- **Generarla la mesa en su navegador:** el servidor la necesita igualmente para firmar, así que no aporta garantías.
- **KMS o HSM en la nube:** coste y complejidad, y el RSA ciego no es una operación estándar en esos servicios [por verificar].

## Consecuencias

- Tras el cierre no se pueden fabricar credenciales nuevas, siempre que la destrucción sea real.
- Desde fuera **no se puede verificar** que la clave se destruyó; se documenta en el modelo de amenazas.
- Comprometer una clave solo afecta a su votación.

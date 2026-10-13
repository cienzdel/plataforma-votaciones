> 🇬🇧 [Read this in English](README.en.md)

# plataforma-votaciones

Plataforma web **pública y auditable** para las votaciones de un órgano colegiado de representación estudiantil. Las votaciones secretas usan **firmas ciegas RSA** ([RFC 9474](https://www.rfc-editor.org/rfc/rfc9474.html)).

## Para qué órgano

La primera instancia está pensada para el **Pleno del Consejo de Estudiantes de la Facultad de Ciencias de la Universidad de Zaragoza**, con unas 40–60 personas con derecho a voto. Las reglas no están fijadas en el código: se configuran en un perfil por órgano, así que otros órganos pueden reutilizar la herramienta en su propia instancia.

> **No es un servicio oficial de la Universidad de Zaragoza.** La plataforma la promueve y la opera el propio órgano estudiantil.

## Estado del proyecto

🚧 **En planificación.** Todavía no hay código de aplicación. **No la uses para votaciones reales.**

- Plan, decisiones de diseño y modelo de amenazas: [`PLAN/`](PLAN/PLAN.md) (en español).
- Objetivo: una primera versión para el segundo cuatrimestre del curso 2026-27. Antes de usarla, el Pleno debe aprobar su uso y el reglamento que aplica debe estar ratificado.
- Nadie ha hecho todavía una revisión de seguridad independiente. La invitación a revisar está abierta (ver [SECURITY.md](SECURITY.md)).

## Por qué tu voto es secreto (en lenguaje llano)

Imagina una votación en papel con un truco:

1. Escribes tu voto en un papel y lo metes en un **sobre con papel de calco por dentro**. Solo tú sabes qué hay dentro.
2. La mesa comprueba quién eres y que no has pedido ya otro sobre, y **firma por fuera**. El calco copia la firma en tu papel, pero la mesa no ve lo que has escrito.
3. Sacas el papel firmado y lo echas en la urna **sin dar tu nombre**. La firma demuestra que es un voto autorizado, pero nadie puede saber a quién se lo firmó.

Las firmas ciegas hacen esto con matemáticas:

- Tu navegador genera un número secreto al azar (el *token*) y lo «envuelve» antes de enviarlo.
- El servidor, que sí sabe quién eres, lo firma sin poder verlo.
- Después tu navegador lo «desenvuelve» y envía el voto con esa firma por un canal que no lleva tu identidad.

Para que la hora o la conexión no te delaten:

- Todas las personas presentes reciben su firma a la vez al abrir la votación.
- El voto se envía sin cookies ni sesión.
- **No se guardan ni la hora, ni la IP, ni el orden de llegada.**
- Los resultados se publican al cerrar, ordenados de forma que no reflejan el orden de llegada.

## Cómo puedes comprobarlo

- **Tu voto se contó como lo emitiste.** Al votar recibes un **comprobante**. Tras el cierre, la web comprueba sola que tu voto aparece en el **tablón público**, tal como lo enviaste. No enseñes el comprobante: permite ver tu voto.
- **No se han añadido votos falsos a tu nombre.** Al cerrar cada votación recibes un correo con el número de credenciales emitidas a tu nombre. Si no cuadra, avisa. Los contadores públicos deben cumplir: votos ≤ credenciales emitidas ≤ derechos de voto.
- **El resultado es correcto.** Cualquiera puede recalcularlo con una **herramienta de verificación independiente**, escrita en otro lenguaje a partir de la especificación y no del código del servidor.
- **No se ha reescrito el pasado.** Cada resultado se encadena con el anterior mediante un resumen criptográfico (*hash*) que se envía por correo a todo el censo y se publica en un repositorio público.

## Límites honestos

La plataforma **no** puede garantizar todo. En particular:

- **Quien administra el servidor mientras se vota** podría, si actúa de mala fe y modifica el servidor, intentar relacionar personas y votos por la hora o la IP. Tampoco se puede demostrar qué código ejecuta exactamente el servidor (sí el de tu navegador).
- **En las votaciones en directo**, si la mesa no espera a publicar la huella de la clave en un sitio externo, un servidor malicioso podría marcar votos dando claves distintas a cada persona.
- **El comprobante permite demostrar a otra persona qué votaste.** Esto abre la puerta a la compra de votos o a la coacción. Tampoco se puede impedir que alguien vote mientras otra persona mira.
- **La persona a quien delegas tu voto sabe qué vota en tu nombre.**
- **En grupos muy pequeños o con unanimidad**, el resultado revela lo que votó cada persona. Eso ocurre en cualquier sistema.
- **Si pierdes tu credencial antes de votar** (por ejemplo, borras los datos del navegador), pierdes ese voto.
- Las votaciones **en papel** o a mano alzada no tienen verificación criptográfica.
- La librería criptográfica no tiene una auditoría formal publicada. Nadie ha revisado todavía este proyecto de forma independiente.

Detalle completo: [modelo de amenazas](docs/es/modelo-amenazas.md).

## Documentación

| Documento | Para quién |
|---|---|
| [Guía de votación](docs/es/guia-votacion.md) | Miembros que votan |
| [Guía de verificación](docs/es/guia-verificacion.md) | Cualquiera que quiera comprobar un resultado |
| [Guía de la secretaría (mesa)](docs/es/guia-secretaria.md) | Quien organiza la sesión |
| [Protocolo](docs/es/protocolo.md) | Personas con perfil técnico y auditoras |
| [Modelo de amenazas](docs/es/modelo-amenazas.md) | Personas con perfil técnico y auditoras |
| [Plan y decisiones (ADR)](PLAN/PLAN.md) | Quien desarrolle o audite el diseño |

## Cómo verificar un resultado

Cuando exista la herramienta (`tools/verify`), el proceso será:

1. Descargar los datos públicos de la votación (el tablón) del repositorio de datos de la instancia.
2. Ejecutar la herramienta de verificación sobre esos datos.
3. Comprobar que todas las verificaciones salen en verde y que el resultado coincide con el publicado.

Pasos detallados: [guía de verificación](docs/es/guia-verificacion.md).

## Cómo contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Se aplica el [código de conducta](CODE_OF_CONDUCT.md).

## Licencia

- Código: [EUPL-1.2](LICENSE). Si alguien despliega una versión modificada, debe ofrecer su código a quienes la usen.
- Documentación: [CC BY-SA 4.0](docs/LICENSE).

## Seguridad

¿Has encontrado un fallo? **No abras un *issue* público.** Usa el reporte privado de GitHub (pestaña *Security → Report a vulnerability*). Detalles en [SECURITY.md](SECURITY.md).

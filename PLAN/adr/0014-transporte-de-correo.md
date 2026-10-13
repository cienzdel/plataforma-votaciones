# ADR-0014: Transporte de correo intercambiable

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

El órgano quiere enviar desde su cuenta institucional, que está en Google Workspace. Otros órganos usarán otros proveedores.

## Decisión

- Dos adaptadores: **Gmail API (OAuth)** para cuentas de Google y **SMTP genérico** para todo lo demás. Se eligen con variables de entorno y hay una guía para cada uno.
- Para el Consejo: Gmail API con la cuenta institucional del órgano. Límite de Workspace: 2.000 mensajes al día por usuario (knowledge.workspace.google.com, «Gmail sending limits in Google Workspace»).
- **[POSPUESTO]** Viabilidad pendiente de comprobar: que el Workspace universitario permita conceder OAuth a una app propia y que los correos lleguen sin caer en spam. Plan B: SMTP con Brevo (plan gratuito de 300 al día, empresa de la UE [por verificar el plan actual]).

## Alternativas descartadas

- **Solo SMTP con contraseña de aplicación:** puede estar desactivado en cuentas institucionales [por verificar].
- **Proveedor transaccional como única vía:** añadiría un tercero cuando el órgano ya tiene cuenta.

## Consecuencias

- El volumen esperado (<200 correos por sesión) cabe en cualquiera de las opciones.
- El token de OAuth es un secreto operativo ([ADR-0022](0022-operacion-y-relevo.md)).

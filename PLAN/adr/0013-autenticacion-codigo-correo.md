# ADR-0013: Autenticación con código de un solo uso por correo

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Los miembros tienen correo institucional. El SSO de la Universidad exige un alta formal en el servicio de informática, con plazo incierto. Los enlaces mágicos pueden ser consumidos por escáneres antiphishing y obligan a abrir el correo en el mismo dispositivo.

## Decisión

- Código de un solo uso de 6–8 dígitos enviado al correo del censo; caduca a los 10 min y admite 5 intentos.
- Sesión de 12 h, enviada en una cabecera (no en una cookie) para funcionar entre GitHub Pages y la API.
- Se acepta cualquier dirección de correo, porque el censo es una lista cerrada.
- **Acceso asistido:** la mesa comprueba la identidad en persona y genera un código. Queda registrado y se notifica a la persona.
- Los correos de aviso solo contienen enlaces a la interfaz, nunca credenciales.

## Alternativas descartadas

- **Enlace mágico:** vulnerable a escáneres y obliga a usar el mismo dispositivo.
- **SSO SAML de la Universidad:** queda como mejora futura.
- **«Iniciar sesión con Google» para votar:** depende de la configuración del Workspace universitario y Google sabría cuándo entra cada persona.

## Consecuencias

- La seguridad del acceso equivale a la del buzón de cada persona.
- La mesa podría suplantar a alguien con el acceso asistido, pero el correo de aviso lo haría detectable.

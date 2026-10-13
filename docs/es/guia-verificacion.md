> 🇬🇧 [English](../en/verification-guide.md)

# Guía de verificación

> 🚧 **Borrador.** Describe el funcionamiento **previsto**; la plataforma aún no está implementada. Las capturas llegarán con la v1 y usarán datos ficticios.

## 1. Comprobar tu propio voto (votantes)

1. Tras el cierre, abre la plataforma en el navegador donde votaste. La web descarga el tablón público y comprueba que:
   - tu token aparece en la lista de participación;
   - cada respuesta de tu papeleta aparece, con su valor, en la lista de su casilla.
2. Si votaste en otro dispositivo, carga el **comprobante** que descargaste.
3. Lee el correo de cierre:
   - el **número de credenciales emitidas a tu nombre** debe ser igual al de las papeletas que recibiste;
   - el **hash del registro** debe coincidir con el publicado.

Si algo no cuadra, avísalo a la mesa y, si sospechas manipulación, por el canal descrito en [SECURITY.md](../../SECURITY.md).

## 2. Recalcular un resultado (cualquiera)

La herramienta independiente `tools/verify` (Python) se escribe a partir de la especificación, no del código del servidor. Uso previsto (los comandos definitivos se documentarán con la v1):

```bash
# 1. Clonar el repositorio de datos públicos de la instancia
git clone <url-del-repositorio-de-datos> datos
# 2. Instalar la herramienta (desde este repositorio)
pip install ./tools/verify
# 3. Verificar una votación o toda la cadena
verify board datos/votaciones/<id>.json
verify chain datos/
```

## 3. Qué comprueba la herramienta

| Comprobación | Qué detecta |
|---|---|
| Cada firma de `participation` es RSA-PSS válida con la clave publicada | Votos sin credencial |
| No hay tokens repetidos | Doble voto |
| Cada lista de casilla tiene tantas entradas como `participation` | Casillas añadidas o eliminadas |
| Votos ≤ credenciales emitidas ≤ derechos en la foto | Credenciales fabricadas por encima del censo |
| Totales y resultado recalculados con las reglas publicadas (`rules_hash`) | Recuento o reglas alterados |
| Ronda drand (firma BLS) y orden del sorteo | Sorteos amañados |
| Cadena de hashes completa | Resultados antiguos reescritos |

## 4. Qué no puede comprobar

- Que el servidor no correlacionara en tiempo real. Ver el [modelo de amenazas](modelo-amenazas.md).
- Las votaciones en papel o a mano alzada: solo se verifica que el resultado sale correctamente de los totales introducidos.
- Que no haya credenciales fantasma a nombre de personas presentes que no votaron. Eso depende de que cada persona lea su correo de cierre.

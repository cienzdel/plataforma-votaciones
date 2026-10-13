# ADR-0022: Operación, secretos, incidentes y relevo

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Las personas responsables cambian cada curso y el traspaso debe ser mínimo.

## Decisión

- **Despliegue:** GitHub Actions manual (`up`/`down`) en el entorno «production», con aprobación obligatoria.
- **Secretos operativos** (token del proveedor, OAuth de correo, token del repositorio de datos, clave maestra de la base de datos) en los secretos del entorno «production» de GitHub. La **clave privada age** de las copias nunca se sube: hay dos copias fuera de línea custodiadas por dos personas de la Comisión.
- **Copias:** volcado de SQLite cifrado con age tras cada cierre, más la instantánea al apagar.
- **Caída en directo:** si el servicio vuelve en 10 min o menos (parámetro), la votación se reanuda; si no, se anula públicamente y se repite en papel o más tarde.
- **Relevo:**
  - Todas las cuentas externas de la instancia (proveedor de la VM, cuenta de GitHub del despliegue con su fork, secretos y repositorio de datos, Google) se registran con el **correo institucional del órgano**. La Comisión entrante recibe ese correo y el enlace al repositorio, y sigue el tutorial de la documentación.
  - El repositorio de datos se mantiene y la cadena continúa.
  - Cambiar contraseñas, tokens y la clave age es **opcional**: el tutorial lo recomienda con una lista de comprobación.
- **Guía de la secretaría:** antes, durante y después de la sesión, con datos ficticios.

## Alternativas descartadas

- **Desplegar desde el portátil de la administración técnica:** secretos en un equipo personal y sin registro de ejecuciones.
- **Gestor de contraseñas compartido:** otro servicio más que traspasar.
- **Rotación obligatoria en el relevo:** se descartó por decisión de la Comisión.

## Consecuencias

- **Riesgo aceptado:** quien sale puede conservar accesos válidos si no se rotan los secretos.
- Quien controle el correo del órgano controla la instancia.

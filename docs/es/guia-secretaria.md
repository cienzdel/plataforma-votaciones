> 🇬🇧 [English](../en/secretariat-guide.md)

# Guía de la secretaría (mesa)

> 🚧 **Borrador.** Describe el funcionamiento **previsto**; la plataforma aún no está implementada. Las capturas llegarán con la v1 y usarán datos ficticios.

El rol **mesa** (1–3 personas) crea, abre, cierra y anula votaciones y registra el censo, la asistencia y las delegaciones. La administración técnica (encender y apagar el servidor) puede recaer en las mismas personas.

## Antes de la sesión

1. **Encender el servidor:** en GitHub, en el repositorio de despliegue, ejecuta el flujo **`up`** y apruébalo. Espera a que la interfaz muestre la API disponible.
2. **Censo:** importa o revisa el CSV (nombre, correo, titulaciones). No incluyas datos que no hagan falta, como el curso o el motivo de una ausencia.
3. **Delegaciones:** registra las recibidas por el canal de la convocatoria. Solo se marca «justificada: sí». La plataforma rechaza las que superen el tope y avisa por correo a las dos personas.
4. **Prueba de correo:** envíate un código para comprobar que los correos llegan.
5. **Votaciones previstas:** puedes prepararlas, pero recuerda que **una votación abierta no se edita**.

## Durante la sesión

1. **Abrir la sesión.** El total de miembros queda congelado.
2. **Asistencia:**
   - Marca las entradas presenciales y telemáticas (las telemáticas, al ver a la persona en la videollamada).
   - Marca también las salidas.
   - Si llega alguien que había delegado, márcalo presente: su delegación se suspende para las votaciones siguientes.
3. **Convocatoria:** si no hay quorum en primera convocatoria, el botón de **segunda convocatoria** se habilita pasados los minutos del perfil.
4. **Votaciones en directo:**
   - Crea la votación: método, opciones o candidaturas, secreta o no, y filtro de titulación. Si alguien pide votación secreta, la plataforma te muestra cuántas personas hacen falta.
   - Ábrela. Si falta quorum, la plataforma avisa; puedes **forzar** la apertura, pero el motivo se publicará.
   - En las votaciones del enlace final, la plataforma espera a publicar la huella de la clave en GitHub Pages antes de abrir. En directo puedes elegir esperar (~1 min [por verificar]); es más seguro.
   - Ciérrala. El resultado se publica automáticamente.
5. **Elección de cargos:** usa el **asistente**, que propone la siguiente votación (segunda vuelta, repetición, sorteo o siguiente cargo). Quien sale elegido se retira de los cargos posteriores; puedes deshacerlo indicando un motivo.
6. **Sorteos:** cuando haga falta, la plataforma compromete la semilla y espera a una ronda de drand de unos 30 segundos después. Proyecta el compromiso.
7. **Acceso asistido:** si alguien no puede leer su correo, comprueba su identidad en persona y genera su código.
8. **Errores:** si una votación se configuró mal, **anúlala** con un motivo y crea otra.
9. **Caídas:** si el servidor cae y vuelve en 10 minutos o menos, la votación se reanuda. Si no, anúlala y repítela en papel o más tarde.
10. **Modo papel:** si hace falta, pasa la votación entera a papel e introduce los totales por casilla.

## Al levantar la sesión

1. Anuncia el **plazo** de las votaciones del enlace final antes de levantar la sesión.
2. Ábrelas. La foto de presentes es la del momento de levantar la sesión (según el perfil) y el cierre es automático.
3. Cuando cierren, revisa en la vista pública que se publicaron los tablones.

## Después

1. **Acta:** exporta el Markdown (reglas, asistencia nominal, resultados, sorteos y forzados), el CSV y el JSON del tablón.
2. **Verificación:** ejecuta (o pide a alguien ajeno) la herramienta de verificación sobre los datos publicados.
3. **Apagar:** ejecuta el flujo **`down`** cuando no quede nada abierto (incluidos los asentimientos).
4. **Copias:** se generan solas y cifradas. La clave para descifrarlas la custodian fuera de línea dos personas de la Comisión.

## Asentimiento por correo

1. Crea la propuesta. La plataforma muestra las materias excluidas: confirma que no es una de ellas.
2. Elige el cierre. No puede ser anterior a las 23:59 (hora de Madrid) del segundo día natural tras el envío.
3. Se envía a todo el censo. Recibirás un aviso por cada oposición. Al cierre, se aprueba o va al siguiente pleno.

## Relevo

La Comisión entrante recibe la **cuenta de correo institucional del órgano**, con la que están registradas todas las cuentas de la instancia, y el enlace al repositorio. Se recomienda cambiar contraseñas y tokens y generar una clave de copias nueva (opcional, pero muy aconsejable). La lista de comprobación detallada se publicará con la v1.

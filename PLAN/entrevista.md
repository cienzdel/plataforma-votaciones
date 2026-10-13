# Registro de decisiones de la entrevista

Formato: `[Bloque N] Decisión — Justificación`. Las decisiones aplazadas se marcan **POSPUESTO** junto con la información que falta para tomarlas.

## Bloque 1 · Alcance de la v1

- [Bloque 1] La v1 debe estar en producción para un pleno ordinario del 2.º cuatrimestre (febrero–mayo de 2027). — Deja margen para el desarrollo, la convocatoria abierta de revisión, un simulacro y la ratificación del Reglamento.
- [Bloque 1] La v1 incluye todos los tipos de votación del Pleno: sí/no, cargos con bloques, vocalías, voto limitado, censura, reforma, asentimiento por correo, sorteos y modo papel. — Cobertura completa del Reglamento desde el primer uso.
- [Bloque 1] Las votaciones y la interfaz no citan artículos concretos; se describen con métodos genéricos (p. ej., «mayoría absoluta con segunda vuelta»). — Así la herramienta puede servir a otros órganos.
- [Bloque 1] Las elecciones de delegación y subdelegación de grupo quedan fuera, sin previsión en el diseño. — Otro censo, otra escala y otro órgano responsable.
- [Bloque 1] Las reglas son parametrizables (quorums, mayorías, topes de delegación…) para que otros órganos puedan reutilizarlas. — Prima la reutilización; a cambio, crece la superficie de errores y habrá que mitigarlo con pruebas y publicando las reglas aplicadas.
- [Bloque 1] Las reglas se modelan como un catálogo cerrado de métodos de votación probados, con parámetros acotados; no hay reglas definidas por el usuario. — Es auditable y se puede probar exhaustivamente.
- [Bloque 1] Los parámetros del órgano están en un perfil versionado (archivo) y cada votación elige método y umbral; cada resultado publica las reglas efectivas y su hash. — Un cambio de reglas no puede pasar inadvertido.
- [Bloque 1] Una instancia por órgano, con su perfil, sus claves y su base de datos. — No se comparten datos; es más simple para el RGPD y la custodia de claves.
- [Bloque 1] La v1 admite votaciones electrónicas en directo durante la sesión y también el enlace único al terminar. — Las elecciones secuenciales (bloques, segunda vuelta, desempates) no caben en un enlace final. El anonimato en directo es más débil por los metadatos y se documentará.
- [Bloque 1] Las votaciones no secretas pueden ser electrónicas y nominales (registro público de quién vota qué, sin firmas ciegas) o de recuento manual (la secretaría introduce los totales a mano alzada). Ambas pasan por el mismo recuento y la misma exportación. — Quien asiste por vía telemática puede votarlas, y la mano alzada sigue siendo posible.
- [Bloque 1] La petición de voto secreto no se gestiona en la plataforma: la mesa la decide y marca la votación como secreta. La plataforma muestra el umbral en número de personas como ayuda. — Registrar quién lo pide podría intimidar.
- [Bloque 1] Bloque cerrado.

## Bloque 2 · Roles y permisos

- [Bloque 2] Un rol genérico «mesa», asignable a 1–3 personas, crea y configura las votaciones. — No depende de una sola persona y cada órgano decide quién lo tiene.
- [Bloque 2] En directo, la mesa abre y cierra a mano. En diferido, el cierre es automático a la hora fijada al abrir, que no se puede acortar. — Evita olvidos y cierres anticipados.
- [Bloque 2] Los resultados se publican automáticamente al cerrar (totales y tablón de votos). — Nadie puede retener ni retocar un resultado.
- [Bloque 2] La administración técnica puede coincidir con la mesa. Esa concentración de poder se documenta como riesgo en el modelo de amenazas. — Es realista con pocas personas voluntarias.
- [Bloque 2] La primera persona de mesa se fija en la configuración del despliegue. Después, la mesa asigna y retira el rol desde la web, y cada cambio queda en un registro público (alias de cargo, sin datos personales). — El traspaso no depende de la administración técnica y los cambios quedan a la vista.
- [Bloque 2] Las personas sin voto no tienen cuenta. Los resultados, el tablón, la clave pública y los compromisos de sorteo son públicos sin iniciar sesión. — Se tratan menos datos personales y cualquiera puede verificar.
- [Bloque 2] Una votación abierta o cerrada no se edita nunca. La mesa puede anularla con un motivo obligatorio: queda publicada como anulada, con su tablón, y se crea otra. — Nadie puede cambiar las reglas a mitad de una votación sin que se vea.
- [Bloque 2] No hay un rol de auditoría con permisos especiales: todo lo auditable es público. — Si hiciera falta un acceso privilegiado, sería señal de que falta algo por publicar.
- [Bloque 2] Bloque cerrado.

## Bloque 3 · Identidad y autenticación

- [Bloque 3] La autenticación es con un código de un solo uso enviado al correo del censo; el SSO SAML de la Universidad queda como mejora futura. — Un escáner de enlaces no consume un código. El SSO exige un alta formal en el SICUZ (procedimiento PRC 0603), con plazo incierto.
- [Bloque 3] El código caduca a los 10 minutos, es de un solo uso y admite 5 intentos; la sesión dura 12 horas. — Cubre el pleno y el plazo habitual del enlace final.
- [Bloque 3] Si alguien no puede acceder a su correo en la sala, la mesa comprueba su identidad en persona y genera un código de un solo uso. Queda registrado y se notifica por correo a esa persona. — Nadie presente se queda sin votar, y una suplantación por la mesa sería detectable.
- [Bloque 3] Los correos de aviso solo llevan un enlace a la plataforma, sin credenciales; para votar hay que iniciar sesión. — Quien acceda al buzón o al proveedor de correo no puede votar solo con el correo.
- [Bloque 3] Se acepta cualquier dirección de correo como identidad, sin lista de dominios. — El censo de cada votación es una lista cerrada.
- [Bloque 3] Los correos se envían desde la cuenta institucional del Consejo, autenticándose en Google, con un transporte configurable y fácil de cambiar para otros órganos. — Preferencia de la Comisión: mejor entrega y sin depender de terceros. Se concreta en las dos decisiones siguientes.
- [Bloque 3] Google se usa solo para que la plataforma envíe correo desde la cuenta del Consejo (Gmail API con OAuth). Los miembros siempre entran con el código por correo. — Google no sabe cuándo entra cada votante y se mantiene «cualquier correo».
- [Bloque 3] El transporte de correo tiene dos adaptadores, Gmail API (OAuth) y SMTP genérico, y se elige con variables de entorno. Habrá una guía paso a paso para cada uno. — Otros órganos lo cambian sin tocar código.
- [Bloque 3] **POSPUESTO**: viabilidad de usar la cuenta del Consejo desde una app externa. Falta comprobar que el Workspace de la Universidad permite conceder OAuth a una app propia, que el correo enviado no cae en spam y que el límite de envío es el de Workspace (2.000 correos al día por usuario según la ayuda de Google Workspace). Si falla, se usa SMTP con Brevo (300 correos al día gratis, empresa de la UE).
- [Bloque 3] Bloque cerrado.

## Bloque 4 · Censo, asistencia y quorum

- [Bloque 4] La asistencia presencial la registra solo la mesa, con su lista. — Es más fiable y no hay códigos que se puedan reenviar.
- [Bloque 4] La asistencia telemática la marca la mesa al comprobar en la videollamada que la persona está conectada; no hay integración con la videollamada. — Es lo más simple y evita códigos reenviables.
- [Bloque 4] Cada entrada y salida es un evento con hora. Al abrir cada votación se congela la lista de presentes, que es su censo y su base de quorum. — Cumple «quorum en el momento de cada votación» y deja trazabilidad.
- [Bloque 4] En el enlace final, por defecto, censo y quorum se congelan al levantar la sesión. Es un parámetro del perfil y puede cambiarse a «presente en algún momento». — Es la lectura más coherente con el quorum por votación, y sigue siendo configurable para otros órganos.
- [Bloque 4] Las salidas también las registra solo la mesa; el miembro no tiene botón «salgo». — Coherente con la lista de la mesa.
- [Bloque 4] El censo se carga con un CSV (nombre, correo y una o varias titulaciones) y se edita en la web; los cambios quedan en un registro interno, no público. — Es rápido al inicio de curso y deja trazabilidad.
- [Bloque 4] La mesa activa la segunda convocatoria con un botón que se habilita tras N minutos; el perfil fija N (15 por defecto) y los umbrales (1/3 y 1/4). Queda registrada la hora de activación. — Hay control humano y constancia de cuándo se aplicó.
- [Bloque 4] Si falta quorum o la asistencia mínima del método, la plataforma avisa y permite a la mesa forzar la apertura con un motivo obligatorio, que se publica junto al resultado. — Prima no bloquear la sesión ante errores de registro; el forzado queda a la vista de todos.
- [Bloque 4] En la web pública solo se publican los totales de asistencia (miembros, presentes, delegados y quorum exigido); la lista nominal solo va en la exportación para el acta. — Es el mínimo de datos personales en Internet.
- [Bloque 4] Las votaciones restringidas filtran el censo por titulación. Los requisitos adicionales de candidatura (p. ej., el curso) no se guardan y los comprueba la mesa. — Son menos datos y no caducan cada curso.
- [Bloque 4] El total de miembros se congela al abrir la sesión: el censo queda bloqueado mientras está abierta y solo se corrige forzando con motivo registrado. — Los quorums no cambian a mitad de pleno.
- [Bloque 4] Bloque cerrado.

## Bloque 5 · Delegación de voto

- [Bloque 5] La solicitud llega por el canal que indique la convocatoria y la mesa registra la delegación; la plataforma rechaza las que superen el tope del perfil (2 por defecto). — Es simple y encaja con un «procedimiento formal» que fija cada órgano.
- [Bloque 5] De la justificación solo se guarda «justificada: sí»; el motivo se presenta a la secretaría por su canal. — Evita tratar datos de categoría especial (art. 9 del RGPD).
- [Bloque 5] Si quien delegó llega a la sesión, la delegación se suspende para las votaciones que se abran después; en las ya abiertas sigue votando la persona delegada. — Una credencial ciega emitida no se puede retirar.
- [Bloque 5] La persona delegada recibe papeletas separadas, una por voto («Tu voto» y «Voto delegado de [nombre]»), cada una con su credencial y su comprobante. — Puede votar distinto en cada una y el tablón no revela pesos.
- [Bloque 5] En una votación restringida a una titulación, el voto delegado cuenta si quien delega es de esa titulación, sea cual sea la de la persona delegada. — El derecho de voto es de quien delega.
- [Bloque 5] Los votos delegados siguen la presencia de la persona delegada: si no está en la foto de presentes de una votación, tampoco entran sus delegados. — Respeta el requisito de presencia.
- [Bloque 5] Al registrar o suspender una delegación se envía un correo a ambas personas. — Una delegación falsa introducida por la mesa sería detectable.
- [Bloque 5] La delegación vale para la sesión completa, enlace final incluido. — Es lo que describe el Reglamento y lo más simple.
- [Bloque 5] Bloque cerrado.

## Bloque 6 · Protocolo criptográfico

- [Bloque 6] Librería: `@cloudflare/blindrsa-ts` en el cliente (navegador) y en el servidor. — Soporta las 4 variantes del RFC y pasa sus vectores; un solo lenguaje facilita el relevo. No tiene auditoría formal publicada, y se documentará así. Fuente: github.com/cloudflare/blindrsa-ts.
- [Bloque 6] Variante: RSABSSA-SHA384-PSS-Randomized. — Es la más conservadora y no cuesta nada: la firma resultante se verifica como RSA-PSS estándar en cualquier librería.
- [Bloque 6] Claves RSA de 3072 bits. — Dan unos 128 bits de seguridad (NIST SP 800-57). El anonimato no depende del tamaño de la clave; la infalsificabilidad, sí.
- [Bloque 6] Una clave por votación. — Un token no sirve en otra votación y comprometer una clave solo afecta a esa votación.
- [Bloque 6] El servicio de firma genera la clave al abrir la votación, la guarda cifrada con un secreto del entorno y la destruye al cerrar. — Impide fabricar votos después del cierre. Que se destruya de verdad no es verificable desde fuera, y se documentará.
- [Bloque 6] La consistencia de la clave pública solo la comprueba el cliente, que la compara con la del tablón; no hay comprobación humana en la sala. Se documenta como vulnerabilidad conocida: un servidor malicioso que sirva clave y tablón distintos a cada persona podría marcar votos. — Decisión de la Comisión: es más simple, y la limitación queda explícita en el modelo de amenazas.
- [Bloque 6] Al abrir la votación, los clientes de todos los presentes piden su token a la vez. El voto se envía sin cookies ni sesión a un endpoint distinto, y ni la aplicación ni los registros configurables del proveedor guardan hora ni IP. — Así la hora de emisión no delata a nadie. Un operador malicioso aún podría correlacionar en tiempo real; se documenta.
- [Bloque 6] Mientras la votación está abierta solo se publica el contador de votos recibidos. Al cerrar se publica la lista completa, ordenada por token, sin hora ni orden de llegada y con un hash final. — No hay resultados parciales ni orden de llegada a la vista.
- [Bloque 6] El historial se ancla con una cadena de hashes (cada votación incluye el hash de la anterior) y el hash final se envía por correo a todo el censo al cerrar. — Reescribir el historial exigiría alterar los buzones de todas las personas.
- [Bloque 6] Para detectar votos fabricados se publican el censo de la votación, las credenciales emitidas y los votos recibidos (votos ≤ emitidas ≤ censo). Al cerrar, cada miembro recibe un correo con «se emitieron N credenciales a tu nombre». — Así es detectable una credencial fantasma a nombre de un presente que no votó.
- [Bloque 6] El tablón se publica desagregado por casilla. Por un lado, una lista de participación (token y firma, verificable por cualquiera). Por otro, una lista barajada por cada casilla con entradas `(id, valor)`, donde id = H(s ‖ casilla) y `s` es un secreto aleatorio de la papeleta generado por el cliente que solo conoce quien vota (y el servidor al recibir el voto). Cada lista de casilla debe tener tantas entradas como tokens válidos, y la abstención cuenta como entrada. — Cualquiera recalcula totales y algoritmos y cada votante comprueba sus casillas, pero terceros no pueden reconstruir la combinación (anti «firma» en vocalías). Ojo: el id NO puede derivarse del token, porque el token es público y entonces cualquiera reconstruiría las papeletas.
- [Bloque 6] El comprobante es el token junto con `s`. Se guarda en el almacenamiento local del navegador y se puede descargar como archivo o QR. Tras el cierre, la web comprueba sola que las casillas del votante están en el tablón. Habrá un aviso visible: enseñar el comprobante revela el voto. — Verificación individual sin depender del servidor. La falta de resistencia a recibos es inherente al esquema y se documenta.
- [Bloque 6] Un token perdido no se reemite. Se guarda localmente desde que se obtiene y se puede reanudar en el mismo navegador; si se pierde, se pierde el voto. — El servidor no puede saber si un token se usó sin vincularlo a la persona, y reemitirlo permitiría el doble voto.
- [Bloque 6] No se puede cambiar el voto: un token, un voto. — Es más simple de explicar y verificar; la coacción en presencia ya se acepta y se documenta.
- [Bloque 6] El mensaje firmado en ciego es id de votación ‖ 32 bytes aleatorios (crypto.getRandomValues). — Defensa en profundidad por si alguna vez se reutilizara una clave.
- [Bloque 6] La emisión es idempotente por mensaje cegado: el cliente lo guarda antes de enviarlo y, en un reintento, el servidor devuelve la misma firma ciega. Un mensaje distinto cuenta contra el tope (1 + delegados). — Un fallo de red no da una segunda credencial ni hace perder la primera.
- [Bloque 6] El tablón y la cadena usan SHA-256 con JSON canónico (RFC 8785, JCS). — Es estándar y cualquier herramienta independiente puede recalcular los hashes byte a byte.
- [Bloque 6] Bloque cerrado. La separación física entre el servicio de firma y el de recepción se decide en el Bloque 11.

## Bloque 7 · Tipos de votación y algoritmos

- [Bloque 7] La papeleta del método sí/no ofrece A favor, En contra, En blanco y Abstención; el perfil puede ocultar opciones. — Las definiciones distinguen el blanco (emitido) de la abstención (no emitida).
- [Bloque 7] La base de los umbrales es configurable por método: emitidos, presentes, presentes + delegados o miembros. El perfil del Pleno usa presentes + delegados ejercidos en censura y reforma. **POSPUESTO** su confirmación formal: es una interpretación que debería ratificar el Pleno. — La lectura literal (solo presentes en la base) permitiría superar el 100 %.
- [Bloque 7] Redondeo: «más de la mitad» es estricto (a favor > base/2) y «fracción de» usa ≥ con techo (a favor ≥ ⌈2·base/3⌉; quorum: presentes ≥ ⌈miembros/3⌉). Todo con aritmética entera. — Lectura habitual y sin errores de coma flotante.
- [Bloque 7] La elección de cargos en directo usa un asistente: la mesa define cargos y candidaturas, la plataforma propone la siguiente votación según el resultado (segunda vuelta, repetición, sorteo, siguiente cargo) y la mesa la confirma y abre. — Menos errores en la sala.
- [Bloque 7] La papeleta de un cargo lleva: candidaturas, En blanco, En contra de todas y Abstención (no emitida). — Con abstención explícita, «no votar» no se distingue de abstenerse en los contadores, y todo el mundo recibe comprobante.
- [Bloque 7] Qué ocurre en segunda vuelta si «en contra de todas» supera a ambas candidaturas es un parámetro del método. El perfil del Pleno usa la lectura literal: gana la más votada. — Sigue el texto y permite a otros órganos dar efecto de bloqueo.
- [Bloque 7] Si hay empate por el puesto de paso a la segunda vuelta, se repite la votación entre las empatadas para ese puesto y, si persiste, se sortea. — Aplica la regla general de empates y respeta «entre las dos más votadas».
- [Bloque 7] Las candidaturas en bloque usan el mismo método que un cargo (mayoría simple si hay una; absoluta, segunda vuelta y desempates si hay varias). Si ningún bloque resulta elegido, se pasa a la elección individual. — Se reutiliza un solo método.
- [Bloque 7] Con candidatura única, un empate entre a favor y en contra significa que no resulta elegida y el cargo queda sin cubrir. — No hay mayoría simple, y la regla de empates se refiere a empates entre candidaturas.
- [Bloque 7] Un empate se repite una vez y, si persiste, se sortea; el número de repeticiones es un parámetro del perfil (1 por defecto). — Concreta «de persistir» y evita alargar la sesión.
- [Bloque 7] Quien ya ha sido elegido para un cargo se retira automáticamente de las candidaturas posteriores, con aviso a la mesa, que puede deshacerlo con motivo. — Una persona no ocupa dos cargos [interpretación: el Reglamento no lo dice expresamente].
- [Bloque 7] La elección de cargos (bloques e individuales, con sus rondas) solo se hace en directo; la plataforma no la ofrece en el enlace final. — Las rondas sucesivas no caben en un plazo diferido. Esto se aparta de la posibilidad que abre el Reglamento (votar cargos en línea al término de la sesión), y se documentará.
- [Bloque 7] Vocalías: aceptación diferida propuesta por las candidaturas (Gale–Shapley), determinista. Cada vocalía retiene por votos a favor, después por menos votos en contra y después por un orden único sorteado y comprometido antes de abrir la votación. — Es lo que fija el Reglamento.
- [Bloque 7] Cada casilla de vocalía (candidatura × vocalía) admite A favor, En contra o Abstención, con abstención por defecto. Solo es elegible quien tiene más votos a favor que en contra. — Es lo que dice la norma, y así todas las papeletas tienen todas las casillas, como necesita el tablón desagregado.
- [Bloque 7] Una vacante posterior se ofrece a la siguiente candidatura elegible en esa vocalía que no ocupe otra, con el mismo orden del recuento original. La plataforma conserva y muestra la clasificación; la aceptación la registra la mesa. — No mueve a nadie de su vocalía.
- [Bloque 7] Las vocalías pueden votarse en directo o en el enlace final. — Es una sola votación simultánea, sin rondas.
- [Bloque 7] En el voto limitado se marcan hasta k = máx(1, puestos − 1) candidaturas; una papeleta sin marcas cuenta como blanco (emitido) y la abstención es un botón aparte. El tablón publica cada candidatura como una casilla sí/no. — Sigue «podrá votar a tantas…» y encaja con el tablón desagregado.
- [Bloque 7] Para un solo puesto (representante, delegación de titulación) gana la candidatura más votada (mayoría relativa, k = 1). — Decisión de la Comisión: cabe en el enlace final y es simple. Riesgo aceptado: alguien puede salir elegido con muy pocos votos.
- [Bloque 7] En el voto limitado, todos los empates (último puesto y orden de suplentes) se resuelven con el orden único sorteado antes del recuento, sin repetir la votación. — Decisión de la Comisión: es más rápido. Se aparta de la regla general de empates (repetir y después sortear), y se documentará.
- [Bloque 7] El mínimo de votos para resultar elegido en el voto limitado es un parámetro; por defecto no hay mínimo. — Lectura literal de «resultarán elegidas las más votadas».
- [Bloque 7] La moción de censura y la reforma son votaciones sí/no con umbral y asistencia mínima. Censura: secreta, mayoría absoluta sobre presentes + delegados y asistencia ≥ 1/2; la candidatura alternativa va como texto en la descripción. Reforma: 2/3 y asistencia ≥ 1/3. La restricción a los firmantes de una moción rechazada no se controla. — Se reutiliza el catálogo y se guardan menos datos.
- [Bloque 7] En el modo papel, la mesa introduce los totales por casilla; el resultado se marca como «recuento manual», sin verificación criptográfica, y pasa por los mismos algoritmos. — Los algoritmos solo necesitan totales y la mesa no ve combinaciones.
- [Bloque 7] Cada votación es solo electrónica o solo en papel; no se mezclan. Si alguien no puede votar electrónicamente, la mesa pasa la votación entera a papel. — Evita el doble voto entre canales.
- [Bloque 7] Bloque cerrado.

## Bloque 8 · Sorteos verificables

- [Bloque 8] Los sorteos combinan un compromiso de la mesa con la baliza pública drand (red quicknet, firmas BLS verificables): la mesa publica H(semilla) y una ronda futura R de drand; tras R revela la semilla, y el resultado sale de H(semilla ‖ aleatoriedad de la ronda R). — Ni la mesa ni drand controlan el resultado por sí solos. Fuente: drand.love/developer/http-api. El periodo de quicknet (3 s) está [por verificar] con `/info`.
- [Bloque 8] El orden único de desempate (vocalías, voto limitado) se compromete al crear la votación y se revela al cerrarla. El sorteo por empate persistente se compromete en la sala con una ronda de drand de unos 30 s después. — Nadie conoce el orden antes de que se emitan los votos.
- [Bloque 8] El orden se deriva con Fisher–Yates sobre la lista de candidaturas en orden canónico, usando SHA-256(semilla ‖ i) en modo contador con muestreo por rechazo. — Sin sesgo de módulo y reproducible por la CLI en cualquier lenguaje.
- [Bloque 8] Si drand no responde, se espera: la ronda R es fija y se puede obtener más tarde de cualquier espejo (api.drand.sh, Cloudflare), y el sorteo queda pendiente hasta tenerla. Nunca se recurre solo a la semilla de la mesa. — La garantía no se debilita cuando hay un fallo. La dependencia de drand se documenta.
- [Bloque 8] Bloque cerrado.

## Bloque 9 · Asentimiento por correo

- [Bloque 9] La plataforma envía el texto de la propuesta y un enlace a todo el censo. Para oponerse hay que iniciar sesión con código y pulsar «Me opongo»; la oposición se puede retirar hasta el plazo. — Registro fiable, sin tener que interpretar respuestas por correo.
- [Bloque 9] La oposición es nominal en el acta. En la web pública solo aparece el resultado: «aprobada» o «va al siguiente pleno (N oposiciones)». — El asentimiento no es secreto y así se publican menos datos.
- [Bloque 9] La mesa elige la fecha de cierre y la plataforma impide que sea anterior a las 23:59 (hora de Madrid) del segundo día natural tras el envío. El cierre es automático y la hora de envío queda registrada. — Garantiza el plazo mínimo sin ambigüedades; el número de días es un parámetro del perfil (2 por defecto).
- [Bloque 9] Al crear un asentimiento se muestra la lista de materias excluidas del perfil, sin bloqueo: la mesa confirma que el asunto no es una de ellas. — La plataforma no puede clasificar el asunto por sí misma.
- [Bloque 9] Tras la primera oposición, el asentimiento sigue abierto hasta el plazo y la mesa recibe un aviso de cada oposición. — Una oposición se puede retirar, así que el resultado solo es firme al cierre.
- [Bloque 9] El censo de un asentimiento es todo el censo del órgano, sin delegaciones y sin depender de la asistencia; puede restringirse a una titulación. — «Se enviará a todos los miembros».
- [Bloque 9] Bloque cerrado.

## Bloque 10 · Experiencia de uso y accesibilidad

- [Bloque 10] Objetivo WCAG 2.2 AA y diseño móvil primero, comprobado con axe en la CI y con una revisión manual con lector de pantalla antes de cada versión. — Es el nivel de referencia europeo (EN 301 549 [por verificar la versión vigente]).
- [Bloque 10] La interfaz está en español e inglés. Los textos de cada votación (títulos, candidaturas) van en el idioma que decida la mesa, sin traducción. — Coherente con el repositorio bilingüe y con los miembros de intercambio.
- [Bloque 10] Para tolerar la mala cobertura: página ligera (menos de 200 KB), token obtenido y guardado al abrir la votación, y voto guardado localmente y reintentado hasta el cierre, con su estado visible. Sin app instalable. — Robusto con poca complejidad.
- [Bloque 10] Se requiere JavaScript y un navegador moderno (WebCrypto, BigInt). Si no los hay, se muestra un aviso: otro dispositivo o paso a papel. Nunca se ciega en el servidor. — Cegar en el servidor rompería el anonimato.
- [Bloque 10] Habrá una vista pública de proyección, sin sesión: estado de la votación, presentes, quorum, contador y, al cerrar, el resultado y la huella de la clave. — Transparencia en la sala con la misma información que la web pública.
- [Bloque 10] Antes de enviar hay una pantalla de revisión con avisos (p. ej., «sin marcas = blanco») y un botón de confirmar; después se entrega el comprobante. — Sin revoto, un error no tendría arreglo.
- [Bloque 10] La exportación para el acta incluye: Markdown para pegar (reglas aplicadas, asistencia nominal, resultados, sorteos y forzados con motivo), CSV y el JSON del tablón como anexo verificable. — Formatos simples y sin dependencias pesadas.
- [Bloque 10] Bloque cerrado.

## Bloque 11 · Stack y despliegue

- [Bloque 11] TypeScript en todo el proyecto: servidor con Hono, cliente con Preact y empaquetado con Vite. — Un solo lenguaje, igual que blindrsa-ts. Hono funciona en varios entornos (Node, Deno, Bun, Workers) y facilita cambiar de hosting; Preact cabe en el presupuesto de 200 KB.
- [Bloque 11] Para el Consejo, el alojamiento es una VM en la UE de pago mínimo (p. ej., Hetzner, ~4–5 €/mes [por verificar tras la subida de precios de abril de 2026]), pagando solo los meses o días de uso. Es configurable para otras organizaciones que hagan fork. Si no se consigue esa flexibilidad de pago, se usa Render (Frankfurt) + Neon (UE), gratis. — Solo con control total de la máquina se garantiza que nadie guarda IP ni hora de los votos. Fuentes: render.com/docs/free y neon.com/faqs/free-plan-limits-and-quotas. Hetzner factura por horas con tope mensual según fuentes secundarias [por verificar en hetzner.com/cloud].
- [Bloque 11] Firma y recepción de votos van en la misma app, en módulos distintos que solo comparten la lista de tokens gastados. El voto se envía a otro subdominio, sin cookies ni sesión. — Separarlo en dos despliegues solo protegería si los operasen personas distintas; se documenta.
- [Bloque 11] Se descarta Cloudflare Workers en el plan gratuito. — Tiene 10 ms de CPU por petición, probablemente insuficiente para firmar RSA-3072 en JS [por verificar con una prueba de rendimiento]. Fuente: developers.cloudflare.com/workers/platform/pricing.
- [Bloque 11] La VM se crea con un script antes de cada pleno o asentimiento a partir de la instantánea guardada, y se destruye después dejando una instantánea (~0,012 €/GB/mes [por verificar]). Resultados, tablón, claves públicas y cadena de hashes se publican en un archivo estático gratuito y siempre en línea. — Se paga solo por el uso y la verificación pública no depende de la VM.
- [Bloque 11] La base de datos es SQLite con Drizzle ORM. — Un solo archivo y copias triviales; Drizzle también soporta PostgreSQL para el plan B (Render + Neon).
- [Bloque 11] Copias de seguridad: después de cada cierre se hace un volcado de SQLite cifrado con age (la clave pública va en la configuración; la privada se custodia fuera de línea, ver Bloque 15), que se guarda en la VM y en la instantánea. — Una caída en mitad de la sesión no pierde lo ya cerrado. La retención se fija en el Bloque 12.
- [Bloque 11] GitHub Pages aloja la interfaz web, compilada por GitHub Actions desde el repositorio público, y el archivo público. La API corre en la VM con un hostname gratuito sobre su IP (tipo sslip.io) y certificado de Let's Encrypt. La sesión va en una cabecera, no en una cookie. — La VM no puede servir un JS manipulado y cualquiera puede comprobar qué código ejecuta el votante. Pages no puede ejecutar backend, por eso la VM sigue siendo necesaria.
- [Bloque 11] No se reserva una IP fija: el script de arranque publica en Pages la nueva URL de la API. — Coste cero. Los enlaces enviados por correo apuntan a la interfaz en Pages, que lee la URL de la API de su configuración, así que siguen valiendo.
- [Bloque 11] En el enlace final, la huella de la clave pública se publica en Pages antes de abrir y el cliente la compara con la de Pages, no con la de la VM; en directo es opcional y la mesa decide si espera (~1 min [por verificar]). — Cierra el ataque de «clave distinta por persona» salvo colusión con GitHub. Matiza la decisión anterior de «solo cliente», que sigue aplicando en directo cuando no se espera.
- [Bloque 11] El archivo público vive en un repositorio público separado, solo para datos. La VM publica con un token de GitHub de grano fino limitado a ese repositorio. — Una VM comprometida no puede alterar la interfaz, y el historial de git sirve además de anclaje con fecha.
- [Bloque 11] La VM se crea y se destruye con scripts `up` y `down` que usan la CLI del proveedor, cloud-init y Docker Compose, con un adaptador por proveedor (Hetzner primero). — Legible para estudiantes y adaptable en un fork.
- [Bloque 11] El servidor corre en Node.js LTS. — Es el entorno más conocido y estable, con buen soporte en Hono y Drizzle.
- [Bloque 11] Bloque cerrado.

## Bloque 12 · Privacidad y RGPD

- [Bloque 12] Responsable del tratamiento: el Consejo de Estudiantes. — Decisión de la Comisión. [por verificar] Si el Consejo puede ser responsable sin personalidad jurídica propia y cómo encaja con la base del art. 6.1.e, cuya misión de interés público corresponde a la Universidad. Conviene confirmarlo con el DPD de la Universidad (ver Bloque 16).
- [Bloque 12] Base jurídica: misión de interés público, art. 6.1.e del RGPD. — Votar es parte del cargo y no se puede negar libremente, así que el consentimiento no encaja [por verificar con el DPD].
- [Bloque 12] Retención: censo, asistencia, delegaciones, oposiciones y roles se borran un mes después de la sesión constitutiva siguiente. Los códigos de acceso se borran al usarse o caducar y las sesiones a las 12 horas. El acta nominal la custodia la secretaría fuera de la plataforma. El tablón anónimo y los totales son públicos indefinidamente. — Mínimo necesario con margen para aprobar actas.
- [Bloque 12] Registros: no hay registros de acceso (proxy desactivado). La app solo registra errores, sin IP, user-agent, token ni identidad, y la limitación de intentos se hace en memoria. Una prueba en la CI comprueba que el endpoint de voto no escribe registros. — Requisito de no guardar metadatos que permitan correlacionar.
- [Bloque 12] Los resultados publicados llevan nombres (quién sale elegido). El tablón desagregado usa ids de candidatura, y la tabla id→nombre va en un archivo aparte: la cadena cubre los ids y el hash de esa tabla, de modo que se puede anonimizar más adelante sin romperla. — Los cargos de representación son públicos y el derecho de supresión no choca con la integridad de la cadena.
- [Bloque 12] Información al votante: página de privacidad bilingüe y completa, más un resumen de 3 líneas con enlace en la pantalla de acceso y en el correo del primer código. — Cumple el art. 13 de forma visible.
- [Bloque 12] Se redactan en `docs/` una EIPD simplificada y un registro de actividades de tratamiento, con datos ficticios en los ejemplos. — Se aplica tecnología nueva a votaciones; la EIPD reutiliza el modelo de amenazas [obligatoriedad por verificar].
- [Bloque 12] Encargados del tratamiento declarados: Hetzner (VM en la UE), Google (correo desde la cuenta del Consejo) y GitHub (publicación de datos ya públicos). — Hay que revisar el contrato de encargo (DPA) de cada uno [por verificar].
- [Bloque 12] Bloque cerrado.

## Bloque 13 · Pruebas y auditoría

- [Bloque 13] Herramientas de prueba: Vitest (unitarias e integración), fast-check (propiedades: asignación de vocalías estable, nadie ocupa dos vocalías, emitidas ≥ votos…) y Playwright con axe (flujo completo y accesibilidad). — Cubre la lógica, las propiedades y la experiencia.
- [Bloque 13] La CI ejecuta los vectores de prueba de RFC 9474 contra blindrsa-ts y verifica las firmas producidas como RSA-PSS estándar con la librería `cryptography` de Python. — Demuestra que no dependemos de un detalle de una sola implementación.
- [Bloque 13] La CLI de verificación independiente se escribe en Python a partir de la especificación escrita, no del código TS. Recalcula hashes JCS, cadena, firmas RSA-PSS, contadores, algoritmos de recuento, sorteos y drand. — Un error del núcleo no se reproduciría en la verificación, y Python es lo más accesible para quien audita.
- [Bloque 13] Los ejemplos de las reglas forman un corpus JSON compartido (entrada, reglas, resultado esperado y explicación en lenguaje llano) que ejecutan tanto el núcleo TS como la CLI de Python. — Ambas implementaciones deben coincidir, y el corpus documenta además los algoritmos.
- [Bloque 13] Revisión externa: convocatoria abierta, sin exigir una revisión antes del primer uso. — Decisión de la Comisión. Riesgo aceptado: el sistema puede usarse sin una revisión independiente; se indicará claramente en el README y el modelo de amenazas.
- [Bloque 13] El simulacro antes del primer pleno real lo hace solo el equipo de desarrollo. — Decisión de la Comisión: menos logística. Riesgo aceptado: puede no detectar problemas de uso reales.
- [Bloque 13] Cobertura: 100 % de ramas en el núcleo (algoritmos, recuento, protocolo, sorteos), exigido en la CI; sin umbral en la interfaz ni la infraestructura. — Máximo rigor donde importa, sin incentivar pruebas vacías.
- [Bloque 13] Bloque cerrado.

## Bloque 14 · Repositorio público

- [Bloque 14] El código se publica con licencia EUPL-1.2. — Es copyleft que cubre el uso en red, así que una instancia modificada debe ofrecer su código. Tiene texto oficial con validez jurídica en español y es compatible con GPL y AGPL.
- [Bloque 14] La documentación se publica con licencia CC BY-SA 4.0. — Se puede adaptar citando y compartiendo igual, en línea con el copyleft del código.
- [Bloque 14] Monorepo con pnpm: `packages/core` (algoritmos y protocolo, sin E/S), `apps/api` (Hono), `apps/web` (Preact), `tools/verify` (CLI en Python), `spec/` (especificación y corpus JSON), `infra/` (scripts up/down), `docs/` (es/en) y `PLAN/`. El archivo de datos va en otro repositorio. — Versiones coherentes y un núcleo aislado y auditable.
- [Bloque 14] Conventional Commits en inglés, versiones SemVer, CHANGELOG con el formato Keep a Changelog y GitHub Releases con atestación de procedencia del build (GitHub Artifact Attestations). — Cualquiera puede comprobar que la interfaz publicada sale de un commit concreto.
- [Bloque 14] La CI de cada pull request ejecuta: lint, tipos, Vitest con cobertura del núcleo, vectores del RFC, corpus TS y Python, Playwright con axe, la prueba de «sin registros», CodeQL y Dependabot. — Es gratis en repositorios públicos y protege lo crítico.
- [Bloque 14] Las vulnerabilidades se reportan por el canal privado de GitHub. SECURITY.md describe el proceso, los plazos orientativos (acuse en 7 días) y el alcance, sin correos en el repositorio. — Divulgación responsable sin publicar datos de contacto.
- [Bloque 14] No hay web de documentación aparte: la documentación es Markdown en GitHub (que renderiza Mermaid) y la app enlaza a las guías. — Pages ya aloja la app y una web más sería otra cosa que mantener.
- [Bloque 14] Código de conducta: Contributor Covenant 2.1 en español e inglés, con el canal privado de GitHub como contacto. — Es el estándar de facto y tiene traducción oficial.
- [Bloque 14] Contribuciones por pull request: `main` protegida, al menos 1 revisión, la CI en verde y firma DCO (Signed-off-by); los cambios en el núcleo o en la criptografía exigen 2 revisiones. — Trazabilidad de la autoría sin CLA y más rigor en lo crítico.
- [Bloque 14] El repositorio se aloja en una cuenta personal de GitHub. — Decisión de la Comisión: es más rápido. Consecuencia: el relevo exige transferir el repositorio o añadir colaboradores (Bloque 15), y depende de una persona.
- [Bloque 14] Bloque cerrado.

## Bloque 15 · Operación y relevo

- [Bloque 15] `up` y `down` se ejecutan con un flujo manual de GitHub Actions en el entorno «production», con aprobación obligatoria. — Los secretos no están en portátiles y cada ejecución queda registrada.
- [Bloque 15] Los secretos operativos (token del proveedor de la VM, OAuth de Gmail, token del repositorio de datos, clave maestra de la base de datos) van en los secretos del entorno «production» de GitHub. La clave privada age nunca se sube: hay dos copias fuera de línea custodiadas por dos personas de la Comisión. — Si se compromete GitHub, no se pueden descifrar las copias.
- [Bloque 15] Si el servidor cae en mitad de una votación en directo y vuelve en 10 minutos o menos (parámetro), se reanuda: los votos y la clave cifrada sobreviven en SQLite y los clientes reintentan. Si tarda más, la mesa anula la votación (queda publicada como anulada) y la repite en papel o cuando vuelva el servicio. — Equilibra continuidad y garantías.
- [Bloque 15] Relevo: la Comisión entrante recibe la cuenta de correo institucional del Consejo y el enlace al repositorio. Es responsabilidad suya clonarlo o bifurcarlo y hacerlo suyo, siguiendo un tutorial de la documentación. — Decisión de la Comisión: el traspaso es mínimo y autónomo. Las implicaciones se concretan en las decisiones siguientes.
- [Bloque 15] Todas las cuentas externas de la instancia (proveedor de la VM, la cuenta de GitHub del despliegue con su fork, secretos y repositorio de datos, y Google) se registran con el correo institucional del Consejo. El repositorio de código principal puede seguir en una cuenta personal. — Heredar el correo es heredar la instancia, porque permite recuperar cualquier acceso.
- [Bloque 15] Al cambiar de Comisión se mantiene el mismo repositorio de datos y la cadena continúa sin cortes. — Todo el historial queda en un solo sitio verificable.
- [Bloque 15] Cambiar contraseñas, tokens y clave age en el relevo es opcional: el tutorial lo recomienda con una lista de comprobación, pero no lo exige. — Decisión de la Comisión. Riesgo aceptado y documentado: quien sale puede conservar accesos válidos.
- [Bloque 15] La guía de la secretaría cubre la sesión entera. Antes: `up`, censo, delegaciones y prueba de correo. Durante: asistencia, convocatorias, votaciones, forzados y caídas. Después: enlace final, cierre, exportación del acta, `down` y verificación con la CLI. Lleva capturas con datos ficticios. — Es una guía completa para personas que cambian cada curso.
- [Bloque 15] Bloque cerrado.

## Bloque 16 · Encaje institucional

- [Bloque 16] El Pleno aprueba con un acuerdo el uso de la plataforma y su perfil de reglas antes del primer uso, tras conocer el modelo de amenazas y los límites. — Le da legitimidad como «medios electrónicos» que garantizan anonimato, unicidad y verificabilidad, también ante una impugnación.
- [Bloque 16] La plataforma lleva un aviso legal (quién la opera, sin ánimo de lucro, licencia y ausencia de garantía según la EUPL), un aviso visible de que no es un servicio oficial de la Universidad y la página de privacidad. — Deja clara la relación con la Universidad.
- [Bloque 16] No se usan logotipos institucionales. La plataforma tiene un nombre neutro y el nombre del órgano aparece solo como texto, configurable en el perfil. — No hace falta autorización y la herramienta es reutilizable.
- [Bloque 16] El desarrollo sigue el texto propuesto del Reglamento, y el perfil del Pleno se marca como «basado en texto pendiente de ratificación». El uso real solo llega tras la ratificación. **POSPUESTO**: qué hacer si en febrero de 2027 no está ratificado (aplazar o usar un perfil de las normas vigentes con acuerdo del Pleno). — Evita impugnaciones por aplicar normas que aún no están en vigor.
- [Bloque 16] No se informa a la Universidad (ni al Decanato ni al DPD) antes del primer uso. — Decisión de la Comisión. Consecuencia: el responsable del tratamiento y la base jurídica (Bloque 12) quedan [por verificar] sin respaldo institucional; se documenta como riesgo abierto.
- [Bloque 16] El nombre público del proyecto (repositorio y app) es `plataforma-votaciones`. — Descriptivo y neutro.
- [Bloque 16] Bloque cerrado.

## Puntos POSPUESTOS o por verificar

1. [Bloque 3] Viabilidad de enviar correo con la cuenta institucional del Consejo vía Gmail API/OAuth: si el Workspace de la Universidad lo permite, si el correo llega sin caer en spam y cuál es el límite real. Plan B: SMTP con Brevo.
2. [Bloque 7] Confirmación formal por el Pleno de la base «presentes + delegados» en los umbrales sobre presentes (censura y reforma).
3. [Bloque 8] Periodo real de la red quicknet de drand (consultar `/info`).
4. [Bloque 11] Precio actual de la VM, facturación por horas y precio de las instantáneas del proveedor. Rendimiento de RSA-3072 en JS (generación de claves y firma ciega).
5. [Bloque 11] Retraso real de publicación en GitHub Pages, que condiciona la huella de la clave en directo.
6. [Bloque 12] Si el Consejo puede ser responsable del tratamiento y cómo encaja con la base del art. 6.1.e. Obligatoriedad de la EIPD. Contratos de encargo (DPA) de Hetzner, Google y GitHub.
7. [Bloque 16] Qué hacer si el Reglamento no está ratificado en febrero de 2027.
8. [Bloque 10] Versión vigente de EN 301 549 y su correspondencia con WCAG 2.2.

## Hito H1 (2026-10-13)

- [H1] La firma ciega del servidor se hace con OpenSSL (`node:crypto`, `RSA_NO_PADDING`) con las comprobaciones de RFC 9474 §4.3; blindrsa-ts se mantiene en el cliente y para generar claves y verificar. — `blindSign` de la librería tarda ~0,9 s por firma en Node y bloquea el proceso; OpenSSL da el mismo resultado byte a byte en ~4 ms. Ver `h1-pruebas-de-concepto.md`.

## Hito H2 (2026-10-13)

- [H2] La especificación normativa de `spec/` se escribe solo en inglés; el resumen divulgativo sigue en `docs/` es/en. — Un único texto normativo evita que dos versiones digan cosas distintas, y llega a auditores externos.
- [H2] La ronda drand del orden de desempate se fija en público antes de que exista: en el enlace final, la de la hora de cierre fijada, publicada en el aviso de apertura; en directo, unos 30 s tras el cierre, mostrada en la proyección. — Si se derivara de la hora de cierre que declara el servidor, quien conociera la semilla podría elegir entre varias rondas ya vistas.

## Hito H3 (2026-10-13)

- [H3] `packages/core` obtiene SHA-256 de `@noble/hashes` (auditada, sin dependencias, síncrona). — Mantiene síncronas y puras las funciones de recuento, tablón y sorteo; WebCrypto obligaría a hacerlas asíncronas.
- [H3] El núcleo verifica las firmas RSA-PSS del tablón con WebCrypto (`crypto.subtle`), disponible en Node y en el navegador, sin añadir blindrsa-ts al núcleo. — La verificación es RSASSA-PSS estándar; blindrsa-ts solo hace falta para cegar (cliente) y llegará con la interfaz.

## Hito H4 (2026-10-13)

- [H4] El verificador Python usa `cryptography` (RSA-PSS), `py_ecc` (BLS12-381, para la firma de drand) y `tzdata` (zonas horarias en Windows), con versiones exactas. — `cryptography` es la referencia en Python; `py_ecc` incluye hash-to-curve sobre G1 y la verificación se compone con sus operaciones de curva; `tzdata` hace que los plazos del asentimiento den lo mismo en todos los sistemas.
- [H4] La verificación de un repositorio de datos sigue la estructura de `spec/formats.md` §9.1: `chain.json` en la raíz y, junto a cada tablón, su aviso de apertura, su tabla de candidaturas y su lista nominal. — Hacía falta fijarla para que la herramienta encuentre cada documento sin configuración.

## Hito H5 (2026-10-13)

- [H5] La API usa Hono, Drizzle con better-sqlite3 (trae binarios precompilados, sin scripts de instalación) y nodemailer para SMTP; Gmail API se llama con `fetch`, sin la librería de Google. — Lo mínimo para el plan; menos dependencias que auditar.
- [H5] El código TypeScript se ejecuta directamente con Node (eliminación de tipos), sin paso de compilación; los imports llevan extensión `.ts`. — Un artefacto menos que construir y comprobar en la VM.
- [H5] Interpretaciones de las delegaciones que conviene confirmar con la mesa: no se admiten cadenas (quien ha delegado no puede recibir delegaciones y quien tiene delegaciones no puede delegar); no puede delegar quien está presente; si quien delegó llega y vuelve a irse, puede registrar una delegación nueva. — El reglamento no trata estos casos y una cadena haría difícil saber quién vota por quién.
- [H5] Solo puede haber una sesión abierta a la vez, y la importación del censo sustituye la lista completa: quien no aparece se desactiva, nunca se borra. No se puede desactivar a nadie de la mesa. — Evita errores de la mesa y conserva las referencias del registro interno.

## Hito H6 (2026-10-13)

- [H6] Las reglas efectivas se fijan al abrir la votación, no al crearla, porque incluyen el quorum de la convocatoria vigente. — Nada se publica antes de abrir, así que no cambia lo que se puede verificar; corrige una incoherencia de la especificación.
- [H6] En H6 solo se admiten `yes_no` y `single_winner`; vocalías y voto limitado necesitan el sorteo de drand y llegan en H8 con el resto del catálogo. — Así el orden de los hitos del plan se mantiene.
- [H6] La clave privada de cada votación se guarda cifrada con AES-256-GCM (OpenSSL) bajo la clave maestra del entorno, con el id de la votación como dato asociado. — Sobrevive a un reinicio sin quedar en claro en disco.
- [H6] Si la publicación en el repositorio de datos falla, la votación queda cerrada con su tablón encadenado y la mesa puede reintentar; los votos agrupados se borran solo tras publicar. — No se pierde nada si GitHub no responde.
- [H6] Una votación creada pero nunca abierta se anula sin publicar nada, porque no hay aviso de apertura ni papeletas. — Solo se publica lo que llegó a abrirse.
- [H6] Solo una votación abierta a la vez por sesión. — Simplifica la proyección y evita confusiones al votar.

## Hito H7 (2026-10-13)

- [H7] La interfaz usa Preact con navegación por ancla (`#/vote`, `#/officials`, `#/projection`) y consulta la API cada pocos segundos, sin WebSockets ni librerías de estado. — Funciona en GitHub Pages sin configuración y cabe holgadamente en el presupuesto de 200 KB.
- [H7] Las papeletas de los votos delegados se titulan «Voto delegado 1, 2…», sin el nombre de quien delegó. — La foto de presentes solo guarda el número de derechos; mostrar nombres exigiría guardar en la votación qué delegación da cada derecho. Se puede añadir si la mesa lo pide.
- [H7] La credencial pendiente, la credencial y el voto se guardan en el navegador antes de enviarse. Si el navegador no permite guardar (ventana privada), la interfaz no continúa y lo explica. — Así no se pierde un voto por recargar la página.
- [H7] Para las pruebas con navegador, la API admite correo y publicación en una carpeta local (`PV_MAIL=directory`, `PV_PUBLISH=directory`), solo para desarrollo. — Permite leer los códigos de acceso sin abrir ningún punto de acceso nuevo en la API.

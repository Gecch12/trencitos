# Historial, repetición e idiomas

Contrato implementado en este checkout; entrega y evidencia en
[la ficha](work/history-replay.md). La [versión publicada](production.md) se registra
por separado.

## Resultados y conservación

Cada partida recibe un UUID independiente de su código de sala. El servidor
registra el reparto inicial, acciones aceptadas de humanos/bots, vencimientos,
conexión y cambios de control. Guarda resultados reales de los sorteos y estados,
sin volver a sortear para reproducirlos. El archivo permanece aunque desaparezca
la sala. Las partidas anteriores a esta implementación no se pueden reconstruir;
si una sala ya iniciada se recupera, su grabación se marca parcial.

- `active`: en curso; aparece en el historial propio, sin replay aún.
- `completed`: final natural después de la última ronda y elecciones pendientes.
  Conserva puntos de rutas, destinos positivos/negativos, estaciones, Express,
  desempates y procedencia detallada (`result.details`).
- `abandoned`: cierre definitivo por abandono/caducidad o fin anticipado de
  práctica. Conserva progreso y puntos parciales de rutas; no declara ganador
  ni liquida destinos/bonificaciones como resultado completado.

Una desconexión breve no cierra el historial. Continúan las reglas existentes de
reconexión, reserva, plazos y deduplicación por ID de acción. Los recibos nuevos
comparan también la huella de la acción y su dependencia opcional `after`; un ID reutilizado con contenido diferente
se rechaza sin añadir pasos al replay. IDs antiguos y ventana de 128 se conservan
según el [contrato de recibos](architecture.md#recibos-de-comandos). Salas normales se
recuperan desde el checkpoint. La práctica conserva también su sesión activa y
elecciones pendientes durante 24 h de ausencia, incluso al reiniciar el proceso.
Las salas iniciadas con un humano y bots usan esa misma ventana; con varios
humanos permanece la ventana de 120 s cuando todos se desconectan.

## Cierre integrado y recuento opcional

La tabla final y sus mapas por categoría se presentan dentro del área útil del
tablero, como región accesible sin bloquear el lateral de escritorio/tablet.
Se mantienen clasificación, selección de jugadores/categorías, detalles, revancha
existente y salida. El chat lateral empieza plegado y recupera espacio para el
historial; en móvil conserva el panel desplegable. Su conversación continúa desde
la sala de espera hasta los resultados, según el [contrato del chat](room-chat.md).
Los mensajes no forman parte del archivo ni aparecen al reproducir la partida.

`postgame.js` coordina resultados, mapa, recuento y repetición. Resultados y recuento
mantienen el tablero ensombrecido. La acción única «Mapa» restaura cámara, zoom
y el modo anterior (normal o destinos resaltados). Al terminar el recuento quedan
los resaltados y las fichas visibles, con «Repetir» y «Volver a resultados»; no hay
salto automático ni reproducción obligatoria.

`score-recount.js` consume exclusivamente `result.details` y los totales guardados:

- Rutas construidas: primero tramos conectados, colocando los vagones de un tramo
  por paso. Mantiene los anteriores con base suave, el actual más intenso y sus
  fichas de puntos para seguir la suma. Un ajuste legado se suma explícitamente.
- Camino más largo: recorre el camino continuo registrado en su dirección, vagón
  por vagón. Cuenta longitud en vagones; muestra la bonificación aparte, sin
  confundirla con la longitud. La comparación permite reproducir el jugador elegido,
  también sin bono. El ritmo base es 700 ms por vagón más 350 ms al cambiar de
  tramo. Repetir reinicia el mismo plan y lleva el foco al control de pausa.
- Destinos: coloca a la vez las rutas del recorrido guardado para cada billete y
  suma sus puntos o resta su penalización. Conserva dueños y distingue préstamos.
  Un billete incompleto no inventa un recorrido. Un registro sin detalles conserva
  su total y muestra que no dispone de detalle, sin animación ficticia.

El aterrizaje del último vagón de cada paso actualiza simultáneamente ficha y
total. El nombre y el resaltado permanecen durante la pausa de lectura; recién
después empieza el siguiente tramo. Pausa, salto y reinicio no duplican puntos;
los callbacks de un recuento cancelado no afectan al siguiente. Una nueva velocidad
entra en vigor al comenzar el siguiente paso, tanto para animación como para pausa.
Un golpe suave de 90 ms acompaña ese aterrizaje: uno por vagón del camino largo,
por grupo de una ruta o por conjunto simultáneo de un destino. Los pasos sin
vagones, el salto y los callbacks cancelados no emiten golpes. Se comparte el
silencio general y la protección de pestaña oculta; el audio no modifica el ritmo.

`score-medals.js` dibuja fichas con volumen junto a los vagones, orientadas hacia
la cámara y con separación frente al ancla, otras fichas y nombres de ciudades. El contador acumulado se ubica abajo
a la derecha del mapa en escritorio/tablet y en una franja compacta encima de la
mano en móvil; el encuadre reserva ese espacio. Pausa, velocidad y salto están
accesibles por teclado/tap; cambiar de pestaña pausa y movimiento reducido muestra
el estado final directamente. Nunca se escriben resultados desde estos efectos.

«Repetición» abre el motor existente dentro de la mesa, con un retorno a los
resultados originales aun durante carga, fallo o un paso intermedio. Se reutilizan
las autorizaciones de historial; no se revela información adicional por abrir el
cierre. La vista de replay no envía jugadas y restaura el contexto de la mesa al
salir. La URL autónoma `/replay` continúa funcionando.

Aceptación local y pendientes en [la ficha de experiencia](work/summary-postgame-experience.md).

La tabla final conserva el desplazamiento horizontal directo y por teclado, sin
barra auxiliar sobre el pie móvil. El desglose se ajusta al ancho visible incluso
al desplazar las columnas. Al salir de una partida terminada se vuelve a
salas sin aviso de abandono ni bot de reemplazo. Los resultados guardados permanecen.

## Acceso

Durante la partida se conserva el filtrado por puesto. Desde UI 8, las vistas
públicas nuevas conservan la base comprometida de un túnel y, al construir, su
extra pagado; no incluyen alternativas de pago ni el resto de la mano. Los
archivos anteriores mantienen sus proyecciones originales, sin reconstruir
composiciones de pago ausentes. Al cerrarse:

| Solicitante | Sala privada | Sala pública |
| --- | --- | --- |
| Participante con identidad verificada | Replay completo y auditoría | Replay completo y auditoría |
| Cualquier otra persona con el enlace | Sin acceso | Replay completo de juego, sin auditoría de identidad |

El replay cerrado revela los hechos registrados: manos iniciales y actuales,
robos del mazo, destinos ofrecidos/conservados/descartados, pagos, resultados y
orden de los mazos. `full:true` indica transparencia de juego; `canAudit` autoriza
por separado la descarga de auditoría para participantes. No se publican IDs de
cuenta, cookies ni credenciales. El resultado del espectador en vivo sigue
mostrando puntos sin identidades de destinos privados, incluso al terminar. Los bots fijos y
los reemplazos usan icono de robot; la vista espectadora no incluye el panel vacío
de mano. Un enlace de observación caducado muestra una alerta visible en Partidas.

`guest-identity.js` crea una cookie aleatoria HttpOnly/SameSite=Lax/Secure en HTTPS,
con duración de un año. Solo su SHA-256 se asocia a los puestos. Borrar esa cookie
sin vincular una cuenta puede perder el acceso; un nombre igual no recupera nada.
OAuth y la consulta autenticada de cuenta vinculan el invitado al UUID del perfil
verificado. La unión es idempotente, conserva el historial previo de la cuenta y
rechaza apropiación por otra. Una identidad ya reclamada no da acceso anónimo;
logout rota la cookie. Los enlaces privados de puesto siguen siendo independientes.

En la beta nativa, `connection.js` conserva una credencial aleatoria propia por
instalación/servidor. `native-client.js` la recibe por cabecera o subprotocolo WS
solo desde los orígenes de Capacitor, y `guest-identity.js` aplica el mismo SHA-256
antes de asociarla al historial. No se aceptan cookies de cuenta en esa frontera.
Safari, Chrome y la app conservan invitados distintos. El login nativo permite
vincularlos con la misma cuenta mediante el BFF; la sesión cifrada usa cabecera
explícita y almacenamiento seguro, no cookies web. [Contrato de cuenta](GOOGLE_AUTH.md)
y [distribución y límites](mobile-development.md).

La composición de vistas de lobby, partida y grabación vive en
[authorized-views.js](../game/queries/authorized-views.js), compartida por servidor
y archivo. El transporte verifica sesión y permiso de observar la sala; la
consulta no toma una identidad ni un puesto enviados por el cliente como prueba
de acceso.

[history-queries.js](../game/application/history-queries.js) aplica propiedad,
reclamaciones, visibilidad, cierre y versión antes de solicitar pasos remotos.
[replay-view.js](../game/queries/replay-view.js) construye resúmenes y respuestas
con las perspectivas guardadas. También listado, acciones, eventos y auditoría
se devuelven como copias, sin permitir cambios del archivo desde una consulta.
El puente público `archive.list`/`archive.replay` y las rutas HTTP se conservan.
El encabezado aditivo de definición se comprueba después de autorizar y antes
de cargar pasos remotos. Una versión desconocida o referencia incompleta devuelve
409; no se sustituye por Europa. La ausencia de los tres campos conserva el lector
original de archivo v1.

## Grabación y almacenamiento

[match-archive.js](../backend/match-archive.js) recibe observaciones del motor y conserva
estado completo, vistas autorizadas y miembros públicos. [replay-state.js](../shared/replay-state.js)
guarda diferencias y un estado completo cada 32 pasos (y al recuperar un proceso).
Cada paso incluye fecha, acción, eventos y una cadena SHA-256. La cadena detecta
alteraciones accidentales; no equivale a una firma externa contra un administrador
con acceso para reescribir el archivo entero.

Antes de captar un paso nuevo se normaliza la partida viva mediante
`Engine.normalize`; sus vistas ya son copias independientes. Esto completa los
detalles de resultados legados sin cambiar sus totales. Leer una repetición usa
sus proyecciones guardadas: no ejecuta el normalizador sobre frames anteriores
ni reescribe sus datos o hashes para añadir detalles actuales.

Las partidas vivas nuevas llevan `schemaVersion:1`, `mapRef` y `rulesRef`.
`Engine.restoreState` valida y adapta partidas al cargar salas; nunca se aplica a
frames históricos. Al continuar una grabación antigua, solo el estado completo
o las diferencias del paso nuevo incorporan la cabecera dentro de `game`. El
prefijo anterior y su cadena de hashes permanecen intactos.

Las nuevas vistas añaden `definitionVersion:1`, `mapRef` y `rulesRef`. El snapshot
guarda una sola `definition` pública junto a `game`, `views` y `members`; forma
parte del hash. Su esquema y campos están en [arquitectura](architecture.md).
Los metadatos guardan esa misma versión y referencias, sin copiar todo el catálogo
en cada fila del listado. `map` es una etiqueta (`Europa`, `Laboratorio`, `Sudamérica · beta` o el ID de un mapa sin etiqueta) y
`rulesVersion` conserva el formato informativo anterior; las referencias exactas
son la identidad normativa. El archivo y el formato de diferencias siguen en v1.

El lector usa la definición grabada aunque ese mapa ya no esté en el catálogo
del servidor. Comprueba versión de definición y coherencia entre referencias de
metadatos, definición y vistas; no ejecuta reglas actuales ni reconstruye datos
desde el estado privado. Público y participantes reciben la misma definición,
y el replay cerrado hace transparentes los hechos guardados en todas las vistas. La auditoría devuelve
los frames originales completos, con hashes intactos. El verificador de auditoría
comprueba la cadena, no certifica legalidad histórica ni balance.

Una grabación reanudada puede empezar con pasos antiguos sin definición. Los
pasos nuevos introducen el contrato mediante snapshot o diff; desde entonces no
puede desaparecer. Metadatos con referencias nuevas exigen que haya una definición
grabada. Un archivo completamente antiguo se devuelve con su formato anterior,
sin añadir campos ni cambiar sus respuestas para adaptarlo al motor actual.
No hay cambio SQL: metadatos y frames siguen siendo JSON en las mismas columnas.

Archivo local: el manifiesto `version: 2` conserva salas, metadatos y reclamaciones;
los pasos viven en `STATE_FILE.archive/<hash-del-id>.jsonl`, un archivo por partida.
Solo se serializan/anexan pasos nuevos. Se sincronizan antes de reemplazar
atómicamente el manifiesto, que fija bytes y cantidad de pasos confirmados. Al
recuperar se ignoran colas sin confirmar; el siguiente anexo las trunca. La copia
`.bak` referencia su propio prefijo, recuperando sala y grabación coherentes.
Un archivo de pasos faltante o incompleto intenta recuperar la copia y, si tampoco
es válida, falla sin sustituir el historial por uno vacío.

Se leen tanto el array antiguo como `{rooms, archive}`; el primer guardado los
migra conservando los pasos y una copia del formato previo. Los cambios posteriores
de color escriben solo el manifiesto y su respaldo, sin leer ni serializar el
historial acumulado. Los pasos siguen cargándose al arrancar para servir replay;
esta mejora reduce el coste de guardar, no la memoria total del historial.
Para respaldar/restaurar hay que conservar juntos manifiesto, `.bak` y directorio
`.archive`; [operación local](operations.md) explica el procedimiento.

Una versión local de envoltorio desconocida se rechaza y no intenta sustituirse
por un respaldo antiguo. La validación del estado de partida sucede antes del
primer commit, también en Supabase. Si falla, no se cierra ni reescribe el historial
como consecuencia de una restauración parcial.

Supabase: [003_match_archive.sql](../supabase/003_match_archive.sql)
crea metadatos, pasos y reclamaciones de invitados. La lectura usa
[004_archive_paging.sql](../supabase/004_archive_paging.sql): primero
metadatos/permisos y después páginas secuenciales de hasta 16 pasos.
Se verifica la secuencia completa y se limita al cierre leído; una respuesta parcial
no se presenta como replay válido. El plazo de lectura es 15 s por página, sin cambiar
el plazo ni la autoridad de las escrituras. La RPC de SQL 009 guarda la sala y
sus pasos en la misma transacción, valida secuencia, rechaza conflictos y conserva
idempotencia y exclusión de escritor. El protocolo anterior v2 mantiene esas
garantías con checkpoint global para compatibilidad. Activación y regreso en
[SQL 009](RENDER_SUPABASE.md#transacciones-por-sala-sql-009). RLS y permisos impiden acceso directo de
`anon`/`authenticated`; solo Node utiliza las RPC con credenciales del servidor.
Un fallo de guardado pausa también la práctica y sus bots: no se confirma una
jugada cuyo historial no pudo conservarse. El cierre sella el archivo: desconexiones
posteriores o la caducidad de la sala no agregan eventos de abandono a una partida
ya completada. No hay borrado automático del historial. Vigilar el crecimiento de la base; el
archivo no sustituye backups ni recuperación punto en el tiempo.

Al arrancar, los archivos activos sin una sala recuperable se cierran como
abandonados. Un archivo conserva `schemaVersion:1` y los estados ya proyectados:
el replay no ejecuta reglas nuevas sobre partidas antiguas. Europa, Laboratorio y Sudamérica beta
son seleccionables y renderizables. Cualquier mapa/modo
futuro debe pasar por esta misma autoridad, privacidad y grabación.

API HTTP sin caché:

- `GET /api/history`: partidas del invitado/cuenta verificados.
- `GET /api/history/:uuid`: repetición cerrada filtrada; activa 409, privada ajena 404.
- `GET /api/history/:uuid/audit`: JSON completo solo para participantes.

Ninguna respuesta contiene tokens de puesto, cookies o identificadores de propiedad
privados. La auditoría sí contiene las cartas/destinos y el orden de mazos registrado;
compartirla revela esa información de la partida cerrada.

## Interfaz e idiomas

Las partidas nuevas incorporan `game.journal`, un registro de hechos anexados
con ID, fecha, turno, puesto y actor histórico (humano, bot, reemplazo o reloj).
`turnHistory` agrupa esos hechos para la vista autorizada: una fila lógica por
turno y filas independientes para conexión, control, pausa, inicio y cierre.
Dos robos, renovación de mesa y resolución de túnel comparten su fila; la oferta
de destinos conserva el turno de origen aunque se confirme durante otro turno.
Las cantidades recibidas, conservadas y descartadas son públicas. Las identidades
de destinos, cartas iniciales y colores robados del mazo quedan solo en la vista
del dueño durante la partida. Las ofertas y descartes nuevos guardan sus
identidades para el replay cerrado; las grabaciones anteriores solo revelan lo
que realmente contienen. Los hitos privados usan IDs independientes para no dejar huecos que
revelen actividad privada en la secuencia pública.

El registro incluye cartas reveladas, base, extra exigido/pagado y desenlace del
túnel, incluso extra cero, desistimiento y tiempo agotado; pagos de rutas y
estaciones, reciclados, pases, acciones automáticas, conexiones, cambios de
control, pausa por ausencia total, reanudación, última ronda y cierre. Los
cambios de destinos cumplidos son privados; el liderazgo del camino largo es
público. Reconexión y toma de control son hechos independientes. El actor queda
fijado al actuar, no se deduce del ocupante actual del puesto.

El historial visible nuevo conserva la partida completa, sin el límite de 25
mensajes del registro legado `logs/history`. Estos campos antiguos siguen
existiendo para compatibilidad. Al continuar una partida anterior, se conservan
sus mensajes disponibles y se muestra registro parcial; no se inventan turnos
ni cartas anteriores. El replay utiliza las perspectivas grabadas y completa
su información visible con los hechos del estado y diario originales, sin
recalcular jugadas ni alterar hashes:
el paso actual muestra solo lo ya ocurrido, y las filas futuras se distinguen.
La repetición no reproduce avisos de cuenta atrás de plazos archivados. Las animaciones de robos del replay no usan la
deduplicación de la sesión viva. La mano procede del paso grabado: al terminar,
omitir o cancelar un vuelo, se retira su ocultación temporal. Pausar o saltar
limpia las presentaciones pendientes y muestra las cantidades de ese paso.

`replay-state.diff` anexa índices de `journal`, `turnHistory` y sus listas de
hechos cuando crecen. Usa las mismas operaciones v1 y conserva compatibilidad
con snapshots/diferencias anteriores; evita copiar el prefijo entero en cada
paso. No modifica archivos ni hashes guardados. El registro del estado, vistas,
mazos y elecciones reales continúa siendo la autoridad de la reproducción.

La renovación conserva `before/after` en el diario y también en
`history.marketRefresh` para clientes anteriores. Se registra después del robo
causante, dentro de su turno, sin duplicar un aviso de sistema. Las nuevas
reposiciones `market_refill` registran la carta que ocupó el hueco. La secuencia
de cada robo conserva reciclado, carta tomada, reposición y renovación en su
orden causal, con `drawNumber` y `endsTurn`. La UI usa subsecciones: una renovación
intermedia queda entre robos y una posterior al último se identifica como
«Después del robo». Los registros anteriores no inventan reposiciones ausentes. Los avatares del
historial conservan las proporciones del panel y el actor histórico.

La presentación omite el número de turno y la etiqueta redundante «Bot»;
conserva «Bot de reemplazo» y «Automático por tiempo». Los iconos de persona y
robot quedan centrados en su círculo. Los robos muestran «Robó» y miniaturas de
18 × 25 px; los robos consecutivos se agrupan si no hay hechos visibles intermedios.
El historial y el replay ocultan las reposiciones `market_refill` y los reciclados
`recycled`, incluidos sus bloques y las filas que solo contengan esos eventos.
El diario y las grabaciones los conservan íntegros; la renovación de mesa por
tres comodines sigue visible en su posición cronológica. Los enlaces del replay
se calculan con los eventos visibles de cada fila, manteniendo sus IDs originales.
En vivo el mazo usa reverso incluso para quien robó; el servidor conserva su
color en la vista propia y lo filtra para rivales/espectadores. En replay todos
los POV muestran los colores reales guardados, incluidas las manos iniciales
rivales y las elecciones de billetes.

Cada cambio de líderes del camino más largo se presenta como aviso del sistema
con trofeo, separado inmediatamente después de la jugada que lo provocó. El
texto distingue liderazgo y empate, con el bono provisional por jugador.
`TurnHistory.displayRows` aplica esta separación al historial y al replay sin
modificar el diario, los IDs de eventos ni las perspectivas ya grabadas; cada
aviso sigue enlazando al paso donde ocurrió.

Las variaciones decorativas de Pasajeros se reconstruyen con el código de sala,
puesto, ruta y celda. Cada ruta recorre tandas barajadas de seis sin repeticiones
internas ni entre el final e inicio de tandas; no se guardan variantes ni
personajes en los pasos. El
catálogo visual puede evolucionar sin migrar la grabación. El blanco retirado
se sustituye por un color activo libre en copias para presentación; los frames
y hashes archivados no se reescriben.

Perfil → Historial filtra todas/en curso/completadas/abandonadas y presenta filas
compactas con fecha, puesto, jugadores, duración, estado y replay; dos líneas
por partida en móvil. La fila abre un único desglose de puntos y el icono de
repetición navega directamente. La duración es tiempo de calendario entre inicio
y cierre; lleva `~` si la grabación es parcial y `—` mientras siga en curso.
El servidor añade `ownSeat` y `rank` al listado privado a partir de la identidad
verificada y sus reclamaciones de invitado, nunca del nombre. El puesto solo
existe al completar: compara puntos, destinos completados, puntos de estaciones
y Express, compartiendo puesto en empate exacto. No expone IDs de propiedad.
Resumen usa resultados y responsabilidad individual conforme al [contrato de estadísticas](profile-social-statistics.md). `/replay?id=UUID`
reutiliza el tablero, mercado, jugadores, mano y resultados, sin conexión de juego
ni envío de acciones. Pulsar un avatar del panel normal selecciona su perspectiva;
los iconos de persona/robot, nombres y colores son los mismos de la partida.
Tiene inicio/final, pasos, historial pulsable, barra de posición, pausa y velocidades
0,5×, 1×, 2×, 4× y 8×. Todo visitante autorizado puede elegir cualquier
perspectiva y consultar su mano y destinos mediante los avatares. La interfaz no
muestra selector de acción, hitos, estadísticas adicionales ni enlaces de auditoría.
Se elimina el botón de vista general; las grabaciones sin detalle privado conservan
únicamente su información disponible.

La barra de posición usa el último índice de los estados cargados; al terminar
su valor coincide con el máximo y su pista no hereda padding de los formularios.
El historial utiliza separadores rectos y un resaltado del ancho útil completo,
con avatar y línea de agrupación dentro del margen interior de cada fila.

La repetición reutiliza mercado, mano, jugadores e historial de la mesa, pero
reubica sus controles: en escritorio/tablet, bloque plegable arriba del mapa,
fuera del lateral; en móvil, mercado y jugadores arriba, mano abajo y transporte
justo encima de ella. El encuadre reserva el espacio ocupado. La barra de progreso,
anterior/reproducir/siguiente y las perspectivas por avatar permanecen accesibles;
en móvil, velocidad e inicio/final se amplían desde «Más controles». Se retira
«Vista general». El retorno a resultados se integra en el bloque del replay.
Al abrirlo desde el cierre se muestra el mapa completo; salir recupera su cámara. Las animaciones comparten `playEffects`, `animateCardFlight`,
`prepareMarketRefresh` y `animateConstruction` con la mesa. Sus tiempos siguen la
velocidad seleccionada y respetan movimiento reducido; pausar, cambiar de jugador
o saltar cancela los efectos pendientes.

Las manos iniciales separan miniaturas y destinos. Cada destino ofrecido aparece
una sola vez, con sus puntos y ✓/✕ cuando la decisión está registrada. No repiten
listas ni etiquetas de conservado/descartado; los símbolos tienen descripción
accesible. Las grabaciones antiguas sin identidades conservan sus cantidades,
sin inventar nombres ni estados. La proyección en vivo mantiene su privacidad.

El cliente recibe la definición reconstruida de cada paso junto a su vista.
Usa los nombres de ciudades guardados y conserva
IDs numéricos o de texto al seleccionar destinos y vías. Solo el protocolo
antiguo completo usa el contexto europeo legado; un paso actual sin definición
o sin layout compatible detiene la reproducción y muestra el error. Los controles
se cierran de forma segura si la pestaña cambia de visibilidad tras ese error.
El layout no está en los frames: se resuelve por referencia exacta en el bundle,
que incluye Europa, Laboratorio y Sudamérica beta. Contrato del cliente en
[arquitectura](architecture.md#contexto-y-layout-del-cliente).

`i18n.js` y `translations.js` localizan HTML, accesibilidad, mensajes y registros.
Español es el valor inicial; Más → Idioma permite ESP o ENG y guarda `rr-language`.
Durante la partida se accede desde el engranaje, también en móvil. El cambio
recarga la misma URL y conserva credencial y borradores locales; no reinicia
los plazos del servidor.
El cambio recarga la ruta actual, conservando los mecanismos de reconexión.
Las plantillas se traducen antes de interpolar nombres, códigos y otros valores:
los datos del jugador no se traducen ni cambian de identidad. Las ciudades conservan
sus nombres propios. No se han inventado contenidos para Jugar o las
secciones futuras.

## Verificación y auditoría local

```sh
node --test tests/authorized-views.test.js tests/history-queries.test.js tests/match-archive.test.js tests/archive-sql.test.js tests/history-server.test.js tests/account-auth.test.js tests/i18n.test.js
node scripts/verify-match-audit.js /ruta/a/trencitos-partida.json
node tests/helpers/history-preview.js
```

El helper crea dos partidas completas y una abandonada en datos temporales, arranca
localhost:3143 y ofrece `/__qa/setup` para una identidad de invitado de prueba.
Nunca cargar ese helper en producción. La ruta de fixture solo existe en el helper,
no en `server.js`. Las pruebas SQL usan PGlite y las de OAuth un proveedor simulado.


## Análisis opcional y controles de reproducción

`GET /api/history/:id?analysis=1` añade una lista `analysis`, alineada con los
frames. La auditoría conserva los frames originales; la respuesta de juego
añade `canAudit` y `knowledge` con los mazos guardados. Esta API de compatibilidad
sigue disponible, pero la interfaz de replay no solicita ni dibuja el análisis.
Cada paso contiene recursos públicos, rutas construidas, longitud del camino más
largo y líderes empatados. Todo visitante autorizado recibe cantidades/puntos de destinos
completados y pendientes y una proyección «Puntuación si terminara ahora».
Los destinos se leen de `ticketProgress` grabado, que ya incluye la asignación de
estaciones histórica; la longitud usa `longestTrail` sobre las rutas de ese paso.
Las longitudes se cachean por red propia. La proyección requiere parámetros de
puntuación grabados; en un registro antiguo incompleto se muestra dato no disponible.
No se confunden bonificaciones provisionales con puntos concedidos en vivo.

La interfaz muestra un modal de carga con tren y reintento, conserva la perspectiva
seleccionada al avanzar y distingue el actor del paso. El historial acumula todos
los eventos grabados: pasado, paso actual y futuro navegable. Los controles viven
en una franja flotante bajo los jugadores; el historial se abre por su icono
en todos los tamaños, sin cambiar el encuadre del tablero. Las filas del
historial permiten saltar a una acción y conservan sus nodos mientras no cambie
su contenido; avanzar no vuelve a crear toda la lista. La reproducción conserva
la cámara y la perspectiva elegida.

## Entrega con memoria acotada

HTTP autoriza el registro antes de leer frames. El cliente solicita
`Accept: application/x-ndjson` sobre la misma URL: recibe una línea `match`, líneas
`frame` y un cierre `end` con cantidad validada. Tras el primer frame puede mostrar
el tablero mientras descarga el resto. Solo permite buscar pasos recibidos y
habilita ir al final al confirmar `end`; una interrupción ofrece reintento y nunca
se presenta como grabación completa.

Esta proyección comparte diario/eventos/resultados entre perspectivas en `shared`
y omite mazos internos y estadísticas. `ReplayState.view` recompone la vista para
el renderer existente. Los cursores reutilizan un estado de trabajo privado,
copian solo valores cambiados y parten del snapshot apropiado al retroceder;
no mutan los frames recibidos ni almacenados. El índice de eventos inspecciona
las filas modificadas, no todos los historiales de todos los jugadores por paso.

Supabase sigue consultándose en páginas secuenciales de 16 frames y HTTP conserva
backpressure. El backend de archivos cede entre frames para enviar el primer paso
y atender otras solicitudes. Sin ese encabezado se conserva el contrato JSON
anterior y la auditoría completa. Cancelar cierra el iterador; los hashes,
snapshots, permisos y archivos persistidos no cambian. No hay migración ni
ejecución de jugadas para reconstruir estados históricos.

### Consulta visual de una ocupación

La fila usa «Ocupó» y un botón «Ver». La consulta temporal enfoca el tramo,
atenúa el entorno y eleva/asienta los vagones en secuencia. No emite comandos,
sonidos de jugada nueva ni puntos. Recupera el encuadre al terminar o salir;
una construcción real tiene prioridad. Movimiento reducido conserva solo el foco.
El historial conserva su posición de lectura al reabrirse.

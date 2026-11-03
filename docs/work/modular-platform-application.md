---
{"id":"modular-platform-application","status":"active","parent":"modular-game-platform","depends_on":["modular-platform-domain"],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Fase 3: aplicación e interfaz

## Objetivo y alcance

Separar casos de uso, coordinación de guardado y proyecciones autorizadas del
transporte; organizar después frontend/backend dentro del mismo repositorio.
Conservar partidas completas, bots, reconexión, privacidad y replay. Los contratos
objetivo están en [la decisión](../decisions/match-domain-contracts.md); las
responsabilidades implementadas, en [arquitectura](../architecture.md).

Worktree: `/Users/angelaltarodri/Desktop/free/trains/worktrees/modular-game-platform`.
Base del primer corte: `24ad09d` más los cambios de esta entrega. La fase 2 está
[aceptada](modular-platform-domain.md). No se integran automáticamente cambios de
otros worktrees ni se publica en Render.

## Hitos de la fase

- [x] Extraer el caso de jugada humana, conservar protocolo y comprobar reintentos/rollback.
- [x] Separar entradas automáticas y coordinar vencimientos, bots y práctica desde aplicación.
- [x] Separar preparación/confirmación/publicación y definir puertos de repositorio/commit conjuntos con historial.
- [x] Centralizar vistas autorizadas de jugador/espectador, conservando privacidad de replay.
- [x] Introducir recibos con huella de comando y compatibilidad de los 128 IDs legados.
- [x] Integrar un checkpoint revisado de vagones antes de mover archivos visuales.
- [x] Separar responsabilidades de frontend/backend en código y verificar empaquetado.
- [ ] Aceptación conjunta de Europa tras todos los cortes de esta fase.

## Primer corte: jugada humana

- [player-action.js](../../game/application/player-action.js) coordina la solicitud
  sobre sala/puesto ya autenticados. Recibe motor, reloj, azar y el puente de
  guardado/publicación; devuelve aceptación, duplicado o rechazo estructurado.
- [legacy-action-reply.js](../../game/compat/legacy-action-reply.js) convierte ese
  resultado al ACK/error existente, con los mismos mensajes y códigos públicos.
  Las excepciones del motor conservan su mensaje legado durante la transición.
- [server.js](../../backend/server.js) resuelve sesión/sala, entrega únicamente ID,
  revisión y acción del mensaje, y envía la respuesta mediante `peer.send`.
  El cliente no selecciona el puesto efectivo, reloj ni generador de azar.

Se conserva el orden observado: partida iniciada → ID válido → duplicado →
vencimiento multijugador → guardado disponible → control humano → revisión →
acción → revisión/recibo → preparar guardado/publicación → respuesta.
Las elecciones privadas no se rechazan por una revisión global vieja: el motor
valida sus pendientes/oferta. Los duplicados mantienen la semántica anterior
por ID y puesto, incluso con payload distinto; la huella nueva sigue pendiente.

`stageRoom` es síncrono y enlaza temporalmente con `sendRoom`. En archivo, `false`
señala fallo con rollback. En remoto, `true` solo prepara la transacción: la cola
global confirma estado, recibos e historial antes de liberar las vistas y el ACK.
Una aceptación del caso de uso no es por sí sola una confirmación durable.
El caso no envía sockets, escribe disco ni importa infraestructura; modifica el
formato legado de sala y todavía utiliza la fachada `Engine` como dependencia.
Las excepciones inesperadas del puente se propagan al despachador, en vez de
presentarlas como un rechazo de reglas del motor.

También se conserva la diferencia previa de práctica: no hay vencimiento
preliminar antes de validar revisión, pero `Engine.action` puede avanzar el reloj
antes de rechazar. Un rechazo puede publicar ese avance sin incrementar revisión
en esa rama legada. Este corte no uniforma esas entradas ni cambia el protocolo.

## Evidencia del primer corte

- [Caso de uso](../../tests/player-action.test.js): motor real sin servidor,
  recibos por puesto/límite 128, duplicados sin nuevo sorteo/vencimiento,
  elecciones simultáneas, revisión obsoleta, control por bot, rechazo tardío,
  orden de práctica y rollback local. Incluye ejecución en VM sin dependencias
  ambientales y respuestas sin estado privado.
- [Servidor remoto](../../tests/supabase-server.test.js): una respuesta de commit
  perdida reintenta el mismo commit sin ejecutar ni grabar la jugada otra vez;
  un fallo restaura juntos partida, revisión, recibo y hash/secuencia de archivo,
  y no publica ACK ni un estado con revisión adelantada.
- Suite enfocada: **33/33**, sin fallos ni omisiones; incluye multijugador local,
  cola durable e historial/reinicio. [Resultado](../qa/modular-application-actions/focused-tests-result.json)
  y [TAP](../qa/modular-application-actions/focused-tests.tap).

Ejecución del 2026-11-02 (Lima), sobre la base indicada y el diff de este corte:

- Suite completa, Node `v25.6.1`: **485/485**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  [Resultado y huellas](../qa/modular-application-actions/node-tests-result.json),
  [TAP](../qa/modular-application-actions/node-tests.tap).
- Imagen Docker `linux/arm64`, Node `v22.23.4`: arranque normal, `healthz`, UID
  1000 y escritura de estado correctos; tres pruebas HTTP/WebSocket aprobadas
  sobre código empaquetado. Incluye el módulo nuevo sin modificar el Dockerfile;
  la URL del módulo de aplicación devuelve 404. La práctica ejecuta elecciones,
  jugadas humanas y bots con la nueva entrada. [Construcción](../qa/modular-application-actions/docker-build.txt),
  [resultado](../qa/modular-application-actions/docker-result.json),
  [TAP](../qa/modular-application-actions/docker-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  Ocho recorridos de interacción, nueve combinaciones de viewport/zoom y partida
  completa de cuatro jugadores con **266 acciones**, reconexión y cero errores.
  Incluye 68 intentos de construcción, pagos/desistimientos de túnel, estaciones
  y cinco ofertas/confirmaciones de destinos. [Resultado](../qa/modular-application-actions/browser-tests-result.json),
  [reporte](../qa/modular-application-actions/browser/threejs-report.json).
  Se inspeccionaron [resultado final](../qa/modular-application-actions/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-application-actions/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Revisados arquitectura, contratos, dominio, operación y fichas afectadas.
  Los contratos de reglas y las evidencias históricas permanecen vigentes para
  sus bases; el resultado nuevo se conserva aquí. `docs/qa/threejs-*` restaurado.

Primer corte aceptado localmente; fase 3 continúa activa. No cambian datos de
Europa, reglas, estrategia de bots, guardados ni archivos visuales. Las pruebas
remotas/SQL usan simuladores; Docker es local sin red externa, y el navegador
usa emulación móvil. No se acredita Render, Supabase real ni dispositivos físicos.
Entrega en esta rama, sin integrar otros worktrees, push ni despliegue.

## Segundo corte: entradas automáticas

Base `2af73a5` más los cambios de esta entrega. Se extrae la coordinación de
relojes, bots permanentes, reemplazos, bots de práctica y cierre anticipado a
[automatic-play.js](../../game/application/automatic-play.js). El
[adaptador legado](../../game/compat/legacy-automatic-play.js) proporciona motor,
políticas existentes, reloj, azar, traducciones y reporte de errores. El servidor
ensambla una instancia y la entrega a los cuatro controladores; estos conservan
temporizadores, conexión/ausencia y entrada a la cola serializada.

Se preservan los lotes de elecciones privadas, vencimiento antes de decidir,
demoras, revisión y marca automática propias de cada entrada. Un reemplazo sin
jugada sigue esperando al reloj; práctica y permanentes conservan su posibilidad
de ceder turno. Práctica mantiene separado el reloj de ausencia del de jugada,
y su azar de política/demora del azar del motor. El cierre devuelve las cartas
reveladas de un túnel sin pagar y puntúa una vez. La tabla del contrato efectivo
queda en [arquitectura](../architecture.md).

Las dependencias son explícitas en aplicación, pero la fachada `Engine` conserva
dependencias internas legadas. Todavía se modifica el formato existente de sala;
`stageRoom` sigue reuniendo historial, guardado, vistas y reprogramación.
El reemplazo conserva el manejo previo de excepciones de acción/preparación.
Esta extracción no introduce repositorios ni uniforma las revisiones de práctica.

## Evidencia del segundo corte

- [Aplicación automática](../../tests/automatic-play.test.js): 13 pruebas con
  motor real, reloj y azar controlados. Comprueban lotes y orden de registro,
  vencimiento antes de consultar políticas, rollback del puente, robos separados,
  cierre de ofertas, espera durante revelación, cesión/reemplazo, cierre sin doble
  puntuación, conservación de cartas y ejecución en VM sin globals ambientales.
- [Servidor remoto](../../tests/supabase-server.test.js): un lote de dos bots no
  publica estado antes del commit; una respuesta perdida reintenta el mismo
  cuerpo sin duplicar elecciones ni frames. Un fallo restaura partida, revisión,
  hash/secuencia y archivo, con almacenamiento pausado y sin estado adelantado.
  Las diez pruebas de este archivo aprobaron con el simulador local.
- Temporizadores y ciclo de vida: 52 pruebas de reloj, bots permanentes,
  multijugador, práctica y túneles compartidos aprobaron. Se conservan pausas por
  desconexión/guardado, reconexión, plazos y aislamiento de salas eliminadas.

Ejecución del 2026-11-02 (Lima), sobre la base indicada y el diff de este corte:

- Suite completa, Node `v25.6.1`: **500/500**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  Incluye las pruebas enfocadas anteriores. [Resultado y huellas](../qa/modular-application-automatic/node-tests-result.json),
  [TAP](../qa/modular-application-automatic/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  Ocho recorridos de interacción, nueve combinaciones de viewport/zoom y partida
  completa de cuatro jugadores con **254 acciones**, reconexión y cero errores.
  Incluye 63 intentos de construcción, pagos/desistimientos de túnel, cuatro
  estaciones y cinco ofertas/confirmaciones de destinos.
  [Resultado](../qa/modular-application-automatic/browser-tests-result.json),
  [reporte](../qa/modular-application-automatic/browser/threejs-report.json).
  Se inspeccionaron [resultado final](../qa/modular-application-automatic/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-application-automatic/browser/threejs-mobile.png).
- Docker `linux/arm64`, Node `v22.23.4`: arranque, `healthz`, UID 1000 y estado
  escribible correctos; **3/3** pruebas HTTP/WebSocket sobre código empaquetado.
  La práctica con bots funciona y los dos módulos nuevos devuelven 404 por HTTP.
  [Construcción](../qa/modular-application-automatic/docker-build.txt),
  [resultado](../qa/modular-application-automatic/docker-result.json),
  [TAP](../qa/modular-application-automatic/docker-tests.tap).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Revisados arquitectura, dominio, contratos, operación y fichas afectadas;
  estrategia, navegación y evidencias de fases anteriores conservan su alcance.
  Los archivos históricos `docs/qa/threejs-*` se restauraron sin cambios.

Segundo corte aceptado localmente; fase 3 continúa activa. No se modifican
reglas, estrategia, datos de Europa ni archivos visuales. Supabase/SQL se
comprueban con simuladores; Docker usa red externa deshabilitada y el navegador
emulación móvil. No se acredita producción ni dispositivos físicos. Entrega
aislada en esta rama, sin integrar otros worktrees, push ni despliegue.

## Tercer corte: preparación, confirmación y publicación

Base `adf6973` más los cambios de esta entrega. [room-stage.js](../../game/application/room-stage.js)
coordina preparación, solicitud de checkpoint y vistas encoladas por puertos
separados. [checkpoint.js](../../game/application/checkpoint.js) conserva el modo
síncrono de archivo y la confirmación diferida dentro de la cola remota.
Los [adaptadores](../../game/infrastructure/checkpoint-committer.js) preparan
DTOs de sala independientes del runtime y confirman salas e historial juntos.
El `Map` existente satisface el puerto mínimo `get(code)` / `values()`; no se
añade una clase envolvente ni se promete aún búsqueda de partida por `matchId`.

Se conservan el manifiesto y prefijo JSONL local, la RPC remota y sus reintentos,
la exclusión de escritores, el checkpoint global y los puntos de rollback.
Los pasos ya confirmados del replay local se comparten sin volver a copiarlos
ni serializarlos. Las salas de práctica no se persisten, pero su historial sí.
El servidor conserva los snapshots de recuperación y las proyecciones; la cola
libera mensajes solo después de confirmar. El detalle de los puertos y sus
diferencias está en [arquitectura](../architecture.md).

## Evidencia del tercer corte

- [Pruebas de checkpoint](../../tests/checkpoint-application.test.js): preparación
  sin escrituras, DTOs y recibos separados del runtime, historial de práctica,
  coste acotado de cambios de lobby, rollback local antes de vistas de
  recuperación, error de entrega posterior al commit, reintento remoto con el
  mismo cuerpo, varias preparaciones agrupadas, orden de trabajos en la cola
  y errores asíncronos compatibles en la entrada antigua de guardado.
- Pruebas existentes de archivo, Supabase simulado y cola: **20/20** aprobadas.
  Integración de multijugador, directorio, carga antigua, historial y servidor
  remoto: **28/28** aprobadas. Incluyen recuperación tras fallos, privacidad,
  partidas/replay tras reinicio y lotes de bots sin publicación anticipada.

Ejecución final del 2026-11-02 (Lima), sobre la base indicada y el diff de este corte:

- Suite completa, Node `v25.6.1`: **508/508**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  Incluye las ocho pruebas nuevas de checkpoint y compatibilidad.
  [Resultado y huellas](../qa/modular-application-checkpoints/node-tests-result.json),
  [TAP](../qa/modular-application-checkpoints/node-tests.tap).
- Docker `linux/arm64`, Node `v22.23.4`: arranque, `healthz`, UID 1000 y estado
  escribible correctos; **3/3** pruebas HTTP/WebSocket sobre código empaquetado.
  La práctica con bots funciona y los nuevos módulos de aplicación e
  infraestructura no son accesibles por HTTP.
  [Construcción](../qa/modular-application-checkpoints/docker-build.txt),
  [resultado](../qa/modular-application-checkpoints/docker-result.json),
  [TAP](../qa/modular-application-checkpoints/docker-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  Ocho recorridos de interacción, nueve combinaciones de viewport/zoom y partida
  completa de cuatro jugadores con **304 acciones**, reconexión y cero errores.
  Incluye 74 intentos de construcción, pagos/desistimientos de túnel, cuatro
  estaciones y diez ofertas/confirmaciones de destinos.
  [Resultado](../qa/modular-application-checkpoints/browser-tests-result.json),
  [reporte](../qa/modular-application-checkpoints/browser/threejs-report.json).
  Se inspeccionaron [resultado final](../qa/modular-application-checkpoints/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-application-checkpoints/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Revisados arquitectura, contratos, dominio, historial, operación y fichas
  afectadas. Las reglas y los informes anteriores conservan su alcance histórico;
  `docs/qa/threejs-*` quedó restaurado sin cambios. Las huellas de los resultados
  corresponden a las fuentes finales, incluido el ajuste de compatibilidad.

Tercer corte aceptado localmente; fase 3 continúa activa. No cambian reglas,
estrategia, datos de Europa ni presentación. Los contratos remotos/SQL se prueban
con simuladores, Docker usa red externa deshabilitada y el navegador emulación
móvil; no se acredita producción ni dispositivos físicos. Entrega aislada en
esta rama, sin integrar otros worktrees, push ni despliegue.

## Cuarto corte: consultas y vistas autorizadas

Base `2962ff7` más los cambios de esta entrega. El servidor y el archivo comparten
[authorized-views.js](../../game/queries/authorized-views.js) para lobby, estado y
grabación, ensamblado por el [adaptador legado](../../game/compat/legacy-authorized-views.js).
La vista pública incluye el filtro adicional de resultados; la grabación elimina
el reloj volátil. El transporte conserva sesión/puesto, permiso de observar,
credencial del destinatario y envío/outbox. Las consultas no normalizan ni guardan
la partida; la captura sigue normalizando explícitamente antes de proyectar.

[history-queries.js](../../game/application/history-queries.js) reúne las decisiones
de acceso al historial/replay mediante un puerto de metadatos/reclamaciones y
otro de carga de pasos. [replay-view.js](../../game/queries/replay-view.js) usa las
proyecciones guardadas y devuelve copias de resúmenes, acciones, eventos y auditoría.
Consultar ya no añade frames a los metadatos recibidos ni permite modificar el
archivo a través de sus respuestas. No se recalculan reglas ni hashes antiguos.
Se preservan rutas HTTP, sobres WebSocket y entradas `archive.list`/`archive.replay`.
Los contratos y responsabilidades viven en [arquitectura](../architecture.md) y
[historial/replay](../history-replay.md).

## Evidencia del cuarto corte

- [Vistas autorizadas](../../tests/authorized-views.test.js): seis pruebas sobre
  credencial del destinatario, manos/ofertas/robos privados, túneles públicos,
  resultados filtrados, salidas independientes del estado, grabación sin reloj
  volátil, sobre de recuperación y ejecución con dependencias inyectadas.
- [Consultas de historial](../../tests/history-queries.test.js): cuatro pruebas
  de autorización antes de cargar pasos remotos, invitado/cuenta y reclamaciones,
  cierre/versión/auditoría, perspectivas de participantes, filtro público y copias
  de respuestas sin alterar metadatos, estados ni integridad de hashes.
- [Integración HTTP/WebSocket](../../tests/history-server.test.js): una sala pública
  recorre elección, robo ciego, observación y cierre; el replay público coincide
  con la vista final en vivo, los participantes reciben todas las perspectivas y
  solo ellos pueden descargar auditoría. La prueba privada conserva reinicio y
  deduplicación. Integración enfocada con directorio, carga antigua, multijugador
  y Supabase simulado: **29/29**, sin fallos ni omisiones.
- Suite completa, Node `v25.6.1`: **519/519**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  Incluye las once pruebas nuevas de este corte.
  [Resultado y huellas](../qa/modular-application-views/node-tests-result.json),
  [TAP](../qa/modular-application-views/node-tests.tap).

- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  Ocho recorridos de interacción, nueve combinaciones de viewport/zoom y partida
  completa de cuatro jugadores con **264 acciones**, reconexión y cero errores.
  Incluye 68 intentos de construcción, pagos/desistimientos de túnel, cuatro
  estaciones y cinco ofertas/confirmaciones de destinos.
  [Resultado](../qa/modular-application-views/browser-tests-result.json),
  [reporte](../qa/modular-application-views/browser/threejs-report.json).
  Se inspeccionaron [resultado final](../qa/modular-application-views/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-application-views/browser/threejs-mobile.png).
- Docker `linux/arm64`, Node `v22.23.4`: arranque, `healthz`, UID 1000 y estado
  escribible correctos; **3/3** pruebas HTTP/WebSocket sobre código empaquetado
  en la repetición aislada. Los cuatro módulos nuevos se incluyen en la imagen y
  sus URLs devuelven 404. [Construcción](../qa/modular-application-views/docker-build.txt),
  [resultado](../qa/modular-application-views/docker-result.json),
  [TAP](../qa/modular-application-views/docker-tests.tap).
  La primera ejecución coincidió con suite/navegador y tuvo **2/3**: la prueba
  existente de práctica agotó una espera de 10 s. Se conserva el
  [fallo inicial](../qa/modular-application-views/docker-first-tests.tap) y su
  [resultado](../qa/modular-application-views/docker-first-result.json).
  No se modificó la prueba ni su timeout; la repetición pasó sobre la misma
  imagen. La causa del timeout no queda demostrada por esta repetición.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Revisados arquitectura, contratos, dominio, historial, operación y fichas
  afectadas. Las evidencias anteriores conservan su alcance histórico;
  `docs/qa/threejs-*` se restauró sin cambios. Las huellas de fuentes y logs
  coinciden con los archivos finales de este corte.

Validación del 2026-11-02 (Lima). Cuarto corte aceptado localmente; fase 3 sigue
activa. Se conservan reglas, estrategia, Europa y presentación. Supabase/SQL se
prueban con simuladores, Docker sin red externa y móvil mediante emulación; no
se acredita producción ni dispositivos físicos. Entrega aislada en esta rama,
sin integrar otros worktrees, push ni despliegue.

## Quinto corte: recibos con huella de comando

Base `9c1f720` más los cambios de esta entrega. [player-action.js](../../game/application/player-action.js)
consulta el recibo del miembro antes de vencer relojes, comprobar revisión o
volver a ejecutar. Un reintento idéntico conserva ACK; otra acción con un ID ya
aceptado produce `COMMAND_ID_CONFLICT` sin publicar datos del comando anterior.
La respuesta tiene traducción española/inglesa y el cliente existente la procesa
como los demás rechazos, liberando su acción pendiente.

El [adaptador de huella](../../game/infrastructure/command-fingerprint.js) se
inyecta en aplicación: SHA-256 con codificación `sha256-json-v1`, claves de JSON
ordenadas y arrays en su orden original. Incluye todo el payload; revisión e ID
pertenecen al sobre y no cambian la identidad de la acción. No se introduce una
dependencia de criptografía en el caso de uso. Formato y orden de decisión quedan
en [arquitectura](../architecture.md), con el motivo de compatibilidad en
[contratos](../decisions/match-domain-contracts.md).

`actionIds` mantiene la ventana de 128 por partida/puesto; `actionReceipts`
conserva las huellas de comandos nuevos que siguen dentro de esa ventana. Un
reintento no refresca su posición. Los IDs legados sin huella siguen confirmándose
por ID, sin inventar contenido. Un ID expulsado debe pasar controles como nuevo.
La serialización y los snapshots de rollback incluyen los recibos; se confirman
con revisión/estado/historial. No se modifica el esquema SQL ni el formato de
replay y no se publican huellas en lobby, estado, errores o frames.

## Evidencia del quinto corte

- [Aplicación](../../tests/player-action.test.js): reintento con claves reordenadas,
  revisión distinta, reloj vencido, almacenamiento pausado y piloto automático;
  conflicto antes de cualquier ejecución; compatibilidad legada, ventana de 128,
  expulsión conjunta, independencia de puestos/partidas y solicitudes sin ID.
- [Codificación](../../tests/command-fingerprint.test.js): valor conocido persistible,
  JSON anidado, arrays ordenados, tipos/campos distintos y claves especiales sin
  modificar prototipos. [Checkpoint](../../tests/checkpoint-application.test.js)
  comprueba que el lote preparado no comparte las huellas mutables del runtime.
  [Vistas](../../tests/authorized-views.test.js) comprueba que los recibos siguen
  privados. Suite enfocada de aplicación/huellas/checkpoint/vistas/idiomas:
  **33/33**, sin fallos ni omisiones.
- [Archivo y WebSocket](../../tests/command-receipts-server.test.js): reconexión,
  reinicio, ID antiguo, nuevo duplicado, conflicto sin añadir historial, fallo de
  manifiesto y recuperación. Un guardado fallido no reserva el ID: tras recuperar
  se acepta una acción diferente válida con ese ID y se guarda su huella correcta.
- [Supabase simulado](../../tests/supabase-server.test.js): respuesta de commit
  perdida reintenta un cuerpo idéntico, incluidos los recibos; reinicio conserva
  ACK/conflicto y un fallo restaura huellas junto con revisión y archivo.
  Integración enfocada con multijugador e historial: **22/22**, sin fallos ni
  omisiones.


Ejecución del 2026-11-02 (Lima), sobre la base indicada y los cambios de este corte:

- Suite completa, Node `v25.6.1`: **524/524**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  Incluye cinco pruebas nuevas y la ampliación de contratos existentes.
  [Resultado y huellas](../qa/modular-application-receipts/node-tests-result.json),
  [TAP](../qa/modular-application-receipts/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  Ocho recorridos de interacción, nueve combinaciones de viewport/zoom y partida
  completa de cuatro jugadores con **269 acciones**, reconexión y cero errores.
  Incluye 68 intentos de construcción, cinco pagos/seis desistimientos de túnel,
  cuatro estaciones y siete ofertas/confirmaciones de destinos.
  [Resultado](../qa/modular-application-receipts/browser-tests-result.json),
  [reporte](../qa/modular-application-receipts/browser/threejs-report.json).
  Se inspeccionaron [resultado final](../qa/modular-application-receipts/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-application-receipts/browser/threejs-mobile.png).
- Docker `linux/arm64`, Node `v22.23.4`: arranque, `healthz`, UID 1000 y estado
  escribible correctos; **4/4** pruebas sobre código empaquetado. Además de assets,
  privacidad HTTP y práctica con bots, se ejecutó el recorrido de recibos con
  reinicio y rollback. El adaptador nuevo está incluido y su URL devuelve 404.
  [Construcción](../qa/modular-application-receipts/docker-build.txt),
  [resultado](../qa/modular-application-receipts/docker-result.json),
  [TAP](../qa/modular-application-receipts/docker-tests.tap).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Revisados arquitectura, contratos, dominio, historial, operación y fichas
  afectadas; la traducción añadida no cambia el trabajo de variantes de vagones.
  `docs/qa/threejs-*` quedó restaurado y las huellas de fuentes/logs coinciden con
  los archivos finales. Las evidencias anteriores conservan su alcance histórico.

Quinto corte aceptado localmente; fase 3 sigue activa. Supabase/SQL se prueban
con simuladores, Docker sin red externa y móvil mediante emulación; no se acredita
producción ni dispositivos físicos. Entrega en esta rama, sin push ni despliegue.

## Sexto corte: checkpoint visual y organización del monorepo

Base `f9bbdaf` más los cambios de este corte, en el mismo worktree aislado.
Se tomó una copia fija de Midsommar Express desde los cambios locales validados
sobre `f41e033` del checkout principal. No se modificó ese checkout ni se importó
el prototipo antiguo de `passenger-extreme`. La [procedencia y huellas](../qa/modular-platform-layout/visual-checkpoint.json)
distinguen ese snapshot de una revisión Git: todavía no tenía commit en origen.
Se integraron código, pruebas y documentación visual; las ediciones posteriores
de otras ramas no entran automáticamente aquí.

- `frontend/`: presentación, Three.js y assets. `shared/`: datos públicos,
  tiempos, lobby, idiomas y formato de replay realmente usados por ambos entornos.
- `backend/`: transporte, composición, fachada `Engine`, bots y almacenamiento.
  `game/` conserva dominio, aplicación, consultas y adaptadores extraídos.
- El [arranque raíz](../../server.js) delega en [backend/server.js](../../backend/server.js).
  `npm start`, Render y Docker conservan un proceso; `STATE_FILE` y su ubicación
  predeterminada permanecen estables, incluso desde otro directorio de trabajo.
- [public-assets.js](../../backend/public-assets.js) mantiene una lista explícita
  de URLs y sus ubicaciones físicas. No cambian HTML, imports del navegador,
  `/assets/...`, HTTP/WebSocket ni sus protecciones. Las carpetas internas no
  se exponen; las nuevas piezas visuales sí se sirven con MIME JavaScript.
- Docker copia los cuatro límites de ejecución y el arranque; scripts Python,
  pruebas y documentación apuntan a los archivos trasladados. El [mapa de movimientos](../qa/modular-platform-layout/path-map.json)
  conserva la correspondencia para futuras integraciones.

No se añaden paquetes npm, servicios independientes, buses ni repositorios
abstractos. `app.js` sigue siendo un coordinador amplio y `Engine` conserva la
adaptación legada: la separación física no equivale a cerrar el trabajo de mapas.
Detalles canónicos en [arquitectura](../architecture.md), [operación](../operations.md)
y [decisión](../decisions/match-domain-contracts.md).

## Evidencia del sexto corte

Ejecución del 2026-11-02 (Lima), con almacenamiento local aislado y autenticación
externa desactivada. La validación del snapshot de origen permanece histórica;
los siguientes resultados pertenecen a esta rama:

- Suite enfocada de modelos, idiomas, tablero y recursos: **26/26**.
  Suite completa con Node `v25.6.1`: **529/529**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  [Resultado y huellas](../qa/modular-platform-layout/node-tests-result.json),
  [TAP](../qa/modular-platform-layout/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: Chrome `156.0.8078.80`, ocho recorridos,
  nueve combinaciones de viewport/zoom y partida completa de cuatro jugadores
  con **238 acciones** y reconexión; cero errores. Incluye construcción, túneles,
  destinos y estaciones. [Informe](../qa/modular-platform-layout/browser/threejs-report.json).
  Se inspeccionaron el resultado final y la captura móvil emulada.
- `node tests/browser-hippie.cjs` y `node tests/browser-wagon-gallery.cjs`:
  correctos en Chrome sin interfaz. Seis escenas, selección/guardado/recarga,
  construcción de ocho vagones, animación, resaltado, reconexión, espectador y
  replay. Galería de 21 familias en ocho tamaños con recuperación WebGL.
  [Resultados](../qa/modular-platform-layout/visual-tests-result.json),
  [galería](../qa/modular-platform-layout/gallery/report.json),
  [Midsommar](../qa/modular-platform-layout/midsommar/report.json).
  Se inspeccionaron las seis escenas y los encuadres de escritorio/móvil.
- [Probe de entrada](../qa/modular-platform-layout/entrypoint-check.cjs): arranque
  CLI desde otro directorio, creación y guardado de sala en la raíz de una copia
  temporal y entrega de `/app.js` correctos. [Resultado](../qa/modular-platform-layout/entrypoint-result.json).
  `python3 scripts/make_assets.py --check`: las diez cartas coinciden.

La primera prueba Docker agotó la espera de bots de 10 s; el recorrido real puede
incluir tres túneles con hasta 23,4 s de pausas programadas. La espera de esa prueba
ahora contempla 30 s; no cambian los tiempos del juego ni las condiciones de éxito.
Se conserva [el intento inicial](../qa/modular-platform-layout/docker-tests-attempt1.tap).
La comprobación de navegador precede a ese ajuste exclusivo de la prueba de red;
su árbol de ejecución coincide con el final.

Docker final, `linux/arm64` y Node `v22.23.4`: **4/4** pruebas aprobadas sobre
el código empaquetado (45 recursos y navegación, privacidad HTTP, bots por
WebSocket y recibos con reinicio/rollback). Arranque predeterminado, `healthz`,
UID 1000, raíz de solo lectura y escritura del estado en `/data` correctos;
sin credenciales, tests, docs ni dependencias de desarrollo en la imagen.
[Construcción](../qa/modular-platform-layout/docker-build.txt),
[resultado](../qa/modular-platform-layout/docker-result.json),
[TAP](../qa/modular-platform-layout/docker-tests.tap).

`node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
Revisados contratos, arquitectura, operación, referencias y documentación visual.
Los QA anteriores permanecen intactos. Solo se normalizó una línea vacía al final
de `wagon-people.mjs` después de las pruebas de navegador; las fuentes ejecutables
no cambiaron. Las huellas de ejecución y el árbol final quedan diferenciados en
[la comprobación final](../qa/modular-platform-layout/final-checks.json).

Sexto corte aceptado localmente; fase 3 sigue activa. SQL/Supabase se comprueban
con simuladores, Docker no usa red externa y móvil es emulado. No se acredita
producción ni dispositivos físicos. Todo queda en esta rama, sin push ni despliegue.

## Siguiente corte

Comprobar la aceptación conjunta de Europa en fase 3: jugada humana, entradas
automáticas, checkpoint/rollback, recibos, privacidad de vistas/replay y arranque
empaquetado. Registrar los límites restantes y cerrar la fase antes de iniciar
mapas versionados e IDs opacos de la fase 4. Mantener el trabajo en esta rama;
no se ha solicitado integración a `main`, push ni despliegue.

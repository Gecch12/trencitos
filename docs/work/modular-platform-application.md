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
- [ ] Centralizar vistas autorizadas de jugador/espectador, conservando privacidad de replay.
- [ ] Introducir recibos con huella de comando y compatibilidad de los 128 IDs legados.
- [ ] Integrar un checkpoint revisado de vagones antes de mover archivos visuales.
- [ ] Separar responsabilidades de frontend/backend en código y verificar empaquetado.
- [ ] Aceptación conjunta de Europa tras todos los cortes de esta fase.

## Primer corte: jugada humana

- [player-action.js](../../game/application/player-action.js) coordina la solicitud
  sobre sala/puesto ya autenticados. Recibe motor, reloj, azar y el puente de
  guardado/publicación; devuelve aceptación, duplicado o rechazo estructurado.
- [legacy-action-reply.js](../../game/compat/legacy-action-reply.js) convierte ese
  resultado al ACK/error existente, con los mismos mensajes y códigos públicos.
  Las excepciones del motor conservan su mensaje legado durante la transición.
- [server.js](../../server.js) resuelve sesión/sala, entrega únicamente ID,
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

## Siguiente corte

Centralizar proyecciones autorizadas de jugador/espectador para sala, partida
y replay, conservando el filtro público adicional y la privacidad de datos
ajenos. Mantener transporte/outbox separados de esas consultas. Los recibos
con huella y la organización de frontend/backend continúan después; antes de
mover archivos visuales corresponde integrar un checkpoint revisado de vagones.

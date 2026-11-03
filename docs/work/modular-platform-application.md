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
- [ ] Separar entradas automáticas y coordinar vencimientos, bots y práctica desde aplicación.
- [ ] Separar preparación/confirmación/publicación y definir puertos de repositorio/commit conjuntos con historial.
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

## Siguiente corte

Extraer las entradas de vencimiento y acción automática utilizadas por reloj,
bots permanentes, reemplazos y práctica. Conservar sus diferencias actuales y
el orden de registro/guardado antes de sustituir el puente `stageRoom` por
preparación, commit y publicación separados. No mover aún archivos visuales.

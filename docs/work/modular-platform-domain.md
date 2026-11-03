---
{"id":"modular-platform-domain","status":"active","parent":"modular-game-platform","depends_on":["modular-platform-contracts"],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Fase 2: extracción del dominio

## Objetivo y alcance

Extraer las reglas de Europa en políticas y transiciones comprobables sin
transporte, almacenamiento, presentación o dependencias globales de tiempo/azar.
Se conserva `engine.js` como fachada durante la transición. El diseño completo
está en [los contratos](../decisions/match-domain-contracts.md); esta ficha registra
qué parte existe y qué falta, sin dar por terminada la fase al completar un corte.

Worktree: `/Users/angelaltarodri/Desktop/free/trains/worktrees/modular-game-platform`.
Primera extracción sobre `1669ae5102c0d8316d4af6305661f43525c6e1a9`, más los
cambios de esta entrega. El trabajo visual de otros chats permanece separado.

## Hitos de la fase

- [x] Pagos y decisión de construcción extraídos, puente compatible y validación registrada.
- [ ] Transiciones de túnel y turno extraídas, con tiempo/azar explícitos.
- [ ] Creación, reparto, destinos, estaciones y puntuación extraídos.
- [ ] Consultas sin mutación y compatibilidad de resultados/temporizadores fuera de ellas.
- [ ] Europa completa verificada, incluyendo bots, privacidad, guardado y replay.

## Primer corte: pagos y construcción

Implementado en esta rama:

- [payment.js](../../game/domain/payment.js): `planPayment` calcula la composición
  sin gastar cartas; `reservePayment` devuelve una mano restante nueva o `null`.
  Se comparte por construcción normal, ferris, estaciones y base/extra de túnel.
- [route-claim.js](../../game/domain/route-claim.js): `decideRouteClaim` valida
  disponibilidad, carriles paralelos, vagones, color y pago; devuelve un plan
  de construcción/reserva o un código de rechazo. `blocksParallelRoute` también
  respalda el `block` usado por bots y otras comprobaciones del motor.
- [legacy-errors.js](../../game/compat/legacy-errors.js): conserva los mensajes
  existentes de los cuatro errores de construcción extraídos.
- [engine.js](../../engine.js): `pay`/`block` conservan sus firmas. `decideClaim`
  proyecta temporalmente definición y propiedad por separado. Aplica el plan
  con el gasto, reciclado, registro, observación y avance de turno existentes.

El núcleo recibe paleta, puntos y umbral de dobles del reglamento, mapa sin dueños
y propiedad en un `Map` por ID. Las pruebas usan otro color, otra puntuación,
IDs numéricos no consecutivos y cadenas, y cambian el orden de las vías.
No depende de las constantes de Europa ni importa `engine.js`.

El puente conserva el formato numérico de Europa, incluido resolver la entrada
legada antes de invocar la política; no convierte guardados ni añade campos al
protocolo. `MapDefinition` completo y el registro versionado siguen pendientes
de fase 4. Los datos transitorios del puente no se persisten.

Fase, turno, vencimientos, consumo efectivo de cartas, revelación/resolución de
túneles, textos de historial y proyecciones aún pertenecen a la fachada. En
particular, una acción tardía sigue pudiendo resolver antes un vencimiento.
Este corte no promete pureza del resto del motor ni un segundo mapa jugable.

## Evidencia

- [Contrato de construcción existente](../../tests/route-claim-contract.test.js):
  se conserva sin modificaciones para comparar el comportamiento anterior.
- [Pagos del dominio](../../tests/domain-payment.test.js): colores inyectados,
  ferris, pagos explícitos, rechazo y reservas sin doble gasto ni mutación parcial.
- [Construcción del dominio](../../tests/domain-route-claim.test.js): IDs opacos,
  orden independiente, dobles, códigos/prioridad de rechazo, protección de costes
  ante campos del cliente e importación/ejecución sin dependencias ambientales.
- La suite enfocada de siete archivos pasó: pagos, construcción, contratos de
  Europa, túneles, reciclado y compatibilidad de las opciones de pago de la UI.

Ejecución del 2026-11-02 (Lima), Node `v25.6.1`, base indicada arriba más el diff
de esta entrega:

- Suite completa, `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`:
  **394/394**, sin fallos ni omisiones. [Resultado y huellas del código](../qa/modular-domain-construction/node-tests-result.json)
  y [salida TAP](../qa/modular-domain-construction/node-tests.tap).
- El primer recorrido de navegador pasó las ocho interacciones iniciales y las
  nueve combinaciones de viewport/zoom; se detuvo esperando una revisión durante
  la partida automática. [Resultado anterior al ajuste](../qa/modular-domain-construction/browser-before-driver-fix-result.json)
  y [reporte](../qa/modular-domain-construction/browser-before-driver-fix/threejs-report.json).
  Se identificó una carrera en el conductor: podía esperar ACK después de llamar
  a `act` durante la renovación de cartas; ese cliente descarta robos mientras
  `marketRefresh` está activo. Se ajustó para esperar también a que termine esa animación
  antes de enviar el robo. No se desactiva el bloqueo ni se adelanta el reloj.
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.74`.
  [Resultado](../qa/modular-domain-construction/browser-tests-result.json) y
  [reporte](../qa/modular-domain-construction/browser/threejs-report.json): ocho
  recorridos de interacción, nueve combinaciones de viewport/zoom y partida de
  cuatro jugadores completa con 234 acciones, reconexión y cero errores.
  Incluye 58 intentos de construcción, pagos/desistimiento de túnel y estación.
  Se inspeccionaron las capturas de [resultado final](../qa/modular-domain-construction/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-domain-construction/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  La revisión del diff confirmó que no cambiaron los archivos visuales ni
  `data.js`, y que la evidencia histórica `docs/qa/threejs-*` fue restaurada.

Se revisaron los documentos señalados por el mapa de fuentes. Las fichas
históricas de fase 0/1 y de bots conservan sus evidencias originales; el puente
no cambia sus reglas ni estrategias. El resultado nuevo se registra aquí.

Límites: entorno local con estado de archivo separado, puertos de prueba y
autenticación externa desactivada. Las pruebas SQL/remotas usan simuladores;
no certifican Render, Supabase real ni dispositivos físicos. No se han migrado
guardados, integrado el trabajo visual de otros worktrees ni publicado cambios.

## Siguiente corte

Extraer las transiciones de túnel empezando por el cálculo de suplemento y los
resultados de pagar/desistir, usando la misma composición/reserva. Mantener
`reveal → decision → result`, pausa/reanudación de ofertas y avance único de turno.
Después integrar el reloj explícito y retirar duplicación de adjudicación entre
acción y vencimiento. No mover todavía `app.js`, `board-3d.js` ni los modelos de
vagones. Crear un nuevo hito con entrega propia solo si lo exige el alcance real.

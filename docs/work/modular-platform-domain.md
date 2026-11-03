---
{"id":"modular-platform-domain","status":"done","parent":"modular-game-platform","depends_on":["modular-platform-contracts"],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
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
- [x] Transiciones de túnel y turno extraídas, con tiempo explícito y cartas reveladas suministradas.
- [x] Preparación de recursos, reparto y elecciones/ofertas de destinos extraídos, con azar suministrado.
- [x] Estaciones, conectividad, puntuación y desglose extraídos, con puente para resultados guardados.
- [x] Cartas de tren y mercado extraídos, con azar explícito y puente compatible.
- [x] Consultas sin mutación ni alias y normalización explícita de resultados/temporizadores.
- [x] Europa completa verificada, incluyendo bots, privacidad, guardado y replay.

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

En ese primer corte, fase, turno, vencimientos y resolución de túneles seguían
en la fachada; el segundo corte descrito abajo extrae parte de ellos. El consumo
efectivo de cartas, textos de historial y proyecciones continúan allí. Una acción
tardía sigue pudiendo resolver antes un vencimiento. Ninguno de estos cortes
promete pureza de todo el motor ni un segundo mapa jugable.

## Evidencia del primer corte

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

## Segundo corte: túneles y turnos

Base: `7a0fddc` más los cambios de esta entrega.

- [tunnel.js](../../game/domain/tunnel.js) calcula suplemento, reserva base/extra,
  decide pagar/desistir y planifica `reveal → decision → result`, vencimiento y
  reanudación de ofertas. Recibe cartas reveladas, `now` y duraciones; no roba
  cartas, importa datos de Europa ni consulta reloj/azar por su cuenta.
- [turn.js](../../game/domain/turn.js) planifica comienzo, espera por oferta,
  rotación y última ronda. Conserva el plazo inicial compartido existente y
  devuelve una señal de cierre sin calcular resultados.
- La fachada aplica esos planes, traduce dos errores de túnel y comparte
  `awardRoute` entre construcción normal, túnel pagado y construcción automática.
  Mantiene mensajes, orden de registros, reciclado y representación persistida.
  La actualización de guardados antiguos sigue en `ensureTiming`, antes de
  entregar las decisiones al dominio.

Se reprodujo y corrigió un fallo previo del suplemento automático: con dos
cartas rojas reservadas como base y una locomotora restante, el motor calculaba
el extra sobre la mano completa, gastaba las rojas y fallaba con «Descuadre de
mano». Ahora calcula y gasta exactamente el extra disponible tras reservar la
base. Un pago explícito imposible se rechaza sin mutación. Es una corrección
de la regla de pago conjunto, no una nueva regla ni cambio del protocolo.

### Evidencia del segundo corte

- [Pruebas directas](../../tests/domain-transitions.test.js): plazos inyectados,
  última ronda completa, espera de billetes, revelaciones cortas/vacías,
  límites exactos, ticks tardíos, pagos automáticos/explícitos y no mutación.
- [Túneles compartidos](../../tests/shared-tunnel.test.js): regresión del pago
  automático y rechazo íntegro seguido de desistimiento con un solo avance y
  los registros correspondientes. Se mantienen las pruebas de recuperación,
  privacidad, resultados y ofertas congeladas.
- Se extendió la prueba de frontera ambiental para ejecutar las políticas de
  túnel/turno con reloj, azar global, red e importaciones externas prohibidos.
- Suite enfocada de siete archivos: **68/68** correctas.

Ejecución del 2026-11-02 (Lima), Node `v25.6.1`, sobre la base indicada y el diff
de este corte:

- `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`:
  **408/408**, sin fallos ni omisiones. [Resultado y huellas del código](../qa/modular-domain-tunnels/node-tests-result.json)
  y [salida TAP](../qa/modular-domain-tunnels/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.74`.
  [Resultado](../qa/modular-domain-tunnels/browser-tests-result.json) y
  [reporte](../qa/modular-domain-tunnels/browser/threejs-report.json): ocho
  recorridos, nueve combinaciones de viewport/zoom y partida de cuatro jugadores
  completa con 251 acciones, reconexión y cero errores. Incluye 63 intentos de
  construcción, dos pagos y cuatro desistimientos de túnel, destinos y estaciones.
  Se inspeccionaron [resultado final](../qa/modular-domain-tunnels/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-domain-tunnels/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Se revisaron las referencias a motor en las fichas históricas de contratos y
  bots; conservan su evidencia original y no cambian las estrategias.

Estado de archivo y puertos locales aislados, sin autenticación externa. SQL y
backend remoto se verifican con simuladores; no acredita Render, Supabase real
ni dispositivos físicos. La evidencia previa `docs/qa/threejs-*` quedó restaurada.
Entrega local, sin integración de otros worktrees ni publicación.

### Límites al terminar el segundo corte

La fachada aún crea/baraja mazos, coordina vencimientos generales, destinos,
estaciones, cierre/puntuación y consultas. `newGame` y `finish(force)` todavía
usan azar global; no se declara determinista todo el motor. Se mantiene el
formato de guardados y las referencias que esperan consumidores existentes.
Frontend, tablero, vagones y datos de Europa no cambian en este corte.

## Tercer corte: reparto y destinos

Base: `25a9135` más los cambios de esta entrega.

- [setup.js](../../game/domain/setup.js) valida cantidad de jugadores y primer
  puesto, prepara mazos y reparte manos/billetes con recursos, colores y cantidades
  suministrados. No importa datos de Europa ni produce historial, relojes o vistas.
- [destinations.js](../../game/domain/destinations.js) decide selección inicial,
  oferta y confirmación por ID; recibe mínimos y política de duración. Devuelve
  planes sin mutar entradas. Las elecciones iniciales simultáneas arrancan el
  primer turno solo cuando todos terminaron; las ofertas posteriores mantienen
  devolución al mazo, confirmación fuera de turno y cierre pendiente.
- [random.js](../../game/domain/random.js) comparte barajado y muestreo sin
  reemplazo con el generador suministrado. Lo usan reparto, reciclado y elecciones
  automáticas. Se conserva el orden de consumo de azar de los recorridos legados.
- La fachada traduce errores, aplica los planes conservando referencias de manos
  y mazo corto, coordina vencimientos e historial y normaliza partidas antiguas.
  El reloj fijo de ofertas de guardados sin `timing` se traduce a una política
  explícita; el dominio no detecta versiones de guardado.

Se añadió `{random}` como quinto argumento opcional de `newGame` y
`newRandomGame`, para reparto y mercado inicial. El tercer argumento de
`newRandomGame` sigue consumiendo una sola muestra para elegir el primer puesto.
`finish(g, true, {random})` permite controlar las elecciones del cierre forzado.
Las firmas existentes y defaults de producción permanecen compatibles.

### Evidencia del tercer corte

- [Pruebas del dominio](../../tests/domain-setup-destinations.test.js): reglas y
  billetes alternativos, reparto sin mutar entradas, validación antes del azar,
  elecciones, devolución, mínimos y duraciones inyectados, muestreo sin reemplazo.
- [Contratos de fachada](../../tests/setup-destinations-contract.test.js): estado
  inicial reproducible incluso al renovar el mercado, rechazo sin azar/mutación,
  diferencias entre descartes iniciales/posteriores, referencias e identidad de
  oferta y cierre forzado con generador suministrado.
- La prueba ambiental ejecuta también estos módulos con reloj/azar globales,
  transporte e importaciones externas prohibidos.
- Suite enfocada de nueve archivos: **62/62** correctas.
- [Comparación de reparto con la base](../qa/modular-domain-destinations/setup-compatibility-result.json):
  **20/20** estados completos iguales con semillas 1–20, 2–5 jugadores y relojes
  legados/configurados. Incluye orden de mazos, manos, billetes, mercado, eventos
  y plazos; se capturó la base antes de editar y se contrastó con la nueva API.

Ejecución del 2026-11-02 (Lima), Node `v25.6.1`, sobre la base indicada y el diff
de este corte:

- `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`:
  **421/421**, sin fallos ni omisiones. [Resultado y huellas del código](../qa/modular-domain-destinations/node-tests-result.json)
  y [salida TAP](../qa/modular-domain-destinations/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.74`.
  [Resultado](../qa/modular-domain-destinations/browser-tests-result.json) y
  [reporte](../qa/modular-domain-destinations/browser/threejs-report.json): ocho
  recorridos, nueve combinaciones de viewport/zoom y partida de cuatro jugadores
  completa con 267 acciones, reconexión y cero errores. Incluye seis ofertas y
  seis confirmaciones de destinos, selección inicial, construcción, túneles y
  estación. Se inspeccionaron [resultado final](../qa/modular-domain-destinations/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-domain-destinations/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Las fichas históricas de contratos y bots se revisaron y conservan sus
  evidencias anteriores. No cambian sus estrategias ni el protocolo de acciones.

Entorno local con estado de archivo y puertos aislados, sin autenticación externa.
Las pruebas SQL/remotas usan simuladores; no acreditan Render, Supabase real ni
dispositivos físicos. Se restauró la evidencia histórica `docs/qa/threejs-*`.
Entrega local, sin integración de otros worktrees ni publicación.

### Límites al terminar el tercer corte

El ensamblado del estado legado, robo/reciclado y renovación de cartas, estaciones,
puntuación, coordinación de cierre/vencimientos y consultas siguen en la fachada.
Los módulos nuevos reciben definiciones válidas; el catálogo/validador versionado
de mapas pertenece a fase 4. No se ha activado otro mapa ni cambiado guardados.

## Cuarto corte: estaciones y puntuación

Base: `5436d5d` más los cambios de esta entrega.

- [stations.js](../../game/domain/stations.js) decide coste/pago y disponibilidad
  de estación con ciudades, costes y ocupación suministrados. La consulta
  `canBuildStation` reutiliza esa decisión. `assignStations` elige una asignación
  conjunta para todos los destinos; no cambia de vía prestada por billete.
- [network.js](../../game/domain/network.js) extrae conectividad, camino de
  destino y recorrido más largo. Usa IDs opacos, admite ciclos y carriles
  paralelos y no repite vías. El bit de cada arista usa su posición local,
  no el ID del mapa.
- [scoring.js](../../game/domain/scoring.js) calcula destinos, bonos, clasificación,
  ganadores compartidos y desglose. Recibe puntos de rutas/estaciones/Express y
  orden de desempate. Las vías prestadas completan destinos pero no Express.
- [legacy-scoring.js](../../game/compat/legacy-scoring.js) proyecta definiciones y
  propiedad separadas y traduce `n`/`p` a `length`/`points`. Mantiene el formato de
  resultados y referencias de billetes esperado por los consumidores actuales.
  Los detalles antiguos se completan usando totales/asignaciones guardados,
  sin recalcular clasificación o ganadores ni reemplazar detalles ya presentes.
- La fachada aplica pagos y efectos, conserva firmas públicas y espera las
  ofertas pendientes antes de puntuar. La normalización desde `view` sigue
  existiendo; este corte extrae su cálculo pero no adelanta el hito de consultas.

La validación de ciudad ahora compara IDs presentes en el mapa; nombres de
propiedades heredadas como `constructor` se rechazan antes del pago. Los
desempates entre asignaciones equivalentes conservan el orden del mapa de Europa.
No se migraron IDs ni se activó un segundo mapa.

### Evidencia del cuarto corte

- [Dominio](../../tests/domain-stations-scoring.test.js): costes/paleta/bonos
  alternativos, no mutación, préstamos conjuntos, IDs desordenados y `0`/`"0"`,
  ciclos, carriles paralelos, más de 32 vías, empates y totales históricos.
- [Fachada](../../tests/stations-scoring-contract.test.js): costes 1/2/3,
  eventos/avance único, rechazos sin gasto, acción tardía, privacidad durante el
  cierre y reconstrucción parcial de resultados conservando campos anteriores.
- La prueba de frontera ambiental ejecuta estaciones/red/puntuación con reloj,
  azar global, transporte e importaciones externas prohibidos.
- Suite enfocada de nueve archivos: **93/93** correctas, incluyendo resultados,
  préstamos de bots, pagos, reciclado y privacidad existentes.
- [Comparación con la base](../qa/modular-domain-scoring/scoring-compatibility-result.json):
  **24/24** estados finales, proyecciones de destinos y reconstrucciones de
  resultados antiguos iguales. Cubre 2–5 jugadores, 32 vías adjudicadas por caso,
  0–3 estaciones por jugador y ajustes de puntos históricos.

Ejecución del 2026-11-02 (Lima), Node `v25.6.1`, sobre la base indicada y el diff
de este corte:

- `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`:
  **440/440**, sin fallos ni omisiones. [Resultado y huellas del código](../qa/modular-domain-scoring/node-tests-result.json)
  y [salida TAP](../qa/modular-domain-scoring/node-tests.tap).
- La primera ejecución de navegador se detuvo por superposición MUN/VIE al
  cambiar a 768×1024 y zoom 1. Se conserva el [resultado fallido](../qa/modular-domain-scoring/browser-before-resize-wait-result.json)
  y su [reporte](../qa/modular-domain-scoring/browser-before-resize-wait/threejs-report.json).
  El conductor medía inmediatamente después de cambiar viewport/zoom, mientras
  la cámara también se ajusta mediante `ResizeObserver`. Se añadió una espera
  de dos frames tras cada cambio, conservando todas las comprobaciones y sin
  modificar el código visual de la aplicación.
- Repetición de `QA_PORT=0 npm run test:board3d`: **aprobada**, Chrome
  `156.0.8078.74`. [Resultado](../qa/modular-domain-scoring/browser-tests-result.json)
  y [reporte](../qa/modular-domain-scoring/browser/threejs-report.json): ocho
  recorridos, nueve combinaciones de viewport/zoom y partida de cuatro jugadores
  completa con **248 acciones**, reconexión y cero errores. Incluye selección
  inicial, construcción, estación, pagos/desistimientos de túnel y dos ofertas
  de destinos con sus confirmaciones. Se inspeccionaron el [resultado final](../qa/modular-domain-scoring/browser/threejs-finished.png)
  y el [móvil emulado](../qa/modular-domain-scoring/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Las fichas de tablero, base, contratos y bots conservan su evidencia histórica;
  este corte no cambia estrategias, interfaz pública ni presentación del juego.

Entorno local con estado de archivo y puertos aislados, sin autenticación externa.
Las pruebas SQL/remotas usan simuladores; no acreditan Render, Supabase real ni
dispositivos físicos. Se restauró la evidencia histórica `docs/qa/threejs-*`.
Entrega local, sin integración de otros worktrees ni publicación.

### Límites al terminar el cuarto corte

El ensamblado legado, robo/reciclado y renovación del mercado, coordinación de
vencimientos/cierre y consultas permanecen en la fachada. Las políticas reciben
definiciones válidas; el catálogo/validador versionado sigue en fase 4. La búsqueda
exacta del recorrido más largo conserva su complejidad: no se ha certificado el
rendimiento de redes arbitrarias futuras ni un cambio de estrategia de bots.

## Quinto corte: cartas de tren y mercado

Base: `ab159b3` más los cambios de esta entrega.

- [train-cards.js](../../game/domain/train-cards.js) concentra el ciclo de las
  cartas de tren: robo visible/oculto, reposición de casilla, reciclado,
  renovación del mercado y disponibilidad para continuar robando. Trabaja sobre
  copias privadas de las pilas, recibe azar explícito y devuelve planes sin
  consultar reloj, transporte, datos de Europa ni estado global.
- Tamaño de mercado, umbral de renovación y número de cartas por turno se
  suministran como reglas. La locomotora visible consume el turno y solo puede
  tomarse como primera carta; la oculta cuenta como una. El agotamiento puede
  terminar el turno antes del límite, incluso si solo quedan locomotoras visibles.
- El muestreo condicionado conserva la distribución y orden de consumo de azar
  anteriores. Si no existe mercado completo válido, reparte una sola vez tras
  reciclar, sin bucle de reintentos. Los revelados de un túnel pendiente siguen
  fuera de estas pilas hasta su resolución.
- La fachada conserva `draw`, `refill` y `recycleDiscards`, aplica los planes y
  mantiene los contenedores legados entre robos; reciclado/renovación los
  reemplazan como antes. Publica `market_refresh` antes de `draw`, conserva
  contadores, historial, observadores y avance único. El puente de errores
  mantiene los tres mensajes existentes de robo inválido.

No cambia el reglamento de Europa, el protocolo ni el formato de guardado. La
coordinación de vencimientos sigue decidiendo cuándo ejecutar robos automáticos
y cuándo reciclar; las políticas reciben definiciones válidas. El catálogo y su
validador, y la activación de mapas nuevos, siguen en fases posteriores.

### Evidencia del quinto corte

- [Dominio](../../tests/domain-train-cards.test.js): no mutación, rechazo sin
  azar, conservación de cartas, agotamiento, mercado parcial/imposible,
  ponderaciones combinatorias, límites alternativos y exclusión de revelados.
- [Fachada](../../tests/train-cards-contract.test.js): referencias, orden de
  eventos, privacidad tras guardar/cargar, observadores, vencimientos y avance.
- Frontera ambiental ampliada: el módulo se carga y ejecuta con reloj, azar
  global, transporte e importaciones externas prohibidos.
- Suite enfocada de ocho archivos: **86/86** correctas, incluyendo las pruebas
  existentes de reciclado, eventos, relojes y túneles.
- [Comparación con la base](../qa/modular-domain-cards/cards-compatibility-result.json):
  **160/160** casos idénticos. Veinte semillas, 2–5 jugadores y ocho escenarios
  de pilas. Compara tras cada paso estado completo, vistas de puestos/espectador
  salvo `serverNow`, eventos de observación, límites de cada llamada aleatoria
  e identidad de contenedores. Incluye robos aceptados/rechazados, vencimientos,
  aislamiento de túnel y helpers públicos.

Ejecución del 2026-11-02 (Lima), Node `v25.6.1`, sobre la base indicada y el diff
de este corte:

- `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`:
  **457/457**, sin fallos ni omisiones. [Resultado y huellas del código](../qa/modular-domain-cards/node-tests-result.json)
  y [salida TAP](../qa/modular-domain-cards/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.74`.
  [Resultado](../qa/modular-domain-cards/browser-tests-result.json) y
  [reporte](../qa/modular-domain-cards/browser/threejs-report.json): ocho
  recorridos, nueve combinaciones de viewport/zoom y partida de cuatro jugadores
  completa con **262 acciones**, reconexión y cero errores. Incluye 173 robos
  de cartas de tren, 65 intentos de construcción, pagos/desistimientos de túnel,
  tres estaciones y cinco ofertas de destinos con sus confirmaciones. Se
  inspeccionaron [resultado final](../qa/modular-domain-cards/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-domain-cards/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Contratos y ficha de bots revisados; conservan su evidencia histórica. Las
  estrategias, archivos visuales, datos de Europa y conductor de navegador no
  cambiaron en este corte. Se restauró la evidencia histórica `docs/qa/threejs-*`.

Entorno local con estado de archivo y puertos aislados, sin autenticación externa.
Las pruebas SQL/remotas usan simuladores; no acreditan Render, Supabase real ni
dispositivos físicos. Entrega local, sin integración de otros worktrees ni
publicación. La fase 2 permanece activa hasta completar consultas y aceptación
conjunta.

## Sexto corte: consultas y compatibilidad explícita

Base: `34ac499` más los cambios de esta entrega.

- [match-view.js](../../game/queries/match-view.js) proyecta la partida por puesto,
  filtra eventos/historial y copia el resultado completo. No modifica el estado
  ni devuelve referencias mutables a él; tampoco consulta reloj/azar. Recibe `now`, duración
  visual de carta y cálculo de destinos. Rechaza puestos inválidos sin convertir
  cadenas como `"0"` en acceso a una mano privada.
- `Engine.view(game, seat, {now})` conserva la fachada y el reloj predeterminado.
  La lectura de un resultado antiguo incompleto ya no lo repara: el llamador debe
  normalizar primero. Las pruebas anteriores de hidratación se adaptaron a ese
  punto explícito, conservando sus verificaciones de totales y referencias.
- [legacy-timing.js](../../game/compat/legacy-timing.js) planifica adaptación de
  selección inicial secuencial, fase antigua de billetes y túnel sin etapas.
  Conserva plazos existentes y usa el dominio de turno para el avance; la fachada
  aplica sus cambios/eventos. `ensureTiming` mantiene compatibilidad pública.
- `Engine.normalize(game, now)` aplica relojes y `completeResults` del
  [puente de puntuación](../../game/compat/legacy-scoring.js). Es idempotente,
  conserva totales/clasificación/ganadores y no reemplaza detalles presentes.
- Servidor: normaliza tras restaurar salas de archivo o backend remoto, antes
  de tomar snapshots confirmados, y antes de persistir/publicar. Motor/reloj:
  normalizan antes de comandos, vencimientos y programación. Práctica y bots
  pasan por esas mismas entradas; no se cambian sus estrategias.
- Archivo: normaliza la partida viva antes de captar un paso nuevo. Leer replay
  conserva proyecciones y hashes históricos, incluso si faltaban detalles.
  El filtro `safePublic` de destinos finales sigue en servidor/archivo; no se
  cambia el acceso de participantes/espectadores ni el formato de las grabaciones.

### Evidencia del sexto corte

- [Consultas](../../tests/match-queries.test.js): nueve estados/fases congelados,
  todas las referencias anidadas separadas, vistas estables tras acciones,
  reloj explícito, rechazos de puesto, privacidad de historial y normalización
  idempotente de iniciales, billetes, túneles y resultados. Incluye ejecución en
  VM sin reloj/azar/transporte ambientales.
- [Carga del servidor](../../tests/legacy-load-server.test.js): archivo y remoto
  simulado normalizan antes de publicar, conservan totales/plazos/revisión y
  guardan el estado compatible; reconexión real por WebSocket local.
- [Archivo](../../tests/match-archive.test.js): captura de resultado antiguo y
  lectura de replay sin normalizar frames ni cambiar la cadena de hashes.
- Suite enfocada de once archivos: **99/99** correctas, incluyendo práctica,
  bots permanentes, relojes, resultados, túneles, eventos y privacidad.
- [Comparación con la base](../qa/modular-domain-queries/queries-compatibility-result.json):
  **144/144** estados normalizados y vistas de todos los puestos/espectador
  idénticos (excepto `serverNow`). Doce semillas, 2–5 jugadores y doce escenarios
  actuales/legados, incluida espera por oferta, cierre y etapas del túnel.
  Antes se usaba `ensureTiming` seguido de `view`; ahora `normalize` seguido
  de `view`. Se verifica idempotencia con un tiempo posterior.

Ejecución del 2026-11-02 (Lima), Node `v25.6.1`, sobre la base indicada y el diff
de este corte:

- `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`:
  **470/470**, sin fallos ni omisiones. [Resultado y huellas del código](../qa/modular-domain-queries/node-tests-result.json)
  y [salida TAP](../qa/modular-domain-queries/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  [Resultado](../qa/modular-domain-queries/browser-tests-result.json) y
  [reporte](../qa/modular-domain-queries/browser/threejs-report.json): ocho
  recorridos, nueve combinaciones de viewport/zoom y partida de cuatro jugadores
  completa con **245 acciones**, reconexión y cero errores. Incluye 169 robos
  de cartas, 62 intentos de construcción, pago/desistimiento de túneles, estación
  y oferta/confirmación de destinos. Se inspeccionaron el [resultado final](../qa/modular-domain-queries/browser/threejs-finished.png)
  y el [móvil emulado](../qa/modular-domain-queries/browser/threejs-mobile.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Se revisaron contratos y fichas históricas de bots/controles de mesa sin
  reemplazar sus evidencias. No cambiaron datos de Europa, archivos visuales,
  estrategias de bots ni conductor de navegador. `docs/qa/threejs-*` restaurado.

Entorno local con puertos/estado aislados y autenticación externa desactivada.
El backend remoto y las pruebas SQL usan simuladores; no se acredita Render,
Supabase real, una imagen Docker ni dispositivos físicos. Entrega local sin
integración de otros worktrees ni publicación. La aceptación conjunta de fase 2
permanece pendiente.

## Aceptación conjunta de fase 2

Base: `5a5854e` más los cambios de esta entrega. Revisión del 2026-11-02 (Lima).
Este cierre corrige el empaquetado y amplía su comprobación; no cambia reglas,
datos, estrategias de bots ni archivos visuales.

### Revisión de fronteras

| Frontera | Resultado y evidencia |
| --- | --- |
| Políticas de dominio | Once módulos ejecutables con reglas/mapa/tiempo/azar suministrados. La prueba VM de [construcción](../../tests/domain-route-claim.test.js) ejecuta los recorridos principales sin reloj/azar/transporte globales; las suites `domain-*` cubren rechazo e inmutabilidad. |
| Consultas y compatibilidad | `projectMatch` devuelve copias sin reparar estado. `normalize` actúa al cargar/ejecutar/capturar, nunca al leer frames de replay. [Consultas](../../tests/match-queries.test.js), [carga legada](../../tests/legacy-load-server.test.js) y [archivo](../../tests/match-archive.test.js) conservan plazos, resultados e historial. |
| Europa y bots | [Simulaciones](../../tests/simulation.test.js) completan tres partidas por cada tamaño de 2–5 jugadores, con puntuación y conservación de 110 cartas. [Práctica](../../tests/server.test.js), [bots permanentes](../../tests/room-bots.test.js) y las suites de estrategia cubren turnos, destinos privados, pausa y recuperación. |
| Privacidad | [Directorio/espectadores](../../tests/room-directory.test.js), consultas, servidor y archivo verifican manos, destinos, ofertas y robos ocultos. `safePublic` continúa filtrando los destinos finales fuera de `Engine.view`; esa composición debe conservarse en fase 3. |
| Persistencia y confirmación | [Multijugador](../../tests/multiplayer-server.test.js) comprueba rollback local y reintento sin duplicar la jugada; [servidor remoto](../../tests/supabase-server.test.js) comprueba confirmar antes de publicar, reinicio y fallo con backend simulado. [Cola](../../tests/durable-queue.test.js) conserva una confirmación aunque falle su entrega. |
| Historial | [Integración de historial](../../tests/history-server.test.js) cubre recarga/reinicio, deduplicación y autorización. El contrato de archivo conserva hashes y vistas históricas sin volver a sortear ni normalizar frames anteriores. |

El límite de esta fase sigue siendo explícito: `engine.js` conserva validación
de fase/puesto, coordinación de vencimientos, comprobación de acciones disponibles
para pasar, aplicación mutable de planes y textos/eventos. El servidor mantiene
salas, autorización, persistencia y confirmaciones. El núcleo extraído no convierte
toda la fachada en una función pura. Su separación de aplicación y la composición
de vistas autorizadas corresponden a fase 3; IDs/mapas versionados, a fase 4.

### Corrección y comprobación del paquete

La lista anterior de `Dockerfile` omitía módulos raíz y todo `game/`. Se reprodujo
en una imagen local: su comando normal falló con `Cannot find module './i18n'`
([construcción anterior](../qa/modular-domain-acceptance/docker-before-build.txt),
[fallo de arranque](../qa/modular-domain-acceptance/docker-before-start.txt)).
Ahora se copian los recursos/módulos raíz por extensión y los directorios
`game/`/`assets/`, sin copiar el repositorio completo. El contexto excluye también
archivos de replay, QA, docs y worktrees. Los comandos están en [operación](../operations.md#empaquetado-docker).

La [prueba de recursos](../../tests/deployment.test.js) recorre HTML, imports JS
estáticos/dinámicos y referencias CSS, además de las cartas generadas por nombre.
Comprueba **41 recursos** y rechazo de módulos privados. Sustituye la afirmación
incompleta de que bastaba encontrar algunos nombres en el texto de Dockerfile.

Se construyó y arrancó la imagen corregida (`linux/arm64`, Node `v22.23.4`):
`healthz` correcto, usuario `node`/UID 1000, escritura en `/data` y ausencia de
credenciales, estado local, docs, tests y dependencias de desarrollo en `/app`.
Las tres pruebas seleccionadas de recursos/privacidad HTTP y práctica con bots
pasaron dentro de esa imagen. Solo para esa ejecución se montó `tests/` en modo
lectura; raíz del contenedor de solo lectura, estado temporal y red externa desactivada.
[Construcción](../qa/modular-domain-acceptance/docker-build.txt),
[arranque](../qa/modular-domain-acceptance/docker-start.txt),
[TAP](../qa/modular-domain-acceptance/docker-tests.tap) y
[resultado con comandos, imagen y huellas](../qa/modular-domain-acceptance/docker-result.json).

### Evidencia de aceptación

- Suite completa en Node `v25.6.1`: **471/471**, sin fallos ni omisiones,
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  [Resultado y huellas](../qa/modular-domain-acceptance/node-tests-result.json),
  [TAP](../qa/modular-domain-acceptance/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`: **aprobado**, Chrome `156.0.8078.80`.
  Ocho recorridos, nueve combinaciones de viewport/zoom y partida de cuatro
  jugadores completa con **243 acciones**, reconexión y cero errores. Incluye
  60 intentos de construcción, cinco pagos/dos desistimientos de túnel, tres
  estaciones y tres ofertas/confirmaciones de destinos.
  [Resultado](../qa/modular-domain-acceptance/browser-tests-result.json),
  [reporte](../qa/modular-domain-acceptance/browser/threejs-report.json).
  Se inspeccionaron las capturas de [resultado final](../qa/modular-domain-acceptance/browser/threejs-finished.png)
  y [móvil emulado](../qa/modular-domain-acceptance/browser/threejs-mobile.png).
- Las huellas de los 19 archivos de dominio, consultas, compatibilidad y entradas
  de ejecución coinciden con la evidencia del sexto corte. Sus comparaciones
  diferenciales conservan su fecha original; no se presentan como una ejecución nueva.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Revisados operación, contratos, mapa de fuentes y avance de la iniciativa.
  La evidencia histórica `docs/qa/threejs-*` quedó restaurada.

Fase 2 aceptada en este worktree. Los tests de almacenamiento remoto/SQL usan
simuladores; la ejecución Docker corresponde a `linux/arm64` local y la prueba
visual a Chrome de escritorio con móvil emulado. No certifican Render, Supabase
real ni dispositivos físicos. No se integró trabajo visual de otros worktrees,
ni se hizo push, merge o despliegue.

## Siguiente fase

Iniciar fase 3 por un caso de uso de aplicación: separar recepción del comando,
ejecución y confirmación/presentación conservando guardado conjunto con historial,
deduplicación y rollback. Mantener la fachada compatible mientras se cambia cada
entrada. Antes de mover archivos visuales, integrar un checkpoint revisado del
trabajo de vagones. La separación frontend/backend será en código dentro del
mismo repositorio; no exige dividir ahora los despliegues.
El avance posterior se registra en [aplicación e interfaz](modular-platform-application.md).

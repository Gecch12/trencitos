# Operación local y verificación

Para Android Emulator e iOS Simulator, consultar [pruebas móviles con Capacitor](mobile-development.md).

## Entorno

Node >=20; comandos en la raíz Git (la carpeta que contiene `package.json`).
Frontend y backend tienen carpetas distintas, una instalación y un proceso Node.
`server.js` conserva el arranque compatible; la implementación está en `backend/server.js`.
El estado de archivo predeterminado sigue siendo `room-state.json` de la raíz,
aunque el proceso se lance desde otra carpeta. Las herramientas Python viven en `scripts/`.
Ejecutar `npm ci` para instalar Three.js y las herramientas de QA.
PGlite es dependencia solo de desarrollo para comprobar SQL/permisos de identidad e historial;
no se carga en producción. Auth es optativo: [configuración Google/Discord](GOOGLE_AUTH.md).
`npm ci --omit=dev` basta para servir el juego; no requiere proceso de build.
`npm start` sirve HTTP y WebSocket en el mismo proceso, puerto 3000 por defecto.
Las pruebas usan `node --test` y abren puertos de loopback; un `listen EPERM`
del sandbox no demuestra un fallo del juego.

```sh
npm test
npm run test:ci
node scripts/check-docs.js
node scripts/check-docs.js --index
node scripts/check-docs.js --base HEAD
node scripts/benchmark-bots.js --seed 3001 --seeds 25 --players 4 --opponent stage1
```

`check-docs.js --base HEAD` revisa cambios desde una referencia y cambios locales. Sus
avisos de fuentes afectadas solicitan revisión semántica; no exigen editar un
documento que sigue siendo correcto.

[GitHub Actions](../.github/workflows/ci.yml) ejecuta la suite completa en serie,
valida documentación y prueba el lobby y los robos de cartas en Chrome sobre
Ubuntu/Node 26. Usa estado temporal y un doble local para guardado remoto, sin
credenciales de producción. La evidencia del navegador se conserva siete días.
Avance de activación y entrega en [CI y Render](work/continuous-delivery.md).

El benchmark enfrenta un bot nuevo con tres rivales (para cuatro jugadores),
rotándolo por todos los asientos para cada semilla. `--opponent stage1` usa la
primera mejora, `old` el bot original y `heuristic` la versión completa sin
búsqueda de turnos futuros. Separa la aleatoriedad de decisiones de la del motor
y reproduce repartos, mercados y reciclados sin cambiar el RNG de producción.
`--seeds` cuenta repartos; el total es semillas × jugadores. Informa victorias
(repartidas en empates), puntos, destinos y latencia de decisiones. Las métricas
de tiempo dependen de la máquina y de la carga. Los resultados registrados y
los conjuntos usados para ajuste/evaluación están en [la ficha](work/practice-ai.md).

## Empaquetado Docker

`Dockerfile` instala solo dependencias de producción y copia
el arranque raíz `server.js` y las carpetas `backend/`, `frontend/`, `shared/` y `game/`.
No copia el repositorio entero; incluir el dominio en la imagen no lo hace público.
Los módulos de `shared/maps/` se incluyen con `shared/`; `index.html` carga
definición y puente antes de `data.js`. El resolvedor privado valida la compatibilidad
al resolver el mapa de una partida y rechaza referencias desconocidas. Los contextos
y el reglamento incorporado viajan dentro de `backend/`, sin URLs públicas.
El bundle publica los layouts de Europa/Laboratorio/Sudamérica y sus etiquetas de selección;
la topología del mapa elegido llega en cada estado autorizado. Una versión de
mapa desconocida en una sala guardada impide arrancar sin reescribir el checkpoint.
La lista de URLs públicas vive en `backend/public-assets.js`; mover un archivo no
lo expone automáticamente. El arranque y las variables de Render no cambian.
`.dockerignore` excluye credenciales, estado/archivo local, QA, docs y worktrees.

Para comprobar la imagen local, sin conectarla a servicios externos:

```sh
docker build -t trencitos-local .
docker run --rm --network none --read-only \
  --tmpfs /data:uid=1000,gid=1000 --tmpfs /tmp:mode=1777 \
  -e STATE_BACKEND=file -e AUTH_ENABLED=false \
  -v "$PWD/tests:/app/tests:ro" trencitos-local \
  node --test --test-concurrency=1 \
  --test-name-pattern='runtime assets|static SVG|WebSocket practice flow' \
  tests/deployment.test.js tests/server.test.js
```

Las pruebas se montan en modo lectura solo para esta verificación; no pertenecen
a la imagen. Comprueban dependencias servidas desde HTML/imports/CSS, recursos
dinámicos de cartas, archivos privados inaccesibles y práctica con bots por
WebSocket. Ejecutan el código empaquetado como `node` con estado temporal.
El comando normal de la imagen es `node server.js`, con `STATE_FILE=/data/rooms.json`;
para conservar partidas fuera de pruebas, `/data` necesita almacenamiento persistente.
Render sigue usando el runtime Node definido en `render.yaml`; construir esta
imagen local no modifica ni verifica ese despliegue.

## Carpeta de trabajo y ramas

La carpeta habitual es `trains/trencitos`, rama `main`. Desde el 2026-11-03,
solo se crean ramas/worktrees adicionales cuando Ángel lo pide explícitamente.
Revisa el estado Git y cambios de otros chats antes de escribir. Las ramas
históricas conservadas no son copias activas ni trabajo pendiente.
La [consolidación](work/workspace-consolidation.md) conserva procedencia y respaldos.

Para ejecutar un servidor de pruebas desde la carpeta principal, con puerto y
estado propios (crea primero `.qa/`):

```sh
STATE_BACKEND=file STATE_FILE="$PWD/.qa/local-check.json" AUTH_ENABLED=false PORT=3118 node server.js
```

Abrir `http://localhost:3118/`. El tablero principal usa solo 3D.
La cámara usa rueda, arrastre, pellizco y teclado (flechas, `+`/`−`, Inicio al
enfocar el mapa), además del botón **Ver mapa completo** para restaurar el encuadre.

Verificación del inicio, perfil y salas:

```sh
node tests/browser-shell.cjs
```

Abre Chrome y un servidor de archivo aislado en un puerto libre de loopback.
Comprueba navegación, cambios responsive, tres sesiones independientes,
creación/unión, bots, visibilidad y espectadores. Guarda capturas e informe
`docs/qa/shell-*`. Usa un doble HTTP para éxito/error de perfil, sin cuentas de
producción. La prueba adicional del recorrido OAuth/API/SQL local utiliza
`node tests/helpers/identity-preview.js` (puertos 3141/3142, proveedor simulado).

`node tests/browser-profile-style.cjs` comprueba el selector visual y los avatares
del perfil con estado de archivo aislado, teclado y scroll táctil. Guarda capturas
en `.qa/profile-style/` (o `QA_OUT`). La regeneración de miniaturas y su contrato
están en [Personalización](profile-social-statistics.md#personalización).

Verificación reproducible del tablero y los vagones:

```sh
npm run test:board3d
# Si 3119 está ocupado:
QA_PORT=3120 npm run test:board3d
node tests/browser-wagons.cjs
node tests/browser-board-continuity.cjs
```

Requiere Chrome instalado (Playwright usa `channel: chrome`; se puede elegir
`BROWSER_CHANNEL`). Abre servidor solo en loopback, genera estado propio en
`.qa/rooms-<pid>.json` dentro del worktree, ejecuta fixtures y una partida normal
completa por WebSocket, y cierra servidor/navegador al terminar. Las capturas y
métricas se escriben en `docs/qa/threejs-*`; el informe explica qué es emulación.
El conductor respeta el límite existente de acciones del servidor.
El segundo conductor usa 3122, comprueba selección/vista previa, ausencia de símbolos,
reintento ante fallo de WebGL y recursos al recargar. Genera `docs/qa/wagons-catalog.png` con las once piezas reales y su
informe `wagons-report.json`. La galería es un fixture interceptado por Playwright;
no se agrega al servidor ni altera las reglas/límite de cinco jugadores.
El tercero usa 3124 y comprueba profundidad en Frankfurt, conexiones propias y
prestadas, animaciones reales por WebSocket, reconexión, movimiento reducido y
paleta compatible. Genera `threejs-continuity-report.json` y capturas asociadas.
`node tests/helpers/threejs-preview.js` deja disponible una escena densa local
en 3119 para inspección manual. Los fixtures nunca se sirven al cliente como JS.

No reutilices procesos ni archivos de estado de otra carpeta. Los `.env` no se
cargan automáticamente y no deben copiarse del entorno de producción. No
conectes dos procesos al mismo checkpoint Supabase: el nuevo invalida al anterior.

El backend de archivo migra automáticamente el estado anterior al formato 2 en
el siguiente guardado. Reinicia el servidor para cargar el lector/escritor nuevo;
recargar el navegador solo actualiza la interfaz. Para un respaldo consistente,
detén el proceso y copia juntos `STATE_FILE`, `STATE_FILE.bak` si existe y todo
`STATE_FILE.archive/`. Restáuralos juntos y usa una versión que lea el formato 2;
el manifiesto ya no incluye los pasos de las repeticiones. No borres esa carpeta
para reducir el tamaño del estado. El contrato de confirmación y recuperación
está en [historial/replay](history-replay.md).

Si el arranque indica que no se pudo leer el estado ni su copia, el error muestra
la causa de cada lectura. Una repetición incompleta identifica el `.jsonl` y los
bytes o pasos esperados/disponibles; un JSON inválido dentro de una repetición
identifica ese `.jsonl` y su línea, sin mostrar contenido privado. El manifiesto
y su `.bak` pueden ser JSON válidos y fallar al leer la misma grabación compartida.
Conserva el conjunto antes de repararlo:
no se debe vaciar el estado ni reducir sus contadores para forzar el arranque.
Una recuperación parcial debe verificar los hashes disponibles, conservar el
estado válido de la sala y señalar explícitamente el salto en la grabación.
Cuando faltan diferencias intermedias, solo un snapshot completo verificado
permite reanudar la reproducción. Si se prepara una copia derivada con otra
secuencia/cadena, conserva los originales íntegros y la procedencia de cada paso;
su nueva auditoría valida esa copia, no certifica los movimientos ausentes.
El replay muestra `recovery.notice` como texto cuando un registro parcial
incluye ese aviso. El arranque habitual sigue rechazando corrupción; no aplica
una reparación parcial automáticamente.

El estado de cada partida usa su propio `schemaVersion:1` con referencias exactas
de mapa y reglamento. La carga valida y migra copias de los formatos legados antes
de instalar salas; el checkpoint habitual confirma el resultado. Si una partida
o versión no es compatible, el arranque falla sin sobrescribir el guardado. Una
versión desconocida del envoltorio local tampoco cae en una `.bak` antigua; la
recuperación de archivos corruptos conocidos sigue disponible. No elimines
versiones o referencias para forzar una carga: conserva los originales y utiliza
un lector compatible. El esquema RPC/SQL y los frames históricos no cambian.

La app de Codex tiene registrado `trains`, cuyo repo está en `trencitos`.
Un chat local bajo ese proyecto usa explícitamente `trains/trencitos` para
herramientas y servidores. La configuración del chat no demuestra aislamiento.

## Verificar y entregar

Ejecuta pruebas pertinentes al comportamiento cambiado; para una base de
experimento o integración amplia, la suite completa. La UI necesita además
verificación en navegador. Documenta dispositivo real frente a emulación.
Cambios de Node requieren reiniciar el proceso de prueba correspondiente;
recargar la página no recarga el backend.

Registra comandos, resultado, límites, rama y revisión en la ficha de trabajo o
informe enlazado. No copies conteos antiguos de QA como resultado nuevo. Un
checkpoint local, un commit y un despliegue son evidencias distintas.

Despliegue, recuperación y validación remota: [Render/Supabase](RENDER_SUPABASE.md).
Revisión publicada y evidencia: [Producción](production.md). La preparación local
no implica despliegue; la entrega del 2026-10-31 fue solicitada explícitamente.

Historial y repetición: [contrato y comandos de prueba](history-replay.md#verificación-y-auditoría-local).
La migración `003_match_archive.sql` debe preceder al despliegue. La suite amplia
puede ejecutarse con `node --test --test-concurrency=1 tests/*.test.js` para evitar
competencia entre simulaciones y servidores durante QA.


### Medidas de comandos

Contrato, límites de atribución y aceptación en [Rendimiento de partidas](match-performance.md).
El diagnóstico versión 1 añade `capture`, `action`, `history`, `recordingViews`,
`lobbyView`, `stateView`, `checkpointPrepare`, `checkpointJSON` y `checkpointRPC`.
Son spans anidados: acción puede incluir historial y vistas, y commit incluye
preparación/JSON/RPC; no se suman como tiempos exclusivos. `mutation` conserva
su significado histórico, incluida la captura de rollback.

Un mensaje WebSocket puede incluir `traceId` (`[\w-]`, 8–80 caracteres). Después
de completar su lote, solo esa conexión recibe `{type:'timing',id,timing}`.
El resultado tiene espera y ejecución de la operación, tamaño y costes del lote,
spans anidados y `outcome`; `committed` indica que el lote terminó, no que la
acción fuera legal (el ACK/error conserva esa verdad). No contiene datos del juego.
No se almacena el ID en métricas públicas ni en el checkpoint. Los clientes
anteriores y los mensajes sin `traceId` conservan su protocolo.

`/healthz?timings=1` añade `diagnosticsVersion:1` y `runtime`: CPU de proceso
muestreada cada cinco segundos, RSS/heap/external en bytes, utilización y demora
del bucle. CPU puede superar 100 % al usar varios hilos; no equivale al porcentaje
del plan contratado. La demora tiene resolución de 20 ms. `gc` agrega duración
de pausas observadas, no memoria recuperada. El health ordinario no cambia.

`/healthz?timings=1` añade `timingsMs` con hasta 256 muestras por fase (cola,
mutación, commit, entrega, total, cálculo/espera de bots). Cada grupo ofrece
cantidad, mediana, p95 y máximo en milisegundos. No contiene identidades,
credenciales, comandos ni datos de partida. El health ordinario conserva su forma.
La duración de entrega mide encolado local, no RTT del navegador. Para comparar
latencia real se miden envío y recepción en el mismo reloj del cliente.

La cola remota también publica grupos `draw.*`, `build.*`, `bot.*` y `other.*`.
Cola/total corresponden a cada trabajo; mutación/commit/entrega corresponden al
lote. Un lote de tipos diferentes usa `mixed.*` para esas fases compartidas,
sin atribuir todo su coste a un robo. Las etiquetas proceden de una lista fija,
no de IDs, nombres ni payloads. Los rechazos también cuentan como trabajos;
estos agregados no sustituyen una medición de clic a confirmación del cliente.

`node tests/browser-draw-feedback.cjs` prueba el recorrido completo en Chrome
con HTTP/WebSocket locales y el adaptador remoto conectado a un doble en memoria
(`fixture.supabase.co` se intercepta; no se conecta a Supabase real). Retiene el
guardado para comprobar envío inmediato de ambas intenciones, revelación fuera
de la mano, renovación, agotamiento, rechazo, fallo y reconexión. También retiene
los ACK para comprobar que dos estados recibidos antes correlacionen sus colores
sin duplicados; cubre espera prolongada y servidores sin la capacidad nueva.
Escribe métricas y capturas en `.qa/draw-feedback/` (otro destino con `QA_OUT`).
`frameMs` observa el primer frame del movimiento, `confirmationMs` mide el ACK,
`colorRecognizableMs` el color reconocible (inmediato en vivo, giro terminado en replay),
y `handArrivalMs` el frame de incorporación con imágenes cargadas. Las últimas
dos mediciones sustituyen al antiguo criterio de reversos presentes en la mano.
Se usa `requestAnimationFrame`, no una captura física de pantalla ni una medida
de producción. La latencia retenida en la prueba no representa la de Render.


Los respaldos de estado preexistentes conservados durante la limpieza visual
están en `.qa/state-backups/preexisting-2026-11-02/`, fuera de Git y de la entrega.

La entrega de [perfiles y estadísticas](profile-social-statistics.md#configuración-y-verificación)
requiere migración 006 en Auth, 007/008 en estado y configuración externa de Discord
y Cron antes de habilitarlos. El avatar y las nuevas vistas forman parte de los
activos web y del paquete móvil; no requieren un servidor de imágenes adicional.

### Alcance de las transacciones y recuperación

El diagnóstico incluye `persistenceMode` (`room` o `checkpoint`) y el número de
`pausedRooms`; no publica sus códigos. En modo por sala, las acciones/bots/relojes
se ordenan por agregado; el ciclo de vida conserva una barrera. El procedimiento
de activación y regreso está en [SQL 009](RENDER_SUPABASE.md#transacciones-por-sala-sql-009).
Una sala incierta se recupera desde SQL mediante Reintentar; no repetir el
checkpoint en memoria. El cliente conserva el ID del comando. Conflicto de
escritor o fallo global sigue requiriendo reinicio/reconexión.

`node scripts/check-architecture.js` comprueba límites del dominio, aplicación
y consultas; CI también ejecuta casos negativos, aislamiento de dos salas,
rollback y pérdida de respuesta. Son verificaciones deterministas de corrección,
no benchmarks de Render. Las [reglas de entrega](architecture-rules.md) aplican
a cada cambio sin requerir invocar un skill.

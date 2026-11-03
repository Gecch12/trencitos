# Operación local y verificación

## Entorno

Node >=20; comandos en la raíz Git (la carpeta que contiene `package.json`).
Frontend y backend tienen carpetas distintas, una instalación y un proceso Node.
`server.js` conserva el arranque compatible; la implementación está en `backend/server.js`.
El estado de archivo predeterminado sigue siendo `room-state.json` de la raíz,
aunque el proceso se lance desde otra carpeta. Las herramientas Python viven en `scripts/`.
Ejecutar `npm ci` para instalar Three.js y las herramientas de QA.
PGlite es dependencia solo de desarrollo para comprobar SQL/permisos de identidad e historial;
no se carga en producción. Auth es optativo: [configuración Google](GOOGLE_AUTH.md).
`npm ci --omit=dev` basta para servir el juego; no requiere proceso de build.
`npm start` sirve HTTP y WebSocket en el mismo proceso, puerto 3000 por defecto.
Las pruebas usan `node --test` y abren puertos de loopback; un `listen EPERM`
del sandbox no demuestra un fallo del juego.

```sh
npm test
node scripts/check-docs.js
node scripts/check-docs.js --index
node scripts/check-docs.js --base HEAD
node scripts/benchmark-bots.js --seed 3001 --seeds 25 --players 4 --opponent stage1
```

`check-docs.js --base HEAD` revisa cambios desde una referencia y cambios locales. Sus
avisos de fuentes afectadas solicitan revisión semántica; no exigen editar un
documento que sigue siendo correcto.

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
definición y puente antes de `data.js`. El registro privado de mapas valida Europa
al cargar el motor y rechaza una definición incompatible con sus reglas.
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

## Worktrees y ramas

Cada worktree tiene sus archivos y estado local. Git comparte historial y
referencias; los cambios no aparecen automáticamente en las otras carpetas.
Cada frente usa una rama distinta y registra su avance en su ficha. Sincroniza
desde una base revisada y resuelve documentos junto con código al integrar.

Para ejecutar un servidor aislado, desde **su** checkout, con puerto libre:

```sh
STATE_BACKEND=file STATE_FILE="$PWD/room-state.json" PORT=3118 node server.js
```

Abrir `http://localhost:3118/`. El tablero principal usa solo 3D.
La cámara usa rueda, arrastre, pellizco y teclado (flechas, `+`/`−`, Inicio al
enfocar el mapa), sin botones visibles de zoom o centrado.

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

La app de Codex tiene registrado `trains`, cuyo repo está en `trencitos`.
Un chat local bajo ese proyecto debe usar explícitamente la ruta de su worktree
para herramientas y servidores. La configuración de chat no demuestra aislamiento.

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

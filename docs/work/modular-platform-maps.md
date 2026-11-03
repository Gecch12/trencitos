---
{"id":"modular-platform-maps","status":"active","parent":"modular-game-platform","depends_on":["modular-platform-application"],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Fase 4: mapas versionados

## Objetivo y alcance

Hacer que Europa y un mapa pequeño de prueba puedan funcionar simultáneamente,
conservando partidas, bots, grabaciones y presentación Three.js. Sudamérica se
incorpora en fase 5, después de demostrar esa independencia. Los contratos están
en [la decisión](../decisions/match-domain-contracts.md), el funcionamiento actual
en [arquitectura](../architecture.md).

Worktree: `/Users/angelaltarodri/Desktop/free/trains/worktrees/modular-game-platform`.
Base del primer corte: `21947c6`, aceptación documentada de la fase 3. Entrega en
la rama aislada; no se sincronizan automáticamente otros worktrees ni se publica.

## Hitos y aceptación

- [x] Definición inmutable de Europa y catálogo con versiones explícitas y validación estructural.
- [x] Congelar correspondencias de IDs y comprobar equivalencia con los datos y repartos anteriores.
- [ ] Resolver mapa/reglas por partida y sustituir accesos por posición en el motor y sus consumidores.
- [ ] Versionar referencias de estado/guardado y preservar compatibilidad de archivos y replay anteriores.
- [ ] Adaptar bots, consultas y transporte a la definición de cada partida.
- [ ] Separar composición visual por mapa, habilitar selección y conservar Three.js y cosméticos.
- [ ] Aceptación conjunta: Europa y mapa pequeño jugables simultáneamente, con guardado/reconexión/replay.

## Primer corte: definición y puente de Europa

[Europe v1](../../shared/maps/europe-v1.js) declara ciudades, corredores, vías y
billetes sin propietarios ni coordenadas. Los identificadores de vías y billetes
son literales estables; los carriles dobles comparten un corredor explícito.
[El catálogo](../../game/maps/catalog.js) valida identidad, versión de esquema,
referencias, coherencia de corredores, conectividad, cantidades y tipos de
billetes. Sus definiciones y referencias son copias inmutables; una versión
desconocida falla explícitamente, sin elegir otra por defecto.

La compatibilidad con reglas exige colores, puntuación para cada longitud y
soporte de túneles/ferris cuando el mapa los necesita. Es la porción del contrato
que consume el mapa; no se presenta como un `RuleSet` completo. El reparto y la
configuración por partida siguen en los próximos cortes.

[El puente europeo](../../shared/maps/europe-legacy-v1.js) contiene una tabla
congelada entre números anteriores e IDs nuevos, además de las posiciones
históricas usadas por `CITIES`. [data.js](../../shared/data.js) conserva su API,
paleta y formato, pero ya obtiene la red y los billetes de la definición única.
El navegador carga definición y puente antes de esa fachada. El motor verifica
la compatibilidad del mapa registrado al arrancar; Docker ya incluye esas carpetas.

El formato persistido y los mensajes todavía usan números. El mapa pequeño
existe solo como fixture para probar catálogo y políticas de construcción;
no está disponible para iniciar salas. No cambia el esquema SQL, las versiones
de replay, el balance, el orden de mazos ni los reglamentos de Europa.

## Evidencia del primer corte

- [Catálogo](../../tests/map-catalog.test.js): versiones simultáneas, copias
  inmutables, rechazo de definiciones inválidas/desconectadas, versiones
  desconocidas, puntuaciones o mecánicas ausentes. Europa y el mapa de prueba
  alimentan la misma política de construcción con IDs opacos y arrays reordenados.
- [Compatibilidad](../../tests/europe-map-compat.test.js): equivalencia completa
  con la [referencia congelada](../../tests/fixtures/europe-legacy-v1.json), capturada
  antes de la extracción sobre `21947c6`. Reordenar ciudades, corredores, vías y
  billetes mantiene identidades y orden legado. Browser clásico y Node entregan
  los mismos datos. Repartos completos reproducibles de dos a cinco jugadores
  conservan sus hashes anteriores.
- Suite enfocada de catálogo, puente, construcción y reparto: **27/27**, sin
  fallos ni omisiones. [TAP](../qa/modular-map-foundation/focused-tests.tap).

Validación conjunta del primer corte, 2026-11-02 (Lima), sobre `21947c6` más
los cambios de esta entrega, con entorno de archivo aislado:

- Node `v25.6.1`: **543/543**, sin fallos ni omisiones. Incluye 14 pruebas nuevas;
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  [Resultado y huellas](../qa/modular-map-foundation/node-tests-result.json),
  [TAP](../qa/modular-map-foundation/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`, Chrome `156.0.8078.80`: ocho recorridos,
  nueve combinaciones de viewport/zoom y partida completa con **250 acciones**,
  reconexión y cero errores. Construcciones, pagos/desistimientos de túnel,
  destinos y estaciones incluidos; capturas final y móvil inspeccionadas.
  [Resultado](../qa/modular-map-foundation/browser-tests-result.json),
  [informe](../qa/modular-map-foundation/browser/threejs-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **6/6** sobre el código empaquetado.
  Carga de 47 recursos y navegación, privacidad HTTP, práctica con bots,
  recibos/reinicio/rollback, equivalencia de datos y repartos congelados.
  `healthz`, usuario `node`/UID 1000 y escritura temporal del estado correctos;
  raíz de solo lectura, sin red externa ni dependencias de desarrollo.
  [Construcción](../qa/modular-map-foundation/docker-build.txt),
  [resultado](../qa/modular-map-foundation/docker-result.json),
  [TAP](../qa/modular-map-foundation/docker-tests.tap).
- Revisión documental y `git diff --check`: correctos. Todas las huellas de
  fuentes y logs coinciden con los archivos finales; los QA anteriores quedan
  intactos. [Comprobación final](../qa/modular-map-foundation/final-checks.json).

Primer corte aceptado localmente; fase 4 sigue activa. No hay dos mapas jugables
aún: se comprobó coexistencia de definiciones y políticas, con Europa como único
mapa del runtime. Supabase/SQL se validan mediante simuladores y móvil por
emulación. Sin push, integración a `main` ni despliegue.

## Siguiente corte

Introducir un contexto explícito de mapa/reglas para cada partida, comenzando por
la fachada del motor y las búsquedas de vía por identidad. Mantener el puente de
Europa para guardados existentes y definir cómo viajan las referencias exactas
sin alterar ni reinterpretar replays antiguos. Los hitos siguientes requieren
validación propia; el catálogo por sí solo no demuestra dos mapas jugables.

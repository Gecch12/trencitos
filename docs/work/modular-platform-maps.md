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
- [x] Resolver mapa/reglas por partida y sustituir accesos por posición en construcción y túneles del motor.
- [ ] Versionar referencias de estado/guardado y preservar compatibilidad de archivos y replay anteriores.
- [ ] Adaptar bots, consultas y transporte a la definición de cada partida, incluidos los demás supuestos sobre IDs.
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

## Segundo corte: contexto por partida e identidad de vías

Base: `9ee033a`. [El motor](../../backend/engine.js) admite un catálogo inyectado
mediante `createEngine({maps})` y opciones exactas de mapa/reglamento al crear.
[El resolvedor](../../backend/match-context.js) conserva contextos inmutables,
usa las referencias del estado después de serializar y rechaza referencias
parciales/desconocidas antes de ejecutar acciones. El único reglamento es
[europe-classic@1](../../backend/rules/europe-classic-v1.js), con los mismos
valores del motor anterior. Al iniciar comprueba que alcance el reparto de
billetes; no añade una plataforma de reglas externas.

Construcción, túnel pagado y túnel sin suplemento buscan la vía por igualdad
estricta de ID; reordenar filas ya no cambia la adjudicación. Europa conserva
números y los demás mapas mantienen sus cadenas/corredores. Estaciones y textos
usan las ciudades de cada mapa. Reparto, cartas, turnos, destinos y puntuación
obtienen reglas del contexto. Contrato y límites canónicos en
[arquitectura](../architecture.md).

La creación predeterminada conserva el estado anterior sin nuevas referencias;
solo opciones explícitas incorporan ambas. Esto permite comprobar el motor sin
adelantar una migración incompleta de guardados o replay. Las vistas todavía no
transportan esas referencias; lobby, bots, composición visual y archivos siguen
siendo europeos. No se habilita el mapa pequeño en salas ni se integra Sudamérica.

[Las pruebas del contexto](../../tests/engine-map-context.test.js) ejecutan
Europa y dos versiones de un mapa pequeño en un mismo motor; verifican separación
de estado/definición, IDs numéricos/cadenas distintos, túneles restaurados en otra
instancia, conservación de cartas, dobles/ferris, estaciones y recorridos prestados,
puntuación y privacidad. Los rechazos de referencias no cambian la partida y los
mapas sin billetes suficientes o con longitudes incompatibles fallan antes del azar.
Los repartos europeos conservan las huellas anteriores, sin modificar la fixture.

## Evidencia del segundo corte

Validación local del 2026-11-02 (Lima), sobre `9ee033a` más los cambios de esta
entrega. Estado de archivo aislado, sin credenciales ni servicios de producción:

- Node `v25.6.1`: **552/552**, sin fallos ni omisiones, incluidas nueve pruebas
  nuevas del contexto. `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  [Resultado y huellas](../qa/modular-map-context/node-tests-result.json),
  [TAP](../qa/modular-map-context/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`, Chrome `156.0.8078.80`: ocho recorridos,
  nueve combinaciones de viewport/zoom y partida de cuatro jugadores terminada
  con **249 acciones**, reconexión y cero errores. Construcciones, suplemento y
  desistimiento de túnel, destinos y prueba de estación por teclado correctos.
  Capturas final y móvil inspeccionadas.
  [Resultado](../qa/modular-map-context/browser-tests-result.json),
  [informe](../qa/modular-map-context/browser/threejs-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **15/15** sobre el código empaquetado.
  Incluye contextos, restauración JSON de túneles, equivalencia europea, recursos
  públicos/privados, bots y recibos/reinicio/rollback. `healthz`, usuario `node`
  (UID 1000), estado temporal escribible y ausencia de dependencias de desarrollo
  comprobados con raíz de solo lectura y sin red externa.
  [Construcción](../qa/modular-map-context/docker-build.txt),
  [resultado](../qa/modular-map-context/docker-result.json),
  [TAP](../qa/modular-map-context/docker-tests.tap).
- Documentación y `git diff --check` correctos; huellas de fuentes y logs
  comprobadas y QA anteriores intactos.
  [Comprobación final](../qa/modular-map-context/final-checks.json).

Segundo corte aceptado localmente. Las fichas cerradas de fases anteriores
conservan sus evidencias históricas; el avance actual vive aquí. Supabase/SQL
siguen cubiertos por simuladores y móvil por emulación. No certifica dos mapas
en el producto, Render ni una migración durable. Sin push, merge o despliegue.

## Siguiente corte

Definir y aplicar el esquema de estado con referencias exactas desde la creación
de sala y la carga durable. Distinguir formatos legados conocidos de estados
nuevos incompletos; validar mapa/reglamento e IDs de vías, túneles y billetes antes
de reanudar. Cubrir archivo, restauración/rollback y envoltorio remoto. Conservar
los frames y hashes de replay antiguos, y decidir explícitamente el contrato de
los nuevos pasos antes de añadir referencias a vistas. Después migrar bots,
transporte y composición visual. La fase requiere aún una aceptación conjunta
de dos mapas jugables en el producto.

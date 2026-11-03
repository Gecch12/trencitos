---
{"id":"modular-platform-maps","status":"done","parent":"modular-game-platform","depends_on":["modular-platform-application"],"branch":"main","delivery":"released","updated":"2026-11-03"}
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
- [x] Versionar referencias de estado/guardado y preservar compatibilidad de archivos y replay anteriores.
- [x] Adaptar bots y simulaciones a la definición de cada partida, conservando estrategia y privacidad.
- [x] Adaptar consultas, transporte y archivo a la definición de cada partida, con compatibilidad histórica.
- [x] Consumir definiciones por partida en el cliente, separar layout y conservar identidades en Three.js y controles.
- [x] Registrar el mapa/layout de prueba en el producto, habilitar selección y conservar cosméticos.
- [x] Aceptación conjunta: Europa y mapa pequeño jugables simultáneamente, con guardado/reconexión/replay.

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

## Tercer corte: estado versionado y restauración

Base: `c976997`. Toda creación del motor, incluidas salas/práctica, incorpora
`schemaVersion:1`, `mapRef` y `rulesRef`. El contenido anterior de reparto y
recursos conserva sus huellas al excluir únicamente esos tres campos; la fixture
congelada se mantiene intacta. [El adaptador de estado](../../game/compat/match-state.js)
reconoce los formatos sin versión conocidos y devuelve copias validadas con
cabecera, sin convertir los IDs europeos ni recalcular puntos anteriores.

Comprueba las referencias exactas, la red completa y sus atributos, puestos,
billetes, túneles, ciudades/estaciones y IDs guardados en eventos y resultados.
Una versión desconocida, referencia incompleta o identidad incompatible falla
antes de reanudar. Archivo y remoto pasan por la misma restauración de salas;
el lote se prepara antes de instalarlo y su migración se confirma mediante el
checkpoint existente. Los snapshots usados por rollback ya llevan cabecera.
Una versión desconocida de envoltorio local no se reemplaza con un respaldo viejo.

El estado crudo de auditoría añade referencias solo en pasos nuevos. Las vistas,
versiones de replay y frames/hashes anteriores permanecen intactos: replay nunca
llama a `restoreState`. No hay cambio SQL ni selección de un segundo mapa en
salas. Contratos implementados en [arquitectura](../architecture.md) e
[historial](../history-replay.md).

Las pruebas de [estado](../../tests/match-state.test.js) cubren migración
idempotente sin mutar entrada, fases legadas, IDs opacos, estados inválidos,
cabecera y compatibilidad de replay. La [restauración integrada](../../tests/match-state-server.test.js)
ejecuta array antiguo, historial integrado, manifiesto v2 y Supabase simulado,
conservando el prefijo de grabación y la copia anterior del archivo. Un lote con
una partida incompatible no confirma salas ni cierra/regraba el historial.
[Carga legada](../../tests/legacy-load-server.test.js), recibos y pruebas remotas
mantienen cobertura de reconexión, relojes, reinicio y rollback conjunto.

## Evidencia del tercer corte

Validación local del 2026-11-02 (Lima), sobre `c976997` más los cambios de esta
entrega, con estado temporal y servicios remotos simulados:

- Node `v25.6.1`: **566/566**, sin fallos ni omisiones, incluidas 14 pruebas nuevas.
  `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.js`.
  [Resultado y huellas](../qa/modular-map-state/node-tests-result.json),
  [TAP](../qa/modular-map-state/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`, Chrome `156.0.8078.80`: ocho recorridos,
  nueve combinaciones de viewport/zoom, partida de cuatro jugadores terminada
  con **230 acciones**, reconexión y cero errores. Incluye construcción, pagos y
  desistimientos de túneles, estación y destinos. Capturas final y móvil revisadas.
  [Resultado](../qa/modular-map-state/browser-tests-result.json),
  [informe](../qa/modular-map-state/browser/threejs-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **19/19** sobre el código empaquetado.
  Migración de las cuatro fuentes, rechazo sin commit, replay, datos/repartos
  europeos, recursos públicos/privados, bots y recibos/reinicio/rollback.
  `healthz`, UID 1000 y estado temporal escribible correctos; raíz de solo lectura,
  sin red externa ni dependencias de desarrollo.
  [Construcción](../qa/modular-map-state/docker-build.txt),
  [resultado](../qa/modular-map-state/docker-result.json),
  [TAP](../qa/modular-map-state/docker-tests.tap).
- Documentación y `git diff --check` correctos; fuentes/logs verificados contra
  sus huellas, fixture europea congelada y QA anteriores intactos.
  [Comprobación final](../qa/modular-map-state/final-checks.json).

Tercer corte aceptado localmente. No habilita un segundo mapa en el producto.
Supabase/SQL se comprueban mediante simuladores; móvil, por emulación. Sin push,
merge, cambios en producción ni despliegue. Las fichas cerradas conservan sus
evidencias históricas; esta ficha registra la evolución posterior.

## Cuarto corte: bots y simulaciones por contexto

Base: `ad23759`. `createBots({engine})` resuelve el contexto de cada partida y
compone planificador, tácticas y búsqueda con definiciones inmutables. Reemplazo
y práctica usan colores, pagos, puntos, ciudades, billetes, inventario y límites
del reglamento activo; no consultan las constantes europeas del motor. La
memoria sigue siendo privada y separada por partida/asiento, sin entrar en guardados.

Observaciones y mundos hipotéticos conservan versión y referencias. El muestreo
usa billetes públicos del mapa y cantidades observables, nunca las cartas ocultas
reales. Las simulaciones ejecutan el mismo motor inyectado. Los conjuntos de vías
tienen claves independientes del orden que distinguen tipos y comas dentro del ID.
Contrato implementado en [arquitectura](../architecture.md).

[Las pruebas del corte](../../tests/bot-map-context.test.js) incluyen referencias
incompatibles, getters que impiden leer constantes europeas o cartas ocultas,
estaciones fuera de Europa, destinos retirados, pagos de ferris/túneles y mundos
muestreados válidos. Intercalan partidas completas de Europa y un mapa sintético
de ocho ciudades, restaurándolas durante el recorrido mediante `restoreState`.
Esto prueba motor/controlador, todavía sin interfaz ni replay de un segundo mapa.

[Tres partidas congeladas](../../tests/fixtures/bots-europe-v1.json), capturadas
antes de modificar las políticas, conservan exactamente sus **622 decisiones**
y resultados: bots actuales contra la base anterior, cuatro bots actuales y dos
bots sin búsqueda. Las políticas históricas y la fixture de reparto permanecen
intactas. No se modifican heurísticas ni se certifica balance del mapa sintético.

## Evidencia del cuarto corte

Validación local del 2026-11-03 (Lima), sobre `ad23759` más los cambios de esta
entrega. Entorno limpio, estado temporal y servicios remotos simulados:

- Node `v25.6.1`: **575/575**, sin fallos ni omisiones, incluidas las nueve pruebas
  nuevas del corte. Suite serial completa, con estrategia, privacidad, partidas,
  almacenamiento, recibos y replay.
  [Resultado y huellas](../qa/modular-map-bots/node-tests-result.json),
  [TAP](../qa/modular-map-bots/node-tests.tap).
- `QA_PORT=0 npm run test:board3d`, Chrome `156.0.8078.80`: ocho recorridos,
  nueve combinaciones de viewport/zoom, partida terminada de cuatro jugadores
  con **228 acciones**, reconexión y cero errores. Incluye estaciones y ofertas
  de destinos; el recorrido específico comprueba túnel sin suplemento.
  Capturas final y móvil revisadas.
  [Resultado](../qa/modular-map-bots/browser-tests-result.json),
  [informe](../qa/modular-map-bots/browser/threejs-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **28/28** sobre el código empaquetado.
  Incluye bots por mapa, trazas europeas, restauración y compatibilidad,
  recursos públicos/privados, flujo de práctica y recibos/reinicio/rollback.
  `healthz`, UID 1000 y escritura de estado correctos; raíz de solo lectura,
  almacenamiento temporal, sin red externa ni dependencias de desarrollo.
  [Construcción](../qa/modular-map-bots/docker-build.txt),
  [resultado](../qa/modular-map-bots/docker-result.json),
  [TAP](../qa/modular-map-bots/docker-tests.tap).
- Documentación y `git diff --check` correctos; fuentes/logs contrastados con sus
  huellas. QA anteriores, fixture europea y políticas históricas intactas.
  [Comprobación final](../qa/modular-map-bots/final-checks.json).

Cuarto corte aceptado localmente. La prueba del segundo mapa abarca el motor y
el controlador automático; el navegador sigue mostrando Europa. Supabase/SQL
se verifican con simuladores y móvil por emulación. Sin push, merge ni despliegue.

## Quinto corte: definición pública y archivo

Base: `1527075`. El contrato público añade `definitionVersion`, `mapRef` y
`rulesRef` a las vistas. El mensaje de estado lleva una definición separada y
completa del mapa/reglamento, con IDs compatibles con cada vista y solo campos
públicos. El archivo guarda esa definición una vez en la raíz de los snapshots,
dentro del hash; las diferencias evitan repetirla. Los resúmenes conservan
referencias exactas y dejan de etiquetar otros mapas como Europa.

La API de replay lee la definición almacenada sin requerir el mapa en el motor
actual. Rechaza versiones/referencias incompatibles después de autorizar y antes
de leer pasos cuando el error está en metadatos. Admite prefijos antiguos al
reanudar, sin reescribir frames, recalcular puntos ni cambiar hashes.
Contratos en [arquitectura](../architecture.md) e [historial](../history-replay.md).

[Definiciones y compatibilidad](../../tests/match-definition.test.js) comprueban
IDs/corredores, copias, campos públicos, aislamiento de asignaciones privadas,
versiones, metadatos y reanudación con snapshot o diff. Una
[grabación congelada](../../tests/fixtures/replay-europe-v1.json), capturada sobre
la base antes de cambiar el protocolo, conserva las huellas de las respuestas
pública, de participante y de auditoría. Las grabaciones nuevas llevan su definición.

[HTTP/WebSocket](../../tests/match-definition-server.test.js) verifica entrega y
reconexión, listado/replay/auditoría, reinicio y privacidad, en archivo local y
Supabase simulado. El catálogo vivo sigue teniendo solo Europa; aun así la API
lee el mapa sintético grabado. El frontend conserva la presentación europea.
No se habilita selección de otro mapa ni se integra Sudamérica en este corte.

## Evidencia del quinto corte

Validación local del 2026-11-03 (Lima), sobre `1527075` más los cambios de esta
entrega. Estado temporal, sin servicios ni credenciales de producción:

- Node `v25.6.1`: **588/588**, sin fallos ni omisiones. Incluye las trece pruebas
  nuevas de definición pública, compatibilidad, HTTP, persistencia y WebSocket.
  [Resultado y huellas](../qa/modular-map-public/node-tests-result.json),
  [TAP](../qa/modular-map-public/node-tests.tap).
- Replay en Chrome `156.0.8078.80`: **cuatro recorridos** sobre grabaciones
  europeas anteriores y nuevas, participante en escritorio y público en móvil.
  Cambio de perspectiva, navegación entre pasos y privacidad correctos; cero
  errores. Capturas de participante antiguo y público nuevo revisadas.
  [Resultado](../qa/modular-map-public/replay-tests-result.json),
  [informe](../qa/modular-map-public/replay/replay-report.json).
- `QA_PORT=0 npm run test:board3d`: ocho pruebas, nueve combinaciones de
  viewport/zoom y partida terminada de cuatro jugadores con **255 acciones**,
  reconexión y cero errores. Incluye pagos y rechazos de túnel, estaciones y
  ofertas de destinos. Capturas final y móvil revisadas.
  [Resultado](../qa/modular-map-public/browser-tests-result.json),
  [informe](../qa/modular-map-public/browser/threejs-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **41/41** sobre el código empaquetado.
  Arranque, `healthz`, UID 1000 y escritura de estado correctos; raíz de solo
  lectura, estado temporal y sin red externa ni dependencias de desarrollo.
  [Construcción](../qa/modular-map-public/docker-build.txt),
  [resultado](../qa/modular-map-public/docker-result.json),
  [TAP](../qa/modular-map-public/docker-tests.tap).
  El primer intento tuvo dos fallos al cargar pruebas porque faltaba montar su
  verificador de auditoría; al montarlo de solo lectura pasó sin modificar el
  código ni la imagen de producción.
  [Intento inicial](../qa/modular-map-public/docker-initial-tests.tap).
- Documentación, `git diff --check` y huellas de fuentes/logs correctos.
  QA anteriores, fixtures europeas y políticas históricas intactos.
  [Comprobación final](../qa/modular-map-public/final-checks.json).

Quinto corte aceptado localmente. El segundo mapa se verifica en motor y API;
el cliente aún muestra Europa. Supabase se prueba con un simulador y móvil por
emulación. Sin push, merge ni despliegue.

## Sexto corte: contexto de presentación y layout

Base: `7fdb069`. El cliente resuelve la definición antes de dibujar estado o
replay. Nombres, puntos, pagos, dobles, estaciones, mercado y mínimos de destinos
proceden de su contexto de lectura. Europa conserva sus datos legados solo para
pasos antiguos sin encabezado; mensajes actuales incompletos o mapas sin layout
no usan ese fallback. Un error de presentación detiene también el reproductor.
Contrato en [arquitectura](../architecture.md#contexto-y-layout-del-cliente).

El layout europeo se extrae de `map-layout.js` y la geometría pasa a generarse
por composición. Three.js y las vistas de destinos/resultados buscan vías por ID,
con carriles dobles estables al reordenar arrays. Selección y atributos del DOM
conservan IDs de texto, incluidos comillas, `"0"` y `"__proto__"`. Las elecciones
de ofertas mantienen sus índices de protocolo. No se cambian modelos de vagón.

[Las pruebas del contexto](../../tests/match-presentation.test.js) comprueban
aislamiento, reglas explícitas, identidades, coordenadas, rechazo de contratos
incompatibles y carga como scripts clásicos sin backend. La
[referencia de geometría](../../tests/fixtures/europe-layout-v1.json), capturada
del commit base antes de extraerla, verifica equivalencia completa de rutas y
datos visuales europeos, comparando valores con tolerancia de `1e-9` unidades
entre versiones de Node; el mismo runtime produce valores idénticos.

[La prueba de navegador](../../tests/browser-client-map.cjs) lee por HTTP un
replay sintético y ejecuta la app/Three.js reales. Inyecta únicamente el catálogo
de layouts de prueba, comprueba selección de destinos y vías, vagones, navegación
y privacidad en escritorio/móvil. Sin esa inyección, el mismo replay muestra
«Mapa no disponible». El layout sintético no se incorpora al bundle ni al lobby.

## Evidencia del sexto corte

Validación local del 2026-11-03 (Lima), sobre `7fdb069` más los cambios de esta
entrega. Entorno limpio, archivo temporal y autenticación externa desactivada:

- Node `v25.6.1`: **594/594**, sin fallos ni omisiones. Incluye las seis pruebas
  nuevas del contexto y geometría; conserva compatibilidad, privacidad,
  persistencia, reglas y contratos HTTP/WebSocket.
  [Resultado y huellas](../qa/modular-map-client/node-tests-result.json),
  [TAP](../qa/modular-map-client/node-tests.tap).
- Chrome `156.0.8078.80`: cuatro recorridos de replay europeo anterior/actual,
  público/participante, con navegación y secretos filtrados. Otros tres casos
  verifican rechazo por falta de layout y replay sintético con layout inyectado
  en escritorio/móvil: IDs opacos, billetes con comillas, selección, tres vagones,
  nombres de ciudades, cambios de perspectiva y un solo canvas. Cero errores.
  Capturas sintéticas, error y replay antiguo revisadas.
  [Replays europeos](../qa/modular-map-client/replay/replay-report.json),
  [mapa sintético](../qa/modular-map-client/client/client-report.json).
- `QA_PORT=0 npm run test:board3d`: ocho pruebas, nueve combinaciones de
  viewport/zoom y partida completa de cuatro jugadores con **267 acciones**,
  reconexión y cero errores. Incluye estaciones, destinos, pagos y desistimientos
  de túnel; capturas final y móvil revisadas.
  [Resultado](../qa/modular-map-client/browser-tests-result.json),
  [informe](../qa/modular-map-client/browser/threejs-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **48/48** sobre el código empaquetado,
  incluidos recursos públicos y scripts nuevos. Arranque, salud, UID 1000 y
  escritura de estado correctos; raíz de solo lectura, sin red externa ni
  dependencias de desarrollo.
  [Construcción](../qa/modular-map-client/docker-build.txt),
  [resultado](../qa/modular-map-client/docker-result.json),
  [TAP](../qa/modular-map-client/docker-tests.tap).
- La comparación inicial por hash de decimales falló entre Node 25/macOS y
  Node 22/Linux. El redondeo también encontró un valor en su límite. Se pasó a
  comparar la [geometría anterior congelada](../../tests/fixtures/europe-geometry-v1.json)
  con tolerancia numérica `1e-9`, manteniendo exactos textos, estructura y layout.
  En el mismo Node 22, generadores anterior/actual son idénticos; la diferencia
  máxima entre entornos fue `5.72e-12` unidades. Sin cambios al generador para
  corregir esta aserción.
  [Comparación de runtimes](../qa/modular-map-client/geometry-runtimes.json),
  [primer intento](../qa/modular-map-client/docker-initial-tests.tap),
  [intento con redondeo](../qa/modular-map-client/docker-rounding-tests.tap).
- Documentación y diff correctos; fuentes ejecutadas y logs contrastados con sus
  huellas. Tras los recorridos de navegador solo cambió la aserción Node de
  geometría, verificada nuevamente en Node/Docker; el runtime del navegador y
  sus pruebas permanecen iguales. QA y fixtures históricos intactos.
  [Comprobación final](../qa/modular-map-client/final-checks.json).

Sexto corte aceptado localmente. El mapa sintético usa inyección de layout y un
replay preparado; no certifica todavía salas simultáneas de dos mapas. Móvil por
emulación y servicios remotos simulados. Sin push, merge ni despliegue.

## Séptimo corte y aceptación conjunta: mapas seleccionables

Base `8e534a5`; entrega local en el mismo worktree. Se registran
[Laboratorio v1](../../shared/maps/laboratory-v1.js) y su
[layout](../../frontend/layouts/laboratory-v1.js). El servidor valida la selección
antes de modificar la sala, la conserva en checkpoint y revancha, y rechaza
referencias inexistentes o inconsistentes al restaurar. Las salas antiguas
mantienen su comportamiento europeo. El selector del anfitrión y el directorio
anuncian el mapa confirmado. Los cambios no requieren otro repositorio, servicio,
reglamento o migración SQL.

El tablero ficticio usa ciudades y IDs de texto propios, corredores dobles,
túneles, ferri y billetes. Una primera simulación con tres bots se quedó sin
trayectos útiles antes de la ronda final; se añadieron enlaces periféricos y
longitudes cortas, recalculando los puntos de los billetes. La versión registrada
pasa partidas completas de dos a cinco jugadores. Esto no acredita balance
competitivo; sirve para comprobar la independencia técnica.

Evidencia del 2026-11-03 sobre la base indicada y los cambios locales:

- Node `v25.6.1`: **601/601** pruebas. Incluye cinco partidas intercaladas de
  Europa/Laboratorio, restauración, identidades, layouts completos, bots permanentes,
  práctica, permisos, selección antes del inicio y rollback ante fallo de guardado.
  Archivo local y contrato remoto simulado conservan lobby, partida y revancha.
  [Resultado y huellas](../qa/modular-map-select/node-tests-result.json),
  [TAP](../qa/modular-map-select/node-tests.tap).
- Chrome `156.0.8078.80`: dos salas reales simultáneas, cada una con un cliente
  renderizado y otro cliente WebSocket conducidos por la política de bots.
  Final natural en Europa (**120 jugadas**) y Laboratorio (**208**), con **328**
  comandos aceptados. Reinicio del servidor tras 50 jugadas y recuperación de
  los cuatro puestos. Replays públicos/propios, cambio de paso, auditoría íntegra
  y mismos modelos, composiciones de pasajeros y cantidades de vagones (87/85)
  entre juego y replay. Cero errores de navegador. Capturas de lobby, final y
  replay móvil revisadas.
  [Informe](../qa/modular-map-select/selection/selection-report.json),
  [ejecución](../qa/modular-map-select/selection-tests-result.json).
- Cuatro recorridos de replay europeo legado/actual y tres casos del mapa sintético
  con IDs especiales y diseño inyectado: todos correctos, incluido el rechazo
  explícito cuando falta layout. [Europa](../qa/modular-map-select/replay/replay-report.json),
  [sintético](../qa/modular-map-select/client/client-report.json).
- Docker `linux/arm64`, Node `v22.23.4`: **55/55** pruebas sobre la imagen, salud,
  UID 1000 y escritura temporal correctos; raíz de solo lectura y sin red externa.
  Incluye los recursos públicos y el flujo de selección de ambos mapas.
  [Construcción](../qa/modular-map-select/docker-build.txt),
  [resultado](../qa/modular-map-select/docker-result.json),
  [TAP](../qa/modular-map-select/docker-tests.tap).
- Después de estas ejecuciones solo se ajustó CSS para evitar el recorte del texto
  del selector y alinear su título, y se añadieron dos etiquetas inglesas al diccionario.
  Revisión posterior en Chrome, 1460×940 y 390×844, español/inglés, selección de
  ambos mapas y teclado; capturas finales revisadas. Tres pruebas de idiomas
  correctas en [la comprobación final de traducción](../qa/modular-map-select/i18n-final.tap).
  [Informe y huellas CSS/traducciones](../qa/modular-map-select/menu/report.json).
- Documentación, diff y huellas de fuentes/logs verificados; fixtures y QA
  históricos intactos. [Comprobación final](../qa/modular-map-select/final-checks.json).

Fase 4 aceptada localmente. Emulación móvil y almacenamiento remoto simulado;
no se probó contra Supabase real. Sin push, merge ni despliegue. La aceptación
no certifica todavía los datos ni la cartografía de Sudamérica.

## Siguiente paso

Iniciar fase 5: contrastar el paquete Sudamérica v3.3 con los contratos actuales,
importar su definición versionada y preparar su layout, aplicando la referencia
visual de cruces del usuario. Verificar rutas, billetes, ferris, dobles y selección
antes de las pruebas de balance que realizará el usuario. Conservar Europa y
Laboratorio como regresiones; integrar con el trabajo de vagones mediante un
cambio revisado cuando corresponda.

## Entrega conjunta

Integrada y publicada con Sudamérica. Los resultados anteriores describen cada
corte aislado; la aceptación conjunta y el despliegue están en
[la entrega final](south-america-release.md) y [producción](../production.md).

# Arquitectura existente

Tablero principal exclusivamente Three.js; SVG conserva interacción y mapas de detalle;
Google Auth tiene implementación opcional; el catálogo comercial continúa pendiente.
Evidencia, integración y límites en [la ficha del tablero](work/board-3d.md).

## Organización del monorepo

| Carpeta | Responsabilidad |
| --- | --- |
| `frontend/` | HTML, estilos, navegador, Three.js y assets originales. |
| `backend/` | Transporte HTTP/WebSocket, composición, fachada `Engine`, bots, identidad y almacenamiento. |
| `shared/` | Datos públicos de Europa, paleta/lobby, tiempos permitidos, idiomas y formato de replay usados en ambos entornos. |
| `game/` | Dominio, aplicación, consultas, validación de mapas y adaptadores extraídos. Dominio/aplicación siguen sin depender del navegador o del transporte. |
| `scripts/`, `tests/`, `supabase/`, `docs/` | Herramientas, verificaciones, migraciones SQL y contexto documental. |

El [arranque raíz](../server.js) delega en [backend/server.js](../backend/server.js).
`npm start`, Render y Docker conservan un proceso. `STATE_FILE` mantiene su
significado y el archivo predeterminado sigue en la raíz del repositorio,
independientemente del directorio de trabajo. No hay paquetes ni instalaciones
separados todavía.

[public-assets.js](../backend/public-assets.js) traduce una lista explícita de URLs
públicas a archivos de `frontend/`, los módulos públicos de `shared/` y Three.js
instalado. `/app.js`, `/data.js`, `/assets/...` y las rutas de navegación no cambian.
Las carpetas físicas no se publican; dominio, credenciales y almacenamiento quedan
fuera de esa lista. Se conservan MIME, CSP, `no-store` y `nosniff`.

`Engine` y los puentes de `game/compat` siguen siendo la adaptación al formato
legado; moverlos no termina la abstracción de mapas. `app.js` aún coordina gran
parte de la interfaz. Los siguientes cortes se definen por responsabilidades,
sin convertir cada función en un archivo ni añadir buses o repositorios genéricos.

## Definición versionada de Europa

[Europa v1](../shared/maps/europe-v1.js) es la fuente de topología y billetes:
`schemaVersion: 1`, `id: europe`, `version: "1"`. Declara ciudades con nombre,
corredores, vías con ID explícito/longitud/color/túnel/ferri y billetes con
puntos y tipo. No contiene coordenadas ni propiedad. Sus arrays y objetos
están congelados; reordenar una definición no redefine las identidades.

[createMapCatalog](../game/maps/catalog.js) comprueba esquema, IDs únicos por
colección, extremos válidos, corredores coherentes sin duplicar pares de
ciudades, cantidades enteras y red conectada. Rechaza campos de estado/layout.
Guarda copias inmutables por la pareja exacta `(id, version)`; `get` rechaza
referencias inválidas y versiones desconocidas. `validateMapForRules` comprueba
colores, puntos por longitud y capacidades de túnel/ferri. Esta porción de reglas
no sustituye todavía el reglamento completo ni valida el reparto inicial.

[backend/maps.js](../backend/maps.js) registra Europa; el motor comprueba al
resolver un contexto que sus reglas soportan esa definición. La [fachada de datos](../shared/data.js)
obtiene red y billetes del mismo módulo mediante [un puente fijo](../shared/maps/europe-legacy-v1.js):
`eu-route-051` mantiene el número 51 sin depender de la posición del registro.
La tabla conserva también el orden anterior de billetes y ciudades, necesario
para reproducir repartos y mantener la API del navegador. Sus coordenadas son
las de `CITIES` legado; [map-layout.js](../frontend/map-layout.js) aún contiene
la composición del tablero europeo.

El navegador recibe `/maps/europe-v1.js` y `/maps/europe-legacy-v1.js` antes de
`/data.js`. El validador, el registro, los contextos y el reglamento del backend
son privados. El lobby sigue creando Europa con su formato anterior; no hay
selección de mapa por sala. Alcance y aceptación en [fase 4](work/modular-platform-maps.md).

### Contexto por partida en la fachada

`createEngine({maps})` permite componer un motor con un catálogo explícito; la
exportación habitual de [engine.js](../backend/engine.js) conserva la API anterior
y usa el catálogo registrado. [match-context.js](../backend/match-context.js)
resuelve cada partida por `mapRef` y `rulesRef`, parejas exactas `{id,version}`.
Comparte definiciones/proyecciones inmutables y crea copias separadas para las
vías, mazos y manos de cada partida. El contexto no depende de identidad de
objeto: sigue resolviéndose después de JSON y en otra instancia del motor.

[europe-classic-v1.js](../backend/rules/europe-classic-v1.js) reúne los valores
existentes de reparto, pagos, dobles, túneles, estaciones, destinos, cartas,
relojes y puntuación bajo `europe-classic@1`. Es el único reglamento soportado;
no hay cargador genérico de reglas externas. Cualquier mapa registrado puede
usarlo si satisface colores, longitudes y mecánicas. Antes de sortear, la creación
comprueba que alcance la cantidad de billetes largos/cortos para los participantes.

`newGame(..., {random,mapRef,rulesRef})` y las opciones finales de `newRandomGame`
admiten esas referencias. Toda partida nueva lleva `schemaVersion:1`, `mapRef`
y `rulesRef`; los valores predeterminados son Europa v1 y `europe-classic@1`.
Al pedir una referencia explícita, la otra toma su valor inicial conocido.
Referencias incompletas, inválidas o desconocidas producen error, sin recurrir
a Europa. Los repartos congelados siguen coincidiendo al retirar únicamente
esos tres campos añadidos; la fixture histórica no se reescribió.

Construcción y ambas resoluciones de túnel buscan con `routeById`, por igualdad
estricta: reordenar vías no cambia el objetivo; el número `0` y la cadena `"0"`
son distintos. Europa mantiene números mediante su tabla fija; otros mapas
conservan IDs opacos y corredores. Estaciones/textos usan las ciudades del
contexto; las políticas reciben sus reglas. El estado mutable aún conserva las
filas legadas con topología, dueños y billetes, usadas por scoring y consultas.

Los exports `ROUTES`, `TICKETS`, `CITIES`, `COLORS`, `SCORE`, duraciones y `pay`
siguen siendo compatibilidad europea para consumidores pendientes de migrar.
Las vistas públicas aún no incluyen referencias de mapa. Bots, sala, archivo,
replay y frontend no están habilitados para un segundo mapa: las pruebas de
contexto ejercitan el motor directamente y no certifican ese recorrido completo.

### Estado versionado y restauración durable

[match-state.js](../game/compat/match-state.js) implementa la primera versión
del estado persistido sobre las filas legadas: cabecera explícita y validación
contra el contexto, sin convertir aún la propiedad a una tabla separada.
Es independiente de `version:2` del manifiesto local, `schema_version:1` del RPC,
la revisión de checkpoint/sala, `schemaVersion:1` del archivo de replay y
`uiVersion:9` de las vistas. No requiere cambios SQL ni de protocolo público.

`Engine.restoreState(game)` devuelve una copia validada y con cabecera. Acepta
estados actuales y dos formas sin versión: Europa sin referencias y el formato
transitorio con ambas referencias exactas. Solo añade la cabecera después de
validar contenido; no infiere mapas por ciudades ni convierte IDs. Una versión
de estado presente pero desconocida, o v1 sin referencias, se rechaza. Los
estados de Europa conservan números incluso en arrays reordenados.

La validación comprueba red completa sin IDs duplicados, extremos y atributos de
vía conforme a la definición, dueños/puestos, billetes de mazos/manos/ofertas y
su unicidad activa, ciudades/estaciones, túneles pendientes y referencias de
eventos, asignaciones, recorridos y resultados guardados. También exige la forma
básica necesaria para reanudar. No recalcula puntos anteriores ni certifica todo
el historial de jugadas o el balance de un mapa.

`server.restoreLoaded` prepara todas las partidas y comprueba que sus puestos
coincidan con los miembros de sala antes de instalar ninguna. Después ajusta el
tiempo de ausencia y normaliza los formatos antiguos de reloj/resultado. El
primer checkpoint habitual confirma la migración junto con el historial. Un
error interrumpe la carga antes de bootstrap/commit, conservando el estado
durable. Archivo y remoto comparten esta frontera; rollback usa las copias ya
versionadas del último checkpoint, sin volver a migrar ni extender relojes.

Los envoltorios locales conocidos siguen siendo array, `{rooms,archive}` y
manifiesto v2. Una versión de envoltorio desconocida falla explícitamente y no
recurre a un respaldo anterior. La recuperación de corrupción física/JSON con
`.bak` conserva su comportamiento. El replay no llama a `restoreState`: solo los
pasos nuevos incorporan la cabecera dentro del estado de auditoría, manteniendo
los frames/hashes previos y sus vistas. Contrato en [historial](history-replay.md).

## Recorrido de una jugada

Navegador → mensaje WebSocket → sesión/puesto y validación del servidor →
caso de uso de jugada humana → motor de reglas → persistencia atómica de sala y archivo → vista filtrada para cada jugador
→ renderizado. La animación representa una acción aceptada; no la confirma.
Los túneles conservan en `pending` su etapa, vencimiento y tiempos congelados;
`Engine.deadlines` alimenta la alarma de sala y excluye ofertas pausadas. Los
controladores de bots esperan revelación/resultado; las simulaciones de estrategia
avanzan un reloj virtual para recorrer las mismas etapas sin esperar tiempo real.

La sala guarda `timing` y lo copia al iniciar el motor. El servidor valida
los tres valores, permisos y persistencia antes de publicarlos; un fallo de
guardado restaura también estos ajustes. UI 9 expone `timing` y la duración
de cada oferta para las barras. Los plazos los calcula solo el motor.

El menú flotante y los steppers reutilizan el mismo estado en escritorio y
móvil. La cámara reserva una franja izquierda para los iconos, sin descontar
su altura completa al mapa. Los sonidos de pluma son locales y la firma
se reproduce una vez al confirmar el ACK del comando de selección.
La sala separa opciones generales y tiempos; sus grupos responden al ancho del
panel con container queries. El pie de inicio conserva su espacio mientras el
contenido puede desplazarse en alturas pequeñas. Marcar/desmarcar billetes usa
una envolvente continua; la firma conserva la secuencia de trazos original.

Las cuatro métricas de cada jugador usan la vista pública del motor, incluido
`handCount`; no se reciben manos rivales para contar cartas. `playerAvatar` y
los estilos comunes de `.player-avatar` mantienen las proporciones del símbolo
en panel, historial, resultados y clasificación, aunque cambie el círculo.

`GameUI.urgentClock` selecciona el plazo propio activo bajo cinco segundos;
`updateClockSound` lo consulta una vez por actualización, fuera del recorrido
de elementos visuales. Deduplica cada segundo del plazo y sintetiza clics
alternos. Excluye ofertas pausadas por túneles y turnos sin decisión, además
de silencio, pestaña oculta, desconexión, guardado pausado, piloto automático,
espectadores y replay. No modifica plazos ni recupera sonidos omitidos.

## Mapa de componentes

| Responsabilidad | Código y puntos de entrada |
| --- | --- |
| HTTP, WebSocket, salas, credenciales, despachar y confirmar acciones | [server.js](../backend/server.js): `dispatch`, `persist`, `sendRoom` |
| Huella estable del contenido de un comando | [command-fingerprint.js](../game/infrastructure/command-fingerprint.js): `fingerprintAction` |
| Coordinación de jugadas humanas y respuesta compatible | [player-action.js](../game/application/player-action.js): `createPlayerActionHandler`; [legacy-action-reply.js](../game/compat/legacy-action-reply.js): `actionReply` |
| Vencimientos y jugadas automáticas | [automatic-play.js](../game/application/automatic-play.js): `createAutomaticPlay`; [composición legada](../game/compat/legacy-automatic-play.js): `createLegacyAutomaticPlay` |
| Preparación de sala, solicitud de checkpoint y vistas encoladas | [room-stage.js](../game/application/room-stage.js): `createRoomStager`; [checkpoint.js](../game/application/checkpoint.js): `createCheckpointHandler` |
| Confirmación conjunta en archivo o remoto | [checkpoint-committer.js](../game/infrastructure/checkpoint-committer.js): `createFileCheckpointCommitter`, `createRemoteCheckpointCommitter` |
| Fachada de reglas, fases, efectos, cierre y privacidad | [engine.js](../backend/engine.js): `newRandomGame`, `action`, `expire`, `finish`, `view` |
| Políticas de pago y decisión de construcción | [payment.js](../game/domain/payment.js): `planPayment`, `reservePayment`; [route-claim.js](../game/domain/route-claim.js): `decideRouteClaim`, `blocksParallelRoute` |
| Transiciones de túnel y comienzo/avance de turno | [tunnel.js](../game/domain/tunnel.js): `beginTunnel`, `decideTunnel`, `advanceTunnel`; [turn.js](../game/domain/turn.js): `planTurnStart`, `planNextTurn` |
| Preparación de recursos, reparto y elecciones de destinos | [setup.js](../game/domain/setup.js): `prepareGame`; [destinations.js](../game/domain/destinations.js): `decideInitialChoice`, `planOffer`, `decideOfferChoice`, `randomSelection` |
| Barajado y muestreo con generador suministrado | [random.js](../game/domain/random.js): `shuffle`, `sampleIndexes` |
| Robo de cartas, reciclado y renovación del mercado | [train-cards.js](../game/domain/train-cards.js): `decideTrainDraw`, `drawCard`, `recycleDiscards`, `refillMarket`, `canDrawMore` |
| Costes de estación y asignación conjunta de vías prestadas | [stations.js](../game/domain/stations.js): `decideStation`, `canBuildStation`, `assignStations` |
| Conectividad, caminos de destino y recorrido más largo | [network.js](../game/domain/network.js): `connected`, `connectionPath`, `longestTrail` |
| Puntuación, clasificación y desglose | [scoring.js](../game/domain/scoring.js): `scoreMatch`, `rankResults`, `resultDetails`, `destinationDetails`; [puente legado](../game/compat/legacy-scoring.js) |
| Lobby, estado y grabación con proyección común por puesto | [authorized-views.js](../game/queries/authorized-views.js): `createAuthorizedViews`; [composición legada](../game/compat/legacy-authorized-views.js) |
| Acceso al historial y proyección de replay guardado | [history-queries.js](../game/application/history-queries.js): `createHistoryQueries`; [replay-view.js](../game/queries/replay-view.js): `projectSummary`, `projectReplay` |
| Vistas copiadas por puesto e historial filtrado | [match-view.js](../game/queries/match-view.js): `projectMatch`, `historyEntryView` |
| Restauración y normalización explícita de partidas antiguas | [engine.js](../backend/engine.js): `restoreState`, `normalize`; [match-state.js](../game/compat/match-state.js); [legacy-timing.js](../game/compat/legacy-timing.js): `planTiming`; [legacy-scoring.js](../game/compat/legacy-scoring.js): `completeResults` |
| Definiciones y validación de mapas | [catálogo](../game/maps/catalog.js), [composición registrada](../backend/maps.js), [Europa v1](../shared/maps/europe-v1.js) |
| Fachada pública de datos, paleta e IDs numéricos anteriores | [data.js](../shared/data.js), [puente europeo](../shared/maps/europe-legacy-v1.js) |
| Valores permitidos de relojes y defaults compartidos | [game-timing.js](../shared/game-timing.js): `valid`, `normalize` |
| Relojes, desconexiones y recuperación | [game-clock.js](../backend/game-clock.js), [multiplayer.js](../backend/multiplayer.js) |
| Práctica y políticas de bots | [practice.js](../backend/practice.js), [practice-bot.js](../backend/practice-bot.js), [practice-planner.js](../backend/practice-planner.js), [practice-tactics.js](../backend/practice-tactics.js), [practice-search.js](../backend/practice-search.js), [bots.js](../backend/bots.js) |
| Estado local y hash de credenciales | [room-store.js](../backend/room-store.js): `serializableRoom`, `loadRooms`, `saveRooms` |
| Checkpoint remoto y autoridad única | [supabase-store.js](../backend/supabase-store.js), [SQL](../supabase/001_active_games.sql) |
| Orden y confirmación durable | [durable-queue.js](../backend/durable-queue.js) |
| Conexión, interfaz y efectos del navegador | [app.js](../frontend/app.js), [index.html](../frontend/index.html) |
| Navegación, directorio y perfil responsive | [shell.js](../frontend/shell.js), [shell.css](../frontend/shell.css), [shell-icons.js](../frontend/shell-icons.js) |
| Listado público y bots persistentes | [room-directory.js](../backend/room-directory.js), [room-bots.js](../backend/room-bots.js) |
| Cálculos de presentación y lobby | [game-ui.js](../frontend/game-ui.js), [lobby-ui.js](../shared/lobby-ui.js) |
| Escena 3D, textura cartográfica y piezas instanciadas | [board-3d.js](../frontend/board-3d.js): `createBoard3D`, `update`, `resize`, `dispose` |
| Familias de vagones por color, geometrías y acabados | [wagon-models.mjs](../frontend/wagon-models.mjs): `wagonStyle`, `wagonParts`; [wagon-renderer.js](../frontend/wagon-renderer.js): `createWagonRenderer` |
| Proyección ortográfica compartida con objetivos SVG | [board-camera.js](../frontend/board-camera.js): `view` |
| Geometría visual, curvas y etiquetas | [map-layout.js](../frontend/map-layout.js): `createNetwork`, `pointAt`, `placeLabels` |

## Casos de aplicación

`createPlayerActionHandler` recibe motor, `now`, `random`, `fingerprintAction`,
`storagePaused` y `stageRoom`. Opera sobre la sala legada y un puesto autenticado por el servidor;
el sobre interno contiene `commandId`, `expectedRevision` y `action`. No recibe
el socket ni toma contexto de ejecución del mensaje del cliente.

Comprueba partida/ID, duplicados, vencimiento multijugador, control y revisión;
ejecuta la jugada y prepara revisión/recibo antes de llamar a `stageRoom`.
Las elecciones privadas conservan validación por estado/oferta y la ventana de
deduplicación sigue siendo de 128 IDs por puesto. Los recibos nuevos incluyen
una huella de la acción, con compatibilidad para los IDs legados descrita abajo.
Devuelve `accepted`, `duplicate` o `rejected`; no expone una vista ni estado del
motor. `actionReply` conserva el protocolo ACK/error, incluidos los mensajes
legados de excepciones del motor. Las excepciones del puente de infraestructura
se propagan al despachador.

`stageRoom` se implementa con `createRoomStager`, ensamblado como `sendRoom` en
servidor. Coordina preparación, solicitud de checkpoint y vistas por puertos
separados. `false` indica almacenamiento pausado; `true` puede ser solo
preparación pendiente de commit remoto. El resultado se envía por `peer.send`
dentro del `dispatch` existente: su outbox espera el commit global y descarta la
respuesta si falla. La aceptación del caso de uso nunca sustituye esa confirmación.
Autenticación, límites de solicitudes y autorización de espectadores siguen en
transporte. Detalle y trabajo pendiente en [fase 3](work/modular-platform-application.md).

### Recibos de comandos

`member.actionIds` conserva el orden de los últimos 128 IDs aceptados;
`member.actionReceipts` añade `{id, fingerprint}` únicamente para los comandos
aceptados por la implementación nueva. La pertenencia al miembro de esa sala
acota el recibo a partida/puesto; una revancha crea miembros nuevos. Se calcula
la huella antes de ejecutar, y se registra después de una acción exitosa junto
con el incremento de revisión. Acciones rechazadas o sin ID no crean recibos.

`fingerprintAction` está inyectado en aplicación; su adaptador usa SHA-256 con
prefijo `sha256-json-v1:` sobre el JSON de `{action}`. Ordena claves de objetos
recursivamente y conserva orden de arrays, tipos y todos los campos del payload,
incluso los que el motor no utiliza. No incluye ID ni revisión: esta última es
una precondición para una acción nueva, no la identidad de una ya aceptada.
La codificación persistida tiene una prueba de valor conocido; cambiarla exige
un lector compatible o una migración explícita.

| Solicitud dentro de la ventana | Resultado |
| --- | --- |
| ID nuevo | Pasa controles de reloj, control y revisión; si se acepta, añade ID y huella. |
| ID con huella y misma acción | ACK de duplicado; no vuelve a ejecutar ni consumir azar. El orden de claves o una revisión distinta no lo convierten en una acción nueva. |
| ID con huella y otro contenido | `COMMAND_ID_CONFLICT`, antes de vencimientos y sin preparar guardado, historial o vistas. No expone acción anterior ni huella. |
| ID legado sin huella | Conserva ACK por ID aunque el payload difiera; no inventa una huella a partir del reintento. |

Un duplicado no renueva su posición en la ventana. Al aceptar un comando nuevo
se descartan juntos IDs y huellas que salen de los 128; un ID fuera de esa ventana
se trata como solicitud nueva y debe pasar los controles actuales. La confirmación
sigue siendo del checkpoint completo: la serialización local/remota incluye las
huellas y los snapshots de rollback las copian. Un fallo restaura revisión,
recibos e historial juntos. Los formatos JSON/RPC existentes admiten este campo
opcional sin cambiar su versión. Las vistas de lobby/partida y los frames de
replay no contienen los recibos.

`createAutomaticPlay` coordina vencimientos, jugadas de bots permanentes,
reemplazos, bots de práctica y cierre anticipado de práctica. Recibe motor,
políticas de bot, reloj, dos fuentes de azar (política y motor), mensajes y
`stageRoom`. No importa transporte, almacenamiento, temporizadores ni reloj
global. `legacy-automatic-play.js` ensambla esas dependencias con `Engine`, las
políticas existentes, traducciones y azar criptográfico. La fachada del motor
todavía conserva dependencias ambientales internas, por ejemplo al reciclar
cartas directamente durante el cierre; esto no convierte todo `Engine` en puro.

Los controladores conservan temporizadores, conexión/ausencia, pertenencia de
sala y entrada a `dispatch`; delegan la coordinación de jugadas en aplicación.
`multiplayer.js` también conserva transferencia de anfitrión, recuperación del
control y desplazamiento de plazos durante ausencias. El reloj normaliza partidas
y consulta su próximo plazo antes de programar el siguiente despertar.

| Entrada automática | Revisión y preparación conservadas |
| --- | --- |
| Reloj o vencimiento previo de reemplazo | Incrementa una vez si hubo avance; prepara con `automatic=true`. |
| Bots permanentes | Primero vence plazos; si avanzó, termina. En otro caso ejecuta los puestos pendientes, incrementa por puesto y prepara una vez con `automatic=true`. |
| Bots de práctica | Primero vence plazos; si avanzó, termina. Agrupa elecciones pendientes o ejecuta una jugada. Prepara sin incremento de revisión ni marca automática en esta entrada. |
| Reemplazo | Después del vencimiento comprueba el control; una acción válida incrementa y prepara con `automatic=true`. Sin acción espera al plazo normal. |
| Cierre de práctica | Libera un túnel sin pagar, resuelve ofertas y puntúa una vez; prepara sin incrementar revisión. |

El reloj compartido sí incrementa revisión al vencer una práctica: se conserva
la diferencia respecto al temporizador de sus bots. Práctica mantiene separado
el reloj de ausencia del reloj de jugada; su azar de política también determina
la demora de 800–1000 ms, sin sustituir el azar del motor. Permanentes/reemplazos
mantienen 900 ms. El reemplazo conserva el reporte de excepciones de su acción
y preparación; los otros casos las propagan al despachador. La cola durable,
los committers y los adaptadores de recuperación conservan confirmación e historial.

## Preparación, confirmación y publicación

`createRoomStager` comprueba que la sala siga en el repositorio, actualiza
actividad si corresponde, reconcilia el ciclo de vida, normaliza el motor y
captura historial. Luego solicita `checkpoint.persist()`, encola vistas, programa
temporizadores y encola directorio. Si la reconciliación elimina la sala, termina
sin otro checkpoint ni vistas. Si el almacenamiento ya está pausado, omite la
captura/guardado y conserva las vistas de recuperación.

`createCheckpointHandler` actualiza `savedAt` de las salas persistentes y usa
un committer para preparar y confirmar el lote. En archivo es síncrono: tras
confirmar se recuerda el estado para rollback; un fallo restaura ese estado y
marca pausa antes de construir las vistas. En remoto, `persist()` solo marca la
transacción como modificada. Al terminar el trabajo síncrono, la cola global
invoca `checkpoint.commit()` una vez, con todos los cambios acumulados.

| Puerto implementado | Contrato de transición |
| --- | --- |
| `repository.get(code)`, `repository.values()` | El `Map` de salas existente satisface el puerto; conserva identidad mutable y búsqueda por código. Todavía no es el repositorio objetivo por `matchId`. |
| `committer.prepare(repository)` | Produce `{rooms, archive}` sin escribir ni aceptar historial. Copia los DTOs persistibles de sala, incluidos revisión y recibos; excluye sockets, tokens sin hash y salas de práctica. |
| `committer.commit(batch)` | Guarda conjuntamente sala e historial y solo después acepta el historial pendiente. Es síncrono para archivo; devuelve promesa para remoto. |
| `queueViews`, `queueDirectory` | El transporte obtiene DTOs de las consultas autorizadas y serializa los mensajes. `peer.send` los entrega en archivo o los retiene en el outbox remoto hasta el commit. |

El lote local contiene el archivo completo preparado, con frames ya confirmados
compartidos como datos inmutables: no se copian ni serializan de nuevo. El lote
remoto copia solo los registros/pasos nuevos. Las prácticas se excluyen de
`rooms`, pero su historial participa en ambos lotes. Los formatos físicos siguen
siendo el manifiesto/prefijo JSONL local y la RPC atómica remota. `saveRooms` y
`store.save` siguen disponibles como entradas compatibles; el nuevo adaptador
utiliza `saveCheckpoint` con DTOs preparados.

La preparación y confirmación de un lote pertenecen a la misma operación
serializada; no se intercalan nuevas mutaciones de aplicación. Supabase mantiene
ID de commit, reintento del mismo cuerpo y exclusión de escritores. Un error
remoto restaura runtime/historial y descarta el outbox; un error de entrega tras
confirmar no revierte datos guardados. No se introducen escrituras por partida
en paralelo. Los snapshots de rollback, sesiones y envío efectivo aún viven en servidor/cola;
las proyecciones se consultan mediante el módulo común descrito a continuación.

## Consultas autorizadas

`createAuthorizedViews` reúne los DTOs de lobby, estado y grabación. Recibe motor,
reloj, capacidad, política de visibilidad y normalización de ajustes como
funciones; `legacy-authorized-views.js` ensambla las dependencias existentes.
No normaliza la partida, cambia plazos, guarda ni envía mensajes. El servidor
resuelve el puesto autenticado y comprueba que la sala admita espectadores antes
de consultar; la proyección valida el rango del puesto, pero no autentica una
sesión por sí sola.

El lobby publica miembros mediante una lista explícita de campos. Solo el
transporte puede suministrar el token del destinatario; la consulta no extrae
credenciales del resto de la sala. `state` añade revisión/pausa al resultado de
`Engine.view`; la vista pública compone siempre `safePublic` para ocultar destinos
y préstamos privados del resultado final. El sobre de recuperación conserva su
forma anterior. Todos los objetos devueltos quedan separados del estado fuente.

`recording` usa el mismo filtro por puesto y elimina `serverNow` antes de grabar.
`match-archive.js` conserva captura, diferencias, hashes y almacenamiento, y
expone `list`/`replay` como puentes a `createHistoryQueries`. Este caso de consulta
recibe la identidad verificada y un repositorio de lectura con dos operaciones:
`records(identity, id)` aporta metadatos/reclamaciones; `frames(id, steps)` carga
los pasos remotos solo después de comprobar propiedad, visibilidad, cierre,
versión y permiso de auditoría. Los frames locales ya cargados se reutilizan como
entrada, sin modificarlos.

`replay-view.js` proyecta resúmenes y reconstruye las vistas guardadas; no ejecuta
el motor ni adapta frames antiguos. Listado, eventos, acciones y auditoría son
copias: su consumidor no puede modificar el archivo ni sus hashes. Las respuestas
conservan permisos y formato: participantes de una partida cerrada acceden a todas
sus perspectivas; terceros solo al replay público. El contrato de identidad,
acceso y datos publicados está en [historial/replay](history-replay.md).

## Extracción gradual del dominio

`engine.js` conserva las firmas públicas de `pay` y `block`, pero delega sus
políticas al dominio. Al construir, proyecta las vías como definiciones sin dueño
y pasa la propiedad separada por ID; `decideRouteClaim` devuelve un plan o un
rechazo estructurado. La paleta, puntuación y umbral de dobles son dependencias
explícitas. El núcleo admite IDs opacos y no importa constantes de Europa.

Las políticas de túnel reciben las cartas reveladas, el tiempo y duraciones
explícitos. Calculan suplemento, pago conjunto, etapas y reanudación de ofertas.
Las de turno planifican el reloj, espera por billetes, rotación y última ronda.
Devuelven cambios sin modificar el estado ni consultar reloj o azar globales.

`prepareGame` recibe billetes y reglas de reparto, prepara mazos/manos y recursos
de jugadores. Las políticas de destinos validan elecciones, generan ofertas con
su duración y separan lo conservado de lo devuelto. Los descartes iniciales salen
de juego; los posteriores vuelven al mazo corto. `randomSelection` conserva el
muestreo sin reemplazo usado en vencimientos. El azar se recibe como función;
la fachada lo usa también para completar el mercado inicial.

El quinto argumento opcional `{random}` de `newGame`/`newRandomGame` controla
reparto y mercado. El tercero de `newRandomGame` conserva el sorteo exclusivo del
primer puesto. `finish(g, true, {random})` permite reproducir las elecciones al
forzar el cierre. Ningún generador queda serializado; los llamadores existentes
siguen usando `crypto.randomInt` por defecto.

Las políticas de estaciones reciben ciudades, costes, mano y ocupación. La
consulta de disponibilidad usa la misma decisión que construir. La asignación
de préstamos optimiza todos los destinos conjuntamente y conserva la primera
solución óptima en orden de mapa. La red usa IDs por identidad y cuenta cada vía
una sola vez en el recorrido más largo, aunque se repitan ciudades.

`scoreMatch` calcula totales, bonos, desempates y desglose sin modificar el estado.
Recibe puntos de rutas, bono de estaciones, Express y orden de desempate.
`legacy-scoring.js` adapta `n`/`p` a `length`/`points` y separa dueños de las vías;
al devolver resultados conserva el formato legado y las referencias de billetes.
`resultDetails` explica totales/asignaciones guardados sin recalcular la
clasificación: `routeAdjustment` conserva diferencias históricas de puntuación.

`train-cards.js` prepara robos, reciclado y renovación sobre una copia de las
pilas. Recibe tamaño de mercado, umbral de locomotoras, cartas por turno y azar;
devuelve pilas, carta obtenida, señal de fin de turno y evidencia de renovación.
Conserva el muestreo condicionado del mercado y su salida finita cuando no hay
cartas normales suficientes. La fachada aplica las pilas con las referencias
legadas, publica renovación antes del robo y filtra colores ocultos en `view`.
Los helpers públicos `draw`, `refill` y `recycleDiscards` mantienen sus firmas;
los límites de reciclado siguen coordinados por acciones y vencimientos.

La fachada aún comprueba fase/puesto, despacha vencimientos y
aplica los planes; emite historial/eventos y conserva el formato de guardados.
`awardRoute` comparte la adjudicación entre construcción, túnel pagado y túnel
sin suplemento. `ensureTiming` mantiene su firma y aplica el plan de compatibilidad
de relojes; `normalize` añade el completado explícito de resultados guardados.
[legacy-errors.js](../game/compat/legacy-errors.js) convierte los errores extraídos
a los mensajes existentes. El suplemento se calcula sobre una copia de la mano
tras reservar la base, antes de gastar cualquier carta.

`view(game, seat, {now})` delega a `projectMatch`: selecciona campos autorizados y
copia toda la proyección, sin referencias mutables a la partida. `now` es opcional
en la fachada y obligatorio en el módulo de consulta, que no lee el reloj global.
Leer no añade detalles ni adapta plazos. El servidor normaliza al restaurar salas
de archivo/remotas y antes de persistir/publicar; el motor lo hace antes de
comandos/vencimientos, el reloj antes de programarse y el archivo antes de captar
un paso nuevo. Los snapshots de rollback ya provienen de estados normalizados.
Los llamadores que cargan partidas guardadas directamente deben usar la copia de
`restoreState(game)`, ajustar la ausencia cuando corresponda y ejecutar
`normalize(game, now)` antes de consultar. No se restauran ni normalizan frames históricos.
`safePublic` sigue siendo el filtro adicional de destinos finales para espectadores.

El registro y los contextos descritos arriba ya resuelven mapas en el motor;
los otros consumidores siguen utilizando el formato legado europeo. Las políticas extraídas
no convierten en puro todo el motor: el ensamblado de la partida, aplicación de
efectos y coordinación de vencimientos/cierre aún residen en la fachada.
Alcance y pruebas en
[la fase de dominio](work/modular-platform-domain.md).

## Límites que deben conservarse

- Node sirve frontend y backend juntos. El cliente usa HTML/CSS/JS y SVG;
  Three.js `0.187.0` se importa localmente bajo demanda al mostrar la vista previa o
  entrar en una partida. Se fija con `package-lock.json`; no hay CDN ni framework. El servidor solo expone los
  dos módulos ES necesarios de Three, mediante rutas explícitas.
- `syncBoard3D` reduce la vista autorizada a propietarios de rutas, colores
  y estaciones públicas. La escena no recibe manos, destinos,
  credenciales ni el estado del motor. No abre conexiones.
- La cámara tiene inclinación fija de 25,7°, sin órbita ni física. Su proyección
  afín mantiene alineados los objetivos SVG y el plano XY de Three. Gestos,
  foco, selección y pagos conservan sus manejadores existentes de `app.js`.
- El plano usa `CanvasTexture` con cartografía y guías de `RailMap`. Casillas
  libres, marcas de túnel/ferri, círculos de ciudad, vagones y estaciones son
  mallas instanciadas con profundidad. SVG conserva objetivos transparentes y texto.
  Las bandas de propiedad y conexión son dos lotes de geometría sobre el suelo,
  con color/opacidad por ruta y cortes en tramos prestados; quedan bajo las piezas.
- Las etiquetas SVG se compensan en ambos ejes para mantenerse horizontales y
  de tamaño legible. `placeLabels` admite prioridades, posiciones previas,
  longitud máxima de guía y ocultación de colisiones; estas opciones son optativas
  y solo se activan en 3D. Foco/selección preceden a destinos y secundarios.
- Mano, cartas, menús, pagos y mapas de detalle conservan HTML/SVG 2D.
  Protocolo UI 7 añade miniaturas del historial y eventos `market_refresh` con
  las cinco cartas públicas anteriores y nuevas. El cliente anima la renovación
  durante 940 ms (fundido de 180 ms con movimiento reducido), bloqueando solo los
  robos locales mientras se muestra. Una actualización más reciente, cambio de
  tamaño, ocultación o desconexión cancela el efecto y restaura la mesa vigente.
  La reconexión no repite eventos antiguos; los robos normales no esperan animación.
  El sonido `shuffle` depende del evento fresco `market_refresh`, no de la
  animación ni de la visibilidad del panel. Una única fuente de audio contiene
  la recogida, barajado y reparto, por lo que M cancela toda la secuencia.
  Los túneles usan `sharedTunnel` (protocolo UI 8): la etapa y los tiempos vienen
  del motor. El cliente dibuja las cartas por timestamp y no puede cerrar ni
  adelantar la secuencia. La ruta se adjudica al resolver, nunca antes de revelar.
  El modal mantiene reserva, revelación, decisión y resultado; el desglose separa
  base, extra y total. El motor guarda el extra cobrado y la marca de inicio del
  resultado. El cliente anima el pago y los vagones o la devolución de la base;
  al reconectar sitúa el efecto en el tiempo transcurrido, sin reiniciar el plazo.
  Ocultar, redimensionar o desconectar cancela las copias volantes y deja el
  resumen estático; movimiento reducido conserva el mismo resultado sin vuelos.
  El color de los vagones del modal se asigna por CSSOM, respetando la CSP.
  `animateConstruction` traslada las matrices de las piezas aceptadas durante
  500 ms; los eventos existentes evitan repeticiones al reconectar. Solo renderiza
  continuamente durante esa caída, con cancelación/restauración al ocultar,
  redimensionar o desconectar y respeto de movimiento reducido.
- El resaltado principal entrega a Three solo IDs de rutas, extremos y estaciones
  de la selección autorizada del cliente. Atenúa el contexto y conserva los mismos
  vagones y colores; `destinationSpotlight` solo contiene etiquetas e indicadores,
  sin clonar vagones/estaciones SVG. No entrega manos ni billetes al renderizador.
- Los 21 colores seleccionables tienen una familia propia; jade lleva Vivienda
  e índigo Circo; blanco lleva Midsommar Express. Hongos, Cristales y Confitería se retiraron. Rosa conserva su
  clave en partidas anteriores y usa Pasajeros; no se ofrece a nuevas selecciones.
  Pasajeros tiene seis composiciones: clásico, una/dos/tres personas, apoyado y
  saludo. Cabezas esféricas suaves sin rasgos faciales, cuatro peinados y cuatro
  estilos de prendas; piel/pelo/ropa se eligen independientemente en 32 conjuntos
  reproducibles. Los torsos tienen hombros suaves y cintura estrecha; sus poses
  estáticas se inclinan desde dentro de la ventana. Las piezas admiten un
  cuaternión local, reflejado al eje Y del mundo y compuesto con el giro de la
  vía en preview y tablero. Brazos por segmentos redondeados doblan el codo;
  cabeza y pelo contrarrestan la inclinación, sin animación continua ni físicas.
  Las prendas siguen la superficie del torso. Cada composición tiene también
  una decoración fija en `PASSENGER_CARRIAGES`, independiente del conjunto de
  personajes: cortinas y persiana, aperturas de ventanas, franjas, tono del techo
  y distribución de respiraderos. Las ventanas ocupadas quedan despejadas.
  Puertas de extremos, herrajes y escalones son compartidos; marcos, franjas y
  costuras repetidas se agrupan en geometrías para conservar el presupuesto.
  `wagonRouteAppearances` baraja las seis variantes por ruta y
  tanda con una semilla de código de sala/puesto/ruta; agota la tanda antes de
  repetir y evita duplicar la última con la primera de la siguiente. La longitud
  no altera el prefijo y el índice de celda determina el conjunto de personajes.
  No usa `Math.random` al renderizar ni persiste campos decorativos. Las plantillas
  de piezas se calculan una vez y se comparten entre preview y tablero. El aforo
  de instancias contempla todas las variantes; cada una respeta 70 piezas.
  El replay usa el código ya archivado; el suavizado se limita a los personajes.
  El modelo
  depende del propietario, nunca de cartas pagadas ni color de la ruta. No hay
  reglas de carga. Modelo, pintura y acabado son dimensiones separadas, aún sin
  selector de cosméticos ni catálogo comercial. `wagonStyle` conserva el amarillo
  legado y permite un modelo seguro por defecto para colores desconocidos.
  `PLAYER_PALETTE.color` conserva las claves persistidas; `paint` cambia solo
  la presentación: `#ddaf40` → ámbar/grano, `#b88929` → amarillo/deportivos.
  `GameUI.playerColor` y `wagonStyle` admiten también sus tonos de presentación.
- `createWagonRenderer` agrupa piezas por geometría/material en `InstancedMesh`,
  compartidos entre colores. Los metales usan un entorno de estudio generado
  una vez, sin descargas HDR. Cargas, ventanas y ruedas conservan una huella
  acotada. El amarillo transporta dos deportivos y usa pintura normal; ya no hay
  símbolos geométricos de puesto en piezas, avatares, menús ni mapas de detalle.
  El resaltado atenúa todas las piezas. Tolvas, bloques y bobinas huecas usan
  geometrías compartidas; las bobinas separan acero satinado, capas y cinchos.
  Tablero y preview orientan la luz hemisférica al eje vertical Z.
- Midsommar Express usa [hippie-model.mjs](../frontend/hippie-model.mjs) para seis escenas
  deterministas, ropa, poses y decoración vegetal. Las actividades colocan los
  instrumentos y objetos en las manos; la pareja de baile comparte dos puntos
  de contacto en coordenadas del vagón. Poste, arco y utilería pertenecen al
  mismo lote que las personas. [wagon-people.mjs](../frontend/wagon-people.mjs) comparte
  la selección original de piel/pelo con Pasajeros, sin cambiar sus semillas.
  [hippie-geometry.mjs](../frontend/hippie-geometry.mjs) y
  [hippie-hair.mjs](../frontend/hippie-hair.mjs) combinan las 22 personas y los adornos de cada variante
  en una geometría con colores por vértice. El renderizador crea sus lotes solo
  cuando se usan; no reserva miles de instancias por personaje o prenda.
  El tablero usa detalle bajo; previews individuales de al menos 240 px usan
  alto. Ambos conservan cantidad, identidad, poses, blanco de la ropa y siluetas.
  La reflexión Y corrige también el orden de índices, sin escalas negativas de
  instancia. Un atributo por instancia aplica el mismo resaltado que al cuerpo.
  Los lotes creados durante una construcción entran en sus rangos animados,
  aterrizando con el vagón. El tamaño extra lateral y alto se verifica en su
  prueba de integración; no sustituye las huellas de las demás familias.
  La clave técnica `hippie` y los seis IDs se conservan por compatibilidad;
  el nombre visible es Midsommar Express. Contratos y evidencia en
  [la ficha de la familia](work/hippie-train.md).
- Renderizado WebGL bajo demanda y DPR máximo 2. Sin selector ni retorno a 2D;
  se ignoran preferencias/enlaces antiguos de vista. Si falla WebGL, se oculta el
  mapa y se ofrece reintentar 3D, sin modificar sala ni estado del juego.
- [wagon-preview.js](../frontend/wagon-preview.js) comparte `createWagonRenderer` con el
  tablero. El selector usa una sola escena/cámara ortográfica, lateral en escritorio, con
  capacidad para todas las variantes y centros separados 21,3 unidades: los
  enganches existentes se tocan sin superponer las carrocerías. La cámara encuadra
  el tren completo a la altura de sus laterales. `wagonVariants` aporta IDs y
  etiquetas: las seis
  composiciones de Pasajeros y de Midsommar Express, o un diseño clásico para familias aún sin variantes.
  Los ejemplos conservan un aspecto estable al volver a un color; no representan
  el orden ni los personajes exactos de una ruta. La paleta queda encima y los
  vagones se muestran conectados en una franja de 78 px de alto, sin tarjetas,
  bordes, fondos, títulos, nombres visibles, contador ni explicación. En móvil
  se dibuja solo la primera variante estable en la vista 3/4 original, con cámara
  en (24, −38, 29) mirando a (0, 0, 4), encuadre de exposición y sombra al suelo
  (hasta 600 px de ancho, o hasta 950 px de ancho y 500 px de alto para paisaje).
  `matchMedia` actualiza la cámara y el reparto visible al cambiar de tamaño;
  las variantes ocultas no se dibujan
  ni se anuncian al lector de pantalla. No hay desplazamiento horizontal.
  Los nombres visibles al lector de pantalla se conservan en `aria-label`.
  `syncWagonPreview` sigue
  el último color pulsado, también mientras la sala espera confirmación. El cliente
  envía una selección a la vez y conserva solo la última pendiente; perfil,
  almacenamiento local y miembros mantienen el color confirmado por el servidor.
  Rechazo, desconexión o fallo de guardado restauran la selección confirmada;
  no se permite iniciar mientras queda una selección pendiente. Solo existe un
  canvas de previsualización; se libera al salir del selector o jugar.
  ResizeObserver actualiza los encuadres y la distribución; no hay bucle de
  animación continuo. El modo de una pieza con cámara de exposición sigue
  disponible para catálogos QA.
- El estado completo de la partida permanece en el servidor. `view` entrega
  mano/destinos propios y datos públicos; los destinos rivales se revelan al final solo a participantes.
  `sharedTunnel` entrega evidencia pública a jugadores y espectadores; el pago
  reservado y las opciones de la mano solo están disponibles para quien construye.
- Credencial de puesto y cuenta persistente son conceptos diferentes. Actualmente
  existen enlaces privados de recuperación y hashes guardados, más cuenta opcional
  de Supabase Auth. La cuenta no aparece en vistas rivales ni sustituye el puesto.
- La cartografía visual está separada de `data.js`/`engine.js`. Three.js debe
  consumir la misma vista autorizada, sin duplicar el motor.
- La sesión de práctica es efímera, pero su archivo se conserva. Salas y grabación
  se confirman de forma atómica. En disco local, un manifiesto pequeño referencia
  el prefijo confirmado de los pasos anexados por partida; cambiar de color no
  reescribe pasos anteriores. [Historial/replay](history-replay.md) define retención,
  proyecciones, API y migración SQL.
- Supabase se usa desde Node con clave secreta, sin acceso del navegador a la
  tabla de checkpoint. RLS y permisos están definidos en SQL. Auth es un módulo
  independiente y utiliza la clave publicable y el token del propio usuario.
- Una instancia reclama la autoridad del checkpoint. La cola remota serializa
  cambios y retiene confirmaciones hasta guardar. Un fallo incierto pausa y
  requiere recuperar el checkpoint, sin sobrescribirlo con memoria antigua.

Las reglas de juego están en [dominio](domain.md); procedimientos y validaciones
están en [operación](operations.md). Revisa esos límites al cambiar transporte,
persistencia o representación del tablero.

## Planificación de práctica

`practice-planner.observe` construye una observación explícita: mano y destinos
propios, tablero, mercado, cantidades públicas y robos visibles. Las manos
y destinos ajenos solo aportan sus cantidades públicas; no se leen elementos
de los mazos, colores de robos ciegos ni detalles de túneles rivales. `practice-bot` conserva planes e inferencias de cada asiento en
un `WeakMap` privado, sin incluirlos en vistas o persistencia.

El planificador genera hasta tres caminos alternativos por destino y conserva
hasta doce redes candidatas. Evalúa la unión de tramos, el presupuesto total de
vagones y una asignación conjunta de cartas. La selección táctica añade urgencia
por bloqueos, pagos que preserven la red, reserva de túneles y horizonte de
cierre. El Express usa una búsqueda limitada a 4.000 visitas por estimación;
la puntuación real continúa calculándose exactamente en el motor.

`practice-tactics` evalúa subconjuntos iniciales de 2–4 billetes, ofertas de
nuevos destinos y estaciones. Las estimaciones de billetes nuevos usan el
catálogo público, nunca el contenido real del mazo. Las estaciones se evalúan
con una asignación compatible para todos los billetes; su préstamo también
participa en planes con vías propias todavía pendientes. `practice.js` programa
las elecciones pendientes aunque sea el turno humano o la fase `closing`.

`practice-search` compara hasta tres acciones en dos mundos hipotéticos comunes,
con hasta tres turnos propios y 48 acciones por rama (288 acciones como máximo).
Simula respuestas rivales con una política sencilla y sin búsquedas recursivas.
Las manos muestreadas respetan cantidades públicas y robos visibles recordados;
los destinos rivales son hipótesis a partir de su red. Cada rama ejecuta el motor
real sobre un estado independiente. `Engine.action` admite un RNG por acción
que abarca también reciclados/mercado, guardado temporalmente en un `WeakMap`;
la ejecución normal conserva `crypto.randomInt`. No modifica el RNG global.
Se exige una mejora sobre la decisión táctica tras penalizar el desacuerdo
entre muestras. Se omite búsqueda en elecciones obligatorias, la segunda carta
y el cierre cercano; se mantiene el control táctico de esos casos.

La comparación reproducible carga módulos y aleatoriedad aislados en
[bot-match.js](../tests/helpers/bot-match.js), incluyendo todos los barajados del
motor. Las políticas original y de primera etapa están congeladas en los helpers
de pruebas y no se cargan en producción. La política `heuristic` permite medir
la versión completa con la búsqueda desactivada. Resultado y alcance: [ficha de bots](work/practice-ai.md).

## Cuenta opcional

`account-auth.js` sirve OAuth PKCE y API HTTP de perfil con cookies cifradas
HttpOnly, renovación y logout. `account-ui.js` sincroniza nombre/color sin
publicar metadata Google. `account-seats.js` verifica prueba del puesto antes de
vincular un UUID y serializa cambios mediante la cola durable existente. El
checkpoint guarda `members.accountId`, que nunca entra en `sendRoom`/`engine.view`.

`supabase/002_identity.sql` mantiene perfiles separados de partidas y valida sesión
viva, además del usuario verificado por Node. Tabla privada con RLS y RPC de cuenta
propia; sin clave secreta para Auth. Contrato, activación y límites en
[Google Auth](GOOGLE_AUTH.md). Activación y prueba real: ver [identidad](work/identity.md).

## Inicio y directorio público

`/rooms`, `/play`, `/more` y `/profile` sirven el mismo documento; `shell.js`
administra navegación e historial sin desconectar la sala de espera. `app.js`
conserva transporte, partida y tablero. Actualizaciones del roster no cambian la
pestaña elegida. El modal de perfil confirma el guardado mediante `account-ui`
antes de cerrar; ante fallo conserva el nombre anterior.

`list_rooms` suscribe una conexión al directorio WebSocket. `room-directory`
publica solo resúmenes de salas públicas activas: código, ocupación, capacidad,
modo/mapa y nombres/colores públicos. Excluye práctica, privadas, abandonadas y
terminadas. `spectate` vincula `peer.watching`, separado de `peer.room`/puesto.
`Engine.view(game, -1)` produce la proyección pública; el servidor bloquea las
mutaciones del observador. No expone tokens ni IDs de cuenta. Al terminar, los
totales siguen siendo públicos, pero `safePublic` elimina destinos privados.

El checkpoint JSON añade `visibility`, `maxPlayers` y `members.bot`, sin migración
SQL. Ausencia de `visibility` equivale a privada. `room_settings` y `add_bot`
requieren anfitrión y sala sin iniciar. `room-bots` utiliza la política de práctica,
pero pasa por la cola durable y los mismos plazos/guardados de salas normales.
Solo conexiones humanas mantienen la sala viva; los bots y observadores no evitan
la pausa o caducidad. El rollback local restaura ajustes y composición de la sala,
y libera conexiones cuya entrada no pudo guardarse.

## Historial e idiomas

`match-archive.js` observa el motor; `replay-state.js` conserva estados/diferencias,
`history-ui.js` presenta historial y replay. `guest-identity.js` separa identidad
de navegador y puesto; OAuth reclama el historial con el perfil verificado.
`i18n.js` y `translations.js` traducen la app sin modificar datos interpolados.
Contrato y detalles de seguridad en [historial/replay](history-replay.md).

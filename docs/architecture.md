# Arquitectura existente

Tablero principal exclusivamente Three.js; SVG conserva interacción y mapas de detalle;
Google Auth tiene implementación opcional; el catálogo comercial continúa pendiente.
Evidencia, integración y límites en [la ficha del tablero](work/board-3d.md).

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
| HTTP, WebSocket, salas, credenciales, despachar y confirmar acciones | [server.js](../server.js): `dispatch`, `persist`, `sendRoom` |
| Coordinación de jugadas humanas y respuesta compatible | [player-action.js](../game/application/player-action.js): `createPlayerActionHandler`; [legacy-action-reply.js](../game/compat/legacy-action-reply.js): `actionReply` |
| Vencimientos y jugadas automáticas | [automatic-play.js](../game/application/automatic-play.js): `createAutomaticPlay`; [composición legada](../game/compat/legacy-automatic-play.js): `createLegacyAutomaticPlay` |
| Preparación de sala, solicitud de checkpoint y vistas encoladas | [room-stage.js](../game/application/room-stage.js): `createRoomStager`; [checkpoint.js](../game/application/checkpoint.js): `createCheckpointHandler` |
| Confirmación conjunta en archivo o remoto | [checkpoint-committer.js](../game/infrastructure/checkpoint-committer.js): `createFileCheckpointCommitter`, `createRemoteCheckpointCommitter` |
| Fachada de reglas, fases, efectos, cierre y privacidad | [engine.js](../engine.js): `newRandomGame`, `action`, `expire`, `finish`, `view` |
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
| Normalización explícita de partidas antiguas | [engine.js](../engine.js): `normalize`; [legacy-timing.js](../game/compat/legacy-timing.js): `planTiming`; [legacy-scoring.js](../game/compat/legacy-scoring.js): `completeResults` |
| Ciudades, rutas, billetes y paleta | [data.js](../data.js) |
| Valores permitidos de relojes y defaults compartidos | [game-timing.js](../game-timing.js): `valid`, `normalize` |
| Relojes, desconexiones y recuperación | [game-clock.js](../game-clock.js), [multiplayer.js](../multiplayer.js) |
| Práctica y políticas de bots | [practice.js](../practice.js), [practice-bot.js](../practice-bot.js), [practice-planner.js](../practice-planner.js), [practice-tactics.js](../practice-tactics.js), [practice-search.js](../practice-search.js), [bots.js](../bots.js) |
| Estado local y hash de credenciales | [room-store.js](../room-store.js): `serializableRoom`, `loadRooms`, `saveRooms` |
| Checkpoint remoto y autoridad única | [supabase-store.js](../supabase-store.js), [SQL](../supabase/001_active_games.sql) |
| Orden y confirmación durable | [durable-queue.js](../durable-queue.js) |
| Conexión, interfaz y efectos del navegador | [app.js](../app.js), [index.html](../index.html) |
| Navegación, directorio y perfil responsive | [shell.js](../shell.js), [shell.css](../shell.css), [shell-icons.js](../shell-icons.js) |
| Listado público y bots persistentes | [room-directory.js](../room-directory.js), [room-bots.js](../room-bots.js) |
| Cálculos de presentación y lobby | [game-ui.js](../game-ui.js), [lobby-ui.js](../lobby-ui.js) |
| Escena 3D, textura cartográfica y piezas instanciadas | [board-3d.js](../board-3d.js): `createBoard3D`, `update`, `resize`, `dispose` |
| Familias de vagones por color, geometrías y acabados | [wagon-models.mjs](../wagon-models.mjs): `wagonStyle`, `wagonParts`; [wagon-renderer.js](../wagon-renderer.js): `createWagonRenderer` |
| Proyección ortográfica compartida con objetivos SVG | [board-camera.js](../board-camera.js): `view` |
| Geometría visual, curvas y etiquetas | [map-layout.js](../map-layout.js): `createNetwork`, `pointAt`, `placeLabels` |

## Casos de aplicación

`createPlayerActionHandler` recibe motor, `now`, `random`, `storagePaused` y
`stageRoom`. Opera sobre la sala legada y un puesto autenticado por el servidor;
el sobre interno contiene `commandId`, `expectedRevision` y `action`. No recibe
el socket ni toma contexto de ejecución del mensaje del cliente.

Comprueba partida/ID, duplicados, vencimiento multijugador, control y revisión;
ejecuta la jugada y prepara revisión/recibo antes de llamar a `stageRoom`.
Las elecciones privadas conservan validación por estado/oferta y la ventana de
deduplicación sigue siendo de 128 IDs por puesto, sin huella de payload todavía.
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
Los llamadores que cargan partidas antiguas directamente deben ejecutar
`normalize(game, now)` antes de consultar. No se normalizan frames históricos.
`safePublic` sigue siendo el filtro adicional de destinos finales para espectadores.

No hay registro de mapas activo ni conversión de IDs de Europa todavía. Los
otros consumidores siguen utilizando el formato legado. Las políticas extraídas
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
- Los 20 colores seleccionables tienen una familia propia; jade lleva Vivienda
  e índigo Circo. Hongos, Cristales y Confitería se retiraron. Rosa conserva su
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
- Renderizado WebGL bajo demanda y DPR máximo 2. Sin selector ni retorno a 2D;
  se ignoran preferencias/enlaces antiguos de vista. Si falla WebGL, se oculta el
  mapa y se ofrece reintentar 3D, sin modificar sala ni estado del juego.
- [wagon-preview.js](../wagon-preview.js) comparte `createWagonRenderer` con el
  tablero. El selector usa una sola escena/cámara ortográfica, lateral en escritorio, con
  capacidad para todas las variantes y centros separados 21,3 unidades: los
  enganches existentes se tocan sin superponer las carrocerías. La cámara encuadra
  el tren completo a la altura de sus laterales. `wagonVariants` aporta IDs y
  etiquetas: las seis
  composiciones de Pasajeros o un diseño clásico para familias aún sin variantes.
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

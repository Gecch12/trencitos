# Arquitectura existente

Tablero principal exclusivamente Three.js; SVG conserva interacción y mapas de detalle;
Google Auth tiene implementación opcional; el catálogo comercial continúa pendiente.
Evidencia, integración y límites en [la ficha del tablero](work/board-3d.md).

## Recorrido de una jugada

Navegador → mensaje WebSocket → sesión/puesto y validación del servidor →
motor de reglas → persistencia atómica de sala y archivo → vista filtrada para cada jugador
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
| Reglas, fases, pagos, cierre y privacidad | [engine.js](../engine.js): `newRandomGame`, `action`, `expire`, `finish`, `view` |
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
  de instancias contempla todas las variantes; cada variante de Pasajeros normales respeta 70 piezas.
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
- Midsommar Express usa [hippie-model.mjs](../hippie-model.mjs) para seis escenas
  deterministas, ropa, poses y decoración vegetal. Las actividades colocan los
  instrumentos y objetos en las manos; la pareja de baile comparte dos puntos
  de contacto en coordenadas del vagón. Poste, arco y utilería pertenecen al
  mismo lote que las personas. [wagon-people.mjs](../wagon-people.mjs) comparte
  la selección original de piel/pelo con Pasajeros, sin cambiar sus semillas.
  [hippie-geometry.mjs](../hippie-geometry.mjs) y
  [hippie-hair.mjs](../hippie-hair.mjs) combinan las 22 personas y los adornos de cada variante
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
- [wagon-preview.js](../wagon-preview.js) comparte `createWagonRenderer` con el
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
  en (24, −38, 29), encuadre de exposición y sombra al suelo; Midsommar Express
  eleva el foco y amplía el encuadre para incluir las personas del techo
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

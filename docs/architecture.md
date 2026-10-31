# Arquitectura existente

Tablero principal exclusivamente Three.js; SVG conserva interacción y mapas de detalle;
Google Auth tiene implementación opcional; el catálogo comercial continúa pendiente.
Evidencia, integración y límites en [la ficha del tablero](work/board-3d.md).

## Recorrido de una jugada

Navegador → mensaje WebSocket → sesión/puesto y validación del servidor →
motor de reglas → persistencia de sala normal → vista filtrada para cada jugador
→ renderizado. La animación representa una acción aceptada; no la confirma.

## Mapa de componentes

| Responsabilidad | Código y puntos de entrada |
| --- | --- |
| HTTP, WebSocket, salas, credenciales, despachar y confirmar acciones | [server.js](../server.js): `dispatch`, `persist`, `sendRoom` |
| Reglas, fases, pagos, cierre y privacidad | [engine.js](../engine.js): `newRandomGame`, `action`, `expire`, `finish`, `view` |
| Ciudades, rutas, billetes y paleta | [data.js](../data.js) |
| Relojes, desconexiones y recuperación | [game-clock.js](../game-clock.js), [multiplayer.js](../multiplayer.js) |
| Práctica y políticas de bots | [practice.js](../practice.js), [practice-bot.js](../practice-bot.js), [practice-planner.js](../practice-planner.js), [practice-tactics.js](../practice-tactics.js), [practice-search.js](../practice-search.js), [bots.js](../bots.js) |
| Estado local y hash de credenciales | [room-store.js](../room-store.js): `serializableRoom`, `loadRooms`, `saveRooms` |
| Checkpoint remoto y autoridad única | [supabase-store.js](../supabase-store.js), [SQL](../supabase/001_active_games.sql) |
| Orden y confirmación durable | [durable-queue.js](../durable-queue.js) |
| Conexión, interfaz y efectos del navegador | [app.js](../app.js), [index.html](../index.html) |
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
  La máscara del túnel también retrasa la pieza 3D hasta terminar la revelación.
  `animateConstruction` traslada las matrices de las piezas aceptadas durante
  500 ms; los eventos existentes evitan repeticiones al reconectar. Solo renderiza
  continuamente durante esa caída, con cancelación/restauración al ocultar,
  redimensionar o desconectar y respeto de movimiento reducido.
- El resaltado principal entrega a Three solo IDs de rutas, extremos y estaciones
  de la selección autorizada del cliente. Atenúa el contexto y conserva los mismos
  vagones y colores; `destinationSpotlight` solo contiene etiquetas e indicadores,
  sin clonar vagones/estaciones SVG. No entrega manos ni billetes al renderizador.
- Cada uno de los 18 colores tiene un modelo propio. A la familia inspirada en
  cartas se suman grúa, vino, tractores, cemento, fruta, flores y lancha. El modelo
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
  tablero, con capacidad de una pieza y cámara cercana. `syncWagonPreview` sigue
  el color elegido en práctica y el confirmado por el servidor en la sala. Solo
  existe un canvas de previsualización; se libera al salir del selector o jugar.
  ResizeObserver actualiza el encuadre; no hay bucle de animación continuo.
- El estado completo de la partida permanece en el servidor. `view` entrega
  mano/destinos propios y datos públicos; los destinos rivales se revelan al final.
- Credencial de puesto y cuenta persistente son conceptos diferentes. Actualmente
  existen enlaces privados de recuperación y hashes guardados, más cuenta opcional
  de Supabase Auth. La cuenta no aparece en vistas rivales ni sustituye el puesto.
- La cartografía visual está separada de `data.js`/`engine.js`. Three.js debe
  consumir la misma vista autorizada, sin duplicar el motor.
- La práctica es efímera. Las salas normales se guardan como snapshot local o
  checkpoint remoto; el checkpoint no es un archivo histórico de partidas.
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

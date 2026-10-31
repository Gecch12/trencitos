# Arquitectura existente

Tablero principal exclusivamente Three.js; SVG conserva interacción y mapas de detalle;
Google Auth y catálogo comercial siguen fuera de esta implementación.
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
| Práctica y políticas de bots | [practice.js](../practice.js), [practice-bot.js](../practice-bot.js), [bots.js](../bots.js) |
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
- El plano usa `CanvasTexture` con cartografía y guías de `RailMap`. Los huecos
  de rutas y sus marcas de túnel/ferri siguen SVG; vagones, ruedas, tejados y
  estaciones son mallas instanciadas. Las ciudades no se imprimen en la textura.
- Las etiquetas SVG se compensan en ambos ejes para mantenerse horizontales y
  de tamaño legible. `placeLabels` admite prioridades, posiciones previas,
  longitud máxima de guía y ocultación de colisiones; estas opciones son optativas
  y solo se activan en 3D. Foco/selección preceden a destinos y secundarios.
- Mano, cartas, menús, pagos, destinos y resultados conservan HTML/SVG 2D.
  La máscara del túnel también retrasa la pieza 3D hasta terminar la revelación.
  La caída animada de construcción 2D no se reproduce en 3D.
- Cada color de jugador tiene un modelo inspirado en las cartas; marrón toma
  troncos, gris piedra, y dorado/magenta/turquesa amplían la familia. El modelo
  depende del propietario, nunca de cartas pagadas ni color de la ruta. No hay
  reglas de carga. Modelo, pintura y acabado son dimensiones separadas, aún sin
  selector de cosméticos ni catálogo comercial. `wagonStyle` conserva el amarillo
  legado y permite un modelo seguro por defecto para colores desconocidos.
- `createWagonRenderer` agrupa piezas por geometría/material en `InstancedMesh`,
  compartidos entre colores. El oro usa reflexión metálica con un entorno de
  estudio generado una vez, sin descargas HDR. Cargas, ventanas y ruedas
  conservan una huella acotada. El dorado transporta dos deportivos; ya no hay
  símbolos geométricos de puesto en piezas, avatares, menús ni mapas de detalle.
  El resaltado atenúa todas las piezas.
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
  existen enlaces privados de recuperación y hashes guardados, sin login Google.
- La cartografía visual está separada de `data.js`/`engine.js`. Three.js debe
  consumir la misma vista autorizada, sin duplicar el motor.
- La práctica es efímera. Las salas normales se guardan como snapshot local o
  checkpoint remoto; el checkpoint no es un archivo histórico de partidas.
- Supabase se usa desde Node con clave secreta, sin acceso del navegador a la
  tabla. RLS y permisos están definidos en SQL. Esto no implementa Supabase Auth.
- Una instancia reclama la autoridad del checkpoint. La cola remota serializa
  cambios y retiene confirmaciones hasta guardar. Un fallo incierto pausa y
  requiere recuperar el checkpoint, sin sobrescribirlo con memoria antigua.

Las reglas de juego están en [dominio](domain.md); procedimientos y validaciones
están en [operación](operations.md). Revisa esos límites al cambiar transporte,
persistencia o representación del tablero.

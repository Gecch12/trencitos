# Arquitectura existente

Alcance: checkout actual; mapa SVG. Google Auth, catálogo comercial y Three.js
son trabajos futuros, descritos en [las fichas](work/README.md).

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
| Geometría visual, curvas y etiquetas | [map-layout.js](../map-layout.js): `createNetwork`, `pointAt`, `placeLabels` |

## Límites que deben conservarse

- Node sirve frontend y backend juntos. El cliente usa HTML/CSS/JS y SVG; no hay
  framework ni dependencia externa de runtime en la base actual.
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

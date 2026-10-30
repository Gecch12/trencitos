# Rail Routes Europa — beta visual privada v0.5

Juego ferroviario multijugador web **no oficial**, para 2 a 5 jugadores. Incluye rutas, billetes y mecánicas de la versión base europea; el arte es propio y simplificado. No está afiliado a Days of Wonder ni Asmodee. No se distribuyen ilustraciones oficiales.

## Uso local para pruebas

Requiere **Node.js 20 o superior**. No hay dependencias externas.

```bash
npm test
npm start
```

Abre `http://localhost:3000` en tu navegador. Para probar con otro jugador abre una ventana privada y únete mediante el código mostrado; para otros dispositivos, utiliza un servidor accesible desde la red.

## Flujo de partida

1. El anfitrión crea sala, comparte enlace y espera 2–5 jugadores.
2. El anfitrión indica quién visitó más países europeos para iniciar.
3. Cada jugador elige al menos 2 de sus 4 billetes iniciales.
4. En cada turno: dos cartas de tren (salvo locomotora visible), construir ruta, sacar destinos o colocar estación.
5. Una vez activada la última ronda, todos juegan una vez más, incluido el jugador que la activó. Se calculan destinos, estaciones y ruta más larga.

## Arquitectura

- `data.js`: 47 ciudades, 101 rutas, 40 billetes ordinarios y 6 largos.
- `engine.js`: reglas deterministas y puntuación, ejecutadas exclusivamente por el servidor.
- `server.js`: servidor HTTP + WebSocket sin dependencias; salas privadas, validación de turnos, tokens de reconexión, difusión de vistas específicas por jugador.
- `index.html`, `style.css`, `app.js`: interfaz responsive con mapa SVG original.
- `tests/`: pruebas del reglamento y de red, además de simulaciones de partidas completas.

Las cartas del mazo y los billetes de los contrincantes **no** se envían a los navegadores. Las sesiones se guardan en un archivo JSON local configurable; por defecto `room-state.json`, fuera del paquete de distribución. Una sala inactiva caduca en 24 horas.

## Despliegue de prueba (similar a compartir un enlace)

Se necesita un **servicio Node con WebSockets**, como Railway, Render o Fly.io. No basta con publicar el HTML en Netlify sin backend.

- Publica estos archivos en un repositorio **privado**.
- Configura el comando de inicio `npm start` o utiliza el `Dockerfile`.
- Permite que la plataforma asigne la variable `PORT`.
- Configura HTTPS/WSS (normalmente proporcionado por la plataforma).
- Usa un volumen persistente para `STATE_FILE=/data/rooms.json`; sin almacenamiento persistente, un reinicio o despliegue puede perder las partidas.
- El enlace público será una URL HTTPS para crear salas e invitar amigos. Los códigos de sala permiten entrar solo hasta empezar; los participantes se reconectan con un token guardado en ese navegador.

**No es necesario instalar software en los dispositivos de los invitados.**

## QA y limitaciones

Ejecuta `npm test` para revisar las reglas y la red. Ver `QC.md`.

Esta versión se entrega como **candidata de pruebas privadas**, no como versión oficialmente certificada ni desplegada. Falta una prueba de aceptación manual completa con 2–5 dispositivos físicos, además de pruebas de carga prolongadas y revisión de accesibilidad. La cartografía SVG es una representación funcional propia, no un facsímil artístico del tablero original. Se recomienda usarla únicamente en círculos privados y gestionar permisos si alguna vez se pretende distribución pública.

### Fuentes de verificación

- Reglamento inglés de *Ticket to Ride: Europe* (edición 2015): `https://games-for-you.oozmi-cdn.com/products/db57155a-6ffe-45e5-ad38-93b0ee738d8a/pdfs/ticket-to-ride-europe_rulebook_en.pdf`
- Datos de red y tipos de ruta estudiados: `https://github.com/rkdarst/board-game-networks/blob/master/data/ticket-to-ride/europe.yaml`
- Comprobación de destinos: `https://github.com/leonsi7/ticket-to-ride-europe/blob/main/destinations.csv`


## Despliegue gratis en Render

1. Crea un repositorio **privado** en GitHub y sube el contenido de esta carpeta (incluido `render.yaml`).
2. En Render → New → Blueprint, conecta el repositorio y aplica el Blueprint.
3. Verifica que el servicio esté en plan **Free** y espera a que `/healthz` responda.
4. Comparte el enlace HTTPS generado. El anfitrión crea una sala; el resto se une desde su propio navegador.

**Limitaciones del plan gratuito:** Render suspende el servicio tras 15 minutos sin tráfico entrante, incluyendo mensajes WebSocket. Cada reinicio o redeploy pierde archivos locales; por tanto, **una partida puede perderse**. No uses este despliegue para partidas que deban sobrevivir a reinicios sin antes incorporar almacenamiento persistente externo. Los códigos de sala no implican acceso autenticado; evita publicar el enlace ampliamente.

## Interfaz v0.5

- Mapa como elemento principal, zoom hasta 300% y modo ampliar a pantalla.
- Etiquetas de ciudades reforzadas, rutas coloreadas con mayor contraste y selección visible.
- Puntuaciones y vagones en barra compacta; botones móviles para saltar entre mapa, cartas y construcción.
- Motor de reglas y protocolo de sala idénticos a v0.4.

- Durante una sala abierta, los navegadores envían un mensaje de mantenimiento cada 3 minutos para evitar la suspensión por inactividad. Esto no impide reinicios de Render ni sustituye almacenamiento persistente.

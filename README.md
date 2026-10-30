# Ferrovía Europa — beta privada v0.6.1

Juego ferroviario multijugador web **no oficial**, para 2 a 5 jugadores. Incluye rutas, billetes y mecánicas de la versión base europea; el arte es propio y simplificado. No está afiliado a Days of Wonder ni Asmodee. No se distribuyen ilustraciones oficiales.

## Uso local para pruebas

Requiere **Node.js 20 o superior**. No hay dependencias externas.

```bash
npm test
npm start
```

Abre `http://localhost:3000` en tu navegador. Para probar con otro jugador abre una ventana privada y únete mediante el código mostrado; para otros dispositivos, utiliza un servidor accesible desde la red.

## Sala de pruebas con bots

Pulsa **Ir a sala de pruebas**, debajo de **+ Crear sala**, para comenzar como primer jugador frente a tres bots. Elige tus billetes iniciales y juega normalmente. Los bots eligen dos billetes automáticamente; durante la partida construyen una ruta aleatoria cuando pueden pagarla y, en caso contrario, roban cartas de fuentes aleatorias legales. No toman nuevos destinos ni colocan estaciones. Cada acción automática se separa entre 800 y 1000 ms, incluida la segunda carta y la decisión de pagar o desistir de un túnel.

El panel **Controles de prueba** aparece abajo a la izquierda, separado de la interfaz del juego y sobre sus diálogos. Arrástralo desde su encabezado con el ratón, o enfoca el encabezado y usa las flechas del teclado. **Terminar partida de pruebas** detiene los bots inmediatamente y muestra la puntuación actual como cierre anticipado. **Volver al inicio** elimina la sala y permite crear otra prueba.

Estas salas son privadas y temporales: no admiten invitados, no se guardan en disco y se pierden al reiniciar el servidor. Al desconectarte los bots se pausan; puedes volver con el mismo navegador en menos de 30 segundos para continuar. Si no vuelves, la sala se elimina. Leer sin hacer clic o dejar la pestaña en segundo plano no cuenta como desconexión.

`npm test` comprueba las decisiones de los bots, partidas completas simuladas, tiempos y limpieza de salas con un reloj simulado, y la integración real por WebSocket.

## Mapa y selección de destinos (escritorio)

El tablero se encaja completo, sin barras de desplazamiento internas y con agua en el espacio sobrante. Con el puntero dentro del mapa, la rueda acerca o aleja alrededor del cursor; al ampliar, arrastra con el botón izquierdo para desplazarte. **Encajar** restablece la vista completa. **Ampliar** utiliza el mismo comportamiento; pulsa Escape para salir. Fuera del mapa, la rueda desplaza la página normalmente.

La cartografía está compuesta a mano en `map-layout.js`, separada del reglamento. Las 300 casillas tienen las mismas dimensiones; cada una gira siguiendo la curva de su vía. Las rutas dobles mantienen carriles separados, los túneles tienen bordes dentados, y las casillas obligatorias de ferri contienen una locomotora. Una ruta ocupada muestra vagones del color del jugador. Los nombres mantienen 13 píxeles de pantalla al cambiar el zoom y se colocan evitando otras etiquetas; cuando deben alejarse de su ciudad, una línea fina conserva la asociación.

Los billetes se comparan en un único mapa con la red ferroviaria atenuada. Cada opción tiene un número y un color estables (amarillo, rojo, azul y verde). Los destinos seleccionados muestran sus ciudades y una línea discontinua que las une: no es un recorrido obligatorio. Pasar el cursor o enfocar una opción con el teclado permite previsualizarla sin seleccionarla. Las ciudades compartidas muestran varios anillos de color.

Se requieren al menos dos billetes iniciales y uno al robar destinos durante la partida. Las actualizaciones de estado no reinician las casillas elegidas. `npm test` incluye la regresión de confirmar nuevos destinos y continuar con los turnos siguientes. El desarrollo y la verificación actuales son exclusivamente de escritorio; móvil queda fuera de alcance.

## Flujo de partida

1. El anfitrión crea sala, comparte enlace y espera 2–5 jugadores.
2. El anfitrión indica quién visitó más países europeos para iniciar.
3. Cada jugador elige al menos 2 de sus 4 billetes iniciales.
4. En cada turno: dos cartas de tren (salvo locomotora visible), construir ruta, sacar destinos o colocar estación.
5. Una vez activada la última ronda, todos juegan una vez más, incluido el jugador que la activó. Se calculan destinos, estaciones y ruta más larga.

## Arquitectura

- `data.js`: 47 ciudades, 101 rutas, 40 billetes ordinarios y 6 largos.
- `map-layout.js`: posiciones visuales, costas propias, curvas, casillas uniformes y colocación de etiquetas; compartido por el tablero y la miniatura de billetes, sin alterar las reglas.
- `engine.js`: reglas deterministas y puntuación, ejecutadas exclusivamente por el servidor.
- `bots.js`, `practice.js`: decisiones automáticas y ciclo de vida de las salas temporales de pruebas.
- `server.js`: servidor HTTP + WebSocket sin dependencias; salas privadas, validación de turnos, tokens de reconexión, difusión de vistas específicas por jugador.
- `index.html`, `style.css`, `app.js`: interfaz de escritorio con mapa SVG original.
- `assets/cards/*.svg`, `assets/ticket.svg`, `assets/favicon.svg`: ilustraciones vectoriales originales de las cartas, billetes y marca Ferrovía. `make_assets.py` permite regenerarlas.
- `tests/`: pruebas del reglamento y de red, además de simulaciones de partidas completas.

Las cartas del mazo y los billetes de los contrincantes **no** se envían a los navegadores. Las salas multijugador se guardan en un archivo JSON local configurable; por defecto `room-state.json`, fuera del paquete de distribución. Una sala multijugador inactiva caduca en 24 horas. Las salas de pruebas se mantienen solo en memoria.

El servidor funciona en una única instancia Node.js. Valida el origen de las conexiones WebSocket y rechaza tramas fragmentadas o con bits reservados. Comprueba las conexiones multijugador cada 25 segundos y cierra las que no responden durante más de 70 segundos, conservando su asiento para reconexión. Las salas con bots usan su propio control de desconexión y limpieza.

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

Las pruebas de cartografía verifican dimensiones y orientación de las casillas, ausencia de superposiciones, separación respecto a ciudades ajenas, límites del mapa y colocación de etiquetas en tamaños de escritorio. El servidor también verifica la entrega del nuevo recurso de cartografía: al actualizar desde una versión anterior, reinicia `npm start` y recarga el navegador.

Esta versión se entrega como **candidata de pruebas privadas**, no como versión oficialmente certificada ni desplegada. Falta una prueba de aceptación manual completa con 2–5 dispositivos físicos, además de pruebas de carga prolongadas y revisión de accesibilidad. La cartografía SVG es una representación funcional propia, no un facsímil artístico del tablero original. Se recomienda usarla únicamente en círculos privados y gestionar permisos si alguna vez se pretende distribución pública.

### Fuentes de verificación

- Reglamento inglés de *Ticket to Ride: Europe* (edición 2015): `https://games-for-you.oozmi-cdn.com/products/db57155a-6ffe-45e5-ad38-93b0ee738d8a/pdfs/ticket-to-ride-europe_rulebook_en.pdf`
- Datos de red y tipos de ruta estudiados: `https://github.com/rkdarst/board-game-networks/blob/master/data/ticket-to-ride/europe.yaml`
- Comprobación de destinos: `https://github.com/leonsi7/ticket-to-ride-europe/blob/main/destinations.csv`


## Despliegue gratis en Render

1. Crea un repositorio **privado** en GitHub y sube el contenido de esta carpeta (incluidos `render.yaml`, `assets` y los módulos del mapa y de pruebas).
2. En Render → New → Blueprint, conecta el repositorio y aplica el Blueprint.
3. Verifica que el servicio esté en plan **Free** y espera a que `/healthz` responda.
4. Comparte el enlace HTTPS generado. El anfitrión crea una sala; el resto se une desde su propio navegador.

**Limitaciones del plan gratuito:** Render suspende el servicio tras 15 minutos sin tráfico entrante, incluyendo mensajes WebSocket. Cada reinicio o redeploy pierde archivos locales; por tanto, **una partida puede perderse**. No uses este despliegue para partidas que deban sobrevivir a reinicios sin antes incorporar almacenamiento persistente externo. Los códigos de sala no implican acceso autenticado; evita publicar el enlace ampliamente.

## Interfaz Ferrovía v0.6.1

- Mapa como elemento principal, zoom hasta 300% y modo ampliar a pantalla.
- Etiquetas de ciudades reforzadas, rutas coloreadas con mayor contraste y selección visible.
- Puntuaciones y vagones en barra compacta.
- Cartas SVG ilustradas y billetes debajo del tablero; mercado y construcción en el lateral.
- Botón **Invitar** durante partidas multijugador; las salas con bots siguen siendo privadas para su creador.
- Descripción explícita del coste de cada ruta, incluidos los requisitos de locomotoras de los ferris.
- Botón para pasar cuando se agotan cartas y destinos; el servidor comprueba que no quede otra acción legal.
- Las pruebas cubren ferris, túneles y rutas dobles, además del mapa y del flujo con bots.

- Durante una sala abierta, los navegadores envían un mensaje de mantenimiento cada 3 minutos para evitar la suspensión por inactividad. Esto no impide reinicios de Render ni sustituye almacenamiento persistente.

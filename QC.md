# QC / Prepublicación — 30 octubre 2026

## Resultado: candidata de preproducción; no publicada

| Verificación | Resultado |
| --- | --- |
| Datos | 47 ciudades, 101 rutas, 46 destinos (40+6) |
| Reparto y mazo | 110 cartas; 4 iniciales por jugador; 5 visibles |
| Número de jugadores | 2, 3, 4 y 5; salas rechazan un sexto |
| Cartas y destinos secretos | Comprobado en pruebas del motor y servidor |
| Reglas de robo | Locomotora visible, dos cartas, robo a ciegas |
| Rutas | Longitud/color, dobles, ferris, túneles y pago extra |
| Estaciones | Costes 1/2/3, ciudad única y elección única de vía prestada |
| Puntuación | Rutas, billetes +/−, estaciones, ruta continua más larga y empates |
| Final | Cada jugador, incluido desencadenante, recibe turno adicional |
| Reunión online | Creación, invitación, inicio, controles de turno y reconexión |
| Partidas automáticas | 12 partidas completas (3 por cada cantidad de jugadores) |
| Pruebas automatizadas | 24/24 aprobadas — `npm test` |
| UI | Render Chromium: 101 rutas, 47 ciudades, lobby móvil, cambio de pago, 0 excepciones JS |

**Limitaciones explícitas**

- Las pruebas de interfaz Chromium se ejecutaron con transporte simulado porque el navegador de pruebas bloquea las navegaciones a servidores locales. Las pruebas reales de WebSocket se ejecutaron aparte desde el cliente WebSocket de Node.
- No se ha completado todavía una partida humana en 5 navegadores/dispositivos físicos.
- No hay hosting HTTPS público ni DNS configurado en esta entrega.
- En un hosting sin volumen persistente, los estados pueden perderse al reiniciar.
- El tablero es una representación funcional redibujada; sus proporciones no son idénticas a las del producto comercial.

**Recomendación de aceptación antes del enlace público:** ejecutar partida humana de principio a fin con 2 personas y una partida corta dirigida de 5 personas cubriendo ferris, túneles, estaciones, reconexión móvil y cierre. Repetir pruebas tras cada cambio de reglas.


## Visual v0.5 — comprobaciones realizadas

- Aplicación abre sin excepciones JavaScript en una prueba de navegador con estado de partida simulado.
- 101 grupos de ruta y 47 etiquetas de ciudad renderizados en escritorio y móvil.
- Selección SVG de una ruta actualiza su descripción.
- Zoom 100% → 125% en escritorio y 240% → 265% en móvil; modo ampliado activado y desactivado.
- Controles móviles de salto a mapa, cartas y construcción incluidos.
- Reglas del motor y salas inalteradas; se añadió intercambio `ping/pong` para conexión activa.

**No completado:** prueba manual en dispositivos reales con conexión de red ni prueba de pérdida de conexión o reinicios en Render. La captura visual de QA usa un estado simulado; no prueba infraestructura remota.

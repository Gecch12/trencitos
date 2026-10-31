# Correcciones táctiles — 31 de octubre de 2026

## Alcance

Selección y deselección de billetes → acción WebSocket → conservación por el
servidor → actualización de la mano de destinos. También navegación del mapa,
gestos y distribución compacta, sin cambios en reglas, tiempos ni persistencia.

Pruebas locales en `localhost:3011` con salas desechables del helper
`tests/helpers/responsive-preview.js`. No se modificaron partidas de producción.
Chrome con eventos táctiles del protocolo del navegador; no sustituye una
prueba en Safari/iPhone físico.

## Fallos reproducidos y correcciones

- Antes: el primer movimiento transfería la captura del elemento SVG al visor;
  `lostpointercapture` del hijo se propagaba y cancelaba el arrastre. Después:
  se ignora esa transferencia, se captura una sola vez al empezar a arrastrar
  y se termina únicamente el puntero correspondiente.
- Antes: foco/hover podían seguir resaltando un billete desmarcado. Después:
  previsualización solo con ratón; el foco de teclado indica navegación, no
  selección. Touch modifica casilla, contador y mapa inmediatamente.
- La lista de destinos propios y la comparación de destinos existentes ponen
  pendientes primero. La oferta nueva no se reordena; sus índices de envío se
  conservan. Colores y números del comparador no cambian al ordenar.

## Evidencia del flujo completo

| Límite | Resultado observado |
| --- | --- |
| UI táctil | Cuatro toques consecutivos sobre el mismo billete: 1 → 0 → 1 → 0; confirmación deshabilitada con cero |
| UI → servidor | Oferta `[30, 23, 17]`; se confirmó únicamente el índice original `2` |
| Servidor → UI | Destinos antes `[2, 8, 12, 15, 16, 18, 21, 25]`; después se añadió solo `17` y desapareció la oferta |
| Selección inicial | Partida nueva a 320 × 568, cero seleccionados; marcar/desmarcar vuelve a cero; índices 0 y 2 conservaron exactamente los IDs 43 y 37 |
| Teclado y ratón | Espacio desmarca; foco visible permanece y ruta baja a opacidad 0,25; hover real vuelve a previsualizar |
| Consola | Cero errores y avisos durante la revisión |
| Servidor | Arrancó el helper aislado; acciones y respuestas recibidas sin errores |

## Gestos y distribución

- Un arrastre continuo recorre múltiples posiciones sin levantar el dedo.
- Pellizco 100 % → 187,5 %, sin abrir menús; al soltar ambos dedos no quedan
  punteros registrados. El siguiente toque en Paris abre el menú de estación.
- Tocar el mapa descubierto activa Mapa y cierra el panel compacto. Ese primer
  toque no abre accidentalmente una ruta; los siguientes mantienen su acción.
- Capacidad de fullscreen simulada como no disponible: botón oculto. Al
  restaurar la capacidad del navegador vuelve a mostrarse.
- 320 × 568, 390 × 844 y 430 × 932: seis cartas en una fila, sin desbordamiento
  horizontal. En 320 px cada carta mide aproximadamente 45,7 px de ancho.
- 844 × 390: seis cartas en una fila, panel de 128 px de altura útil, sin scroll
  interno necesario para alcanzar el mazo.
- 768 × 1024 y 1024 × 768: se conserva el panel lateral y el mercado 3 × 2.
- 1440 × 900: se conserva la distribución de escritorio y el mercado 3 × 2.
- Cinco jugadores: puntos, vagones y estaciones visibles; los puntos son mayores.
  El SVG del avatar queda dentro del círculo también a 320 px.
- Información: círculo de 22 px dentro de un área táctil de 44 × 44 px.
- Comparador: números del mapa de 10 px CSS y marcadores de 16 px de diámetro,
  manteniendo el identificador aunque cambie la posición en la lista.

## Automatización y límites

`npm test`: **180 pruebas correctas**. Las siete nuevas regresiones cubren orden
estable, transferencia de captura, cancelación, taps frente a drag, pinch,
previsualización y disponibilidad de fullscreen. `node --check app.js` y
`git diff --check` también correctos.

Queda pendiente comprobar en un iPhone físico los gestos y la disponibilidad
real de fullscreen en el navegador usado por el jugador. No se afirma una
certificación de Safari ni se ha publicado este cambio desde estas pruebas.

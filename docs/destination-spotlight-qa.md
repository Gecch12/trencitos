# Resaltado de destinos — 31 de octubre de 2026

## Alcance

Cerrar el comparador → volver a Mapa sin previsualización residual; activar
«Resaltar mis destinos» → sombrear el tablero y señalar las ciudades de los
billetes conservados. El selector global es estado local de presentación, no
una acción de juego. ROBOS comparte tamaño e interletrado con TU MANO en la
distribución compacta.

Se usaron salas desechables en `localhost:3011` con
`tests/helpers/responsive-preview.js`, almacenamiento temporal de archivos,
Chrome y eventos táctiles nativos mediante CDP. No se tocaron Supabase ni
partidas de producción. Esto no certifica Safari ni un iPhone físico.

## Fallo reproducido

Antes, tocar un minibillete y cerrar el comparador devolvía:
`shade: true, panel: destinations, focused: 2, active: 2`.
Restaurar foco en la tarjeta encendía otra vez el sombreado.

Ahora el foco mantiene su función accesible, pero no activa previsualización.
Solo el hover real del ratón activa el resaltado temporal; abrir/cerrar ventanas
y cambiar paneles lo limpia. El modo global se conserva únicamente cuando el
usuario lo ha activado expresamente y se reinicia al salir de la sala.

## Evidencia

| Recorrido | Resultado |
| --- | --- |
| Toque en minibillete → Volver al mapa | Sombra desactivada, panel Mapa, foco en el botón Mapa |
| Cierre por × y Escape | Mismo resultado, sin destino temporal activo |
| Activar todos | 8 billetes → 14 ciudades únicas, pendientes y completadas; cero tramos resaltados |
| Abrir/cerrar comparador con todos activo | Modo global conservado; desactivar restaura etiquetas y mapa normal |
| Arrastrar y pellizcar | Modo conservado; zoom 1 → 1,8; cero punteros retenidos al terminar |
| Nuevo billete confirmado | IDs previos `[2,8,12,15,16,18,21,25]`; oferta `[19,31,10]`; se añadió solo `19`; ciudades globales 14 → 16 |
| UI → servidor | Activar el botón y navegar no envía acciones; robar/confirmar envía únicamente `draw_tickets` y `keep_tickets` con índice `0` |
| Datos → UI | Destinos conservados recibidos del servidor; conjunto de ciudades mostradas coincide exactamente con esos billetes |
| Escritorio y teclado | Hover muestra dos extremos; Enter abre; cerrar devuelve foco sin sombra; Espacio alterna el botón |
| Pantalla completa no disponible | Botón de fullscreen oculto; selector de destinos visible y operativo |
| Resultados finales | Inspeccionar un tramo apaga el modo global y muestra ese tramo; hover de destino completado conserva su conexión |
| ROBOS e información | ROBOS/TU MANO: 10 px; separación visual 4 px; círculo 22 px dentro de objetivo táctil 44 × 44 px |

Revisión visual en 320 × 568, 390 × 844, 768 × 1024 y 1440 × 900, sin
desbordamiento horizontal. Se reutiliza la colocación de etiquetas del mapa para
reducir colisiones al mostrar múltiples destinos. Los destinos fuera del visor
se indican en el borde; el botón no altera la posición ni el zoom elegidos.

Consola: cero errores y advertencias. Mano, billetes, rutas e historial sin
cambios durante la navegación visual. `npm test`: **183/183**; incluye tres
nuevas regresiones para selección global, cierre/foco y entrada ratón/touch.
`node --check app.js` y `git diff --check`: correctos.

Implementado y verificado localmente; no publicado en producción en esta tarea.

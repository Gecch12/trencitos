# Navegación compacta y sonido — 31 de octubre de 2026

## Cambios

- La navegación Mapa/Robar/Destinos/Historial y el acceso compacto Prueba
  tienen ocultación nativa en escritorio, sincronizada con el mismo breakpoint
  que distribuye los paneles. Prueba solo se ofrece en partidas de prueba.
- El control existente de sonido muestra texto de estado en escritorio y un
  icono en la vista compacta. Nombre accesible estable «Sonido» y estado
  `aria-pressed=true` cuando está activado. Se conserva la preferencia `rr-muted`.

## Verificación local

Sala QAPLAY de `tests/helpers/responsive-preview.js` en localhost:3011,
almacenamiento temporal de archivos; sin cambios en producción ni Supabase.

- Antes: con CSS responsive cargado la barra ya se ocultaba. Al deshabilitar
  únicamente esa hoja aparecía en escritorio, reproduciendo la presentación
  de la captura. Esto no confirma por qué falló la carga en el navegador del usuario.
- Después: la barra y Prueba permanecen ocultos incluso con esa hoja deshabilitada;
  el panel independiente de controles de prueba sigue accesible.
- 1920×930, 1440×900 y 1194×834: distribución de escritorio, sin barra compacta.
- 1024×768, 768×1024, 390×844 y 320×568: navegación compacta disponible, sin
  desbordamiento horizontal. Mercado, destinos e historial accesibles.
- Al volver de cada tamaño compacto al escritorio, mercado/jugadores regresan
  al lateral y destinos a la mano inferior; la barra queda oculta.
- Click → silencio → recarga: permanece «Sonido desactivado». Espacio → activar
  → recarga: permanece activado. En móvil el texto se oculta y queda el icono.
- Web Audio real en Chrome: cartas/construcción/campana produjeron 1/4/7 nodos
  acumulados; silenciar los detuvo todos. Nuevos eventos silenciados: cero nodos.
- Mano, billetes, rutas e historial no cambiaron durante las comprobaciones de
  presentación. Sin modificaciones de reglas, mensajes de juego o almacenamiento remoto.
- Consola de la última navegación: cero errores y advertencias.

`npm test`: **186/186**, con tres regresiones nuevas de visibilidad, preferencia
y bloqueo de efectos silenciados. `node --check app.js` y `git diff --check`
correctos. Revisión visual en navegador con tamaños emulados, no certificación
en dispositivos físicos. Cambios todavía locales, sin commit ni despliegue.

# Desglose visual de puntos — 2026-10-31

Flujo verificado: estado final calculado por `engine.finish` → vista pública de resultados por WebSocket → categorías del jugador → mapa, puntos y comparación. No se modificaron las reglas ni los totales.

## Pruebas

- Suite completa: **260 correctas, 0 fallos**. La primera ejecución restringida no pudo abrir puertos locales; la ejecución con autorización pasó todos los tests de integración.
- Diez pruebas nuevas de presentación: rutas exclusivas del jugador, suma de etiquetas, selección de tramos, destinos completados/fallidos, préstamos por estación, comparación exacta del recorrido más largo, empates, datos vacíos/antiguos, nombres escapados y conservación del DOM ante snapshots repetidos.
- `node --check app.js`, `node --check game-ui.js` y `git diff --check` sin errores.

## Chrome local

Servidor aislado: `PORT=3114 node tests/helpers/results-preview.js`. Usa estado temporal local y una partida determinista de cuatro jugadores; no accede a Render ni Supabase. El fixture no se sirve como recurso público.

- Escritorio nativo; emulación de 320 × 640, 390 × 844, 768 × 1024 y 844 × 390. Ancho del documento igual al viewport en todos los tamaños emulados comprobados.
- Un único mapa activo al abrir/cerrar jugadores; rutas propias y puntos flotantes reconciliados con el detalle del servidor.
- Tocar una etiqueta muestra el tramo, sus vagones y puntos. Lista textual alternativa disponible.
- Estaciones: `2 sin construir × 4`; Roma muestra exclusivamente el tramo prestado Roma–Brindisi. Destino incompleto Lisboa–Danzig muestra −20 y una línea discontinua, sin inventar vías construidas.
- Camino más largo: los cuatro jugadores aparecen ordenados; elegir Azul cambia a sus diez tramos, que suman 34 vagones. Angel muestra sus nueve tramos del recorrido de 27, no las ramas restantes de su red.
- Entrada táctil emulada: dos dedos amplían y desplazan simultáneamente; mover ambos dedos conservando su distancia mantiene la escala y cambia la posición. El arrastre con un dedo sigue funcionando al terminar el gesto.
- Flechas de teclado cambian la categoría y mantienen foco/selección sincronizados.
- Explorar mapa y volver a resultados conserva la categoría, sin duplicar mapas.
- Marco exterior con `overflow: hidden`, scroll interior independiente y acciones inferiores visibles. Sin errores ni avisos de consola.

Capturas locales: `/tmp/trencitos-results-desktop.png` y `/tmp/trencitos-results-mobile.png`.

Limitaciones: emulación de Chrome, no prueba física de Safari/iPhone. Los cambios están implementados localmente, sin publicación a producción.

## Regresión de zoom con rueda — corregida

- Reproducida en Chrome local: tras acercar con `deltaY=-650`, alejar con `deltaY=650` conservaba exactamente la escala `1.952138`. La prueba anterior no había cubierto este recorrido de ida y vuelta.
- Causa: el controlador pasaba un factor de zoom menor que 1 a un cálculo que esperaba distancias entre dedos y las limitaba a un mínimo de 1. Ahora el zoom directo tiene su propia transformación; el gesto táctil conserva sus límites y protección para dedos coincidentes.
- La cámara se actualiza antes de procesar cada evento, aunque todavía no haya ocurrido el repintado. Así, los giros rápidos no desvían el punto bajo el cursor.
- Rueda real emulada por CDP en Chrome: escala inicial `0.532020` → acercar `1.952138` → alejar `0.532020`. También permite salir del máximo (`3.192118` → `2.511009`).
- Doble clic estando ampliado y tecla Inicio/Home devuelven la vista completa y centrada. Las teclas + y − vuelven a ser reversibles. No se añadieron barras de zoom.
- Táctil emulado a 390 × 844: ampliar `0.351396` → `0.491954`, desplazar ambos dedos mantiene la escala y cambia la traslación, cerrar los dedos retorna a `0.351396`.
- Siete pruebas nuevas: anclaje del cursor, rueda en ambos sentidos, eventos sin repintado intermedio, límites reversibles, unidades de rueda, doble clic y teclado. **Suite completa: 267 correctas, 0 fallos**; sintaxis y `git diff --check` sin errores; consola de Chrome sin avisos ni errores.
- Fixture aislado en `localhost:3115`; captura tras volver a vista completa: `/tmp/trencitos-results-zoom-fixed.png`. Sin cambios de reglas, puntuaciones ni producción.

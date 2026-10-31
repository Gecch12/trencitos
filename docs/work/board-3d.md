---
{"id":"board-3d","status":"done","parent":null,"depends_on":["docs-system"],"branch":"main","delivery":"integrated","updated":"2026-10-31"}
---
# Tablero 3D y familia de vagones

Objetivo: tablero principal exclusivamente Three.js, mapa plano y piezas 3D.
Mano, cartas, paneles, etiquetas y mapas de detalle conservan HTML/SVG. Sin física
de simulador, cámara libre ni cambios de reglas. Primera integración `0177ab0`;
esta iteración retira la opción 2D, los símbolos y añade previsualización/deportivos.
Sin despliegue de producción.

## Hitos

- [x] M1: plano cartográfico y cámara ortográfica con pan/zoom.
- [x] M2: piezas, estaciones, selección/pagos y revelación de túnel.
- [x] M3: etiquetas con prioridades; teclado y móvil emulado.
- [x] M4: partida completa, reconexión y rendimiento medidos.
- [x] M5: once familias inspiradas en cartas; modelo/pintura/acabado separados.
- [x] M6: integración en `main`, preservando cambios concurrentes de bots.
- [x] M7: tablero solo 3D, sin símbolos de puesto; vista previa antes de jugar
  y plataforma dorada con dos deportivos. Validación visual y reintento WebGL.

## Implementación

[Arquitectura](../architecture.md) conserva componentes/límites y
[producto](../decisions/product-direction.md) las decisiones.
`syncBoard3D` entrega solo propietarios, colores y estaciones de la vista pública
autorizada. Selección SVG y motor conservan las reglas y privacidad.

[WAGON_STYLES](../../wagon-models.mjs) determina la familia por color de jugador,
nunca por ruta o cartas pagadas. Marrón usa troncos; gris piedra; dorado, magenta y
turquesa añaden transporte de deportivos, correo y bobinas. No hay reglas de carga.
[El renderizador](../../wagon-renderer.js) comparte geometrías y materiales en
instancias; oro con reflejos de estudio procedurales y huella acotada.

[La vista previa](../../wagon-preview.js) usa esas mismas piezas con cámara cercana:
un único canvas en práctica o sala de espera; cambio de color inmediato en práctica
y tras confirmación del servidor en sala. Se libera al ocultarla o empezar a jugar.
Las siluetas/colores y nombres identifican jugadores; se eliminaron insignias,
símbolos de casillas, textos accesibles de símbolos y medallones 3D.

El tablero ignora preferencias y enlaces antiguos de 2D. Ante fallo de WebGL,
oculta el mapa, muestra un mensaje y permite reintentar sin perder la sala.
No cambia automáticamente a otra representación. Render bajo demanda, DPR máximo 2.

## Evidencia de esta iteración — 2026-10-31

Base `5a111d2` más esta iteración y cambios locales concurrentes de bots, conservados.
Node 25.6.1, Chrome 156.0.8078.74 / Playwright 1.64.1, Apple M1 Pro / macOS 25.5.
QA en loopback 3120/3123, `STATE_BACKEND=file` y `.qa` propios. Sin producción.

- `npm test`: 306 correctas, 0 fallos en ese checkout. El fallo de privacidad de
  bots observado en la iteración anterior no se reprodujo en esta ejecución.
- `QA_PORT=3123 node tests/browser-wagons.cjs`: correcto. Once selecciones/previews,
  color confirmado en sala, escritorio/móvil sin overflow, ausencia de símbolos,
  preferencia 2D antigua ignorada, recursos estables al recargar, fallo WebGL inicial
  inducido y reintento conservando sala. [Informe](../qa/wagons-report.json).
- `QA_PORT=3120 npm run test:board3d`: correcto. Construcción y pago en salas
  equivalentes, estación por teclado/tejado elevado, túnel sin suplemento, pellizco,
  foco, reposo y recuperación de contexto. Partida normal de cuatro puestos hasta
  resultados: 249 acciones aceptadas y reconexión; sin forzar el cierre.
  [Informe](../qa/threejs-report.json).
- 225 vagones/15 estaciones: 15 llamadas de dibujo, 159.242 triángulos, 10
  geometrías, 3 texturas. Pan tras calentamiento: mediana 16,7 ms, p95 16,8 ms.
  No mide tiempo GPU ni garantiza rendimiento en otros dispositivos.
- Matriz 1460×940, 768×1024 y 390×844, zoom 0,25×/1×/6×: sin colisiones entre
  etiquetas visibles ni overflow, error de alineación < 1e-9 px.
- `node scripts/check-docs.js` y `git diff --check`: correctos.

Capturas actuales: [preview escritorio](../qa/wagon-preview-desktop.png),
[preview móvil](../qa/wagon-preview-mobile.png), [familia](../qa/wagons-catalog.png),
[tablero](../qa/threejs-desktop.png), [móvil](../qa/threejs-mobile.png),
[final](../qa/threejs-finished.png). Los archivos `threejs-m1`, `threejs-closeup` y
`threejs-mobile-detail` son históricos; las comparaciones 2D/3D anteriores están
registradas en Git antes de retirar esa alternativa.

## Límites y siguiente paso

[Calidad](quality.md) conserva pruebas en Safari/iOS, Android físico y GPU modesta,
carga inicial (Three unos 2,1 MB sin comprimir), legibilidad humana de vías paralelas
y animación de construcción: en 3D aparecen las piezas aceptadas con su sonido.
Al alejar se ocultan nombres en conflicto y se priorizan al enfocar/acercar.
Siguiente frente de producto: [identidad](identity.md); materiales/sonidos mantienen
sus fichas independientes. Este cierre local no certifica publicación remota.

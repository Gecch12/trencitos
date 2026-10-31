---
{"id":"board-3d","status":"done","parent":null,"depends_on":["docs-system"],"branch":"main","delivery":"integrated","updated":"2026-10-31"}
---
# Tablero 3D y familia de vagones

Objetivo: tablero principal exclusivamente Three.js, mapa plano y piezas 3D.
Mano, cartas, paneles, etiquetas y mapas de detalle conservan HTML/SVG. Sin física
de simulador, cámara libre ni cambios de reglas. Cambios en el checkout local
`main`; no se ha desplegado producción.

## Hitos

- [x] M1: plano cartográfico y cámara ortográfica con pan/zoom.
- [x] M2: piezas, estaciones, selección/pagos y revelación de túnel.
- [x] M3: etiquetas con prioridades; teclado y móvil emulado.
- [x] M4: partida completa, reconexión y rendimiento medidos.
- [x] M5: once familias inspiradas en cartas; modelo/pintura/acabado separados.
- [x] M6: integración en `main`, preservando cambios concurrentes de bots.
- [x] M7: tablero solo 3D, sin símbolos; preview y transporte de deportivos.
- [x] M8: carbón, piedra, bobinas, correo y mercancías con estructuras propias;
  iluminación al eje Z y encuadre de piezas altas.
- [x] M9: profundidad de vías/estaciones, bandas de propiedad, caída de piezas,
  destinos con modelos 3D y paleta amarillo/ámbar compatible con partidas guardadas.

## Implementación actual

[Arquitectura](../architecture.md) conserva componentes/límites y
[producto](../decisions/product-direction.md) las decisiones.
`syncBoard3D` entrega solo rutas públicas, colores, estaciones y los IDs del
resaltado autorizado del cliente. Selección SVG y motor conservan reglas/privacidad.

[WAGON_STYLES](../../wagon-models.mjs) determina la familia por color de jugador,
nunca por vía o cartas pagadas. Carbón usa tolva alta; piedra, bloques de cantera;
bobinas, cilindros huecos con capas/cinchos/cunas; correo, coche postal; mercancías,
contenedores acanalados. Amarillo lleva dos deportivos y ámbar lleva grano.
Las claves persistidas anteriores se conservan: solo cambia la pintura visible.
No hay reglas de carga, selector de materiales ni identidad dorada en la UI.

[El renderizador](../../wagon-renderer.js) comparte geometrías/materiales en
instancias; reflejos de estudio procedurales y huella acotada. La
[vista previa](../../wagon-preview.js) usa las mismas piezas: un canvas en práctica
(o sala, tras confirmar el color en servidor), liberado al ocultarlo o jugar.

Vías libres, túneles/ferris, círculos de ciudad, bandas, vagones y estaciones
comparten profundidad Three.js. Los nombres quedan sobre la escena. Resaltar
un destino atenúa el contexto, conserva piezas/colores reales y señala con trazos
los tramos prestados. Ya no clona dibujos SVG sobre el tablero.

Construcciones aceptadas descienden durante 500 ms; solo sus matrices se animan.
El sonido se dispara una vez al aterrizar. Túneles esperan su revelación; cargar o
reconectar no repite eventos. Movimiento reducido y cancelación muestran el
resultado final. Render bajo demanda salvo durante la animación, DPR máximo 2.
Ante fallo WebGL se oculta el tablero y se permite reintentar conservando sala.

## Evidencia M9 — 2026-10-31

Base `bc5666c` más M8/M9 locales y trabajo concurrente de bots preservado.
Node 25.6.1, Chrome 156.0.8078.74 / Playwright 1.64.1, Apple M1 Pro / macOS 25.5.
Servidores QA en loopback 3120/3123/3124, `STATE_BACKEND=file` y archivos propios.

- `npm test`: 308 correctas. Se actualizó la expectativa del color de grano.
  La primera ejecución detectó además una expectativa antigua de dos billetes
  exactos para todos los bots; la prueba ahora comprueba dos para el humano y
  entre dos y cuatro para bots. `node --test tests/server.test.js`: 19 correctas
  tras ese ajuste, sin modificar la estrategia concurrente.
- `QA_PORT=3124 node tests/browser-board-continuity.cjs`: nueve verificaciones
  correctas, sin errores. Frankfurt frente a la vía de Essen, bandas propias,
  destinos directos/prestados sin copias SVG, foco de teclado en Three, móvil
  emulado, paleta y efectos. El ajuste final de foco también pasó 34 pruebas de
  cámara/presentación/gestos (`board-3d`, `game-ui` y `mobile-ui`).
  Construcción real por WebSocket de ruta, estación y túnel: descenso continuo,
  reposo al terminar, sin repetición al reconectar; movimiento reducido inmediato.
  [Informe](../qa/threejs-continuity-report.json).
- `QA_PORT=3120 npm run test:board3d`: correcto. Pagos, selección por teclado y
  tejado, túnel, pan/zoom/pellizco, etiquetas y recuperación WebGL. Partida normal
  hasta resultados: 256 acciones aceptadas y reconexión. [Informe](../qa/threejs-report.json).
- Pan de tablero denso: mediana 16,7 ms / p95 16,8 ms entre cuadros; CPU de cámara
  1,9 / 2,1 ms, en este equipo. No mide tiempo GPU ni certifica otros dispositivos.
- `QA_PORT=3123 node tests/browser-wagons.cjs`: once previews, sala, reintento,
  recursos y 225 vagones de las cinco familias revisadas, sin errores.
  [Informe](../qa/wagons-report.json). Precede al ajuste final de uniones de bandas;
  las regresiones y la partida completa posteriores verifican el tablero final.
- `node scripts/check-docs.js` y `git diff --check`: correctos.

Capturas: [Frankfurt](../qa/threejs-frankfurt-depth.png),
[destino con coches 3D](../qa/threejs-destinations.png),
[tramo prestado](../qa/threejs-borrowed-destination.png),
[destinos móvil](../qa/threejs-destinations-mobile.png),
[amarillo](../qa/palette-auto-carrier.png), [ámbar](../qa/palette-grain.png),
[familias](../qa/wagons-refined.png) y [partida finalizada](../qa/threejs-finished.png).
M1–M7 están registrados en `0177ab0`/`bc5666c`; las capturas `threejs-m1`,
`threejs-closeup` y `threejs-mobile-detail` son históricas.

## Límites y siguiente paso

[Calidad](quality.md) conserva pruebas en Safari/iOS, Android físico/GPU modesta,
carga inicial de Three y legibilidad humana de vías paralelas. Al alejar se ocultan
nombres en conflicto y se priorizan al enfocar/acercar. Siguiente frente de producto:
[identidad](identity.md); materiales y sonidos mantienen fichas independientes.
Este cierre local no certifica publicación remota ni aceptación en equipos físicos.

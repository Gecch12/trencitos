---
{"id":"board-3d","status":"validated","parent":null,"depends_on":["docs-system"],"branch":"main","delivery":"released","updated":"2026-11-02"}
---
# Tablero 3D y familia de vagones

Objetivo: tablero principal exclusivamente Three.js, mapa plano y piezas 3D.
Mano, cartas, paneles, etiquetas y mapas de detalle conservan HTML/SVG. Sin física
de simulador, cámara libre ni cambios de reglas. Publicado desde `main` en
`16bf6c3` hasta M9; [entrega y verificación remota](../production.md).
M10 está publicada en `2a46f58`; evidencia y límites en [producción](../production.md).
M11 está publicada en `2308691`; evidencia remota en [producción](../production.md).
M12 está publicada en `bf1c5c1` junto con la navegación; evidencia remota en
[producción](../production.md).

Ampliación local de 2026-11-02: hongos/jade, cristales/índigo y confitería/rosa
llevan el catálogo del checkout a 21 familias. Implementación y evidencia en
[Controles de mesa y sala](table-controls.md); esta ampliación aún no está publicada.

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
- [x] M10: siete colores/familias adicionales, gratis: azul noche/grúa, borgoña/vino,
  oliva/tractores, marfil/cemento, coral/fruta, lavanda/flores, azul hielo/lancha.
  18 selecciones válidas; modelos compartidos por preview/tablero, sin cambiar reglas.
- [x] M11: al resaltar destinos, ocultar los nombres y guías de las ciudades ajenas
  a la selección; conservar etiquetas/números de los extremos, incluidos billetes
  completados, y restaurar los nombres habituales al desactivar.
- [x] M12: cartas sin recorte adicional, cámara sin botones de zoom/centrado,
  barra de turno y tarjetas de jugadores más compactas en móvil.

## Ajuste M12 — espacio y cartas en móvil

2026-10-31, `main` sobre `bcee9b4` más cambios locales:

- Las cartas conservan el redondeado de su SVG; se elimina el radio CSS que
  cortaba el marco. La mano móvil mantiene desplazamiento horizontal, sin barra
  que reste altura ni elevación al tocar/pasar el cursor que recorte el contador.
- Se eliminan los tres botones de cámara en móvil/escritorio y sus listeners.
  `Inicio` centra directamente; se conservan rueda, arrastre, pellizco y teclado.
  El conductor histórico de navegador usa ahora ese atajo para centrar.
- Móvil: turno de 36 px, reloj de 20 px, sin subtítulo ni «Solo tú la ves».
  Jugadores de 64 px (58 px en pantallas bajas), sin estado/etiqueta «En turno»
  duplicados. Se mantienen nombre, avatar y las tres métricas. La altura reservada
  de paneles se reduce junto con la barra para recuperar espacio útil del mapa.

Validación local, sin certificar Safari/iPhone físico:

- `node --test tests/mobile-ui.test.js tests/presentation-controls.test.js tests/turn-presentation.test.js tests/board-3d.test.js`:
  19 pruebas correctas.
- IAB en `127.0.0.1:3145`, fixture `QAPLAY` con backend de archivo aislado, cinco
  jugadores y nueve tipos de cartas: 390×844 y 375×667, cartas/contadores dentro
  de la mano, sin desbordamiento horizontal de página, métricas y mercado legibles.
  844×390 confirma alturas y ausencia de desbordamiento. En 1440×900, `+` cambia
  el encuadre e `Inicio` lo restaura exactamente; no hay botones eliminados ni
  errores/avisos de consola. El subtítulo y reloj de escritorio se conservan.
  Captura local ignorada: `.qa/compact-interface/mobile.png`.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

M12 publicada y comprobada en producción el 2026-10-31: tablero móvil/tablet,
billetes y construcción aceptada, sin errores de consola. La entrega no certifica
equipos físicos adicionales; el seguimiento continúa en [calidad](quality.md).

## Regresión con la nueva navegación

2026-10-31: los conductores `browser-threejs.cjs` y `browser-wagons.cjs` usan ahora
Create Room y el código asignado por el servidor; la selección de vagones se
verifica en la sala, dado que Play queda vacío. Ejecución local correcta:
partida completa de 231 acciones con reconexión y resultados; 18 previews y
225 piezas, cambio de color confirmado, recarga y reintento WebGL sin errores.
Los informes/capturas `qa/threejs-*` y `qa/wagons-*` corresponden a esta nueva
corrida. Alcance del inicio y matriz responsive: [navegación y salas](navigation-rooms.md).

## Ajuste M11 — etiquetas del resaltado

2026-10-31, `main` sobre `d6456c2` más cambios locales: `updateDestinationSpotlight`
oculta las etiquetas base en lugar de dejarlas al 32 % de opacidad. El overlay
conserva los extremos seleccionados; puntos, rutas, vagones y estaciones no cambian.

- `node --test tests/destination-overview.test.js tests/board-3d.test.js tests/mobile-ui.test.js`:
  18 pruebas correctas.
- IAB/Chromium, fixture `830106` en `127.0.0.1:3144`, backend de archivo aislado:
  London–Berlin completado conserva ambos nombres y números; ninguna etiqueta base
  visible mientras se resalta. Al desactivar vuelven los nombres habituales.
  Repetido a 390×844 y con zoom: mismo resultado, sin errores ni avisos de consola.
  Captura local ignorada: `.qa/destination-labels/mobile.png`.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

M11 publicada el 2026-10-31 a las 16:44:57 de Lima, tras autorización del reinicio.
Resaltar/restaurar verificado también en práctica pública; evidencia y límites en
[producción](../production.md). No quedan pasos de entrega de M11; las pruebas en
dispositivos físicos siguen en [calidad](quality.md).

## Ampliación M10

[Catálogo inicial renderizado](../qa/wagons-seven-new.png): dos toneles
con duelas y aros; tractores con neumáticos y motor; silos cónicos con escalerilla;
cajones abiertos de fruta; macetas y flores; casco de lancha, asientos y cubierta.
Todos conservan la huella y el presupuesto máximo de 70 piezas por modelo.

Revisión de grúa el 2026-10-31: la celosía horizontal resultaba poco reconocible.
Se reemplazó por pluma telescópica inclinada, pistón, polea, doble cable y bloque
rayado con gancho suspendido; cabina azul, contrapeso y estabilizadores diferenciados.
[Preview actual en el juego](../qa/wagon-crane-telescopic.png). Conserva límites de
pieza y el mismo modelo en el tablero. Pruebas de catálogo/huella correctas; 225
vagones incluyendo 45 grúas, resaltar/restaurar sin errores (29 llamadas, 464.762
triángulos, 18 geometrías; DPR 2). No reemplaza la medición histórica de FPS.

Referencias aprobadas, adaptadas sin marcas:
[grúa](https://www.techne-kirow.de/en/railway-logistics),
[vino](https://www.marklin.com/products/details/article/4432),
[tractores](https://www.marklin.com/products/details/article/46948),
[cemento](https://www.roco.cc/ren/products/coaches-and-wagons/coach-and-wagon-sets/6600180-3-piece-set-silo-wagons-cd.html),
[fruta](https://www.reynaulds.com/products/Faller/180605.aspx),
[flores](https://www.noch.com/flowers-in-pots/14031/),
[lancha](https://www.mariostrains.com/index.php?Itemid=480&option=com_virtuemart&view=productdetails&virtuemart_category_id=47&virtuemart_product_id=8244).
Fruta/flores son propuestas estilizadas basadas en cargas de miniatura.

2026-10-31, navegador IAB/Chromium local: siete selecciones muestran el modelo correcto;
225 vagones en dos grupos cubren las siete familias (27/26 llamadas, 457.202/541.172
triángulos); resaltar/restaurar conserva modelos y geometrías, sin errores de consola.
Fixture reproducible: `node tests/helpers/catalog-preview.js`, ruta local `/__catalog`.
No es una medición nueva de FPS ni una prueba en dispositivos físicos.
Suite completa `npm test`: 317 pruebas correctas, sin fallos (43,8 s).
M10 integrada y publicada junto con identidad;
la entrega histórica siguiente solo describe M1–M9.

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
y sala, liberado al ocultarlo o jugar. La selección provisional responde al clic
y se reconcilia con el servidor; la corrección de latencia local y su evidencia
están en [rendimiento del selector](wagon-preview-performance.md).

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
La publicación remota está registrada por separado; no certifica otros equipos físicos.

2026-10-31: catálogo nuevo y grúa revisada integrados en `main`, commit `2a46f58`
subido con `[skip render]`. Tras esperar la indicación del usuario, publicado y
verificado en navegador: selector, Essen–Berlin con grúas y cierre de práctica.
Evidencia de la revisión publicada en [producción](../production.md).

---
{"id":"summary-postgame-experience","status":"validated","parent":null,"depends_on":["profile-social-statistics"],"branch":"main","delivery":"released","updated":"2026-11-06"}
---
# Resumen visual y cierre con recuentos

Implementación autorizada por Ángel tras la revisión Moti del 2026-11-06.
Alcance: resumen del perfil, cierre integrado en el tablero, recuentos opcionales
y cartas de robo horizontales en escritorio/tablet. Publicado desde `main` en
`51cb1ea`; la entrega verificada se registra en [Producción](../production.md).

## Hitos y aceptación

- [x] Resumen con iconografía existente, gráficos, ayudas por hover/tap/teclado,
  navegación fija y «Mi estilo». Media de porcentajes por partida con igual peso;
  se retiran los acumulados de categorías y bonificaciones del panel.
- [x] Conservar tabla y detalle final en el área del mapa; lateral accesible,
  chat deshabilitado plegable en escritorio/tablet y desplegable en móvil. Replay
  embebido con regreso durante carga, error o cualquier paso.
- [x] Recuentos desde el desglose guardado: rutas conectadas primero, camino
  continuo por vagón y destinos por recorrido. Fichas flotantes con volumen,
  resaltado acumulado y contador; pausa, velocidad, salto, repetición y movimiento
  reducido. Resultados mantienen sombra; volver al mapa restaura cámara y modo.
- [x] Mercado horizontal en escritorio/tablet y giro a vertical al llegar a la mano;
  mantener proporciones y disposición móvil.
- [x] Completar regresión y revisión visual/documental del cambio final.

## Contratos y evidencia

El cálculo y la terminología viven en [perfil](../profile-social-statistics.md).
La consulta final y los recuentos viven en [historial/replay](../history-replay.md).
Los [pendientes sociales y competitivos](social-competitive-followups.md) conservan
ranking de habilidad, chat funcional, compartir selecciones, revancha coordinada
y análisis automático. Compras/contenido siguen en [comercio](commerce.md).
No se activó envío de mensajes ni se creó un cálculo de ranking.

Pruebas nuevas: `tests/summary-recount.test.js` y
`tests/browser-postgame-summary.cjs`, con archivo temporal y servidor local aislado.
Capturas e informes locales se conservan bajo `.qa/postgame-summary/` (ignorados
por Git). El resumen visual usa datos de prueba explícitos; la media se comprueba
por separado contra las funciones reales del servidor.

Verificación del 2026-11-06:

- `npm run test:ci`: **721/721 correctas**, sin omitidas. Los ajustes finales de
  presentación se contrastaron además con pruebas dirigidas y Chrome.
- `browser-postgame-summary.cjs`: correcto en 1440×1000, 1024×900, 820×1180,
  390×844 y 844×390; sin errores JavaScript. Comprueba sumas y resultado inmutable,
  pausa, movimiento reducido, retorno con sombra, recuperación de cámara/resaltado,
  carga/error/cancelación de replay, proyección coherente de etiquetas/3D, mercado
  horizontal, navegación fija del perfil, gráficos y ayudas en español/inglés.
- `browser-replay-analysis.cjs`, `browser-card-ui.cjs`,
  `browser-profile-social.cjs` y `browser-flow-ui.cjs`: correctos. Conservan carga
  progresiva, pasos, robos públicos/privados, renovación, pagos, túneles, detalles
  finales y flujos de perfil/amigos. Se adaptó una aserción antigua de cabeceras
  textuales a la etiqueta accesible y ayuda de la iconografía existente.
- Revisión de capturas: contador de una fila en móvil horizontal; fichas separadas
  de nombres de ciudades y otras fichas, con guía hasta el vagón. El contador
  reserva altura estable para no desalinear nombres y tablero al terminar.
- Empaquetado móvil a directorio temporal: incluye todos los módulos y CSS nuevos.
  No se modificaron proyectos nativos ni se instaló una compilación.
- `node scripts/check-docs.js`, revisión de impacto `--base HEAD` y
  `git diff --check`: correctos. Se actualizaron los contratos afectados;
  las fichas de entregas anteriores conservan su evidencia histórica.

## Refinamiento de mesa, túneles y repetición · 2026-11-06

Ángel autorizó implementar la revisión Moti completa. Se conservan todos los
cambios locales previos; durante la implementación no se reinició el servidor
de su partida. La publicación posterior se registra al final de esta ficha.

- [x] Lateral con historial compacto, títulos visibles redundantes retirados,
  chat plegable inicialmente cerrado y compositor deshabilitado sin anuncio.
  Mercado horizontal 2 × 3 y botón «Nuevos destinos» de ancho completo arriba.
- [x] «Ver mapa» durante la decisión del túnel, con «Volver al túnel», reloj y
  suplemento visibles, opción de pago conservada y sin alterar plazos/reglas.
- [x] Recuento del camino largo a 700 ms por vagón más 350 ms entre tramos;
  reparar el foco al repetir y permitir varios reinicios de jugadores sin bono.
- [x] Una sola acción «Mapa» en resultados, con navegación alineada al contenido.
  Replay fuera del lateral en escritorio/tablet y sobre la mano en móvil;
  mercado/jugadores arriba, perspectivas por avatar, sin «Vista general».
- [x] Separar la deduplicación de animaciones vivas del replay; liquidar la
  presentación de cartas si el vuelo termina, se omite o se cancela.
- [x] Completar la regresión final, revisar capturas y registrar evidencia.

Verificación final de esta ampliación (2026-11-06, Node 25.6.1 y Chrome
156.0.8078.80), con servidores y archivos temporales separados del guardado
habitual:

- `npm run test:ci`: **723/723 correctas**, sin omitidas.
- `browser-postgame-summary.cjs`: lateral compacto, chat plegable, botón de
  destinos arriba, navegación alineada, ritmo del camino largo y dos reinicios
  consecutivos de un jugador sin bonificación. Comprueba el replay integrado,
  carga/error/cancelación y retorno, ausencia de «Vista general» y desbordamientos
  en 1440×1000, 1024×900, 820×1180, 390×844 y 844×390. Capturas revisadas en
  `.qa/postgame-summary/`; controles compactados en horizontal para dejar más mapa.
- `browser-replay-analysis.cjs`: reproducción continua a **0.5×, 1×, 2×, 4× y
  8×** con identificadores de robos ya vistos en vivo; cartas públicas y ocultas
  llegan a la mano, sin presentaciones pendientes. Incluye pausa, salto,
  perspectivas, movimiento reducido y carga interrumpida. Informe en
  `.qa/replay-experience/browser/report.json`.
- `browser-tunnel-outcomes.cjs`: seis casos de pago/desistimiento/tiempo agotado.
  La decisión minimizada permite mover el mapa y consultar destinos, conserva
  el pago mixto y no cambia el vencimiento; el retorno desaparece al resolverse.
  Capturas e informe en `.qa/tunnel-outcomes/`.
- `browser-map-replay.cjs`, `browser-card-ui.cjs` y `browser-flow-ui.cjs`:
  correctos; grabaciones antiguas/actuales, controles adicionales móviles,
  perspectivas, cartas, renovaciones, pagos, túneles y resultados sin regresiones.
  Todas las suites de navegador anteriores terminaron sin errores JavaScript.
- `git diff --check` y `node scripts/check-docs.js --base HEAD`: correctos.
  Logs de esta ejecución en `.qa/table-refinements/` (ignorados por Git).

Al preparar la publicación, `browser-table-ui.cjs` detectó que «Nuevos destinos»
medía 36 px en escritorio. Se ajustó a 44 px sin alterar la disposición 2 × 3;
el recorrido completo pasó en doce tamaños/orientaciones, con `CI=true` y sin
errores de navegador. Evidencia antes/después en `.qa/table-release-2026-11-06/`.
Los paquetes se regeneraron con esa corrección. El CI de `51cb1ea` pasó completo:
723/723 pruebas Node y todos los recorridos Chrome, incluidos los tres nuevos de
personalización, cierre y repetición. [Resultado](../qa/postgame-release-2026-11-06/ci-result.json).

## Siguiente paso

Entrega completa autorizada mediante `trencitos-publicar` y verificada:
Render Live, Android 0.7.0 build 6 publicado e iPhone 0.7.0 build 7 instalado.
La revisión conjunta incluye «Mi estilo» y el diagnóstico seguro de grabaciones;
salud, revisión Live, Release e instalación constan en [Producción](../production.md).
Ángel evalúa el juego en su iPhone; no se abrió una partida en el dispositivo.
La ficha conserva `validated` mientras la dependencia de perfil siga abierta.

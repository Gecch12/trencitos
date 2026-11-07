---
{"id":"summary-postgame-experience","status":"validated","parent":null,"depends_on":["profile-social-statistics"],"branch":"main","delivery":"integrated","updated":"2026-11-06"}
---
# Resumen visual y cierre con recuentos

Implementación autorizada por Ángel tras la revisión Moti del 2026-11-06.
Alcance: resumen del perfil, cierre integrado en el tablero, recuentos opcionales
y cartas de robo horizontales en escritorio/tablet. Publicado desde `main` en
`51cb1ea`; la entrega verificada se registra en [Producción](../production.md).
La revisión posterior de los ocho puntos está validada localmente, sin publicación;
su alcance y comprobaciones se registran al final de esta ficha.

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

## Correcciones tras las capturas de uso · 2026-11-06

Ángel aprobó los ocho puntos discutidos con Moti. Trabajo directo en `main`,
conservando los cambios de CI y publicación de otro chat. No se reinicia ni se
modifica el guardado de la sesión habitual en localhost:3000.

- [x] Cabecera estable con contador reservado y botón Destinos de un tercio del
  ancho a la derecha; 34 px en escritorio y 44 px con puntero táctil. Móvil conserva
  cartas, recordatorio de segundo robo y botón sobre el mapa.
- [x] Total y medalla al aterrizar el último vagón, antes de avanzar de tramo;
  pausa de lectura, reinicio/salto sin duplicar y fichas desplazadas del ancla.
- [x] Avisos de salida neutrales, descartables y con caducidad de cuatro segundos.
- [x] Fullscreen excluido de Capacitor; mira diferenciada para reencuadrar.
  Partida terminada ofrece Volver a salas sin abandono ni bot de reemplazo.
- [x] Zoom principal hasta 12× con etiquetas acotadas y mismos gestos.
- [x] Resultados sin barra horizontal auxiliar; tabla conserva scroll directo.
- [x] Progreso de replay sin padding/borde de formulario y final en el máximo.
- [x] Historial con separadores rectos y selección que incluye avatar y agrupador
  con margen interior, en vivo y replay.
- [x] Completar regresión, revisar capturas y registrar evidencia final.

Verificación local de esta ampliación (2026-11-06):

- `STATE_BACKEND=file npm run test:ci`: **749/749 correctas**, sin omitidas.
  Incluye las pruebas deterministas nuevas del aterrizaje, pausa, salto, reinicio
  y callbacks cancelados, además de la salida final por WebSocket sin abandono.
- `browser-ui-polish.cjs`: puntos visibles durante el mismo tramo, salida final,
  aviso descartable que caduca, zoom 12×, objetivos táctiles, progreso máximo y
  fullscreen oculto al simular Capacitor. Resultados sin slider auxiliar y con
  desglose dentro del ancho visible tras desplazar las columnas. Capturas revisadas
  en `.qa/ui-polish/`; no equivale a una comprobación en dispositivo nativo.
- `browser-table-ui.cjs`: doce tamaños/orientaciones, cabecera estable con cero,
  uno y dos robos, botón de un tercio alineado a la derecha y flujos de cartas.
- `browser-postgame-summary.cjs` y `browser-replay-analysis.cjs`: correctos;
  recuentos y repetición, velocidades de 0.5× a 8×, carga/error/retorno, historial
  y barra al máximo. Capturas revisadas en `.qa/postgame-summary/` y
  `.qa/replay-experience/browser/`, sin errores JavaScript.
- Comprobadores de arquitectura y documentación, revisión documental
  `--base HEAD` y `git diff --check`: correctos.

Siguiente paso de esta ampliación: revisión de Ángel en la web local. La entrega
móvil y el despliegue siguen fuera del alcance de esta solicitud de implementación;
el servidor de su sesión no se reinició.

## Señales de controles, sala y recuento · 2026-11-06

Ángel autorizó la ampliación tras dos revisiones Moti. Se conservan los cambios
locales de chat y CI de otro chat; no se modifica su sesión en localhost:3000.

- [x] Interruptor apagado/encendido con tic y nombre accesible coherente en todos
  los tamaños; ayuda de seis segundos una sola vez al conservar destinos.
- [x] Retirar «Solo tú la ves» y el distintivo «Final» al acabar; mantener los
  avisos útiles de última ronda y elección de los últimos billetes.
- [x] Golpe de encaje al aterrizar cada paso del recuento, respetando silencio,
  pausa, salto, movimiento reducido y callbacks cancelados.
- [x] Señales distintas para incorporaciones humanas y bots manuales confirmados;
  no repetir en listas iniciales, ajustes, desplazamientos de puestos o reconexión
  del propio cliente. Una reconexión observada de otro jugador sí avisa.
- [x] Campana de hasta 700 ms con preparación del selector en paralelo. El
  servidor reserva ese intervalo antes de los 30/60/90 s de elección; reconectar
  conserva el plazo. Audio desactivado/bloqueado no detiene la transición.
- [x] Precargar el módulo del mapa desde la sala y mantener la elección utilizable
  si el primer render tarda más que la campana.
- [x] Completar regresión y registrar evidencia final.

Verificaciones de esta ampliación:

- `STATE_BACKEND=file npm run test:ci`: **764/764 correctas**, sin omitidas,
  en la ejecución final. Se actualizó el entorno aislado del test móvil para
  incluir el cierre de la nueva ayuda; no cambió el contrato de interacción.
- `browser-sound-feedback.cjs`: dos clientes con servidor/archivo temporales;
  incorporaciones y bots confirmados, cambio de ajustes, reconexión, inicio con
  silencio, reserva de tiempo, primera ayuda e interruptor en 1440, 820 y 390 px.
  Los tres recuentos producen un impacto al aterrizar y no suman sonidos en pausa
  o salto. Web Audio ausente y carga del mapa retenida no bloquean los billetes.
  Sin errores JavaScript; capturas revisadas en `.qa/sound-feedback/`.
- Síntesis offline de los cuatro efectos: entradas de 180 ms, campana de 700 ms
  e impacto de 90 ms, picos inferiores a 0,12 y señal no nula. WAV e informe en
  `.qa/sound-feedback/`; comprobación técnica, sin evaluación auditiva humana.
- `browser-table-controls.cjs` y `browser-postgame-summary.cjs`: correctos.
  Se actualizó la expectativa histórica de sala sin scroll/tipografía de 30 px
  al diseño vigente con chat y tarjetas de mapa, comprobando controles inferiores
  alcanzables, inicio fijo y ausencia de desbordamiento horizontal.
- Pruebas dirigidas de plazos, vistas autorizadas, señales, silencio y callbacks:
  correctas. WebSocket real conserva los 60 segundos completos después del inicio
  y los mismos tiempos al persistir y reconectar.

- `node scripts/check-architecture.js`, `node scripts/check-docs.js --base HEAD`
  y `git diff --check`: correctos. El estado previo de chat y CI se conserva.

Siguiente paso: revisión de Ángel en local. Para aplicar la reserva de tiempo
en nuevas partidas debe reiniciarse el backend cuando no interrumpa su sesión;
no se reinició localhost:3000, publicó ni instaló una aplicación nativa.

## Aura de descubrimiento de destinos · 2026-11-06

Ángel reemplazó el interruptor por una señal luminosa y aprobó dos oleadas
alternadas: primero esquinas, después centros de los bordes, según su referencia.

- [x] Retirar interruptor y recuperar el icono centrado. Arcos SVG dorados con
  expansión y desvanecimiento CSS, sin dependencias ni cambios de posición.
- [x] Repetir hasta el primer clic, toque o H por partida; conservar el uso al
  recargar/reconectar y reiniciar en partidas nuevas o revanchas. Sin animación
  antes de conservar billetes, como espectador o en repetición. Si aún no se usó,
  permanece en el mapa terminado hasta el primer uso.
- [x] Halo estático con movimiento reducido; mantener nombre y estado accesibles.
- [x] Verificar ciclo de vida, tamaños y ambas oleadas en navegador; registrar evidencia.

Verificación final:

- 19/19 pruebas dirigidas de destinos, interacción móvil y señales correctas.
  Incluyen almacenamiento bloqueado, reconexión, recarga y cambio de partida.
- `browser-destination-aura.cjs`: Chrome a 1440, 820 y 390 px, ambos orígenes
  alternados, botón inmóvil, movimiento reducido, H/toque, recarga/reconexión,
  mapa terminado y revancha real. Sin errores JavaScript; capturas de ambas
  oleadas revisadas en `.qa/destination-aura/` y resultado en `report.json`.
- `browser-sound-feedback.cjs`: correcto tras actualizar la expectativa del
  antiguo interruptor; se mantienen señales de sala, inicio y recuentos.
- Comprobadores de documentación, impacto `--base HEAD`, arquitectura,
  sintaxis de `app.js` y `git diff --check`: correctos.

Siguiente paso: revisión visual de Ángel en local al recargar la web. Esta
ampliación no requiere reiniciar el backend. La comprobación móvil fue en
navegador, sin publicar ni instalar aplicaciones nativas.

## Rótulo de robos y privacidad de bots · 2026-11-06

Ángel autorizó implementar el rótulo y comprobar los robos de bots. En esa entrega
el apilado, hover y recuadro del mazo quedaron en discusión Moti; su implementación
posterior se registra en el apartado siguiente.

- [x] **ROBAR** precede al contador del lateral y aparece en la mesa móvil,
  compartiendo tamaño, peso, espaciado y color con **TU MANO**; inglés **DRAW**.
  La cabecera conserva sus dimensiones y el botón Destinos su tercio derecho.
- [x] Bot permanente real: dos robos del mazo con mercado agotado, proyecciones
  sin colores para jugador/espectador, reversos tras recargar y al finalizar.
  Replay activo inaccesible; al cerrar muestra los colores exactos en ambas
  perspectivas. No se encontró una filtración ni se modificó la lógica de juego.
- [x] La política permite robar del mazo y favorece cartas visibles útiles;
  la prueba de estrategia también cubre una mesa disponible pero poco útil.

Verificación local: 67/67 pruebas de bots, estrategia, vistas autorizadas, robos,
historial y streaming; 4/4 de idiomas. `browser-table-ui.cjs` pasó cinco grupos
en doce tamaños/orientaciones y `browser-bot-draw-privacy.cjs` comprobó el flujo
por HTTP/WebSocket con Chrome. Evidencia y capturas revisadas en
`.qa/draw-label-2026-11-06/`; estado temporal y puerto propio, sin producción.
Comprobadores de documentación, arquitectura e impacto documental y
`git diff --check` correctos.

Esta entrega quedó disponible al recargar la web local. Sin despliegue ni
actualización nativa.

## Mazo de tres cartas y estados de interacción · 2026-11-06

Ángel aprobó la propuesta con «implementa» tras aclarar que el recuadro molesto
era el fondo detrás del mazo. Contrato visual en [la guía](../../README.md).

- [x] Tres imágenes del mismo reverso sustituyen las capas CSS y el cuarto
  elemento móvil; separación uniforme de 4 px hacia abajo y a la derecha.
- [x] Espacio reservado dentro del botón para las tres capas, con orientación
  vertical en teléfono y horizontal en el lateral. Se mantienen las áreas táctiles.
- [x] Sin fondos, bordes ni sombras rectangulares del contenedor o las imágenes;
  una sombra suave sigue la silueta conjunta de las cartas.
- [x] Hover con brillo, sin desplazamiento. Presión de 1 px hacia dentro y escala
  del 97 %, sin invadir cartas vecinas; movimiento reducido sin transición.
- [x] Verificación visual, geométrica y de robo real en Chrome local.

Evidencia en `.qa/deck-redesign-2026-11-06/`: cinco tamaños entre 320 y 1440 px
en reposo, hover y presión, las tres capas dentro del botón y separación respecto
a la carta superior. Tap emulado confirma una carta recibida; movimiento reducido
comprobado. Capturas de escritorio, tablet y móvil revisadas.
`browser-table-ui.cjs` valida doce tamaños/orientaciones y los flujos de cartas;
19/19 pruebas de recursos y móvil correctas. Sin errores de navegador.
Comprobadores de documentación y arquitectura e inspección del diff correctos.

Esta primera entrega reducía cada carta para encajar las tres capas en el botón.
Ángel rechazó esa reducción; queda reemplazada por la corrección siguiente.

## Cartas del mazo al tamaño de la mesa · 2026-11-06

Corrección aprobada tras Moti: cada una de las tres cartas debe tener exactamente
el ancho y alto de las visibles de la mesa, con las dos traseras desplazadas
4 y 8 px hacia abajo y a la derecha.

- [x] Mismas dimensiones y rotación que las cartas visibles; frontal alineada.
- [x] Espacio adicional en el margen del panel lateral y bajo el mercado móvil,
  sin reducir cartas. El encabezado móvil reserva una sola franja para el rótulo.
- [x] Hover sin desplazamiento, presión leve y ausencia de recuadro conservados.
- [x] Verificar dimensiones, separación, interacción y distribución adaptable.

Evidencia local en `.qa/deck-size-2026-11-06/`: comparación geométrica de las tres
cartas con una carta pública en diez tamaños/orientaciones, de 320 a 1920 px,
en reposo y hover; apilado, límites del panel, presión y movimiento reducido.
Tap emulado confirma un robo. Capturas de escritorio y móvil revisadas.
`browser-table-ui.cjs`: cinco grupos y doce tamaños/orientaciones correctos;
10/10 pruebas de interfaz móvil. Sin errores JavaScript. Comprobadores de
documentación y arquitectura, impacto documental y `git diff --check` correctos.

Siguiente paso: recargar la web local y revisar el tamaño corregido. Sin
despliegue ni actualización de aplicaciones nativas.

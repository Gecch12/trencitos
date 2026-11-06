---
{"id":"board-first-mobile","status":"validated","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-05"}
---
# Mesa compacta con prioridad al mapa

Alcance corregido por Ángel el 2026-11-05: conservar el mapa actual y la mesa
móvil; recuperar la distribución de tablet/escritorio con historial, robos y
jugadores laterales y mano/destinos abajo. La entrega original generalizó la mesa
compacta a todos los tamaños; los apartados históricos siguientes registran esa
implementación, no una autorización para volver a unificar las distribuciones.
El chat continúa como panel de próxima implementación, sin transporte ni envío.

## Recuperación de tablet y escritorio · 2026-11-05

- [x] Reubicar controles existentes mediante sus anclas, sin duplicar estado.
- [x] Recuperar paneles permanentes, botón de nuevos destinos en robos y reloj
  sobre la mano; conservar mejoras de historial, puntos y confirmación.
- [x] Conservar la mesa móvil, incluido teléfono horizontal, y el renderer del mapa.
- [x] Completar regresión de rotación, robos, destinos, historial y replay.
- [x] Revisar capturas y registrar evidencia final y límites de entrega.

Trabajo local sobre `ad3ed98`, en `main`, sin cambios previos ni otros chats
activos sobre los mismos archivos. Evidencia en `.qa/table-restoration/`.
Validación con Chrome y HTTP/WebSocket locales aislados, sin servicios de
producción. El fallo/latencia de persistencia de robos usa un doble local:

- `node-suite.log`: **719/719 pruebas**, sin fallos ni omitidas, 161,6 s.
- `layouts/report.json`: once tamaños, de 320×568 a 1920×1080, más regreso a
  móvil. Cinco jugadores y nueve colores; panel lateral y dock comprobados por
  posición, botones de robo de 44 px, sin controles duplicados. La misma instancia
  de Three.js y canvas sobrevive a cada cambio; abrir paneles no altera su cámara.
- `preservation.json`: posiciones/tamaños de cartas, mano y área del mapa móvil
  idénticos a la captura previa (320×568, 390×844, 430×932 y 844×390).
  SHA-256 de `board-3d.js`, `map-layout.js`, `board-camera.js` y `ticket-map.js`
  sin cambios respecto de la base.
- `refinement/`: cinco grupos, incluyendo consulta de recorridos, animación del
  historial y retorno a cámara, confirmación/cancelación de nuevos destinos,
  pellizco real emulado y capturas con cuatro jugadores.
- `cards/`: cuatro grupos; robos visibles/ocultos para actor/rival/espectador,
  renovación, pagos, redimensionado y reconexión.
- `destinations/`: siete grupos; elecciones iniciales/nuevas, rotación, mapas
  alternativos, túneles y conservación de selección y zoom.
- `continuity/`: cuatro grupos; resaltado, zoom y centro sobreviven al cambio
  móvil/tablet/escritorio y a cancelar/confirmar destinos; reanudación y resultados.
- `replay/`: cinco grupos; carga progresiva, transporte visible en el lateral de
  escritorio, paso/reproducción/velocidad, cartas y cambio a móvil.
- `draw-feedback/`: dieciséis grupos; robos rápidos y animaciones, ACK tardío,
  fallo de guardado simulado, reconexión y cancelación geométrica al redimensionar.
- Cero errores de consola en los informes finales; sintaxis, `git diff --check`
  y comprobador documental normal/`--base HEAD` correctos. Se revisaron capturas
  finales de escritorio, tablet, móvil y replay. Durante el ajuste se corrigieron
  iconos sobredimensionados, recorte del bono, falta de espacio para cinco jugadores
  y transporte del replay plegado en escritorio; las comprobaciones finales pasan.

Ángel solicitó la publicación completa con `trencitos-publicar`. Se prepara
la entrega desde `main`: Android 0.7.0 build 5 e iOS 0.7.0 build 6, con los
identificadores y firmas existentes. Siguiente paso: comprobar CI de la revisión,
Render Live, Release del APK e instalación física; registrar cada resultado en
[producción](../production.md). La validación anterior corresponde al navegador.

## Aceptación de la entrega original

- [x] Sustituir navegación inferior y sidebar por mercado/mano permanentes,
  jugadores compactos arriba y accesos flotantes a historial, chat y destinos.
- [x] Círculos con puntos públicos; bono aparte, recursos ampliables, reloj
  asociado al turno y detalle privado del propio jugador.
- [x] Ayuda de puntos y final desde la definición de la partida; última ronda.
- [x] Paneles superpuestos con cierre/Escape sin reencuadrar el mapa; historial
  con scroll, nuevos movimientos, foco de construcción y regreso a cámara previa.
- [x] Completar comprobaciones de navegador, regresión y revisión visual.

## Implementación

[table.css](../../frontend/table.css) define las variantes de la mesa y se carga
después del CSS anterior. [table-ui.js](../../frontend/table-ui.js) conserva
cálculos de presentación puros; [app.js](../../frontend/app.js) reutiliza los
controles existentes mediante cambio de contenedor, sin duplicar listeners.
Los nuevos recursos se incluyen en la lista pública y, por ella, en el paquete
móvil. El tablero sigue siendo Three.js. El servidor conserva reglas y secretos.

El contrato visible está en [README](../../README.md), los puntos en
[dominio](../domain.md) y la repetición en [historial](../history-replay.md).
Se preservan los cambios previos de otro trabajo. Ocho archivos, incluidos
`board-3d.js` y `map-layout.js`, mantienen su SHA-256; arquitectura recibe solo
tres sustituciones documentadas sobre la mesa y las métricas, conservando el
contenido previo al revertir esas sustituciones. Evidencia en
`.qa/board-first/preexisting.json` y `architecture-edits.json`.

## Evidencia y siguiente paso

Validación local del 2026-11-04, con Chrome y HTTP/WebSocket real. Servidores
aislados y archivos temporales; la prueba de latencia usa un doble local de
Supabase, sin conectar con producción. Evidencia en `.qa/board-first/`:

- `browser-table-ui.cjs`: cinco grupos correctos y cero errores. Siete tamaños
  (320×568, 390×844, 430×932, 700×900, 768×1024, 1440×900, 844×390), cinco
  jugadores, nueve colores, puntos de tres cifras y áreas táctiles de 44 px.
  Paneles y detalles no alteran la cámara; robos reales, privacidad, historial,
  destinos, regreso de foco y construcción que dispara última ronda con dos
  vagones. Ayuda en inglés y chat deshabilitado comprobados.
- `browser-card-ui.cjs`: cuatro grupos correctos, cero errores; cartas públicas
  y ocultas, renovación, pagos, tamaños e idiomas, resultados finales.
- `browser-draw-feedback.cjs`: dieciséis grupos correctos, cero errores;
  robos rápidos, persistencia simulada lenta/fallida, reconexión y animaciones.
- `browser-map-replay.cjs`: cuatro combinaciones de protocolo legado/actual y
  participante/público móvil, correctas y sin errores.
- Suite Node aislada: 697 pruebas; 696 correctas y una expectativa antigua sobre
  volver a destinos en escritorio. Se actualizó al flujo compartido y la
  comprobación focal posterior pasó 22/22 (`mobile-ui`, `table-ui`,
  `presentation-controls`). El primer intento sin `STATE_FILE` propio encontró
  un estado local previo inválido; no se alteraron esos archivos.
- Capturas de móvil, tablet, horizontal, escritorio, ayuda, historial y chat
  inspeccionadas. Corregidos recorte del reloj, cruce de controles en horizontal
  y devolución del foco a una pestaña retirada.
- Comprobador documental normal y `--base HEAD`, sintaxis y `git diff --check`
  correctos. Preservación de cambios anteriores verificada en `preservation.json`.

La prueba de mesa se añade a CI; las pruebas existentes de cartas, robos y replay
se adaptan a la navegación por iconos. La verificación es de navegador, no una
certificación de APK/iOS instalada. Entrega local en main, sin commit ni despliegue.

Siguiente paso: Ángel revisa la vista previa local y decide ajustes visuales.

## Entrega conjunta a main · 2026-11-04

Ángel autorizó subir todos los cambios locales a `main`, incluida la
[continuidad del fondo y las casillas permanentes](ticket-map-shading.md).
La referencia remota estaba al día con la base local `48e5503`.

Comprobación completa previa al commit: **697/697 pruebas Node correctas**,
sin fallos ni omitidas, en 157,2 s. Servidor/estado de pruebas aislados con
`STATE_BACKEND=file` y `STATE_FILE` temporal. Evidencia en
`.qa/board-first/pre-push-tests.log`. La comprobación documental y
`git diff --cached --check` también pasan. Esta ejecución cierra la expectativa
antigua corregida durante la implementación.

Siguiente paso de entrega: comprobar el commit en `origin/main` y el inicio de
CI. La subida a Git no acredita un despliegue Live en Render.

## Refinamiento tras uso en iPhone · 2026-11-04

Ángel aprobó implementar los seis ajustes discutidos con Moti en móvil, tablet y
escritorio. Después de la validación autorizó subir todos los cambios a `main`;
la instalación de una nueva app queda para una solicitud posterior.

- [x] Mercado agrupado, mazo horizontal sin recuadro y separación de la mano.
- [x] Avatar/nombre prioritarios, puntos/cartas/vagones y reloj continuo; solo
  estaciones en expansión general, detalle con etiquetas y camino exacto desde +10.
- [x] Historial «Ocupó» / «Ver», elevación y caída escalonada sin mutar partida.
- [x] Robo de destinos por icono con confirmación previa y revalidación de turno.
- [x] Ayuda más breve, mapa de destinos mayor, tarjetas/reserva compactas y ojo
  para visibilidad; gestos con etiquetas persistentes y dibujo sincronizado.
- [x] Completar comprobaciones de flujo, regresión y revisión de capturas.

Evidencia local en `.qa/table-refinement/`, sin publicación ni instalación nueva:

- Suite Node aislada: **698/698**, sin fallos ni omitidas, 158,8 s
  (`node-suite.log`). La primera comprobación focal necesitó adaptar el stub de
  un test a la nueva limpieza de foco; la suite final incluye esa corrección.
- `browser-table-refinement.cjs`: cinco grupos, cero errores. Móvil/tablet/escritorio,
  glow del recorrido exacto, elevación y retorno sin cambios de estado, movimiento
  reducido, confirmación/cancelación con servidor real, bloqueo fuera de turno y
  tras robar una carta. Capturas con cuatro jugadores.
- Pellizco mediante eventos táctiles de Chrome: 18 actualizaciones progresivas,
  cero reconstrucciones de nodos o medidas de texto, selección intacta y zoom
  conservado al continuar con un dedo. Se corrigió la simulación de `touchEnd`
  para retirar el dedo correcto; no se confunde ese ajuste con un bug de producto.
- `browser-table-ui.cjs`: cinco grupos, siete tamaños de 320×568 a 1440×900,
  cinco jugadores y nueve colores, cero errores. Ajustados números de tres cifras
  y controles en pantallas bajas. Tablet vertical usa mapa sobre lista para evitar
  una columna estrecha; tablet horizontal/escritorio mantienen dos columnas.
- `browser-destination-map.cjs`: siete grupos, cero errores; selección, sombra,
  gestos, mapas alternativos, actualización concurrente, recuperación WebGL y
  túneles. Adaptada la navegación al panel compartido actual.
- `browser-card-ui.cjs`: cuatro grupos, cero errores; `browser-draw-feedback.cjs`:
  dieciséis grupos, cero errores. La latencia y el fallo remoto son un doble local,
  sin conectar con datos de producción.
- Sintaxis, `git diff --check` y comprobador documental normales. La prueba nueva
  se incorpora a CI; las pruebas anteriores de robo pasan por la confirmación.

La verificación táctil es de navegador, no una medición del rendimiento en el
hardware del iPhone. Ángel autorizó la entrega conjunta a `main` después de
esta validación. La entrega incluye código, pruebas, traducciones, documentación
y el nuevo recorrido de CI. Siguiente paso: comprobar el commit en `origin/main`
y el inicio de CI. Esta entrega Git no acredita un despliegue Live ni actualiza
la app ya instalada en el iPhone.

## Publicación y paquete iPhone · 2026-11-04

Ángel autorizó publicar en producción e instalar la actualización en su iPhone.
La revisión `c40d80f` pasó el CI completo y el panel de Render confirmó su estado
Live. Salud y recursos clave verificados en lectura; registro canónico y enlaces
de evidencia en [Producción](../production.md).

El paquete iOS Release build 3 se compiló y firmó con los recursos de esa misma
revisión. Tras desbloquear Ángel el iPhone, la actualización se instaló sobre
la app existente y el dispositivo confirmó la versión y el build. Evidencia en
[Producción](../production.md). No se abrió el juego ni se ejecutaron partidas.

Siguiente paso: recoger la prueba de juego de Ángel en el iPhone.

## Continuación · 2026-11-05

Los ajustes posteriores de indicadores, iconos y resultados se siguen en
[continuidad móvil](mobile-continuity.md), junto con reconexión y cuenta nativa.
Esta referencia no cambia la evidencia ni la publicación histórica de esta ficha.

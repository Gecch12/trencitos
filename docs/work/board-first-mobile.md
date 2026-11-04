---
{"id":"board-first-mobile","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-04"}
---
# Mesa compacta con prioridad al mapa

Ángel aprobó implementar la propuesta discutida con Moti a partir de sus capturas
de Colonist: mapa protagonista, controles por iconos y detalles bajo demanda.
Alcance: web adaptable compartida por móvil, tablet y escritorio. El chat se
reserva como panel de próxima implementación, sin transporte ni envío.

## Aceptación

- [x] Sustituir navegación inferior y sidebar por mercado/mano permanentes,
  jugadores compactos arriba y accesos flotantes a historial, chat y destinos.
- [x] Círculos con puntos públicos; bono aparte, recursos ampliables, reloj
  asociado al turno y detalle privado del propio jugador.
- [x] Ayuda de puntos y final desde la definición de la partida; última ronda.
- [x] Paneles superpuestos con cierre/Escape sin reencuadrar el mapa; historial
  con scroll, nuevos movimientos, foco de construcción y regreso a cámara previa.
- [x] Completar comprobaciones de navegador, regresión y revisión visual.

## Implementación

[table.css](../../frontend/table.css) define el diseño compartido y se carga
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

---
{"id":"table-controls","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-02"}
---
# Controles de mesa y sala

Alcance aprobado después de Moti: recuperar espacio para el tablero y reunir
acciones en un menú, mejorar contraste y avatares, añadir escritura de pluma
y configurar los tiempos antes de empezar. El extra de nuevos billetes se suma
al tiempo restante del turno; el siguiente jugador continúa mientras se elige.

## Aceptación

- [x] Sin cabecera durante la partida; engranaje, pantalla completa y destinos
  arriba a la izquierda. Usuario/campana retirados del encabezado general.
- [x] Menú con invitación, sonido, idioma, acceso privado y abandono; cierre
  exterior/Escape/acción, acceso para espectadores y práctica, foco de teclado.
- [x] M alterna silencio y muestra un aviso; excluye escritura, modificadores
  y repetición. Idioma accesible en móvil conservando sesión y borrador.
- [x] Cabecera crema de jugadores, última ronda ámbar y final petróleo;
  dibujo interior del bot aproximadamente 8 % menor, incluido móvil/historial.
- [x] Pluma al marcar/desmarcar billetes iniciales o nuevos; firma al ACK,
  sin sonidos al comparar, restaurar borradores o repetir la vista.
- [x] Flechas para plazas y tiempos; tarjeta de visibilidad y Europa plana.
  Solo el anfitrión configura; no reduce plazas ocupadas ni cambia tras iniciar.
- [x] Plazos autoritativos, persistencia/rollback, directorio, revancha y
  compatibilidad de partidas anteriores. Barras usan la duración correcta.
- [x] Verificación final y revisión documental.
- [x] Refinamiento posterior: Tiempos separado, plazas de 32 px, invitación
  compacta y paleta junto al vagón. Sala completa sin scroll desde 1366×768;
  ventanas pequeñas conservan desplazamiento y pie de inicio accesible.
  La [franja de variantes](wagon-variants.md) sustituye posteriormente esa
  distribución: paleta arriba y tren conectado de perfil, con todas las variantes
  en escritorio y solo un vagón en vista 3/4 en móvil, sin desplazamiento horizontal.
- [x] Un roce continuo al marcar/desmarcar; firma aprobada sin cambios.
  Engranaje simétrico y estados activos sin la franja inferior.
- [x] Bots nuevos: sorteo uniforme de un color libre, respetando reservas;
  conservación al reconectar/iniciar y liberación al retirarlos.
- [x] Cartas públicas visibles en cada jugador; cuadrícula móvil 2×2 con puntaje
  destacado, avatares de proporción común en panel/resultados/historial y
  tic-tac propio bajo cinco segundos, respetando pausas, silencio y reconexión.
- [x] Renovación audible con el mercado cerrado; atajo H con aviso y protección
  al escribir/abrir diálogos; menú de recuperación agrupado y más claro.
- [x] Perfil sin autocompletado solicitado; historial compacto, puesto calculado
  por identidad, empates correctos, detalles/teclado/replay y adaptación móvil.
- [x] Hongos/jade, cristales/índigo y confitería/rosa seleccionables y persistidos;
  cargas originales con base del propietario, límites de piezas y geometría.
- [x] Avatares personalizables aplazados y registrados en personalización.

## Contratos y evidencia

La ampliación del 2026-11-06 añade avisos de incorporaciones y bots, campana de
inicio con tiempo reservado, interruptor de destinos y sonidos de recuento.
Su aceptación y ejecución están en [la ficha de cierre](summary-postgame-experience.md#señales-de-controles-sala-y-recuento--2026-11-06);
el contrato vigente de tiempos está en [dominio](../domain.md#fases-y-turno).

Refinamiento aprobado e integrado en `main`: sonido de renovación independiente del panel,
atajo H y menú de recuperación claro; perfil sin autocompletado, historial
compacto con puesto propio y tres vagones fantásticos (hongos, cristales,
confitería). Estas tres familias se retiraron en la revisión posterior de
[variantes de vagones](wagon-variants.md); la evidencia inferior describe la
entrega original. Avatares aplazados en [personalización](commerce.md).

- Reglas: [dominio](../domain.md); componentes: [arquitectura](../architecture.md).
- Uso: [guía](../../README.md). Packs de sonido futuros: [sonidos](sounds.md).
- `tests/room-timing.test.js`: combinaciones de tiempos, extra, regreso al turno,
  pausa/reconexión, legado y proyección/persistencia.
- `tests/browser-table-controls.cjs`: HTTP/WebSocket reales y Chrome con dos
  contextos, controles, permisos, guardado, recarga, idioma, sonidos, menú,
  escritorio 1440×900 y móvil emulado 390×844 / 844×390.
- Capturas e informe regenerables en `.qa/table-controls/` (ignorados por Git).
  Pruebas con puerto y archivo temporales; no se usa el proceso habitual ni
  Supabase. La emulación no certifica dispositivos físicos.

## Verificación inicial · 2026-11-02

- `node --test --test-concurrency=1 tests/*.test.js`: **359/359**, 106,7 s.
- `node tests/browser-table-controls.cjs`: correcto, sin errores de consola.
  Se inspeccionaron sala, menú y cabeceras de última ronda/final. Renderizado
  offline de los tres sonidos: señal presente, sin clipping; firma de 350 ms.
  El timbre es sintetizado; no se hizo una evaluación auditiva humana.
- `node tests/browser-flow-ui.cjs`: iniciales, nuevos billetes, túneles
  (cero extra/pago/desistimiento), resultados y traducciones correctos.
- `QA_OUT=.qa/table-controls/shell node tests/browser-shell.cjs`: **55 layouts**,
  navegación, perfil, sala y observadores correctos. Capturas revisadas; el
  encabezado móvil vacío se compactó y el botón de inicio ya no cubre campos.
- `node scripts/check-docs.js`, `node scripts/check-docs.js --base HEAD` y
  `git diff --check`: correctos. Los avisos de fuentes se contrastaron; no
  cambian políticas de bots, geometrías ni contratos de archivo del historial.

## Refinamiento verificado · 2026-11-02

- `node tests/browser-table-controls.cjs`: correcto, sin errores de consola.
  Sala real de cinco jugadores, panel de jugadores y configuración sin scroll
  en 1366×768, 1440×900 y 1920×1080. Número de plazas de 32 px, vagón y pie
  completos. 1366×600 conserva scroll; 390×844 y 844×390 siguen operables.
- Renderizado offline del sintetizador: una sola emisión continua para marcar
  (130–150 ms) y desmarcar (105 ms), sin clipping. Firma original de 350 ms
  conservada; comprobación técnica, sin evaluación auditiva humana.
- `QA_OUT=.qa/table-controls/shell node tests/browser-shell.cjs`: **55 layouts**,
  navegación, sala, perfil y observadores correctos en Chrome 156.
- `node --test tests/presentation-controls.test.js tests/i18n.test.js`: **6/6**.
  Revisión visual de la sala completa, móvil y menú con el nuevo engranaje.
  Las 359 pruebas y el flujo de túneles de arriba corresponden a la ejecución
  inicial; este refinamiento solo cambia presentación, audio y traducciones.
- Documentación e higiene del diff verificadas con los comandos del repo.

## Siguiente paso

Implementación y refinamiento integrados en `main` por solicitud del usuario.
El commit usa `[skip render]`; esta entrega no incluye despliegue ni verificación
de producción. Recargar el navegador permite revisar la presentación; el backend
habitual debe reiniciarse para cargar los nuevos colores, el puesto del historial,
el sorteo de colores de bots y los relojes
cuando no interrumpa una partida activa. Las pruebas usan su propio servidor.

## Colores de bots verificados · 2026-11-02

- `STATE_BACKEND=file node --test --test-concurrency=1 tests/lobby.test.js
  tests/lobby-server.test.js tests/room-directory.test.js`: **19/19**.
- WebSockets reales: cada posible resultado del sorteo entre colores libres,
  exclusión de una reserva desconectada, ausencia de duplicados, liberación al
  retirar y estado persistido. Reconexión después de reiniciar el servidor y
  comienzo de partida conservan el color del bot. Se mantienen permisos,
  límite de plazas y rollback ante fallo de guardado.
- Cambio limitado a `add_bot` del lobby; las elecciones humanas y colores ya
  asignados conservan su comportamiento. Documentación y diff verificados.

## Jugadores y reloj verificados · 2026-11-02

- `node --test tests/presentation-controls.test.js tests/game-ui.test.js
  tests/i18n.test.js`: **31/31**. Plazos propios, umbral, caducidad, túneles,
  iniciales ya confirmados, ofertas en cierre, segundos repetidos y correcciones
  de reloj; silencio, pestaña oculta, replay, conexión y guardado pausado.
- `node tests/browser-player-feedback.cjs`: **10 layouts**, cinco jugadores,
  puntajes de tres cifras y cuatro métricas dentro de cada tarjeta. Un robo real
  actualiza el recuento público sin recibir manos rivales. Detalle táctil,
  proporción del robot del 80 % en jugadores/historial/resultados/clasificación
  y tic-tac en turno, iniciales y oferta minimizada, sin duplicados ni consola.
- Capturas de escritorio 1440×900, tablet 768×1024, móvil 390×844 y 320×568,
  y resultados revisadas. Emulación de navegador; sin prueba en equipos físicos.
  Artefactos regenerables en `.qa/player-feedback/`, incluido `countdown.wav`:
  cinco clics alternos sintetizados, pico 0,135 sin clipping. Verificación técnica
  del audio; el timbre queda disponible para valoración auditiva del usuario.
- `node tests/browser-flow-ui.cjs`: iniciales, túneles compartidos con pago,
  sin suplemento y desistimiento, autoridad/relojes/cierre, resultados,
  navegación por teclado, móvil e inglés correctos; sin errores de consola.
- Documentación y diff verificados; estos cambios no alteran el renderizador
  Three.js, las políticas de bots ni el formato persistido de las repeticiones.

## Historial, atajos y vagones verificados · 2026-11-02

- `node --test tests/presentation-controls.test.js tests/match-archive.test.js
  tests/i18n.test.js tests/wagon-models.test.js tests/lobby.test.js`: **26/26**.
  Tras proteger H también en diálogos nativos, se ejecutó de nuevo la suite de
  presentación: **8/8**, incluyendo escritura, modificadores y teclas repetidas.
- `node --test --test-concurrency=1 tests/history-server.test.js
  tests/lobby-server.test.js tests/room-directory.test.js`: **15/15**. Identidad,
  privacidad, reinicio, reservas de colores, sorteo de bots y rollback; los errores
  EISDIR del log son fallos de guardado inyectados por las pruebas.
- `node tests/browser-refinements.cjs`: HTTP/WebSocket/Chrome reales, backend de
  archivo temporal. Tercera comodín y audio en móvil con mercado cerrado;
  rotación privada persistida; H; historial con nombres duplicados, puesto propio,
  filtros, desglose con teclado, endpoint de replay, perfil y traducción inglesa.
  Nueve tamaños de 320×568 a 1920×1080, sin desbordamiento; scroll del historial
  termina antes de la navegación inferior en tablet. Capturas revisadas.
- Tres selecciones nuevas guardadas desde la sala y sus previews reales; tablero
  con 225 vagones de las nuevas familias, resaltado/restauración conservando los
  modelos y ausencia de render continuo en reposo. La sala sigue cabiendo en
  1366×768. No es una medición de FPS ni prueba en dispositivos físicos.
- `node tests/browser-card-ui.cjs`: renovación real y compartida, movimiento
  reducido, interrupción/resize/reconexión, pagos y resultados sin errores.
- Artefactos regenerables en `.qa/refinements/`: informe, historial, previews y
  `market-renewal.wav`. Síntesis offline con señal y sin clipping; valoración del
  timbre disponible al usuario. Primera ejecución corregida por un código de
  sala demasiado corto en el fixture, sin defecto de aplicación.
- Los archivos persistidos de replay no cambian; `ownSeat` y `rank` se calculan
  solo para el listado privado. No se usan nombres para decidir propiedad.
  Las familias nuevas conservan geometrías instanciadas y los colores anteriores.
  Documentación y diff contrastados antes de integrar; despliegue pendiente.

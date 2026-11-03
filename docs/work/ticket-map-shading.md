---
{"id":"ticket-map-shading","status":"done","parent":null,"depends_on":["destination-map-tunnels"],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Sombreado y foco del mapa de billetes

Ángel aprobó tras Moti el sombreado suave de la vista conjunta, el foco individual
con intensidad completa y una transición breve, en un worktree nuevo.
Después pidió integrar en `main` y retirar los worktrees sin uso, coordinando
con el chat «Revisar historial y resaltado de la».

## Base y alcance de la primera entrega

Worktree original `trains/ticket-map-shading`. Base `20c1a7b`: instantánea local de
`trains/trencitos` sobre `350b193`, incluidos sus cambios sin commit. Se creó con
un índice temporal sin modificar archivos ni índice de main; no incluye estado
de partidas, credenciales, dependencias ni QA ignorados. Los cambios propios
se comparan contra esa instantánea, no contra el main publicado.

- [x] Iniciales y ofertas abren con un tercio de la intensidad del foco individual.
- [x] Sin casillas marcadas se comparan todos los ofrecidos; con selección, solo
  los marcados y los destinos actuales activados para comparar.
- [x] Hover temporal y foco fijado por clic/toque separados de conservar. Al
  quitar el foco se vuelve al conjunto; desmarcar el billete fijado lo libera.
- [x] Transición de colores de 180 ms, cámara y zoom intactos, movimiento reducido
  sin animación. Se conserva el cálculo existente de caminos mínimos.
- [x] Comprobación de navegador, regresión del tablero compartido y documentación.

Contrato de interfaz: [guía del juego](../../README.md). Adaptadores:
[arquitectura](../architecture.md). No cambia reglas, relojes ni guardado.

## Evidencia del worktree

`node --test tests/destination-planner.test.js tests/board-3d.test.js
tests/wagon-models.test.js tests/game-ui.test.js tests/presentation-controls.test.js`:
**47/47**. Sintaxis correcta en los cuatro módulos modificados.

`node tests/browser-destination-map.cjs`: **7 grupos correctos**, cero errores
de navegador, servidor HTTP/WebSocket y Chrome reales con estado temporal.
Incluye intensidades intermedias durante la transición, ausencia de retorno a
luz plena, foco fijado/hover, desmarcado del enfocado y del último billete,
confirmación autoritativa de los elegidos, movimiento reducido, cámara,
recuperación de WebGL, Europa/Sudamérica, nuevas ofertas, construcción concurrente,
reapertura/recarga en inglés y regresión de los túneles en el tablero compartido.

Evidencia local ignorada en `.qa/destination-map/report.json` y capturas:
`initial-soft-overview.png`, `initial-full-focus.png`, `initial-soft-mobile.png`
y `new-soft-selected.png`, inspeccionadas visualmente. Escritorio 1440×900,
teléfono 390×844, tablet 768×1024 y horizontal 844×390 emulados; no hardware móvil.
La primera ejecución detectó una lectura adelantada de las etiquetas SVG en la
prueba de movimiento reducido; se ajustó la espera al siguiente frame y el
recorrido completo pasó. El sandbox impidió abrir loopback en el intento inicial;
la verificación posterior autorizada usó solo servicios locales.

`node scripts/check-docs.js`, revisión de impacto y `git diff --check`: correctos.
Los procesos de prueba se cerraron. Para distinguir el cambio propio de la base
local, comparar el diff archivado contra `20c1a7b`.

## Integración local en main · 2026-11-03

Se trasladaron exclusivamente los nueve archivos del cambio propio. Antes de
copiarlos, se comprobó que sus versiones en main coincidían con la instantánea
base; después se verificó por SHA-256 que los demás archivos locales seguían
intactos. Respaldo de las versiones anteriores, diff, archivos completos y QA
del worktree en `.qa/worktree-cleanup-2026-11-03/` del checkout principal.

La coordinación confirmó que `match-history-progress` mantiene el trabajo de
historial pendiente de integración y debe conservarse. La limpieza de los
worktrees terminados se registra en [consolidación](workspace-consolidation.md).

Verificación repetida sobre main: **47/47 pruebas** y **7 grupos de navegador**,
cero errores. Informes en `.qa/worktree-cleanup-2026-11-03/node-tests.txt` y
`browser-tests.txt`; capturas e informe actual en `.qa/destination-map/` de
main. Se inspeccionó la captura de vista conjunta suave. Servidor de prueba y
Chrome cerrados al terminar; los procesos del usuario permanecieron intactos.

Entrega local en `trains/trencitos`, rama `main`, sin commit, push ni despliegue.
Siguiente paso: combinar el trabajo de historial con esta versión y verificar
la combinación antes de publicar.

## Revisión de interacción e iluminación · 2026-11-03

Ángel aprobó tras Moti seleccionar con toda la tarjeta, volver a un resaltado
medio solo de los billetes elegidos al salir del foco y dejar el mapa sin
previsualizaciones cuando no hay selección. Aclaró expresamente durante la
implementación que los tiempos de 500/350 ms pertenecen a la construcción del
tablero principal; la aparición y movimiento existentes deben conservarse.
Esta revisión sustituye el contrato de la primera entrega descrita arriba.

- [x] Tarjeta completa como label de una casilla nativa, sin doble alternancia;
  teclado, conservación inicial y comparación de destinos actuales.
- [x] Vista conjunta al 50 %, foco individual temporal y salida por ratón o
  toque exterior. Sin selección no se muestran todos los ofrecidos.
- [x] Construcción: sombreado de 500 ms antes de mostrar las piezas; movimiento
  existente intacto y restauración de 350 ms tras la pausa existente. Un
  highlight activo se conserva. La pausa compartida incluye toda la secuencia.
- [x] Verificación en navegador, regresión de relojes y revisión documental.

Verificación de esta revisión:

- **80/80** pruebas Node de construcción/pausa, relojes, túneles, planificador,
  tablero, vagones, controles, GameUI e idiomas.
- `node tests/browser-destination-map.cjs`: **7 grupos correctos**, cero errores.
  Clic en texto/número/espacio/casilla, teclado, hover y salida, touch exterior,
  selección vacía, billetes conservados, confirmación del servidor, cámara,
  WebGL, Sudamérica, cambios concurrentes, inglés y túneles compartidos.
- `node tests/browser-construction-lighting.cjs`: **5 grupos correctos**, cero
  errores. Construcción de ruta y estación, highlight conservado, movimiento
  reducido y cancelación por resize. Los fotogramas confirman piezas ocultas
  durante el sombreado, curva/altura existentes y restauración gradual. Recargar
  no vuelve a ejecutar la construcción.
- Sintaxis, `git diff --check`, `node scripts/check-docs.js` y revisión de impacto
  documental correctos. El impacto contra HEAD incluye trabajos locales previos;
  se contrastaron los documentos afectados por esta revisión.

Evidencia local ignorada: `.qa/destination-map/report.json`,
`.qa/construction-lighting/report.json`, fotogramas JSON y capturas en ambas
carpetas. Se inspeccionaron las vistas de escritorio/móvil y la construcción con
highlight. Chrome real, móvil emulado; sin comprobación en hardware móvil.
Los servidores y navegadores de prueba se cerraron. El sandbox requirió permiso
para abrir exclusivamente los servidores de loopback con estado temporal.

Trabajo entregado en `trains/trencitos`, `main`, preservando los cambios previos
de otros chats. Sin commit, push ni despliegue. Siguiente paso: reiniciar el
backend de desarrollo al probar los nuevos tiempos; publicar solo cuando se pida.

## Foco temporal y reserva · 2026-11-03

El highlight persistente se combina con la ruta activa de cualquier jugador.
Los túneles conservan el foco durante revelación, decisión y resultado. Se
mantienen 500 ms de sombreado y 350 ms de restauración; la aparición y movimiento
de vagones no cambian. El selector muestra la reserva real de vagones fuera de
la lista desplazable. Evidencia en [Transparencia y reinicio](replay-transparency-reset.md).

## Publicación conjunta · 2026-11-03

La implementación de esta ficha quedó publicada en `ef65487`, Live en Render
tras CI aprobado. El alcance publicado, las comprobaciones de producción y
sus límites están en [Producción](../production.md).

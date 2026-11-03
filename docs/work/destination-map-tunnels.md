---
{"id":"destination-map-tunnels","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Mapas de billetes en vivo y túneles sobre el tablero

Alcance aprobado tras Moti: implementar en un worktree nuevo, desde `350b193`.
Tras validar esa entrega, Ángel pidió integrarla en `main`, conservando los
cambios locales de otros trabajos. Esta ampliación sustituye la eliminación del
botón de regreso descrita en la entrega histórica de [flujo](game-flow-ui.md).

## Aceptación

- [x] Mapas de billetes con la misma representación Three.js, piezas reales,
  propuestas translúcidas y solo nombres de ciudades de destino.
- [x] Iniciales por longitud mínima; ofertas por vagones adicionales, vías propias,
  dobles y estaciones colocadas. Empates estables y actualización por estado público.
- [x] Inspección exclusiva por hover/toque separada de conservar; zoom/arrastre/
  pellizco/teclado locales; conservación del borrador y cámara al reabrir.
- [x] Observadores pueden volver al mapa durante un túnel y reabrir el detalle;
  las etapas no vuelven a imponer el modal. Constructor y relojes autoritativos intactos.
- [x] Cartas del túnel sobre el tablero, sincronizadas, con coincidencias y resultado.
- [x] Verificación de actualización concurrente, dispositivos emulados y regresión.

## Contratos

Uso: [guía del juego](../../README.md). Componentes y responsabilidad:
[arquitectura](../architecture.md). Pausas y turnos: [dominio](../domain.md).
La propuesta es individual por destino; no promete disponibilidad futura,
pagos de cartas ni compatibilidad conjunta de préstamos para billetes pendientes.

## Evidencia del worktree original

- `node --test tests/destination-planner.test.js`: 7/7, con bloqueos en vivo,
  reglas de dobles, préstamos limitados, conservación de conexiones y empates.
- `node --test --test-concurrency=1 tests/*.test.js`: 658/658, sin omisiones,
  159 segundos. Registro en `.qa/destination-map/node-tests.txt`.
- `node tests/browser-flow-ui.cjs`: correcto; regresión de iniciales/nuevos,
  túneles sin suplemento/con pago/desistimiento, roles y resultados. Sin errores.
- `node tests/browser-destination-map.cjs`: seis grupos correctos, sin errores
  de navegador. Comprueba el tablero real, selección independiente, hover/toque,
  pellizco/rueda/teclado locales, recuperación de WebGL, Europa y Sudamérica,
  construcción concurrente real por WebSocket, cámara y borrador al reabrir,
  traducción y los tres roles durante todas las etapas del túnel.
- `node tests/browser-tunnel-outcomes.cjs`: correctos los seis resultados
  (sin suplemento, mixto, comodines, desistimiento, insuficiencia y tiempo
  agotado), reconexión, recibos públicos y conservación de cartas.
- Revisión visual de escritorio, teléfono, tablet y orientación horizontal en
  Chrome emulado, incluidos movimiento reducido, modelos translúcidos y las
  texturas reales de las cartas sobre el tablero. Sin pruebas en hardware móvil.
- `node scripts/check-docs.js`, `node scripts/check-docs.js --base HEAD` y
  `git diff --check`: correctos.
- El script histórico `tests/browser-board-continuity.cjs` no llega al tablero:
  busca el selector retirado `#homeTabPractice`. Se conserva ese resultado en
  `.qa/destination-map/legacy-continuity-failure.png`; los flujos actuales de
  cámara, selección y túnel están cubiertos por las pruebas anteriores.

Las capturas e informes de esta primera verificación se generaron en
`.qa/destination-map/`, `.qa/flow-ui/` y `.qa/tunnel-outcomes/` del worktree
`destination-map-tunnels`, ignorados por Git. Tras su retirada, se conservan
dentro de `.qa/worktree-cleanup-2026-11-03/destination-map-tunnels.tar.gz` en main,
con manifiesto SHA-256 verificado; véase [consolidación](workspace-consolidation.md).

## Integración en main · 2026-11-03

- Combinación de tres versiones sobre los 19 archivos de la entrega. Respaldo,
  manifiesto SHA-256 y diff propio en `.qa/merge-6lfi4un5/` del checkout principal.
- Resueltos los solapamientos de README, traducciones y renderer: se conserva
  la terminología «comodines», la retirada de Midsommar y las mejoras locales
  de cartas y recuperación de cuentas. Se comprueba mediante SHA-256 la
  preservación del resto de archivos; el único ajuste adicional es la prueba
  descrita a continuación.
- Suite conjunta: 654 pruebas en 174 segundos, 653 correctas y una prueba
  preexistente desactualizada en `tests/presentation-controls.test.js`.
  Se confirmó que la lógica de sonido era idéntica a la de main antes de la
  integración. Su entorno simulado no incluía `pendingMarketRefreshes` y esperaba
  un sonido inmediato que ahora corresponde al inicio de la animación. Se
  actualizó ese entorno y la comprobación de eventos visibles/en cola; las
  ocho pruebas del archivo pasaron al repetirlo. No hubo cambios de producto
  posteriores a la suite conjunta.
- `node tests/browser-destination-map.cjs`: seis grupos correctos en `main`,
  sin errores de navegador, con el backend y catálogo de vagones actuales.
- `node tests/browser-flow-ui.cjs` y `node tests/browser-tunnel-outcomes.cjs`:
  correctos los cinco grupos de flujo y los seis desenlaces del túnel; sin
  errores de navegador. Revisión visual de la captura del mapa integrado.
- `node scripts/check-docs.js`, su comprobación de impacto contra HEAD y
  `git diff --check`: correctos.
- Evidencia de integración en `.qa/destination-map-integration/`; capturas e
  informe actual del mapa en `.qa/destination-map/` de `trains/trencitos`.

Integración local sin commit, push ni despliegue. Los procesos locales existentes
en los puertos 3000 y 3119 no se reiniciaron; necesitan un reinicio antes de
cargar la lista ampliada de recursos públicos. Las verificaciones usan puertos
y archivos temporales propios.

## Siguiente paso

Entrega integrada en el checkout `trains/trencitos`, rama `main`. La publicación
y el reinicio de servidores con partidas activas quedan fuera de este alcance.

## Publicación conjunta · 2026-11-03

La implementación de esta ficha quedó publicada en `ef65487`, Live en Render
tras CI aprobado. El alcance publicado, las comprobaciones de producción y
sus límites están en [Producción](../production.md).

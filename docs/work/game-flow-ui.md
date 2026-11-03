---
{"id":"game-flow-ui","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-02"}
---
# Billetes, túneles compartidos y tabla final

Alcance aprobado tras la revisión con Moti: simplificar diálogos de billetes y
túneles, mostrar el intento de túnel a toda la mesa con pausa coordinada, usar
las celdas del resumen final para navegar por sus mapas y reducir el coste del
guardado local al tomar cartas.

## Aceptación

- [x] Billetes iniciales/nuevos: barra decreciente, reloj, avisos de urgencia,
  eliminación de los textos indicados y leyenda del mapa; mínimo y borradores intactos.
- [x] Construcción: eliminar el párrafo explicativo del túnel. Revelación/resultado:
  eliminar ambos párrafos y el botón de regreso, con cierre automático compartido.
- [x] Etapas del servidor: revelación, decisión privada y resultado público,
  visibles para jugadores/espectadores. Bots esperan; reloj del constructor
  congelado durante animación y ofertas congeladas durante todo el modal.
- [x] Reconexión y recuperación de túneles anteriores sin reiniciar sus plazos.
  El último turno espera el resultado antes de puntuar. Protocolo UI 6.
- [x] Tabla con todas las categorías y total por jugador, inicialmente plegada;
  celdas navegables, un detalle abierto, controles de teclado y mapas adaptables.
- [x] Estado local pequeño y replay incremental; migración y recuperación
  atómicas, sin reprocesar pasos anteriores por cada jugada.

## Contratos

- Reglas y relojes: [dominio](../domain.md).
- Presentación y proyecciones: [arquitectura](../architecture.md).
- Escritura y recuperación: [historial/replay](../history-replay.md).
- Uso y tabla final: [guía del juego](../../README.md).

El trabajo concurrente del [selector de vagones](wagon-preview-performance.md)
añadió pruebas del mismo escritor y documentación de su recuperación. Se
conservaron esos cambios y se verificó la combinación en este checkout.

## Evidencia local · 2026-11-02

- Regresión final integrada: 344/344 pruebas (93,5 s), ejecutadas con
  `node --test --test-concurrency=1 tests/*.test.js`. Incluye red real,
  permisos/privacidad, historial/replay, almacenamiento, motor y simulaciones.
- `node tests/browser-flow-ui.cjs`: Chrome, HTTP/WebSocket reales en servidor y
  almacenamiento aislados. Iniciales y nuevos billetes; cero suplemento, pagar
  y desistir; tres sesiones (constructor/rival/espectador); rechazo de acciones
  durante revelación; reconexión en decisión; espera del siguiente turno;
  tabla, cuatro categorías, teclado, móvil 390×844, horizontal 844×390 e inglés.
  Sin errores de consola. Capturas de escritorio/móvil inspeccionadas.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
- Artefactos regenerables en `.qa/flow-ui/` (ignorados por Git): capturas,
  `report.json` y `storage-benchmark.json`.
- Guardado medido en archivos temporales con copia del historial local de
  36.759.793 bytes: cinco muestras, mediana anterior 485,86 ms y nueva 12,36 ms;
  manifiesto de 16.591 bytes. Excluye la migración inicial y no mide el clic
  completo. El historial y el proceso activos del usuario no se modificaron.

## Ampliación · pagos y desenlace del túnel · 2026-11-02

Aprobada con «implementa» tras Moti: base comprometida pública, desglose visual
base/extra/total y animación compartida de construcción o devolución. Se mantienen
las reglas: desistir conserva las cartas y consume el turno.

- [x] Reserva, revelación, decisión y resultado con estructura visual común.
- [x] Extra exacto persistido al pagar; cero explícito si no hay suplemento.
- [x] Resultado de 3 s y reloj autoritativo; motivo diferenciado por tiempo agotado.
- [x] Vuelos separados de base/extra, vagones y devolución a la mano del constructor.
- [x] Movimiento reducido, cancelación de efectos y reconexión sin reiniciar el plazo.
- [x] Constructor/rival/espectador; opciones y resto de la mano privados. UI 8.
- [x] Verificación final y cierre de evidencia.

Evidencia de la ampliación:

- `node tests/browser-tunnel-outcomes.cjs`: seis recorridos HTTP/WebSocket en
  Chrome (cero extra, pago mixto, solo comodines, desistimiento voluntario,
  insuficiencia y timeout), tres clientes, recibo exacto, relojes, reconexión en
  resultado, móvil/horizontal, inglés y movimiento reducido. Sin errores de consola.
- `node tests/browser-flow-ui.cjs`: regresión de túneles, billetes y resultados
  correcta, sin errores de consola tras corregir el estilo inline bloqueado por CSP.
- Capturas/reportes en `.qa/tunnel-outcomes/` y `.qa/flow-ui/` (ignorados por Git).
  Se inspeccionaron el pago mixto de escritorio y la decisión/devolución en móvil.
- Regresión final integrada: **353/353 pruebas**, 102,9 s, con
  `node --test --test-concurrency=1 tests/*.test.js`. Se actualizaron las
  expectativas de UI 8 y `TUNNEL_RESULT_MS`. Tras el último ajuste de cancelación
  se repitieron 45 pruebas pertinentes y los seis recorridos Chrome: correctos.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Pruebas con puertos y archivos temporales; el servidor habitual quedó intacto.

## Siguiente paso

Ampliación publicada: recargar producción para usar UI 8. El proceso local del
usuario no se reinició; su actualización requiere reiniciarlo al terminar la
partida activa. La emulación de Chrome no sustituye dispositivos físicos.

## Entrega en producción · 2026-11-02

Publicado en `main` y Render con el commit `f4584c9`; **Live** a las 06:38:26
(Lima). La combinación final pasó 353/353 pruebas y los recorridos Chrome de
túneles y flujo. La verificación remota confirmó archivos idénticos, UI 8,
práctica con bots, resultados, historial anterior y salud de Supabase.
Evidencia y límites en [Producción](../production.md).

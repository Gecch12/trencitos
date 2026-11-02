---
{"id":"card-interactions","status":"done","parent":null,"depends_on":["game-flow-ui"],"branch":"main","delivery":"released","updated":"2026-11-02"}
---
# Cartas, pagos y limpieza de la interfaz

Alcance aprobado con «implementa» después de Moti. Incluye los dos ajustes
pendientes de resultados/avatar, además de las cinco propuestas sobre cartas.

## Aceptación

- [x] Historial: nombre y miniatura; carta pública para todos, robo del mazo
  visible solo al dueño y reverso para los demás, incluso en replay público.
- [x] Renovación por tres locomotoras: brillo, abanico hacia el mazo y reparto
  escalonado; duración 940 ms, movimiento reducido 180 ms, bloqueo local de robos.
  Lecturas/reconexión no repiten; estados nuevos y cancelaciones restauran la mesa.
- [x] Pago como suma de cartas con cantidades, actualización al usar locomotoras,
  existencias en esquina, nombres accesibles sin texto visible redundante.
- [x] Túnel: quitar los dos párrafos y mostrar cuántas cartas válidas faltan.
- [x] «Ver mapa» minimiza billetes con reloj y borrador preservados.
- [x] Quitar explicación de desempates; robot marfil, contorno oscuro y antena dorada.

## Contratos

- Proyecciones y efectos: [arquitectura](../architecture.md).
- Miniaturas y secretos: [historial/replay](../history-replay.md).
- Reglas sin cambios: [dominio](../domain.md).

## Verificación

- Regresión integrada: 348/348 pruebas, 96,6 s,
  `node --test --test-concurrency=1 tests/*.test.js`.
- Pruebas del motor: metadatos por robo, persistencia y redacción; evento público
  de renovación; replay público sin colores ocultos; falta de cartas tras reserva.
- `tests/browser-card-ui.cjs`: servidor HTTP/WebSocket y Chrome aislados, datos
  temporales; actor/rival/espectador, renovación, controles y accesibilidad móvil.
- `tests/browser-flow-ui.cjs`: túnel con aviso de faltantes, billetes minimizados
  sin pérdida del borrador/plazo y resultados sin explicación de desempates.
- Capturas/reportes regenerables en `.qa/card-ui/` y `.qa/flow-ui/`, ignorados.
- Ambos recorridos Chrome completos, sin errores de consola. Capturas de suma
  en escritorio/390×844/844×390, abanico, historial, aviso del túnel y robot
  inspeccionadas. El móvil horizontal conserva scroll dentro del diálogo.
- `node scripts/check-docs.js --base HEAD`: 38 documentos, 14 fichas correctos;
  `git diff --check` limpio.

## Siguiente paso

Implementación publicada junto con UI 8 y el desenlace del túnel. Recargar
producción para recibirla. El servidor local habitual no se reinició; hacerlo
al terminar la partida activa. La emulación móvil no equivale a un dispositivo
físico.

## Entrega en producción · 2026-11-02

Publicado en `main` y Render con el commit `f4584c9`; **Live** a las 06:38:26
(Lima). La combinación final pasó 353/353 pruebas y los recorridos Chrome de
túneles y flujo. La verificación remota confirmó archivos idénticos, UI 8,
práctica con bots, resultados, historial anterior y salud de Supabase.
Evidencia y límites en [Producción](../production.md).

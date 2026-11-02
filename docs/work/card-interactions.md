---
{"id":"card-interactions","status":"done","parent":null,"depends_on":["game-flow-ui"],"branch":"main","delivery":"integrated","updated":"2026-11-02"}
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

Implementación y revisión terminadas. El backend nuevo requiere reinicio local
(UI 7) y recarga al terminar la partida activa. No se ha reiniciado el servidor
habitual ni publicado ni hecho commit. La emulación móvil de Chrome no equivale
a una prueba en dispositivo físico.

## Preparación de producción · 2026-11-02

Publicación solicitada por el usuario. La combinación final de estos cambios
pasó 353/353 pruebas y los recorridos de túneles y flujo en Chrome. Se entrega
junto con las mejoras de cartas, resultados y selector, sin cambios de SQL
ni credenciales. El despliegue y la verificación remota se registran en
[Producción](../production.md) cuando finalicen.

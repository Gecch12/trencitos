---
{"id":"card-interactions","status":"validated","parent":null,"depends_on":["game-flow-ui"],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Cartas, pagos y limpieza de la interfaz

Alcance aprobado con «implementa» después de Moti. Incluye los dos ajustes
pendientes de resultados/avatar, además de las cinco propuestas sobre cartas.

## Aceptación

- [x] Historial: nombre y miniatura; carta pública para todos, robo del mazo
  visible solo al dueño y reverso para los demás, incluso en replay público.
- [x] Renovación por tres locomotoras: brillo, abanico hacia el mazo y reparto
  escalonado; duración actual 420 ms, movimiento reducido 120 ms, bloqueo local de robos.
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

Medir respuesta inmediata en un navegador de producción. El cambio está
publicado y su protocolo/recursos fueron verificados; esa comprobación no mide
la latencia real del clic. El servidor local habitual sigue sin reiniciar.

## Respuesta inmediata al clic · 2026-11-03

Ampliación aprobada con «implementa» tras el análisis Moti de la demora de cartas.

- [x] Carta visible o reverso del mazo inicia movimiento/sonido al pulsar, sin
  adelantar mano, contadores, turno ni secretos. Conciliación con ACK/evento,
  sin un segundo vuelo/sonido al confirmar.
- [x] Hasta una segunda elección local mientras se guarda la primera; envío
  con nueva revisión, identidad de posición conservada y cancelación al renovar.
- [x] Rechazo, desconexión, fallo de guardado, resize y movimiento reducido;
  reintento idempotente y recibo durable con `drawEventId`.
- [x] Métricas separadas para robos, construcción, bots y lotes mixtos. El
  guardado sigue siendo obligatorio; no se promete reducir su RTT con esta UI.
- [x] Completar regresión y revisión final.
- [x] Publicar: `c5c7bf2`, Live en Render a las 10:11:46 Lima del 2026-11-03.
  CI completo 641/641, recursos iguales y `drawFeedbackVersion:1` verificados.
  Evidencia en [Producción](../production.md).
- [ ] Medir clic y confirmación en navegador de producción, sin presentar
  medidas locales o de CI como cifras de Render.

Verificación final: `node tests/browser-draw-feedback.cjs`, diez recorridos Chrome
con doble remoto y guardado retenido, sin errores del navegador. En 18 clics,
creación del feedback entre 0,9 y 2,7 ms y siguiente rAF entre 13,0 y 46,7 ms.
Las confirmaciones medidas en los casos aceptados llegaron entre 494,6 y 646,2 ms
con guardado retenido por la prueba: la espera no retrasa el movimiento inicial.
Capturas de escritorio y móvil 390×844 inspeccionadas. Informe regenerable en
`.qa/draw-feedback/report.json`; los tiempos incluyen carga local de QA, no son
una promesa para todos los dispositivos. Se distinguen feedback y confirmación.

23 pruebas de intención/recibos/cola y 40 de persistencia, proyecciones, assets y
transporte aprobadas. `tests/browser-card-ui.cjs` también pasó su recorrido
previo completo (actor/rival/espectador, renovación, pagos y móvil).

La suite amplia ejecutó 637 pruebas: 636 pasaron y una esperaba el recibo sin el
nuevo campo opcional. Se actualizó esa aserción para comprobar el evento y su
conservación tras reinicio; la repetición dirigida de ese archivo y proyecciones
pasó 7/7. No quedaron fallos pendientes; no se presenta como una segunda suite
amplia. Logs amplios en `.qa/draw-feedback/node-tests.txt`. Comprobador documental
y `git diff --check` correctos. Este cambio no adelanta construcciones de rutas
ni modifica reglas, SQL, planes de hosting o el servidor real.

## Entrega en producción · 2026-11-02

Publicado en `main` y Render con el commit `f4584c9`; **Live** a las 06:38:26
(Lima). La combinación final pasó 353/353 pruebas y los recorridos Chrome de
túneles y flujo. La verificación remota confirmó archivos idénticos, UI 8,
práctica con bots, resultados, historial anterior y salud de Supabase.
Evidencia y límites en [Producción](../production.md).

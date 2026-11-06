---
{"id":"match-performance-baseline","status":"done","parent":"match-performance-architecture","depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-06"}
---
# Referencia de latencia y contratos

## Alcance

Instrumentar el recorrido vigente antes de optimizarlo. Contrato y método en
[Rendimiento de partidas](../match-performance.md). Base limpia `244fd2e`, entrega
`51cb1ea`; conservar el resumen, cierre, replay y mercado 2 × 3 recién publicados.

## Hitos y aceptación

- [x] Revisar commits, cambios locales y entrega documentada antes de implementar.
- [x] Definir estados pendiente/confirmado/visible, autoridad, privacidad, lotes
  y límites de atribución antes de tocar código.
- [x] Instrumentación acotada de cola, captura, acción, historial, proyecciones,
  preparación del checkpoint, serialización y RPC; distinguir fases anidadas.
- [x] Correlación de operación/lote enviada exclusivamente al solicitante, sin
  comandos completos, cartas, tokens o identidades en métricas públicas.
- [x] CPU, memoria, GC y retraso del bucle; observación sin alterar resultados
  ni convertir fallos de diagnóstico en fallos de guardado.
- [x] Validar código/protocolo y publicar la instrumentación con versión conocida.
- [x] Medir en producción altas de bots, robos visibles/ocultos y dobles;
  documentar condiciones, límites, limpieza y prioridades.

## Hallazgos iniciales

Cola, committer y métricas básicas no cambiaron desde `094644c`. La migración 007
sí añadió una proyección por jugador disparada por escrituras de metadatos de
historial, incluso en partidas activas; su coste SQL no está separado del RTT de
la RPC. No atribuirle una regresión sin medición. Las estadísticas globales tienen
otro proceso nocturno. `render.yaml` aún dice `free`, pero el plan pagado fue
verificado en el chat Find Render: no sincronizar el Blueprint como parte de QA.

## Registro de implementación previo al cierre

Documentación creada antes de la instrumentación. La Mac tiene una prevención
temporal de reposo por dos horas solicitada por Ángel; no se cambiaron ajustes
permanentes. Se implementó el diagnóstico y se ejecutaron comprobaciones de
corrección/privacidad antes de obtener la referencia de juego en producción.
Las pruebas de código/CI no se presentan como mediciones de Render.

Instrumentación implementada sobre `244fd2e`. Comprobaciones deterministas de
observación, cola, adaptador y checkpoint: 28/28 correctas; sin servidor local
del juego ni conexión a Supabase. Verifican commit antes de entrega/diagnóstico,
rollback, scopes asíncronos, lotes, reintento y que el observador no revierta una
jugada. Comprobador documental y `git diff --check` correctos. En ese punto faltaban CI, publicación y medición; el cierre inferior registra
sus resultados.

CI de `f86ac0f`: 726/727 comprobaciones Node correctas. El caso de recuperación
exigía preparar y guardar la respuesta en menos de 100 ms; se corrige para
comprobar el presupuesto restaurado descontando como máximo el tiempo real de
esa petición. Conserva la comprobación de recuperación y no altera el reloj del
producto. Se repitió el CI completo antes de desplegar.

## Cierre de fase 0

CI de `5a57127`: 727/727 Node y todos los recorridos Chrome correctos
([ejecución](https://github.com/Gecch12/trencitos/actions/runs/42274484220)).
Render `dep-dbn2ad2fngtc73asu9r0`, Live el 2026-11-06 a las 14:07 Lima.
Diagnóstico v1 verificado por HTTP y por mensajes privados de las operaciones.

[Referencia productiva](../qa/match-performance-baseline.json): cuatro altas de
bots, doce robos individuales y dos pares rápidos; siete visibles y nueve
ocultos. Sala privada propia con un bot al jugar, cerrada al terminar; health
volvió de cuatro a tres salas. Sin errores de comandos. El navegador de prueba
se recargó para retirar sus observadores temporales.

Recepción→color oculto: 194–210 ms; reposición visible: 37–57 ms. RPC de robos:
139–297 ms; historial: 10–35 ms. Espera ordinaria <0,1 ms; segundas cartas de los
pares esperaron 165/296 ms detrás del primer guardado. HTTP ligero: 240–410 ms.
No sumar percentiles ni llamar a HTTP una medida pura de red. Los snapshots de
memoria fueron 80/122 MB RSS y 16/21 MB heap usado; no son picos ni evidencia de
fuga. La muestra no acredita capacidad concurrente.

Prioridades: eliminar trabajo repetido del historial, limitar captura/guardado
a la sala, retirar el giro obligatorio tras la confirmación y mantener privacidad,
durabilidad y controles ejecutables. La siguiente comparación debe conservar
este método y registrar el commit; no se ha alcanzado aún la meta de latencia.

Referencia complementaria antes de actualizar: ocho ping/pong de aplicación
por el WebSocket productivo, con tres salas y sin juego, dieron 235–244 ms.
Incluyen despacho/captura del servidor; no son propagación de red pura. Se
conservan en el mismo JSON para comparar el recorrido de conexión después.

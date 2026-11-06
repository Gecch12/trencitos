---
{"id":"match-performance-baseline","status":"active","parent":"match-performance-architecture","depends_on":[],"branch":"main","delivery":"worktree","updated":"2026-11-06"}
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
- [ ] Validar código/protocolo y publicar la instrumentación con versión conocida.
- [ ] Medir en producción altas de bots, robos visibles/ocultos y dobles;
  documentar condiciones, límites, limpieza y prioridades.

## Hallazgos iniciales

Cola, committer y métricas básicas no cambiaron desde `094644c`. La migración 007
sí añadió una proyección por jugador disparada por escrituras de metadatos de
historial, incluso en partidas activas; su coste SQL no está separado del RTT de
la RPC. No atribuirle una regresión sin medición. Las estadísticas globales tienen
otro proceso nocturno. `render.yaml` aún dice `free`, pero el plan pagado fue
verificado en el chat Find Render: no sincronizar el Blueprint como parte de QA.

## Evidencia y siguiente paso

Documentación creada antes de la instrumentación. La Mac tiene una prevención
temporal de reposo por dos horas solicitada por Ángel; no se cambiaron ajustes
permanentes. Implementar diagnóstico, ejecutar comprobaciones previas de
corrección/privacidad y obtener la referencia de juego en producción. Las pruebas
de código/CI no se presentarán como mediciones de Render.

Instrumentación implementada sobre `244fd2e`. Comprobaciones deterministas de
observación, cola, adaptador y checkpoint: 28/28 correctas; sin servidor local
del juego ni conexión a Supabase. Verifican commit antes de entrega/diagnóstico,
rollback, scopes asíncronos, lotes, reintento y que el observador no revierta una
jugada. Comprobador documental y `git diff --check` correctos. Pendientes CI,
publicación y nueva medición productiva; no hay todavía una mejora medida.

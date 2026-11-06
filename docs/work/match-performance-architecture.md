---
{"id":"match-performance-architecture","status":"active","parent":null,"depends_on":[],"branch":"main","delivery":"worktree","updated":"2026-11-06"}
---
# Arquitectura y respuesta de las partidas

Ángel autorizó el 2026-11-06 ejecutar todas las fases consecutivamente, con
documentación y validación, deteniéndose solo por decisiones importantes que
requieran su intervención. Aclaró que Moti acompañaba su pregunta sobre dudas;
no limita esta ejecución. Se mantiene Node y el servidor autoritativo. Las
mediciones de juego se realizan en producción, con salas propias y carga acotada.

Base: `244fd2e`, checkout limpio en `main`; producto publicado desde `51cb1ea`.
La iniciativa modular anterior conserva su cierre histórico. Esta iniciativa
continúa sus contratos, no certifica retrospectivamente DDD/CQRS completos.

## Fases y aceptación

| Fase | Resultado y aceptación |
| --- | --- |
| 0. Medición y contratos | [Referencia reproducible](match-performance-baseline.md), correlación privada por operación/lote, CPU/memoria y recorrido de producción; prioridades basadas en evidencia. |
| 1. Trabajo por jugada | Reducir copias, preparación/serialización e historial según medición; preservar resultados, recibos, privacidad y confirmación durable. Comparación de producción bajo condiciones registradas. |
| 2. Independencia de partidas | Cola, unidad de guardado y recuperación por partida; una escritura lenta de otra sala no bloquea por diseño la mesa. Migración compatible y escritor protegido; reintentos sin duplicados. |
| 3. Presentación | Retirar la carta seleccionada y representar reposición pendiente sin filtrar el mazo; mostrar información confirmada sin esperar una animación completa; misma corrección con movimiento reducido. |
| 4. Reglas verificables | Límites de módulos, repositorio y CQRS protegidos por comprobaciones ejecutables; regresión de latencia/privacidad/reconexión y documentación de operación. |

Metas iniciales, no resultados: p95 clic→confirmación <500 ms desde conexión
comparable; recepción→información visible <50 ms. Registrar carga, muestras,
dispositivo, región y límites; no sumar percentiles de fases ni prometer cero RTT.
La aceptación conjunta incluye partidas existentes, bots, historial/replay,
Compromiso, cuentas y las interfaces de escritorio/móvil. El dominio no depende
de HTTP, UI, Supabase ni métricas; la aplicación coordina y los adaptadores miden.

## Evidencia y próximo paso

Revisión de commits y contratos completada antes de editar código. Las mediciones
del 2026-11-05 corresponden a `891b2d7` y no acreditan rendimiento de esta base.
Fase 0 publicada y medida en `5a57127`; fases 1–4 publicadas en `15636fb`
tras CI completo (736 Node y todos los recorridos Chrome). SQL 009 activo,
continuidad de partidas e independencia de dos salas verificadas en producción.
La comparación redujo captura, ejecución, RPC y espera visual; la mediana
clic→confirmación de 566 ms todavía supera la meta inicial. La fase 1 continúa
con un hito adicional de transporte incremental definido a partir de esta
medición. Las demás fichas conservan evidencia y límites. No confundir menos
bytes o pruebas simuladas con una mejora productiva aún no medida.

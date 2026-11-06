---
{"id":"match-performance-architecture","status":"validated","parent":null,"depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-06"}
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
Fases 0–4 implementadas, publicadas y verificadas; entrega final `d4de3ae`,
[CI completo](https://github.com/Gecch12/trencitos/actions/runs/42289041784) con
741 Node y todos los recorridos Chrome. SQL 009 activo, recuperación de una
partida del servidor anterior, dos salas concurrentes y reconexión final
comprobadas. [Resultado y comparación](../qa/match-performance-results.md).

Clic→estado: mediana 624,55 → 390,05 ms; p95 observado 959,4 → 567,9 ms.
La meta original <500 ms sigue sin cumplirse para la muestra completa: las dos
superaciones corresponden a segundas cartas de pares rápidos, ordenadas detrás
de la primera escritura. Recepción→visible máximo 52,9 ms tampoco acredita
<50 ms en todos los casos. Las altas de bots no muestran una mejora estable.
El padre queda `validated`, no `done`: entrega técnica verificada, metas de
latencia pendientes. No redefinirlas retrospectivamente ni confundir este
recorrido acotado con capacidad para cientos de usuarios.

Siguiente decisión importante: población/región de jugadores que se prioriza
antes de evaluar un cambio de ubicación de servicios y su coste. Oregón↔Lima
conserva unos 240 ms de ping de aplicación. Mantener confirmación durable y
secretos; no introducir una espera artificial en el primer robo para agrupar
comandos sin evaluar su efecto. No hay otro cambio de código pendiente de esta
entrega. Node continúa y el flujo directo en main se mantiene por decisión
explícita de Ángel; CI/AGENTS protegen disciplina, no prohíben un bypass del push.

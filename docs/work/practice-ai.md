---
{"id":"practice-ai","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"worktree","updated":"2026-10-31"}
---
# Inteligencia de bots de práctica

## Alcance acordado

El usuario aprobó primero planificación conjunta, urgencia, recursos/túneles y
cierre; después pidió completar todas las capacidades propuestas. El alcance
incluye búsqueda de turnos futuros, estaciones, nuevos destinos y conservar
entre dos y cuatro billetes iniciales según conveniencia. Solo cambia la política
de práctica; los reemplazos de jugadores ausentes mantienen su estrategia.

## Hitos y aceptación

- [x] Comparar alternativas compartidas sin duplicar cartas ni exceder vagones.
- [x] Priorizar conexiones amenazadas y preservar recursos para la red restante.
- [x] Evaluar riesgo/suplementos de túneles y puntos alcanzables antes del cierre.
- [x] Mantener información privada rival y mazos fuera de la observación del bot.
- [x] Comparar contra la política previa en partidas reproducibles y asientos rotados.
- [x] Completar la suite general y validación documental.
- [x] Validar simulaciones con información pública y presupuesto acotado.
- [x] Validar estaciones, billetes adicionales y ofertas fuera de turno/al cierre.
- [x] Comparar la versión completa con la primera etapa y cerrar QA/documentación.

## Evidencia

2026-10-31, macOS, Node v25.6.1. Entrega local en `main`, referencia al cierre
`bc5666c`, más estos cambios sin commit. Durante el trabajo se integró el tablero
3D desde otro frente; se conservaron sus cambios. No se desplegó esta mejora.

### Versión completa

- `npm test`: **308 pruebas aprobadas**, ninguna fallida. Incluye partidas de
  2–5 jugadores, integración WebSocket, persistencia simulada, privacidad,
  reservas, Express, temporizadores y repetibilidad. Se ejecutó con permiso
  para los puertos de loopback que necesitan las pruebas de integración.
- `node --test tests/practice-advanced.test.js`: 16 pruebas aprobadas tras el
  último ajuste. Cubre estaciones compatibles y anticipadas, ofertas fuera de
  turno/al cierre, elección de 2–4 billetes, nuevos destinos, presupuesto de
  búsqueda, independencia del estado real y muestreo con 110 cartas y tamaños
  públicos de los mazos. Cambiar secretos rivales no cambia la decisión.
- `node scripts/check-docs.js`, `node scripts/check-docs.js --base HEAD` y
  `git diff --check`: estructura/enlaces válidos, impacto revisado y sin errores
  de espacios. Docker incluye los tres módulos nuevos; la prueba de despliegue
  comprueba que no se sirven como archivos públicos. No se construyó una imagen.
- `node scripts/benchmark-bots.js --seed 3001 --seeds 25 --players 4 --opponent stage1`:
  un bot completo contra tres de primera etapa, rotado por los cuatro asientos,
  **100 partidas**, 29 victorias; media **99,82 frente a 95,38 puntos** y
  **3,08 frente a 1,89 destinos completados**. Realizó 51 estaciones y 85 robos
  de destinos, con todas sus ofertas resueltas. Decisión p95 28,35 ms y máximo
  observado 124,38 ms. Datos en
  [practice-complete-benchmark.json](practice-complete-benchmark.json).
- `node scripts/benchmark-bots.js --seed 4001 --seeds 5 --players 4 --opponent heuristic`:
  20 partidas contra la misma política con búsqueda desactivada; 4 victorias,
  101,60 frente a 102,65 puntos y 3,10 destinos para ambos. Esta comparación
  breve **no demuestra una mejora aislada de la búsqueda**. El comportamiento
  anticipatorio sí está cubierto por un escenario dirigido; no se equipara esa
  prueba con superioridad estadística. Datos en
  [practice-search-benchmark.json](practice-search-benchmark.json).

La búsqueda está acotada a tres candidatos, dos muestras y tres turnos propios,
con hasta 48 acciones por rama. Su alcance y el aislamiento de información están
en [arquitectura](../architecture.md). No incorpora servicios externos ni un LLM.
Las estimaciones no alteran las reglas ni la puntuación real.

### Evidencia histórica de la primera etapa

La primera implementación aprobó 55 pruebas específicas y 285 de la suite
general. En 100 partidas (semillas 1001–1025), obtuvo 39 victorias contra el bot
original, 101,05 frente a 93,01 puntos y 1,90 frente a 1,89 destinos; p95 2,54 ms.
Su resultado se conserva en [practice-benchmark.json](practice-benchmark.json);
no corresponde a la versión completa actual.

La política original está congelada en
[practice-bot-baseline.js](../../tests/helpers/practice-bot-baseline.js) y
[bots-baseline.js](../../tests/helpers/bots-baseline.js); la primera etapa en
[practice-bot-stage1.js](../../tests/helpers/practice-bot-stage1.js),
[practice-planner-stage1.js](../../tests/helpers/practice-planner-stage1.js) y
[bots-stage1.js](../../tests/helpers/bots-stage1.js).

Se exploraron semillas 1–5 y 2001–2025 durante el desarrollo. Las semillas
3001–3025 se repitieron tras corregir la consistencia del muestreo; son evidencia
de regresión, no una evaluación ciega. Las rotaciones del mismo reparto no son
muestras independientes. Las partidas simuladas no establecen una tasa de
victoria frente a personas. Los tiempos se midieron localmente con otras pruebas
en ejecución; no son límites garantizados.

## Siguiente paso

Todas las capacidades acordadas están implementadas y validadas en este checkout.
Para observarlas en una sala local hay que reiniciar su proceso Node y abrir
Practicar; recargar el navegador no carga el nuevo backend. El commit y el
despliegue quedan fuera de esta entrega local. El índice documental está en
[docs/README.md](../README.md).

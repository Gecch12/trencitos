---
{"id":"match-history-progress","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-03"}
---
# Historial completo, modo H y puntaje propio

Implementación solicitada tras Moti, en worktree separado por petición expresa.
Base: `350b193`; no copia ni modifica los cambios sin commit del chat «cambios»
en el checkout principal. La integración posterior debe conservar sus mejoras de
cartas, renovación de mesa y recuperación por cuenta. No se ha desplegado.

## Aceptación

- [x] Registro durable completo de hechos, una fila por turno y eventos de sistema.
- [x] Túneles: revelación, sobrecoste, pago/extra cero/desistimiento/tiempo agotado.
- [x] Destinos iniciales/nuevos con recibidos, conservados y descartados; elecciones
  tardías anexadas a su turno de origen; privacidad en vivo y replay.
- [x] Desconexión, regreso, bot, devolución de control y pausa/reanudación por ausencia.
- [x] H muestra toda la red propia y distingue conexiones cumplidas con oro animado;
  préstamos diferenciados, movimiento reducido y pestaña oculta sin animación.
- [x] Puntaje privado, desglose y `+10` provisional público con liderazgo/empates.
- [x] Cálculo exacto del camino largo con caché por red y poda de ciclos, contrastado
  contra búsqueda exhaustiva en 80 redes pequeñas y redes densas eulerianas y
  con ocho extremos impares.
- [x] Cerrar verificaciones de navegador, regresión y documentación.

Contratos: [historial](../history-replay.md), [dominio](../domain.md) y
[arquitectura](../architecture.md). Las partidas antiguas mantienen los datos
que realmente guardaron; si se continúa una partida sin diario, se marca parcial.

## Evidencia y siguiente paso

Verificación local del 2026-11-03:

- `node --test --test-concurrency=1 tests/*.test.js`: 669/669, 159,4 segundos.
- Revisión focal de seis archivos de pruebas: 57/57, incluidos los contratos
  actualizados de H, metadatos de reparto, privacidad y conexiones.
- `node tests/browser-match-progress.cjs`: cuatro grupos de comprobaciones,
  sin errores, por HTTP/WebSocket real con Chrome. Construcción, H, movimiento
  reducido, puntos privados y bono público, dos robos, nuevos destinos,
  desconexión/reconexión, móvil, inglés y replay público.
- Capturas de escritorio y móvil revisadas: desglose legible, brillo dorado y
  resto de vías propias azul claro. Artefactos regenerables y `report.json` en
  `.qa/match-progress/`, usando puerto efímero y archivos temporales, sin Supabase.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

Los hashes de repartos y trazas de bots anteriores se conservan; las fixtures
históricas no se reescribieron. Los metadatos nuevos se contrastan por separado.

## Integración en main

Ángel solicitó trasladar la implementación a main. Origen `f92948c`; combinación
sobre main local con el sombreado de billetes, túneles sobre el tablero, cartas,
recuperación por cuenta y retiro del color blanco ya presentes. Se conserva el
worktree de origen; no se hace push ni despliegue.

- [x] Combinación por archivo sobre una copia verificada del estado local.
- [x] Renovación de mesa agrupada después del robo, sin aviso de sistema duplicado;
  mantiene el historial legado y las miniaturas públicas retiradas.
- [x] Ciclo de render compartido con sombreado de 180 ms, cartas del túnel y brillo.
- [x] Verificar regresión completa, recorridos de navegador y preservación de main.

Respaldo de los archivos afectados, SHA-256 del estado local, plan de combinación
y evidencia en `.qa/history-integration-2026-11-03/`.

Verificación de la integración en main:

- Suite completa: **674/674**, 166,1 segundos; sin fallos ni omitidas.
- Revisión focal: **61/61**. Las renovaciones se contrastan por turno, pues el
  reparto inicial también puede renovar la mesa y ahora conserva ese hecho.
- Chrome con HTTP/WebSocket real: **31 grupos**, cero errores: historial/H/puntos
  (4), mapas y túneles (7), robos y persistencia simulada (16), miniaturas/pagos (4).
  La persistencia remota de la prueba de robos es un doble local controlado;
  no se conectó con producción. Captura integrada de escritorio inspeccionada.
- Los **151 archivos ajenos** conservan sus SHA-256. Las traducciones existentes
  conservan todos sus valores; el índice Git no se modificó.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

Entrega como cambios locales en `trains/trencitos`, rama `main`, sin commit,
push ni despliegue; los cambios previos de otros chats siguen presentes.
La rama/worktree de origen se conserva. Siguiente paso: revisar y publicar el
conjunto cuando se solicite.

## Ajustes de presentación acordados · 2026-11-03

Solicitud posterior a Moti, implementada directamente sobre los cambios locales
de main. Alcance y comportamiento en [el contrato del historial](../history-replay.md):
avatares centrados, miniaturas compactas, robos sin etiquetas de origen y mazo
con reverso también para el dueño; sin números de turno ni «Bot» redundante;
cambios del camino más largo separados como avisos con trofeo y texto de empate.

- [x] Presentación compartida por historial y replay; registro y privacidad del
  servidor conservados, sin reescribir grabaciones existentes.
- [x] Verificar pruebas pertinentes, navegador e impacto documental.

Respaldo previo y evidencia de esta revisión en
`.qa/history-refinements-2026-11-03/`:

- 66/66 pruebas focalizadas: diario, presentación, privacidad, consultas de
  historial, streaming del replay, interfaz e idiomas.
- Chrome con HTTP/WebSocket real y estado temporal: cinco grupos de
  `browser-match-progress.cjs` y cuatro de `browser-card-ui.cjs`, sin errores
  de navegador. Robos desde dueño/rival/espectador, tamaño de miniaturas,
  centrado geométrico de ambos iconos, avisos separados, enlace al paso correcto
  del replay, recarga, móvil sin desbordamiento y traducción inglesa.
- Capturas de historial de escritorio, móvil y replay inspeccionadas. El primer
  intento móvil de QA intentaba capturar el panel cerrado; se corrigió la prueba
  para abrirlo con su botón antes de verificarlo.
- Los 193 archivos preexistentes ajenos al ajuste conservan su contenido por
  SHA-256; el cambio se limita a diez archivos sobre el estado local previo.
- `node scripts/check-docs.js --base HEAD`, `node scripts/check-docs.js` y
  `git diff --check`: correctos.

Siguiente paso: revisar y publicar el conjunto cuando se solicite.
Entrega local en main, sin commit, push ni despliegue.

## Transparencia y cronología · 2026-11-03

Solicitud aprobada después de Moti. Se añaden reposiciones por carta y se presenta
el diario en subsecciones cronológicas, distinguiendo renovación entre robos y
posterior al último. En replay cerrado todos los visitantes autorizados pueden
consultar cada POV y la información de juego guardada; se conservan la privacidad
en vivo, el acceso a partidas privadas y la auditoría por identidad.

Código integrado localmente, sin commit ni despliegue. Evidencia y alcance del
reinicio solicitado en [Transparencia y reinicio](replay-transparency-reset.md).

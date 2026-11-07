---
{"id":"social-competitive-followups","status":"idea","parent":null,"depends_on":["profile-social-statistics"],"branch":null,"delivery":"none","updated":"2026-11-06"}
---
# Pendientes sociales, competitivos y de análisis

Ángel pidió el 2026-11-06 documentar los frentes que quedan para después de las
mejoras del resumen y del cierre de partida discutidas en Moti. Esta ficha
registra trabajo diferido; no acredita implementación ni autoriza activarlo
como parte de esas mejoras. Separar fichas cuando cada frente tenga una entrega
y criterios de aceptación definidos.

## Frentes por definir

- [ ] **Clasificación de habilidad.** Estudiar nivel por mapa y reglas compatibles,
  partidas amistosas/clasificatorias y tratamiento de rivales, empates, abandonos
  e incertidumbre inicial. Explicar cada cambio de nivel. Las estadísticas y
  percentiles actuales describen rendimiento, no son un rating competitivo.
  Algoritmo, condiciones de acceso y temporadas quedan por definir.
- **Chat de la mesa y referencias a tramos.** Trabajo autorizado y separado en
  [su ficha](room-chat.md). El usuario excluyó mensajes rápidos, privados y
  referencias a billetes de destino; la consulta de un tramo es voluntaria y local.
- [ ] **Reportes de abuso y revisión humana.** Ángel los pospuso expresamente el
  2026-11-06 al aprobar el chat. Definir canal de reporte, identidad/autoridad de
  revisores, evidencia y plazo de conservación, respuesta al reportante,
  sanciones y revisión de errores. El filtro y el silencio personal de la primera
  entrega no constituyen un sistema de reportes. No crear botones sin flujo real
  ni sanciones graves automáticas basadas únicamente en coincidencias léxicas.
- [ ] **Revancha coordinada.** Diseñar invitación y confirmaciones visibles,
  conservando la posibilidad de seguir explorando el resultado. La revancha
  actual continúa disponible; no introducir votaciones nuevas en el cierre
  visual. Quién inicia, esperas y jugadores ausentes quedan por definir.
- [ ] **Análisis automático.** Evaluar explicaciones de decisiones y posibles
  mejoras estratégicas apoyadas en el replay. Separar hechos registrados de
  hipótesis; un destino incompleto no prueba por sí solo qué decisión causó
  una derrota. No incluir recomendaciones automáticas en el resumen descriptivo.

Compras, compartir mapas y conservación del contenido adquirido tienen su
ubicación canónica en [Preparación comercial](commerce.md).

## Fuentes y evidencia

Registro inicial revisado el 2026-11-06; la ampliación del chat se realizó sobre
`main` con cambios locales previos de otras entregas. Contratos existentes:
[perfil y estadísticas](../profile-social-statistics.md),
[historial y replay](../history-replay.md) y [mesa adaptable](board-first-mobile.md).
Los componentes actuales están en `frontend/room-chat.js` (chat),
`backend/server.js` (revancha) y `backend/player-statistics.js` (estadísticas).
La validación del chat vive en [su ficha](room-chat.md); este registro de pendientes
no activa reportes, clasificación, revancha coordinada ni análisis automático.

## Siguiente paso

Mantener estos frentes fuera de la implementación del resumen, cierre integrado
y recuento animado. Al retomar uno, definir su alcance y aceptación, contrastar
el estado vigente y separarlo en una ficha propia si requiere entrega autónoma.

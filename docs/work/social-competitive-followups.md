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
- [ ] **Chat funcional de la mesa.** Definir mensajes durante y después de la
  partida, mensajes rápidos/reacciones, silencio y alcance de conservación.
  Actualmente solo hay un componente deshabilitado; hacerlo visible en el
  lateral del cierre no incluye transporte ni envío. Considerar permisos de
  participantes/espectadores, bloqueo y límites de frecuencia al diseñarlo.
- [ ] **Compartir selecciones al terminar.** Referenciar destinos o tramos en
  el chat para que otros participantes puedan abrirlos voluntariamente, sin
  mover sus cámaras automáticamente. Depende del chat y de los permisos de
  consulta; no amplía la información disponible durante una partida activa.
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

Revisión documental y de código el 2026-11-06, sobre `main` sin cambios locales
previos. Contratos existentes: [perfil y estadísticas](../profile-social-statistics.md),
[historial y replay](../history-replay.md) y [mesa adaptable](board-first-mobile.md).
Los componentes actuales están en `frontend/index.html` (chat deshabilitado),
`backend/server.js` (revancha) y `backend/player-statistics.js` (estadísticas).
No se ejecutaron pruebas funcionales ni se desplegaron cambios por este registro.

## Siguiente paso

Mantener estos frentes fuera de la implementación del resumen, cierre integrado
y recuento animado. Al retomar uno, definir su alcance y aceptación, contrastar
el estado vigente y separarlo en una ficha propia si requiere entrega autónoma.

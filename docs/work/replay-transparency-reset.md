---
{"id":"replay-transparency-reset","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Foco temporal, replay transparente y reinicio de partidas

Ángel aprobó implementar el foco de construcciones rivales y túneles, la
transparencia de cada POV del replay, subsecciones cronológicas del historial y
el contador de vagones en billetes. También solicitó reiniciar los guardados
locales y de producción, preservando cuentas y perfiles.

## Aceptación

- [x] Foco temporal sumado al highlight persistente; 500/350 ms y movimiento existente.
- [x] Túneles iluminados durante sus etapas y restauración al terminar.
- [x] Replay de juego completo para cada visitante autorizado; privacidad en vivo intacta.
- [x] Reposición y renovación ubicadas entre robos o después del último.
- [x] Reserva de vagones visible fuera de la lista desplazable.
- [x] Validación final y reinicio local con respaldo verificado.
- [x] Respaldo y reinicio de producción, sin desplegar código local.

## Evidencia y siguiente paso

Baseline de 917 archivos y copias de fuentes en `.qa/transparency-2026-11-03/`.
Se trabajó sobre los cambios locales preexistentes de main, preservándolos.
Ángel autorizó posteriormente publicar todos los cambios; la entrega se registra
en [Producción](../production.md).

Validación: 681/681 pruebas Node correctas y 26 grupos de navegador: foco y
construcción (6), túneles (6), replay e historial (5), mapa de billetes (7),
renovación de mesa entre robos o posterior al último (2), incluyendo móvil.
La suite final está en `final-suite.txt` dentro de la carpeta QA; validadores
documentales y `git diff --check` correctos.
El resumen verificable de pruebas y reinicios está en `completion-report.json`.
Tras separar visualmente mesa retirada y mesa nueva se repitieron las dos
pruebas de renovación en escritorio/móvil, ambas correctas. Ninguno de los
917 archivos del baseline desapareció; los cambios existentes se conservaron.

Reinicio local completado: 42 partidas y 44 archivos respaldados con SHA-256
verificado en `local-reset-backup/`; quedaron cero partidas y cero salas.
Informe: `local-reset-report.json`. Se reinició el servidor local en puerto 3000
y se verificó `/healthz` con almacenamiento file y cero salas. Los nuevos
guardados creados después del reinicio se conservan.

El procedimiento remoto se preparó en `production-reset/reset.sql` y
`restore.sql` dentro de esa carpeta de QA. Se verificó con PGlite: respaldo en
schema privado, vaciado de partidas/frames/checkpoint, preservación de perfiles y
vínculos de invitados, restauración y rechazo de un segundo reinicio accidental.

## Reinicio de producción completado

Tras actualizar Codex se recuperó el acceso limitado a las pestañas de Chrome.
Se ejecutó el procedimiento autorizado en el proyecto Supabase Trencitos
`xnvskxwbibrxhozgcube`: 48 partidas y 5.083 frames quedaron respaldados en el
schema privado `trencitos_reset_20261103`. Se vaciaron las tablas activas de
partidas/frames y el checkpoint de salas, renovando el identificador del escritor
para impedir que un proceso anterior repueble los datos.

Render `trencitos-swamp` se suspendió a las 15:51 y se reanudó a las 15:52 Lima
del 2026-11-03. Se mantuvo el commit publicado
`b8e7b3726f846db6aa7630a2bc4976b5a3156c5c`; no hubo despliegue de código.
La verificación posterior confirmó cero partidas, cero frames y cero salas,
con una cuenta, un perfil y dos vínculos de invitados conservados. `anon`,
`authenticated` y `service_role` no tienen USAGE sobre el schema de respaldo.
`/healthz` respondió correctamente con `storage: supabase` y `rooms: 0`.

Evidencia local en `production-reset/`: `before.json`, `report.json`,
`after-reset.png`, `verification.png`, `render-suspended.png`,
`render-resumed.png` y `health.json`. La consulta de verificación de solo lectura
quedó guardada en el SQL Editor. `restore.sql` conserva la recuperación y rechaza
sobrescribir partidas creadas después del reinicio; no se ejecutó en producción.

Implementación, reinicios y publicación conjunta completados. La revisión
`ef65487` quedó Live tras CI completo aprobado; 48 recursos contrastados,
salud correcta y cero salas después de cerrar la comprobación temporal.
Evidencia de entrega en [Producción](../production.md).

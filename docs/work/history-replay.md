---
{"id":"history-replay","status":"validated","parent":null,"depends_on":["navigation-rooms","identity"],"branch":"main","delivery":"worktree","updated":"2026-10-31"}
---
# Historial, repetición, idiomas y ajustes de observación

Implementación autorizada después del análisis con `$moti`. Contrato canónico:
[historial y replay](../history-replay.md). No implementa nuevos mapas.

## Aceptación

- [x] Historial durable de resultados completos y abandonos parciales, separado
  de la vida de la sala, para humanos/bots y práctica.
- [x] Registro de acciones y estados reales, velocidades 0,5×–8×, búsqueda y
  perspectivas; participantes completos al cerrar y público sin secretos.
- [x] Identidad de invitado y vinculación segura/idempotente con Google.
- [x] Español predeterminado e inglés seleccionable en la app, incluidos mensajes
  y registros; datos de jugadores opacos a la traducción.
- [x] Observador sin panel blanco, robots para bots/reemplazos y aviso de sala ausente.
- [x] SQL aditivo, guardado atómico, deduplicación, cadena de auditoría y pruebas.

## Evidencia · 2026-10-31

- Suite completa secuencial: 335/335, 74,6 s. Incluye motor, simulaciones de partidas
  2–5 jugadores, privacidad, conexión/reconexión y UI existente.
- PostgreSQL/PGlite: migración repetible, checkpoint+pasos atómicos, retry idempotente,
  bloqueo de escritor anterior, RLS y reclamación exclusiva del invitado.
- HTTP/WS: historial invitado tras recarga/reinicio, replay activo rechazado,
  auditoría privada y mismo ID de acción sin paso ni robo duplicado.
- OAuth simulado: identidad verificada, historial unido sin duplicados, bloqueo
  de otra cuenta y rotación de invitado al cerrar sesión. No es acceso Google real.
- Navegador IAB local: fixture completo de 139 pasos, inicio/final, avance,
  reproducción/pausa a 8×, cinco velocidades, perspectiva pública/participante,
  cartas iniciales y resultados reales. Sin errores/advertencias de consola.
- Revisión visual de escritorio 1440×900, tablet 768×1024 y móvil 390×844, ES/EN:
  [escritorio](../qa/history-replay/replay-desktop-en.jpg),
  [móvil público](../qa/history-replay/replay-mobile-es.jpg),
  [historial tablet](../qa/history-replay/history-tablet-en.png).
- Visitante ajeno: replay público con una sola perspectiva, sin mano, detalle
  privado ni enlace de auditoría; resultados públicos sin destinos.
- Enlace watch inexistente: alerta al inicio de Partidas, en inglés, verificada.
- Revisión final de motor/presentación, traducción y archivo: 30/30; auditoría
  rechaza un paso alterado. Replay abandonado termina con «Partida abandonada»,
  sin ganador ni puntuación final ficticia.
- Regresión final de persistencia/servidor/práctica y presentación: 63/63.
  Los bots de práctica también se pausan si falla el guardado del historial.
- Detalle privado de replay: cartas reveladas del túnel y suplemento verificados
  en el paso original; cero advertencias/errores de consola tras el recorrido.
- `check-docs.js`, comprobación de impacto y `git diff --check` correctos.

## Entrega y siguiente paso

Publicación autorizada por el usuario. `003_match_archive.sql` aplicada en Supabase
con respuesta «Success. No rows returned»; el editor coincidía exactamente con el
archivo local. Antes de publicar: salud correcta, Supabase y cero salas activas;
la rama remota coincide con la base local. Falta desplegar el commit exacto y
verificar API/WS e interfaz en producción.
No se recupera retroactivamente el detalle de partidas borradas antes de grabarse.
La emulación no certifica Safari/iOS/Android físicos. Los contenidos futuros,
notificaciones, amigos y chat siguen con el alcance de esqueleto acordado.

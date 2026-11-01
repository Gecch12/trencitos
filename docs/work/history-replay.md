---
{"id":"history-replay","status":"validated","parent":null,"depends_on":["navigation-rooms","identity"],"branch":"main","delivery":"released","updated":"2026-10-31"}
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

Publicado en `main` y Render, con las migraciones aditivas 003 y 004 aplicadas en
Supabase. La [ficha de producción](../production.md) conserva el commit exacto,
despliegue y horarios; no se modificaron credenciales ni variables.

- [QA remoto completo](../qa/production-history-2026-10-31.json): partida natural
  de 178 pasos, puntos y procedencia, cadena de auditoría válida, reconexión sin
  duplicar acciones, replay público filtrado y abandono privado con progreso parcial.
- [Cierre sellado](../qa/production-history-final-2026-10-31.json): salir de una
  práctica finalizada conserva exactamente la auditoría; archivo privado inaccesible
  a terceros y partida completa previa recuperada tras reiniciar.
- [Comprobación de entrega](../qa/production-history-release-2026-10-31.json):
  recursos públicos coincidentes con la revisión final, replay previo y Supabase sano.
- Navegador en producción: ES/EN y preferencia tras recarga, aviso de sala ausente,
  replay público con controles 0,5×–8×, móvil/tablet sin desbordamiento horizontal,
  espectador sin mano vacía y cuatro bots con icono de robot. Capturas:
  [aviso](../qa/history-replay/production-missing-room.png) y
  [replay móvil](../qa/history-replay/production-replay-mobile.png).
- La lectura inicial monolítica fallaba con un replay largo; la paginación recuperó
  los 169 pasos ya persistidos. Se verificaron permisos antes de leer páginas,
  continuidad y roles SQL. También se corrigieron LONG/Pending y Draw en inglés.
- Tras el ajuste del sellado: 30/30 pruebas pertinentes de archivo, servidor,
  práctica y almacenamiento. Última traducción: 3/3 pruebas de idiomas.

La entrega está publicada; la ficha conserva `validated` mientras la dependencia
[identidad](identity.md) completa su matriz con una segunda cuenta real.

Siguiente paso: vigilar crecimiento y backups de los archivos y completar la
matriz en dispositivos físicos de [calidad](quality.md). No se recupera
retroactivamente el detalle de partidas borradas antes de grabarse. La unión del
historial invitado→Google se verificó con OAuth simulado; esta entrega no repitió
esa unión con una cuenta Google real. La emulación no certifica Safari/iOS/Android
físicos. Los contenidos futuros, notificaciones, amigos y chat siguen con el
alcance de esqueleto acordado.

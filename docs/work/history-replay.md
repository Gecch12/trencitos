---
{"id":"history-replay","status":"validated","parent":null,"depends_on":["navigation-rooms","identity"],"branch":"main","delivery":"released","updated":"2026-11-06"}
---
# Historial, repetición, idiomas y ajustes de observación

Implementación autorizada después del análisis con `$moti`. Contrato canónico:
[historial y replay](../history-replay.md). No implementa nuevos mapas.

Refinamiento local de 2026-11-02: historial compacto y puesto del usuario por
identidad, registrado y verificado en [Controles de mesa y sala](table-controls.md).
La entrega histórica de abajo no incluye todavía este refinamiento.

## Recuperación local de JSON en una repetición · 2026-11-06

En `main` sobre `141e2ea`, con cambios locales preexistentes de otros chats,
`npm start` fallaba con `STATE_LOAD_FAILED`. Ambos manifiestos eran JSON válidos
y compartían una grabación cerrada dañada: su línea 6 contenía el snapshot 5
truncado seguido del paso 12. El tamaño coincidía con el manifiesto, pero había
247 líneas frente a 254 pasos esperados. No se determinó qué escritura produjo
el daño; esta reparación no acredita haber eliminado su causa.

- Respaldo íntegro de los 19 archivos, verificado por SHA-256, en
  `.qa/state-recovery-2026-11-06/original/`. Las otras 16 partidas pasan la
  auditoría completa y permanecen idénticas.
- En la partida afectada se verificaron 247 frames originales: 0–4 y 12–253.
  Los pasos 12–31 son diferencias que dependen de estados ausentes; se conservan
  como evidencia, pero la reproducción salta al snapshot verificado 32.
- La copia derivada conserva los primeros cinco frames sin cambios y los
  estados 32–253, con 227 pasos reproducibles. Cada paso posterior al salto
  conserva `sourceSeq`/`sourceHash`, con una nueva cadena identificada como
  recuperación. Los originales nunca se reescriben en el respaldo.
- Se conservan las 17 partidas, sus IDs, jugadores, resultados, reclamaciones
  y las salas de cada manifiesto. El estado final reconstruido coincide
  exactamente con el tramo original válido. La grabación afectada lleva
  `complete:false` y un aviso visible que explica los 27 pasos omitidos.
- El cargador ahora identifica archivo y línea de JSON inválido en replay,
  sin filtrar fragmentos privados. Conserva el rechazo de corrupción y la
  recuperación de un prefijo válido desde `.bak`.

Validación con Node **22.16.0**:

- **39/39** pruebas de almacenamiento, checkpoints, archivo, carga legada y
  servidor de historial. La primera ejecución del sandbox no pudo abrir puertos
  (`EPERM`); la repetición autorizada con estado temporal pasó completa.
- `npm start` en puerto 3128 con copia aislada: `/` y `/healthz` HTTP 200,
  almacenamiento sano, cero salas activas y ping/pong WebSocket. Servidor cerrado
  al terminar; no queda un segundo proceso usando el guardado habitual.
- Chrome **156.0.8078.80**: aviso visible, navegación hasta **227/227**, resultados
  coincidentes por asiento y cero errores de página. La respuesta de esa
  repetición privada se inyectó solo en el navegador de prueba; no se cambió
  su visibilidad en el servidor ni en los archivos instalados.
- Instalados el manifiesto, su `.bak` y el único `.jsonl` reparado, después de
  verificar que ninguno de los 19 archivos había cambiado desde el respaldo.
  El cargador habitual lee las 17 partidas; las otras 16 grabaciones siguen
  idénticas y el respaldo conserva los hashes originales.

Evidencia, captura y scripts en `.qa/state-recovery-2026-11-06/`, excluidos de Git.
Documentación y `git diff --check` correctos. El diagnóstico seguro del cargador
se publicó posteriormente con `51cb1ea`, según [Producción](../production.md).
La recuperación de los archivos permanece local y no se copió a producción.
Conservar el respaldo para investigar el origen de la corrupción.

## Reparación local del arranque · 2026-11-03

En `main` sobre `350b193` más los cambios locales existentes, el manifiesto y
su `.bak` esperaban 224 pasos (27.883.190 bytes) de una partida activa; el archivo
disponible contenía 206 pasos completos (25.232.240 bytes). Los 206 hashes eran
válidos y la sala conservaba un estado válido posterior. No se pudo determinar
la causa del desacuerdo entre manifiesto y archivo.

- Se preservaron y comprobaron por SHA-256 los 38 archivos originales en
  `.qa/state-recovery-2026-11-03/original/`. Las otras 35 grabaciones pasaron la
  auditoría completa de hashes y cierre.
- La recuperación conserva el prefijo íntegro y el estado guardado de la sala,
  añade un snapshot con aviso explícito del salto y marca la grabación parcial.
  No inventa los movimientos ausentes ni reescribe pasos históricos.
- El cargador conserva su rechazo de archivos dañados, pero ahora informa el
  archivo y los tamaños esperados/disponibles. Los errores JSON no muestran
  fragmentos privados del guardado.
- Node **22.16.0**: **41/41** pruebas de almacenamiento, checkpoints, archivo y
  restauración. Evidencia local en `.qa/state-recovery-2026-11-03/`.
- `npm start` con ese Node y una copia aislada en puerto 3128: inicio correcto,
  `/` y `/healthz` con HTTP 200, una sala restaurada y ping/pong WebSocket.
  La sala vacía espera la reconexión de un participante antes de admitir
  espectadores, como exige el contrato existente. El servidor de prueba se cerró.
- Recuperación instalada en `room-state.json`, su `.bak` y el único `.jsonl`
  afectado. Se comprobó que no hubo cambios desde el respaldo, que los archivos
  instalados coinciden con los preparados y que las otras 35 grabaciones siguen
  intactas. La sala (salvo referencias del replay), identidades y reclamaciones
  se conservaron exactamente. Documentación y `git diff --check` correctos.

Este ajuste y la recuperación son locales; no forman parte de la publicación
histórica de esta ficha. Siguiente paso: iniciar normalmente con `npm start` y
reconectar desde la sesión del jugador; conservar el respaldo para investigar
el origen del desacuerdo sin perder evidencia.

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

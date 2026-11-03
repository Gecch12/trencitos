# Producción

## Versión actual · 2026-11-03, 09:23 (Lima)

- Código `8146ffafbffa0c3e26a48f8f9157216a82dea13c` en `origin/main`.
  Lobby con tarjetas visuales de mapas, ajustes agrupados, vagón compacto y
  colección de seis variantes bajo demanda. Alcance en [la ficha](work/room-map-cards.md).
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbkusdlg1s2s73dr7u50)
  publicó el commit exacto, **Live** a las 09:23:30 Lima. Sin migraciones SQL,
  cambios de variables, planes ni credenciales; no había salas antes de desplegar.
- [633/633 pruebas](qa/room-setup/node-result.json), más Chrome con dos clientes:
  selección autorizada, persistencia/recarga, teclado, inicio de Sudamérica, ES/EN
  y móvil. Preview de 21 familias en ocho tamaños, sin recorte ni render continuo.
- [Verificación HTTP](qa/room-setup/production-http.json): 45 recursos públicos
  idénticos al código y siete rutas privadas con 404. Chrome en producción:
  sala de QA privada, Sudamérica confirmada mediante tarjeta y seis variantes
  de Midsommar visibles en el diálogo, sin errores de consola. La sala temporal
  se cerró después de comprobar. [Captura](qa/room-setup/production-desktop.png) y
  [colección](qa/room-setup/production-collection.png).
- El checkout local de `main` tenía cambios concurrentes de otro trabajo.
  Permanecen intactos: se publicó desde el worktree aislado a `origin/main`,
  sin incorporar ni guardar cambios ajenos. Ese checkout local aún requiere
  reconciliar sus ediciones antes de actualizarse. La revisión publicada es la
  indicada arriba; los commits documentales posteriores no reinician el servicio.

## Entrega anterior · 2026-11-03, 02:26 (Lima)

- Código: `33b42802759255b285dc6b24c54a85ad4ad91eb8`, publicado en `main`.
  Arquitectura modular, mapas versionados, Sudamérica 3.3 beta, replay de análisis,
  construcción sincronizada, bots en worker y menor trabajo de persistencia.
  Se preservaron e integraron los diseños de vagones del checkout original.
  Alcance y aceptación en [la entrega conjunta](work/south-america-release.md).
- [Despliegue Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbkop4h5efls73f7sqj0):
  revisión exacta, **Live** a las 02:26:52, Node 26.13.0. Auto-Deploy sigue
  desactivado. La migración aditiva `005_checkpoint_delta.sql` se aplicó antes
  de publicar; mantiene el escritor exclusivo, commit atómico y compatibilidad
  con el protocolo previo. Sin contratación, cambio de plan ni credenciales.
- [633/633 pruebas](qa/south-america-release/stream-node-result.json) con la revisión
  final; ocho prueban streaming, compatibilidad y cancelación del replay.
  Las verificaciones anteriores de Docker y navegador están en la ficha; no se
  presentan como una nueva ejecución de todos los navegadores en producción.
- [Partida natural local](qa/south-america-worker/browser-report.json): anfitrión
  y cuatro bots, **190 turnos**, 189 vagones, cierre y puntuación correctos;
  auditoría, replay, privacidad y escritorio/móvil comprobados.
- [Verificación HTTP publicada](qa/south-america-release/production-http-stream.json):
  43 recursos públicos idénticos y siete rutas privadas con 404; salud HTTP 200,
  `ok: true`, `storage: supabase`, sin salas abiertas al comprobar.
- [Medición remota final](qa/latency-update/production-final.json): ocho robos en
  salas privadas de QA, mediana de confirmación **393 ms**, frente a **537 ms**
  [antes](qa/latency-update/production-before.json), aproximadamente 27% menos.
  Estado y confirmación llegan en un mismo frame negociado. Es una muestra pequeña,
  no una prueba de carga; el RTT continúa cerca de 237 ms.
- Replay antiguo de cinco jugadores: recuperados sus **330 pasos** y navegado hasta
  `330/330` en Chrome tras publicar. Sus 50 MB almacenados se procesan por páginas
  de 16 frames; la API sigue respondiendo durante la lectura. La comprobación anterior
  coincidió con un reinicio de proceso sin causa registrada; no se afirma un OOM.
  Captura local `.qa/production-south-america/legacy-replay-final.png`.
- [Chrome en producción](qa/south-america-release/production-browser-final.json): anfitrión y cuatro bots en práctica privada, selección
  de billetes, robo y construcciones; después del reinicio se recuperaron **147/147**
  pasos y el mismo mapa. Esta comprobación remota se cerró como abandonada; la
  partida natural completa de 190 turnos es la ejecución local enlazada arriba.
  Chrome no registró errores de consola. Capturas ignoradas por Git en
  `.qa/production-south-america/`.

El balance competitivo y la revisión visual personal de Sudamérica permanecen
como evaluación beta acordada. No se separaron repositorios ni servicios: el
monorepo tiene límites frontend/backend/dominio y conserva un solo despliegue.
Los commits documentales posteriores registran evidencia sin reiniciar Render.

## Entrega anterior · 2026-11-02, 06:38 (Lima)

- Código: `f4584c9a3b17ed0b69f2e720e809b5dfc20c953e`, publicado en `main`.
  Incluye pagos base/extra/total y desenlace animado del túnel para toda la mesa,
  devolución al desistir, UI 8, mejoras de cartas, billetes, resultados y selector
  de vagones. Alcance en [flujo](work/game-flow-ui.md),
  [cartas](work/card-interactions.md) y [selector](work/wagon-preview-performance.md).
- [Despliegue Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbk7c2h42hec73erof9g):
  manual del commit exacto, **Live** a las 06:38:26; duración 38,9 s,
  Node 26.13.0, `npm install --omit=dev` y `npm start`.
  Auto-Deploy continúa desactivado. Sin migraciones SQL ni cambios de variables
  o credenciales. El usuario autorizó publicar; no había salas antes del despliegue.
- Antes de publicar: **353/353 pruebas** y recorridos Chrome de túneles y flujo
  correctos. Los seis desenlaces se verificaron localmente con constructor,
  rival y espectador, incluyendo reconexión, móvil y movimiento reducido.
- [QA remoto HTTP/WebSocket](qa/production-tunnels-2026-11-02.json): 17 recursos
  públicos coinciden byte a byte con el commit y seis rutas privadas devuelven
  404. El replay completo anterior de 178 pasos continúa accesible tras reiniciar.
- Práctica aislada en producción: protocolo UI 8, billetes iniciales, dos robos,
  turnos de tres bots y resultados con totales coherentes. Se comprobó que las
  manos de los bots siguen privadas y se cerró únicamente esa práctica de QA.
  Salud final: HTTP 200, `ok: true`, `storage: supabase`, `rooms: 0`.
- Chrome sobre HTTPS: directorio conectado y controles habilitados, sin errores
  ni advertencias de consola. Evidencia local del despliegue en
  `.qa/release-f4584c9/render-live.png` (ignorada por Git).

La verificación remota es un smoke test del despliegue; no repite los seis
desenlaces de túnel ni la matriz de dispositivos. Los archivos de esos flujos
coinciden con los validados localmente. El servidor local del usuario permanece
sin reiniciar. Los commits documentales posteriores solo registran evidencia.

## Entrega anterior · 2026-10-31, 20:40 (Lima)

- Código: `552e241a551f95aec2115a4336dfa8f48f3b2383`, publicado en `main`.
  Incluye historial durable, desglose de puntuación, replay y auditoría, identidad
  invitada vinculable a Google, ES/EN y correcciones del espectador. Alcance y
  pruebas locales en [la ficha](work/history-replay.md).
- [Despliegue Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbj9grrbc2fs73c6odd0):
  commit exacto, **Live** a las 20:40:35; Node 26.13.0, `npm install --omit=dev`
  y `npm start`. Auto-Deploy continúa desactivado. Se aplicaron en Supabase las
  migraciones aditivas 003 (archivo) y 004 (lectura paginada), verificando que el
  editor contenía exactamente el SQL local. Sin cambios de credenciales o variables.
- [QA remoto HTTP/WebSocket](qa/production-history-2026-10-31.json), ejecutado sobre
  `5112690`: partida natural completa de **178 pasos**, puntos y procedencia,
  auditoría íntegra, historial activo sin replay prematuro, reconexión que conserva
  puesto/mano/billetes y reintento sin robo ni revisión duplicados. Abandono privado
  conserva progreso parcial, sin ganador. Terceros reciben replay público sin
  secretos ni auditoría; una partida privada ajena devuelve 404.
- [Verificación del sellado](qa/production-history-final-2026-10-31.json), sobre
  `b0d2a6d`: el archivo y la auditoría quedan idénticos después de cerrar una sala
  ya finalizada, y la partida completa previa sigue disponible tras desplegar.
  El commit final solo añade la traducción de «Robar» a «Draw» en el panel compacto.
- [Verificación de la revisión final](qa/production-history-release-2026-10-31.json):
  diez recursos públicos coinciden byte a byte con el código, replay completo
  anterior recuperable y salud `ok: true`, `storage: supabase`.
- El usuario autorizó expresamente desplegar con una reconexión breve mientras
  había una partida real activa. La partida conservó su UUID y siguió registrando
  jugadas después del reinicio. El observador recibió temporalmente el aviso de
  partida no disponible hasta reabrir el enlace después de reconectar los jugadores;
  no se manipuló esa partida. No equivale a verificar su mano privada desde el navegador.
- Chrome en producción: ESP/ENG y preferencia persistente, navegación/perfil,
  aviso de enlace ausente, replay 0,5×–8× y salto de pasos, perspectiva pública
  sin cartas privadas. Móvil 390×844 y tablet 768×1024 sin desbordamiento horizontal;
  espectador con panel de mano de altura cero y cuatro robots. Capturas:
  [aviso de sala](qa/history-replay/production-missing-room.png) y
  [replay móvil](qa/history-replay/production-replay-mobile.png).

La primera lectura monolítica del replay largo excedió el plazo; la paginación
recuperó íntegra la grabación de 169 pasos que ya estaba guardada. Se corrigieron
también eventos posteriores al cierre para que no alteren nuevos archivos sellados.
La unión invitado→Google se probó con OAuth simulado, sin repetirla con una cuenta
Google real en esta entrega. La revisión responsive usa emulación, no dispositivos
físicos. Amigos, notificaciones, chat y contenidos futuros siguen como esqueleto.
Los commits documentales posteriores registran evidencia y no reinician el servicio.

## Entrega anterior · 2026-10-31, 18:26 (Lima)

- Código: `bf1c5c19ba99e2ee00e7706d52594860a5e19034`, publicado en `main`.
  Incluye navegación adaptable, perfil editable, directorio público/privado,
  bots durables, espectadores y ajuste móvil M12. No requirió migraciones SQL
  ni cambios de variables o credenciales.
- [Despliegue Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbj7hpss728c7391mldg):
  manual del commit exacto, **Live** a las 18:26:06; Node 26.13.0,
  `npm install --omit=dev` y `npm start`. Auto-Deploy continúa desactivado.
  El usuario pidió publicar en main y verificar producción. No había salas
  antes del despliegue y no se cerró ninguna sala ajena.
- Base local validada: 324 pruebas correctas, 55 combinaciones responsive,
  regresión de partida completa y vagones; detalle en
  [navegación y salas](work/navigation-rooms.md).
- [Informe remoto HTTP/WebSocket](qa/production-shell-2026-10-31.json):
  once recursos públicos coinciden byte a byte con el commit, las cuatro rutas
  cargan directamente y ocho rutas privadas devuelven 404. Salud HTTP 200,
  `ok: true`, `storage: supabase`; API de cuenta habilitada, sin perfil anónimo.
- Sobre el servidor real se creó una sala temporal: publicación por defecto,
  cambios pública/privada reflejados en otra sesión, entrada por código,
  capacidad y permisos del anfitrión, bot, inicio y elección de billetes,
  acciones confirmadas después del guardado y turno automático del bot.
  Reconexión por credencial privada conserva puesto, mano y billetes.
  El espectador no recibe credencial ni cartas privadas y no puede actuar.
- Navegador Chrome sobre HTTPS: edición de nombre de una cuenta autenticada,
  guardado y recarga confirmados; nombre original restaurado. No se repitió el
  consentimiento de Google. Creación desde UI, dos plazas, bot, aviso de sala
  llena, selección de billetes, construcción Dieppe–Paris (+1, 44 vagones) y
  reflejo en otra pestaña espectadora con controles deshabilitados.
- Revisión visual remota en 390×844, 768×1024 y 1440×900: sala y configuración,
  tablero, More y selector con Español como única opción. More sin desbordamiento
  horizontal en escritorio/móvil; sin errores ni advertencias de consola en
  jugador y espectador. Capturas locales en `.qa/release-bf1c5c1/`, fuera de Git
  por contener el nombre de una cuenta real. Emulación restablecida al terminar.
- Se abandonaron solo las salas creadas para QA. Tras su caducidad, `/healthz`
  volvió a `rooms: 0` con almacenamiento saludable; el espectador no la impidió.

La prueba remota cubre una partida parcial y reconexión de cliente; no repite
una partida completa, recuperación tras otro reinicio del servidor ni certifica
Safari/iOS/Android físicos. Notificaciones, amigos, chat y contenidos futuros
conservan el alcance de esqueleto aprobado. El commit documental posterior solo
registra evidencia y no provoca otro despliegue.

## Entrega anterior · 2026-10-31, 16:44 (Lima)

- Código: `23086914b893758b29f3879259e8fa8851f81e9a`, rama `main`.
  El resaltado muestra solo nombres de los extremos seleccionados y restaura
  las etiquetas normales al desactivar. Sin cambios de backend, secretos o SQL.
- [Despliegue Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbj62cnlk1mc738bqq7g):
  manual del commit exacto, **Live** a las 16:44:57; Node 26.13.0,
  `npm install --omit=dev` y `npm start`.
- Antes del despliegue, `/healthz` registraba una sala. El usuario autorizó
  explícitamente publicar aceptando el reinicio; no se cerró ninguna sala ajena.
  Tras arrancar: HTTP 200, `ok: true`, `storage: supabase`, cero salas.
- `app.js` público coincide byte a byte con el publicado; SHA-256:
  `f65adf0a583b2c9cae79bd48defcb5b83cb6cb37395ac98eaf9c7f0246817f45`.
- Las 18 pruebas pertinentes y la comprobación local de destino completado están
  registradas en [M11](work/board-3d.md). Docs y diff verificados antes de publicar.
- IAB/Chromium sobre HTTPS, práctica invitada con Lisboa–Danzig y Zagrab–Brindisi:
  a 390×844 solo aparecen sus cuatro nombres, también con zoom. Al desactivar,
  vuelven las etiquetas normales; sin errores ni avisos de consola. Práctica
  finalizada mediante su control de pruebas y regreso al inicio. Captura local
  ignorada: `.qa/destination-labels/production-mobile.png`.

Esta comprobación cubre el ajuste visual; no repite Google, una partida completa,
recuperación de salas tras reinicio ni pruebas en dispositivos físicos.

## Entrega anterior · 2026-10-31, 16:13 (Lima)

- Código: `2a46f58d96e7254b5ec6d9122c4e052c3bf611cb`, integrado en `main`.
  Incluye siete vagones adicionales (18 en total), grúa telescópica revisada,
  inicio centrado, cuenta Google opcional y aviso de privacidad.
- [Despliegue Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbj5jk7b9u1s73d3t510):
  manual del commit exacto, **Live** a las 16:13:26; Node 26.13.0,
  `npm install --omit=dev` y `npm start`. Auto-Deploy quedó desactivado, verificado.
- Se esperó la indicación del usuario para publicar. Tras avisar que terminó,
  autorizó el despliegue; `/healthz` aún contaba dos salas. No se cerraron salas
  manualmente. Tras el arranque: 200, `ok: true`, `storage: supabase`, cero salas.
- Antes de publicar: suite completa de 317 pruebas aprobadas, cero fallos;
  comprobador documental y `git diff --check` correctos.
- Diecisiete archivos públicos coinciden byte a byte con el checkout publicado;
  siete rutas privadas responden 404. `/api/account` responde 200 con
  `enabled: true`, `profile: null` sin sesión.
  [Informe HTTP/hashes](qa/production-identity-2026-10-31.json).
- Navegador público: 18 colores, vista previa de grúa, práctica invitada, dos
  billetes conservados, construcción Essen–Berlin aceptada (+2, 43 vagones),
  turnos de bots y final anticipado seguido de regreso al inicio. Sin errores
  ni advertencias de consola durante el recorrido. No es una partida completa.
  Las capturas se conservan localmente en `.qa/release-2a46f58/`, fuera de Git.
- Google habilitado en Supabase; SQL/perfiles y callbacks ya aplicados. Variables
  guardadas por el usuario; aviso público y enlaces de inicio/privacidad guardados
  en la marca de Google. Redirección real llega al selector de cuenta con enlace
  de privacidad correcto. Con autorización específica, se completó consentimiento,
  perfil elegido, recarga, recuperación de sala propia desde otra pestaña y
  logout y segundo acceso conservando el perfil.
  Prueba con una cuenta real; matriz restante en [su ficha](work/identity.md).

Esta entrega no repite la recuperación de un checkpoint con jugadores activos
ni valida dispositivos físicos adicionales. El nombre mostrado por Google aún
es el subdominio de Supabase; la marca sigue en modo Testing, sin verificación pública.

## Entrega anterior del 2026-10-31 · 14:31

- Aplicación: [Trencitos](https://trencitos-swamp.onrender.com/).
- Código publicado: `16bf6c3bd1a1f90a3997378ae940b3fe13536d21`, rama `main` de
  `Gecch12/trencitos`. Incluye tablero 3D, vagones, paleta y bots completos.
- Render: servicio `trencitos-swamp`, despliegue
  [dep-dbj43qss728c738pkang](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbj43qss728c738pkang).
  Manual, estado **Live** a las 14:31:52 de Lima; Node 26.13.0,
  `npm install --omit=dev` y `npm start`. Sin migraciones ni cambios de secretos.

### Evidencia de la entrega anterior

- Antes de publicar: `npm test`, **308 aprobadas**, cero fallos; comprobador
  documental y `git diff --check` correctos. No había salas abiertas en `/healthz`.
- Después: `/healthz` respondió 200, `ok: true`, `storage: supabase`.
- Trece archivos públicos (HTML, JS, CSS y los dos módulos de Three) coinciden
  byte a byte con el checkout publicado mediante SHA-256. Seis rutas privadas,
  incluidos los módulos nuevos de bots, devuelven 404.
  [Informe HTTP y hashes](qa/production-2026-10-31.json).
- Recorrido en navegador sobre HTTPS público: preview de deportivos amarillo,
  inicio de práctica con tres bots, elección de billetes, construcción aceptada
  de Amsterdam–Bruxelles (1 punto, 44 vagones restantes), turnos de bots con
  robo y construcción, zoom y resaltado de destinos sobre el tablero 3D.
  Práctica terminada mediante su control de pruebas, resultados calculados y
  regreso al inicio; no es una partida remota completa hasta agotar vagones.
  [Lobby](qa/production-lobby.png) y [tablero remoto](qa/production-board.png).
- Evidencia local de recorridos completos, animaciones y rendimiento:
  [tablero](work/board-3d.md) y [bots](work/practice-ai.md).

Esta comprobación no repite la prueba de checkpoint/reinicio remoto ni certifica
Safari/iOS o Android físico; permanecen en [calidad](work/quality.md).
La documentación de esta entrega puede avanzar respecto al commit ejecutable;
los commits que solo registran evidencia usan `[skip render]` para evitar otro
reinicio ([mecanismo de Render](https://render.com/docs/deploys#skipping-an-auto-deploy)).

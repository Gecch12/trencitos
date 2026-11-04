# Producción

## Versión actual · 2026-11-04, 18:10 (Lima)

- Código `c40d80f6c0f4d8a6e427a8eae385bee1697c0e9f`, publicado desde `main`.
  Incluye mesa compacta y sus refinamientos en móvil, tablet y escritorio:
  mercado/mazo, jugadores con avatar, consulta animada de rutas, confirmación
  de destinos y gestos del mapa. [Alcance y pruebas](work/board-first-mobile.md).
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dblrmgafngtc73c520p0):
  **Live** a las 18:10:37 Lima, Node 26.13.0, despliegue manual de 44,1 s.
  Al revisar el panel ya estaba publicado; no se disparó otro despliegue.
  Sin migraciones ni cambios de configuración o credenciales.
- [CI](https://github.com/Gecch12/trencitos/actions/runs/41920796679):
  `completed/success`; todos los pasos de Node, documentación, PWA y navegador
  correctos, incluidos los nuevos recorridos de mesa, rutas y gestos.
  [Resultado](qa/table-refinement-release/ci-result.json).
- [HTTP](qa/table-refinement-release/production-http.json): salud 200/Supabase,
  cero salas y ocho recursos clave idénticos por SHA-256 a la revisión.
  Comprobación de lectura, sin iniciar partidas ni modificar datos de producción.
- iOS Release `0.6.1`, build `3`: compilación y firma válidas; interfaz de esta
  revisión incluida, backend HTTPS de producción y depuración web desactivada.
  [Paquete](qa/table-refinement-release/ios-package.json). Instalado sobre la app
  existente en el iPhone 17 Pro Max a las 18:26 Lima; el dispositivo confirmó
  versión `0.6.1`, build `3`. [Registro](qa/table-refinement-release/ios-install.json).
  No se abrió el juego; Ángel realizará la prueba de uso.
- Android: APK actualizado build `2` generado y firmado con la clave anterior,
  listo para compartir como archivo local. [Entrega y verificación](work/mobile-beta.md#apk-actualizado-con-la-mesa-compacta--2026-11-04).

La integración Git automática de Render conserva el pendiente de
[entrega continua](work/continuous-delivery.md); este despliegue manual no lo resuelve.

## Entrega anterior · 2026-11-04, 11:00 (Lima)

- Código `d2a943863fbaa544f13c413b2f14d86c9dd3d35d`, publicado desde `main`.
  Incluye Capacitor, invitados nativos persistentes por HTTPS/WSS, PWA e interfaz
  empaquetada. [Alcance de la beta](work/mobile-beta.md).
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbllcron74is73c1if3g):
  **Live** a las 11:00:21 Lima, Node 26.13.0, despliegue manual del usuario de
  37,3 s. Sin migraciones, cambios de credenciales ni servicios de pago.
- [CI](https://github.com/Gecch12/trencitos/actions/runs/41861164488): 692/692
  pruebas Node y todos los pasos de documentos, navegador y PWA correctos.
  GitHub aún mostraba `in_progress`, sin conclusión global, pese a haber terminado
  todos los pasos a las 10:51:07 Lima. El usuario publicó manualmente el último
  commit; no se afirma cierre exitoso del run ni funcionamiento de autodeploy.
- [HTTP/WebSocket](qa/mobile-beta-release/production-report.json): 60 recursos
  públicos coinciden con la revisión; protocolo móvil versión 1, CORS nativo
  estricto e historial del invitado comprobados. Cliente nativo de protocolo y
  navegador compartieron una sala privada por Internet; se cerró sin iniciar
  partida. Salud correcta con Supabase y cero salas antes y después.
- [Beta Android](https://github.com/Gecch12/trencitos/releases/tag/v0.6.1-mobile-beta):
  APK release firmado, descarga pública verificada por hash.
  [Informe del paquete](qa/mobile-beta-release/package-report.json).
  Android Emulator e iOS Simulator mostraron el lobby de producción conectado;
  iPhone físico instalado con firma personal gratuita y apertura verificada.
  Una partida completa en teléfonos reales queda como prueba de uso de la beta.
- Comandos, renovación de la firma gratuita y alternativa web instalada en
  [la guía móvil](mobile-development.md). La integración Git de Render conserva
  el pendiente registrado en [entrega continua](work/continuous-delivery.md).

## Entrega anterior · 2026-11-03, 19:11 (Lima)

- Código `fff022571d8fda2912b019e4538b55c9e14f8685`, publicado desde `main`.
  Incluye el replay progresivo con interfaz y animaciones de partida, historial
  de destinos sin duplicación, destinos actuales premarcados, modales sin espacio
  vacío, túnel reservado al constructor, sombreado manual y colección compacta
  de seis vagones. Alcance y pruebas específicas en las fichas de
  [replay](work/replay-experience.md), [destinos](work/destination-map-tunnels.md),
  [sombreado](work/ticket-map-shading.md) y [colección](work/room-map-cards.md).
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbl7g07b9u1s73dpgkb0):
  **Live** a las 19:11:25 Lima, Node 26.13.0, despliegue manual de 44,8 s tras
  CI aprobado. Sin migraciones ni cambios de configuración o credenciales.
- [CI](https://github.com/Gecch12/trencitos/actions/runs/41743704099): **686/686**
  pruebas Node (173,9 s), documentos y 30 grupos de navegador correctos: lobby
  (6), robos (16), interfaz de cartas (4) y recuperación de cuenta (4).
  [Resultado](qa/modal-replay-release/ci-result.json). La suite completa local
  también pasó; el ajuste final estabilizó únicamente un escenario aleatorio
  del test del programador de bots, sin modificar el producto.
- [HTTP](qa/modal-replay-release/production-http.json): 48 recursos públicos
  coinciden por SHA-256 con la revisión y sus dependencias; once rutas privadas
  o retiradas responden 404. Salud 200/Supabase y cero salas antes y después.
- [Chrome](qa/modal-replay-release/production-browser.json): lobby conectado,
  crear/unirse habilitados y cero errores de consola. Verificación remota de
  lectura: no se crearon salas ni se abrió el historial privado. Los recorridos
  de bots construyendo con el modal abierto y las mediciones de replay se
  verificaron en local, como se documenta en las fichas. Capturas en
  `.qa/modal-replay-release/`.

La integración Git de Render sigue pendiente del propietario; esta entrega fue
manual después del CI aprobado. [Estado](work/continuous-delivery.md).

## Entrega anterior · 2026-11-03, 16:58 (Lima)

- Código `ef654874c55aefca0a4fbcdb7bcc91aa91cc0c30`, publicado desde `main`.
  Incluye todos los cambios locales pendientes: foco temporal de construcciones
  y túneles, sombreado 500/350 ms, billetes y reserva de vagones, replay
  transparente, historial por subsecciones, proporciones de Sudamérica,
  interacción de cartas y recuperación automática de cuenta. El último ajuste
  oculta reposiciones y barajados en la presentación, conservando el registro.
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbl5hhm7bikc73f2780g):
  **Live** a las 16:58:15 Lima, Node 26.13.0, despliegue manual de 48,6 s tras
  CI aprobado. Sin migraciones, cambios de credenciales ni otro reinicio de datos.
- [CI](https://github.com/Gecch12/trencitos/actions/runs/41725335053): **681/681**
  pruebas Node (127,7 s), documentos y 30 grupos de navegador correctos: lobby
  (6), robos (16), interfaz de cartas (4) y recuperación de cuenta (4), sin
  errores de navegador. [Resultado](qa/all-changes-release/ci-result.json).
- [HTTP/WebSocket](qa/all-changes-release/production-http.json): 48 recursos
  públicos coinciden por SHA-256 con la revisión y sus dependencias; once rutas
  privadas o retiradas responden 404. Salud 200/Supabase; capacidades de robos y
  sesión versión 1. La sala privada de comprobación se cerró sin iniciar partida;
  quedaron cero salas activas.
- Chrome local conectó al lobby publicado, con crear/unirse habilitados y sin
  errores de consola. No se inició una partida de prueba en producción ni se
  repitió OAuth real. Capturas e informe local en
  `.qa/all-changes-release-2026-11-03/`. La evidencia de navegador completa está
  también en el artefacto `browser-evidence` del CI enlazado.

La integración Git de Render sigue pendiente del propietario; este despliegue
manual no acredita la entrega automática. [Estado](work/continuous-delivery.md).

## Operación de datos · 2026-11-03, 15:52 (Lima)

Se completó el reinicio de partidas autorizado: respaldo privado de 48 partidas
y 5.083 frames, seguido de vaciado del historial activo y del checkpoint de salas.
Se conservaron cuentas, perfiles y vínculos de invitados. Render se suspendió y
reanudó sobre el mismo commit publicado; salud posterior correcta con Supabase y
cero salas. No se publicó código nuevo. Procedimiento, recuperación y evidencia
en [la ficha del reinicio](work/replay-transparency-reset.md#reinicio-de-producción-completado).

## Entrega anterior · 2026-11-03, 12:05 (Lima)

- Código `b8e7b3726f846db6aa7630a2bc4976b5a3156c5c`, en `origin/main`.
  La segunda intención de robo se envía sin esperar el primer ACK; los robos
  ocultos se revelan antes de incorporarse a la mano, con ilustraciones retenidas
  en memoria y animaciones más pausadas. Alcance en [cartas](work/card-interactions.md).
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbl1863ncjis73fj70h0):
  **Live** a las 12:05:14 Lima, Node 26.13.0, despliegue manual de 49,9 s tras
  CI aprobado. Sin SQL, credenciales ni cambios de plan. Salud previa correcta
  con cero salas. [Captura](qa/draw-pipeline-release/render-live.png).
- [GitHub CI](https://github.com/Gecch12/trencitos/actions/runs/41679488781):
  **651/651 pruebas**, 174,0 s en Node, documentación, lobby con dos clientes
  y quince recorridos Chrome de robos/recuperación aprobados.
  [Resultado](qa/draw-pipeline-release/ci-result.json).
- [HTTP/WebSocket](qa/draw-pipeline-release/production-http.json): 46 recursos
  públicos idénticos al checkout, ocho rutas privadas con 404, salud 200/Supabase
  y `drawPipelineVersion:1`. Se creó y cerró únicamente una sala privada temporal.
- [Chrome en producción](qa/draw-pipeline-release/production-browser.json):
  seis robos ocultos en tres pares, en sala privada con un bot. Las tres segundas
  peticiones salieron antes del primer ACK. Primer rAF entre **17,9 y 29,9 ms**;
  confirmación entre **466,8 y 658,2 ms**; color reconocible entre **619,3 y
  817,3 ms**; llegada a la mano entre **719,6 y 918,5 ms**. Imágenes cargadas,
  cantidades correctas y sin grupos anónimos, duplicados ni errores de consola.
  La [captura posterior](qa/draw-pipeline-release/production-browser.png) incluye
  también dos cartas automáticas por vencimiento del turno de QA durante la
  captura del informe; esas cartas no forman parte de las seis mediciones.
- La sala de QA se cerró mediante el protocolo de la aplicación después de que
  el control del navegador dejara de responder al aviso de salida. No se tocaron
  otras partidas. Los instrumentos de medición se limitaron a esa pestaña de QA.
- Muestra pequeña en Chrome de escritorio, sin retener red ni guardado. rAF no
  mide la pantalla física; no se presenta como comparación controlada con la
  versión anterior ni como garantía de latencia. La confirmación sigue esperando
  persistencia durable. La demora al añadir bots queda fuera de esta entrega.
- La publicación manual sigue siendo necesaria hasta autorizar la integración
  Git de Render; [estado de entrega continua](work/continuous-delivery.md).

## Entrega anterior · 2026-11-03, 11:05 (Lima)

- Código `55b2dd898eb13e714babe5a1f1b41bc6284b37c0`, en `origin/main`.
  La mano incorpora inmediatamente cartas visibles y reversos provisionales;
  el servidor conserva la validación y el guardado antes de revelar robos ocultos.
  Se reutilizan consultas de destinos. Alcance en [cartas](work/card-interactions.md).
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbl0c7gae00c73c8m0k0):
  **Live** a las 11:05:27 Lima, Node 26.13.0, despliegue manual de 40,7 s tras
  CI aprobado. Sin SQL, variables, credenciales ni cambios de plan.
  No había salas al comprobar antes de publicar. [Captura](qa/hand-release/render-live.jpg).
- [GitHub CI](https://github.com/Gecch12/trencitos/actions/runs/41669335691):
  **645/645 pruebas**, documentación, lobby con dos clientes y doce recorridos
  Chrome de robos/recuperación aprobados. [Resultado](qa/hand-release/ci-result.json).
- [Verificación HTTP/WebSocket](qa/hand-release/production-http.json): 46 recursos
  públicos idénticos al checkout, ocho rutas privadas con 404, protocolo de robos
  activo y salud 200 con `storage:supabase`. Se cerró la sala temporal sin iniciar.
- [Chrome en producción](qa/hand-release/production-browser.json): sala privada,
  bot, inicio, billetes y seis robos; mano provisional presente en el primer rAF
  entre **6,8 y 13,4 ms**, con sus imágenes ya cargadas. Confirmaciones entre
  **365,9 y 1871,6 ms**; las segundas cartas incluyen la espera en cola.
  Cantidades finales correctas, sin duplicados ni errores de navegador.
  [Captura tras confirmar](qa/hand-release/production-browser.png).
  Se abandonaron únicamente las salas creadas para QA.
- Son muestras pequeñas en Chrome de escritorio, sin retener artificialmente
  la red ni el guardado. El rAF no mide la pantalla física; no se cronometró
  aparte la pintura del color definitivo de los robos ocultos. No se promete
  eliminar la latencia de confirmación ni se repitió aquí la matriz móvil local.
- La publicación manual sigue siendo necesaria hasta autorizar la integración
  Git de Render, como registra [entrega continua](work/continuous-delivery.md).

## Entrega anterior · 2026-11-03, 10:11 (Lima)

- Código `c5c7bf2d83e6c581d011ae26fbf65bf3b714c413`, en `origin/main`.
  Incluye lobby con tarjetas, Sudamérica y la respuesta inmediata de cartas con
  recibos durables, ya reunidos en la única carpeta de trabajo.
- [Render](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbkvisoae00c73c6sirg):
  **Live** a las 10:11:46 Lima, Node 26.13.0. Despliegue **manual del último
  commit**, después de CI aprobado, sin SQL ni cambios de secretos/planes.
  Salud previa 200, `ok:true`, `storage:supabase`, `rooms:0`.
  [Captura](qa/continuous-delivery/render-live.png).
- [GitHub CI](https://github.com/Gecch12/trencitos/actions/runs/41659648763):
  **641/641 pruebas**, documentación y Chrome (lobby con dos clientes y diez
  casos de respuesta/recuperación de cartas). [Resultado](qa/continuous-delivery/ci-result.json).
- [Verificación HTTP/WebSocket](qa/continuous-delivery/production-http.json):
  46 recursos públicos idénticos al checkout, siete rutas privadas con 404 y
  backend con `drawFeedbackVersion:1`. Se creó y cerró únicamente una sala
  privada temporal, sin iniciar partida. Salud final 200, Supabase y cero salas.
  Este smoke test no mide la latencia de clic en un navegador real de producción.
- Auto-Deploy quedó configurado en **After CI Checks Pass**, con filtros para
  documentación y experimentos, pero **la automatización no está operativa**:
  falta autorizar Render sobre `Gecch12/trencitos` desde la cuenta propietaria.
  La publicación manual no prueba el disparador automático. Diagnóstico y
  siguiente acción en [la ficha](work/continuous-delivery.md).

## Entrega anterior · 2026-11-03, 09:23 (Lima)

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
  de una familia visibles en el diálogo, sin errores de consola. La sala temporal
  se cerró después de comprobar. [Captura](qa/room-setup/production-desktop.png) y
  [colección](qa/room-setup/production-collection.png).
- El checkout local de `main` tenía cambios concurrentes de otro trabajo.
  Permanecen intactos: se publicó desde el worktree aislado a `origin/main`,
  sin incorporar ni guardar cambios ajenos. El checkout local se reconcilió
  después en `e9cb403`: lobby y respuesta inmediata de cartas conviven en main.
  La [consolidación](work/workspace-consolidation.md) no despliega esos cambios
  adicionales. En esa entrega la revisión publicada era la indicada arriba.

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

# Producción

## Versión actual · 2026-10-31, 16:44 (Lima)

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

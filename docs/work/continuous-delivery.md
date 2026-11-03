---
{"id":"continuous-delivery","status":"blocked","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-03"}
---
# Pruebas en GitHub y publicación automática

Ángel aprobó publicar main en Render después de que pasen las pruebas, evitando
despliegues por documentación y experimentos. Se mantiene una carpeta, una rama
habitual y un servicio; el pipeline no crea previews ni usa Supabase real.

## Aceptación

- [x] Workflow de GitHub Actions para pushes/PR a main y ejecución manual.
- [x] Instalación con lockfile, documentación, suite Node completa y Chrome:
  lobby con dos clientes, diez casos de robos, recuperación y privacidad.
- [x] Token de solo lectura, acciones oficiales fijadas por SHA y evidencia de
  navegador retenida siete días. Sin secretos de Render/Supabase en Actions.
- [x] Primera ejecución real en GitHub aprobada.
- [x] Render en `After CI Checks Pass`, rama main, con filtros de documentación
  y experimentos; configuración equivalente en el Blueprint.
- [x] Recursos de la revisión aprobada publicados y contrastados con Git mediante
  despliegue manual; no acredita el disparador automático.
- [ ] Despliegue automático y filtros verificados con la integración Git activa.
- [x] Documentación final, evidencia y estado de producción actualizados.

## Implementación

[CI](../../.github/workflows/ci.yml) usa Ubuntu 24.04, Node 26 y Chrome instalado
por Playwright. `npm run test:ci` ejecuta los archivos Node en serie para mantener
aislados los recursos y reducir variabilidad. Los navegadores usan servidores
temporales; el caso remoto de cartas emplea un doble local de Supabase.
En CI, Chrome usa SwiftShader explícito para WebGL sin GPU. Los informes y
capturas se guardan en `.qa/ci/` y en el artefacto `browser-evidence`.

## Primera validación

El [run 41658456825](https://github.com/Gecch12/trencitos/actions/runs/41658456825)
del commit `19ab042` pasó completo en GitHub: **641/641 pruebas**, 162,2 s en la
suite Node, documentación y ambos recorridos Chrome aprobados. Se conservaron
capturas/reportes en `browser-evidence`. El mismo modo de navegador pasó antes
localmente con `CI=true`, sin errores del navegador.

Después se guardaron en Render los cinco filtros del Blueprint y
`After CI Checks Pass`. Antes de activar, `/healthz` respondió 200 con
`ok:true`, `storage:supabase`, `rooms:0`. Auto Sync del Blueprint permanece en
Yes. Los cambios de configuración del Blueprint se revisan aparte, como indica
la [guía](../RENDER_SUPABASE.md); no se presentan como commits comunes del juego.

## Validación y bloqueo de la integración Git

El [segundo run](https://github.com/Gecch12/trencitos/actions/runs/41659648763),
commit `c5c7bf2`, terminó correctamente a las 15:06:14 UTC: **641/641 pruebas**
en 122,9 s, docs y ambos recorridos Chrome. [Informe](../qa/continuous-delivery/ci-result.json).
Render mantuvo la revisión anterior y no creó un despliegue ni sincronización
de Blueprint al recibir este push. No se presenta el ajuste del selector como
prueba de automatización funcionando.

El servicio usa las credenciales Git de `angelaltarodri`, pero el repositorio
pertenece a `Gecch12`. El selector **Source → Git Provider** no encuentra
`trencitos`; la cuenta de trabajo tiene `push:true`, `admin:false` y
`maintain:false`. [Captura del repositorio ausente](../qa/continuous-delivery/render-repository-missing.png).
Render requiere un proveedor Git conectado para los autodeploys; poder descargar
un repositorio público no prueba esa conexión. No se ampliaron permisos,
instalaron apps, transfirieron repositorios ni copiaron secretos a GitHub.

Ángel confirmó que necesita pedir la autorización al propietario. La opción
[After CI Checks Pass](../qa/continuous-delivery/render-auto-deploy.png) y los
filtros permanecen preparados. Los filtros no se dan por comprobados de extremo
a extremo mientras falte el evento de Git.

## Próximo paso

La revisión `c5c7bf2` se publicó manualmente después del CI aprobado y quedó
Live a las 10:11:46 Lima. Los 46 recursos públicos coinciden con Git, siete
rutas privadas responden 404 y el backend anuncia `drawFeedbackVersion:1`.
La sala privada temporal se cerró; salud final correcta con cero salas.
Evidencia completa en [Producción](../production.md).

El propietario `Gecch12` debe entrar en
[la instalación de Render](https://github.com/apps/render/installations/new)
y autorizarla solo para `trencitos`. Después, comprobar que el repo aparece en
**Git Provider**, asociarlo al servicio/Blueprint existente si hace falta y
validar un push funcional: CI aprobado → despliegue automático Live. Verificar
también que un push exclusivamente documental no genere otro despliegue.


La regresión de navegador incluye también `browser-card-ui.cjs` (renovación e
historial público) y `browser-account-resume.cjs` (cuentas simuladas con protocolo
real), junto al lobby y los dieciséis casos de `browser-draw-feedback.cjs`.
Sus salidas de CI se conservan bajo `.qa/ci/` en el artefacto existente.

## Publicación conjunta · 2026-11-03

El primer intento sobre `0727c5d` pasó la suite Node y el lobby, pero falló
la observación del giro de una carta: el callback de fin de Web Animations
retiró el nodo antes del siguiente `requestAnimationFrame` en Chrome con
renderizado por software. El auditor comprueba también el transform real y la
imagen decodificada justo antes de retirarlo. Conserva la exigencia de revelar
el color antes de llegar a la mano y no modifica la animación del producto.
Se vuelve a ejecutar CI completo antes de desplegar. Evidencia local en
`.qa/all-changes-release-2026-11-03/`.

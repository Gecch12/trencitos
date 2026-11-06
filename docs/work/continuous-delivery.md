---
{"id":"continuous-delivery","status":"blocked","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-06"}
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

La ampliación del 2026-11-06 añade `browser-profile-style.cjs` al workflow,
con capturas en `.qa/ci/profile-style/`: selector visual, teclado, scroll táctil y
guardado de avatares. Validación local en [la ficha de perfil](profile-social-statistics.md).
La entrega de mesa añade también
`browser-postgame-summary.cjs` y `browser-replay-analysis.cjs`: recuentos, regreso
integrado y cartas a todas las velocidades, con evidencia en `.qa/ci/` y
SwiftShader explícito. Ambos recorridos pasaron localmente con `CI=true` antes
del push. El [run de `51cb1ea`](https://github.com/Gecch12/trencitos/actions/runs/42267756859)
terminó `success`: 723/723 pruebas Node y todos los recorridos Chrome, incluidos
los tres pasos nuevos. Render se publicó manualmente después de este resultado;
la [entrega](../production.md) no acredita que se resolviera el acceso Git automático.

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
Desde la revisión de mesa compacta incluye `browser-table-ui.cjs`: siete tamaños,
paneles sin reencuadre, puntos públicos/privados, robos y última ronda.
El refinamiento de mesa incorpora `browser-table-refinement.cjs`: consulta visual
de rutas sin mutación, camino más largo exacto, gestos táctiles y confirmación
de nuevos destinos en los tres formatos. Sus salidas de CI se conservan bajo
`.qa/ci/` en el artefacto existente.

## Publicación conjunta · 2026-11-03

El primer intento sobre `0727c5d` pasó la suite Node y el lobby, pero falló
la observación del giro de una carta: el callback de fin de Web Animations
retiró el nodo antes del siguiente `requestAnimationFrame` en Chrome con
renderizado por software. El auditor comprueba también el transform real y la
imagen decodificada justo antes de retirarlo. Conserva la exigencia de revelar
el color antes de llegar a la mano y no modifica la animación del producto.
Se vuelve a ejecutar CI completo antes de desplegar. Evidencia local en
`.qa/all-changes-release-2026-11-03/`.

La segunda ejecución superó los dieciséis casos de robos. La prueba de historial
todavía seleccionaba cualquier miniatura, incluyendo la reposición que sigue
al robo en el nuevo diario. Se acota a las cartas robadas y comprueba su secuencia
completa (oculta, roja) en actor/rival/espectador. Los dos recorridos añadidos al
workflow usan también SwiftShader explícito en CI, igual que los anteriores.

En el tercer intento, el bloqueo de robos se comprobaba después de esperar al
otro cliente; la animación del actor ya podía haber terminado. La comprobación
se realiza al insertar la capa: controles desactivados y cero envíos al intentar
robar. Ambos clientes conservan la observación, incluso si la animación termina
antes de la siguiente consulta de Playwright. Se mantienen las duraciones y
las comprobaciones de estado final.

La revisión final `ef65487` pasó el
[CI completo](https://github.com/Gecch12/trencitos/actions/runs/41725335053):
681/681 pruebas Node y los 30 grupos de navegador, incluidos los dos recorridos
que antes quedaban pendientes. Se desplegó manualmente y quedó Live a las
16:58:15 Lima. Recursos, backend y navegador de producción verificados;
registro de entrega en [Producción](../production.md). La integración Git
automática continúa pendiente del propietario, como se documenta arriba.

## Publicación de replay y diálogos · 2026-11-03

El CI de `2cf14a8` pasó 685/686 pruebas Node y se detuvo antes del navegador.
La prueba de persistencia del programador de bots recibía una mano aleatoria;
si el bot iniciaba un túnel, al restaurar la sala esperaba erróneamente un
temporizador inmediato. Durante la revelación corresponde esperar al reloj del
juego. El escenario ahora devuelve la mano del bot al mazo antes de esa acción,
para comprobar un robo ordinario y conservar las aserciones de pausa, restauración
y reanudación. No cambia el código de producción ni se omite ninguna prueba.
La revisión `fff0225` superó el
[CI completo](https://github.com/Gecch12/trencitos/actions/runs/41743704099):
686/686 pruebas Node y 30 grupos de navegador. Se publicó manualmente en Render
tras ese resultado y quedó Live a las 19:11:25 Lima. La comprobación posterior
confirmó salud, archivos públicos y lobby. Evidencia en
[Producción](../production.md); la integración Git automática sigue pendiente.

## Regresión de sorteo inicial · 2026-11-04

El [CI de 2257a26](https://github.com/Gecch12/trencitos/actions/runs/41933909898)
pasó 697/698 pruebas Node y se detuvo antes del navegador. El commit cambiaba
solo documentación, pero la prueba de una sala de cinco jugadores suponía que
el sorteo era la última entrada del historial. Una renovación inicial por tres
comodines ocupa esa posición con `seat:null`; el anuncio del primer jugador
está presente en otra entrada.

La prueba ahora localiza el anuncio por su contenido, exige que sea único y
comprueba su puesto contra el turno público. Mantiene el rechazo del sexto
jugador y del puesto inicial enviado por el cliente. El reparto usa una semilla
local que fuerza la renovación y la comprueba explícitamente, conservando el
sorteo real del servidor. No cambia el motor ni el código de las apps.

La misma reproducción falla con la aserción anterior (`null` frente al puesto
del jugador). Después de la corrección pasan 24/24 pruebas de servidor y contrato
de reparto en 32,9 s. Logs antes/después en `.qa/ci-start-history-fix/`.
La validación completa del ajuste se realiza en el
[workflow de main](https://github.com/Gecch12/trencitos/actions/workflows/ci.yml?query=branch%3Amain).
El APK no cambia por esta corrección: su revisión `a7727c7` ya tiene
[CI aprobado](https://github.com/Gecch12/trencitos/actions/runs/41936549724) y se
publicó con descarga verificada en la
[beta build 2](https://github.com/Gecch12/trencitos/releases/tag/v0.6.1-mobile-beta-build2).

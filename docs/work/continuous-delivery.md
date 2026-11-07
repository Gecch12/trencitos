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
por Playwright. Primero comprueba alcance, documentación, arquitectura y las
regresiones del selector/resultado de CI. Para cambios funcionales lanza la suite
Node y cuatro grupos Chrome en runners independientes. `npm run test:ci` conserva
los archivos Node en serie para mantener aislados los recursos; cada grupo de
navegador también mantiene sus recorridos en serie. No se elimina ninguna prueba.

| Grupo Chrome | Recorridos |
| --- | --- |
| `identity` | perfiles, estilos, lobby, recuperación de cuenta, continuidad móvil |
| `cards` | respuesta de robos, movimientos e historial de cartas, privacidad de robos de bots en vivo y replay |
| `table` | chat/moderación/menciones, PWA, mesa compacta, rutas/gestos/destinos |
| `replay` | recuento final, cartas del replay, transporte/recuperación |

`fail-fast: false` conserva el resultado de los demás grupos si uno falla. El
check final mantiene el nombre **Tests, docs and browser** y falla si un trabajo
obligatorio falla, se cancela o se omite inesperadamente. Los navegadores usan
servidores temporales; el caso remoto de cartas usa un doble local de Supabase.
Los recorridos que requieren SwiftShader conservan su configuración. Informes
y capturas se guardan en `.qa/ci/` y en cuatro artefactos
`browser-evidence-<grupo>` durante siete días, también al fallar.

[El selector](../../scripts/ci.js) compara todo el push o el PR contra su base,
sin el límite de archivos de un filtro API. Solo texto documental conocido y
JSON/imágenes de `docs/qa/` pueden usar alcance `docs`: ejecuta los validadores
y las pruebas del control de CI, sin reinstalar dependencias ni repetir el juego.
`docs/references/`, otros datos/configuración, ejecutables, código, tests y
workflow requieren todo. Renombrar código hacia docs también requiere todo.
Una base ausente, rango vacío o evento desconocido usa la suite completa.
**`workflow_dispatch` siempre ejecuta todo**, incluso sobre un cierre documental.
El resultado documental se identifica como tal y no acredita una nueva entrega
del juego; publicar exige el CI completo del commit de código exacto.

## Optimización local · 2026-11-06

Ángel solicitó reducir las esperas del skill y CI conservando pruebas, sin
publicar todavía. El reparto usa como referencia la entrega `51cb1ea`: el job
duró 12 min 26 s, de los cuales Node consumió 3 min 6 s y Chrome 8 min 29 s.
[Tiempos históricos](../qa/postgame-release-2026-11-06/ci-result.json).
El tiempo nuevo depende de las colas de runners y queda pendiente de medición
en GitHub; no se presenta una estimación como una mejora ya observada.

El [skill](../../skills/trencitos-publicar/SKILL.md) reutiliza CI completo del
commit exacto, prepara paquetes durante la espera remota, conserva las cachés y
evita repetir compilaciones por el cierre documental. Las sincronizaciones
móviles siguen en serie porque comparten archivos generados. La distribución
permanece condicionada a la validación completa.

[Validación local](../qa/ci-optimization-2026-11-06.json): **744/744 pruebas Node**,
incluidos los casos nuevos de selección y fallo del CI, en 161,4 s con Node 25.6.1.
`actionlint` 1.7.12, documentos, arquitectura y validador del skill aprobados.
Comparación del workflow: los 13 comandos Chrome y sus variables se conservan
exactamente, cada uno en un solo grupo; no se volvieron a ejecutar navegadores.
Skill instalado y copia canónica idénticos. Cambios locales sin push, ejecución
remota, despliegue, Release ni compilación/instalación móvil.

La [entrega `885e381`](../production.md) valida el reparto real: cinco trabajos
de pruebas aprobados y check agregado correcto en 4 min 26 s; 765 Node y los
15 recorridos Chrome. [Tiempos por trabajo](../qa/release-2026-11-07/ci-result.json).
Android/iOS se prepararon durante la espera; Render, Release e instalación
esperaron al resultado completo. El bloqueo Git de Render sigue independiente.
La comprobación del cierre documental se registra junto al cierre de la entrega.

## Ampliaciones previas

La primera ejecución de la matriz en `832af96` detectó dependencias temporales
en tres recorridos Chrome: lectura del contador después de aterrizar el primer
vagón, captura que agotaba los 3,5 s del foco de chat y confirmación del clic de
inicio mientras se preparaban dos tableros WebGL. Los recorridos observan ahora
el reinicio dentro del evento, separan expiración y retorno manual del foco, y
permiten 30 s para confirmar ese clic. Se conservan las aserciones funcionales.
La nueva revisión requiere CI completo antes de publicar.

El segundo run pasó mesa y replay, pero continuidad móvil aún exigía la barra
auxiliar de resultados retirada por el diseño aprobado. Ese recorrido comprueba
ahora la ausencia de la barra y un deslizamiento horizontal táctil real sobre
la tabla. La prueba del historial conserva sus controles propios.

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

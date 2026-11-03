---
{"id":"card-interactions","status":"validated","parent":null,"depends_on":["game-flow-ui"],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Cartas, pagos y limpieza de la interfaz

Alcance aprobado con «implementa» después de Moti. Incluye los dos ajustes
pendientes de resultados/avatar, además de las cinco propuestas sobre cartas.

## Aceptación

- [x] Historial: nombre y miniatura; carta pública para todos, robo del mazo
  visible solo al dueño y reverso para los demás, incluso en replay público.
- [x] Renovación por tres comodines: brillo, abanico hacia el mazo y reparto
  escalonado; duración actual 1.200 ms, movimiento reducido 120 ms, bloqueo local de robos.
  Lecturas/reconexión no repiten; estados nuevos esperan al final visual y las cancelaciones restauran la mesa.
- [x] Pago como suma de cartas con cantidades, actualización al usar comodines,
  existencias en esquina, nombres accesibles sin texto visible redundante.
- [x] Túnel: quitar los dos párrafos y mostrar cuántas cartas válidas faltan.
- [x] «Ver mapa» minimiza billetes con reloj y borrador preservados.
- [x] Quitar explicación de desempates; robot marfil, contorno oscuro y antena dorada.

## Contratos

- Proyecciones y efectos: [arquitectura](../architecture.md).
- Miniaturas y secretos: [historial/replay](../history-replay.md).
- Reglas sin cambios: [dominio](../domain.md).

## Verificación

- Regresión integrada: 348/348 pruebas, 96,6 s,
  `node --test --test-concurrency=1 tests/*.test.js`.
- Pruebas del motor: metadatos por robo, persistencia y redacción; evento público
  de renovación; replay público sin colores ocultos; falta de cartas tras reserva.
- `tests/browser-card-ui.cjs`: servidor HTTP/WebSocket y Chrome aislados, datos
  temporales; actor/rival/espectador, renovación, controles y accesibilidad móvil.
- `tests/browser-flow-ui.cjs`: túnel con aviso de faltantes, billetes minimizados
  sin pérdida del borrador/plazo y resultados sin explicación de desempates.
- Capturas/reportes regenerables en `.qa/card-ui/` y `.qa/flow-ui/`, ignorados.
- Ambos recorridos Chrome completos, sin errores de consola. Capturas de suma
  en escritorio/390×844/844×390, abanico, historial, aviso del túnel y robot
  inspeccionadas. El móvil horizontal conserva scroll dentro del diálogo.
- `node scripts/check-docs.js --base HEAD`: 38 documentos, 14 fichas correctos;
  `git diff --check` limpio.

## Legibilidad, mano y recuperación · 2026-11-03

Ampliación aprobada con «implementa» después de Moti:

- Robos observados con recogida, pausa y vuelo de 680 ms, separados 320 ms.
  Los del mazo rival mantienen el reverso; los visibles conservan su color.
- Renovación de 1.200 ms, después del vuelo que la provoca; historial público
  con cinco miniaturas retiradas. Movimiento reducido: 120 ms.
- Dos comodines visibles impiden preseleccionar una segunda carta tras tomar
  una visible, hasta conocer su reemplazo. El servidor conserva su rechazo
  de dependencias sobre una mesa renovada.
- El robo oculto avanza mientras llega la respuesta. El giro termina antes
  de incorporarse; no se adivinan colores ni se colocan reversos en la mano.
- La mano conserva sus grupos y anima la distribución en 230 ms, reservando
  el hueco de un color conocido antes del aterrizaje.
- Terminología «comodín/comodines» en código y UI, con lectura de textos antiguos.
- Recuperación automática por cuenta: aceptación y evidencia en [Identidad](identity.md).
- Retiro del blanco del catálogo y de la asignación a bots; fuentes visuales
  inactivas fuera de la entrega HTTP. Restauración con color activo disponible.

Verificado localmente: suite completa **645/645** (159 s), 27 comprobaciones
posteriores de cuenta/catálogo/HTTP y 15 de reglas, traducciones y restauración.
Dieciséis recorridos de robos, renovación/historial con actor-rival-espectador,
lobby con dos clientes, recuperación por cuenta y replay público/privado
(264 pasos), todos correctos en Chrome. Las pruebas pertinentes se repitieron
tras los últimos ajustes; no se presenta como una segunda suite completa.
Se inspeccionaron capturas de mano, renovación y puesto recuperado.
[Evidencia y límites](../qa/card-experience/validation.json).

La prueba de preparación inicial ahora admite una renovación aleatoria sin
confundirla con un inicio de turno; evita el fallo intermitente ya observado.
Próximo paso: publicar esta ampliación cuando se solicite. La demora al añadir
bots sigue fuera de este alcance, por indicación de Ángel.

## Dos intenciones y revelación durante el recorrido · 2026-11-03

Ampliación aprobada con «sí, de acuerdo, implementa» tras observar demasiado
tiempo dos cartas anónimas en la mano. Sustituye esa presentación anterior.

- [x] Enviar la segunda intención al clic, dependiente del ID de la primera;
  mantener orden, reglas, rechazo al renovar y reintentos sin robos duplicados.
- [x] Recogida inmediata, recorrido de unos 520 ms cuando la respuesta llega
  a tiempo, giro con color real y llegada a la mano. La espera lenta permanece
  junto al mazo, con aviso; nunca crea un grupo de reversos en la mano.
- [x] Ilustraciones públicas decodificadas retenidas en la página; sin recibir
  identidades futuras del mazo. Vuelos de rivales ampliados a 560 ms.
- [x] Correlación privada ID/evento para distinguir dos robos aunque los estados
  lleguen antes que los ACK. Reglas, commit durable, privacidad y replay conservados.
- [x] Completar pruebas Chrome, suite amplia, revisión visual y documentación.
- [x] Publicar y medir clic → color definitivo → mano en producción: seis robos
  ocultos, tres pares enviados sin esperar el primer ACK, color reconocible entre
  619,3 y 817,3 ms y llegada a la mano entre 719,6 y 918,5 ms. CI 651/651 y
  quince recorridos Chrome aprobados; [evidencia y límites](../production.md).

Pruebas y capturas de esta ampliación en `.qa/draw-pipeline/`; no sustituyen los
informes históricos del lanzamiento anterior. Los tiempos locales con guardado
retenido validan orden/pintura, no prometen una latencia equivalente en Render.

Verificación final:

- `browser-draw-feedback.cjs`: 15 recorridos completos, sin errores de página ni
  consola. Incluye doble robo antes del primer ACK, colores correlacionados antes
  de ambos ACK, espera superior a 850 ms, rollback, reconexión, renovación,
  agotamiento, resize, móvil, movimiento reducido y compatibilidad anterior.
- Primer frame de recogida en 26 clics entre 10,3 y 46,7 ms. En el caso rápido
  sin retener el guardado: color reconocible a 361,8 ms y mano a 531,7 ms. En el
  doble robo con guardado retenido: colores a 850,0/793,4 ms y mano a
  950,5/894,1 ms desde cada clic. Los tiempos usan rAF e incluyen conducción de
  QA local; no son cifras físicas ni una comparación medida con producción.
- `browser-card-ui.cjs`: actor/rival/espectador, miniaturas privadas/públicas,
  vuelos rivales de 560 ms, renovación, pagos, móvil e inglés, sin errores.
  Capturas de recogida, espera prolongada y móvil inspeccionadas.
- Suite amplia: 651 ejecutadas en 167,4 s, 650 aprobadas y un fallo del chequeo
  textual que solo reconocía comillas simples/dobles en rutas locales. Se
  corrigió para admitir plantillas literales; repetición de recursos/aplicación/
  recibos: 24/24 aprobadas. No se presenta como una segunda suite amplia.
- La CSP permite las ilustraciones `blob:` locales en memoria; los recorridos
  finales comprueban imágenes decodificadas y ausencia de avisos de consola.
  Documentación y `git diff --check` correctos. Sin cambios en bots, SQL o hosting.

## Incorporación inmediata a la mano · 2026-11-03

Ampliación aprobada con «implementa» tras comparar la experiencia con Fortnite.
El criterio pasa de inicio del vuelo a carta/cantidad presentes en la mano.

- [x] Carta visible sumada provisionalmente a su grupo y contador desde el clic;
  hasta dos elecciones, incluidos dos colores iguales y grupos nuevos.
- [x] Robo oculto representado con reverso en la mano; el servidor revela el
  color después del guardado. Vuelo de 180 ms, sin quedarse suspendido.
- [x] Estado antes del ACK, renovación, agotamiento, rechazo, desconexión,
  resize, fallo de almacenamiento, móvil y movimiento reducido sin duplicados.
- [x] Consultas de destinos reutilizadas mientras vías, estaciones y billetes
  no cambien. Estado autoritativo, permisos, recibos y commit conservados.
- [x] Chrome: doce recorridos, veinte clics con guardado retenido; mano presente
  en el primer rAF entre 12,3 y 51,5 ms. Las confirmaciones aceptadas de esos
  recorridos llegan entre 523,9 y 702,9 ms por la espera impuesta y el conductor.
  No son mediciones de Render ni tiempos físicos de pantalla.
- [x] Suite amplia: 645/645 pruebas en 160,5 s; documentación y diff correctos.
- [x] Regresión `browser-card-ui.cjs`: actor/rival/espectador, renovación,
  pagos, móvil y traducción; sin errores de navegador. La última comprobación
  de feedback retiene el ACK y verifica que el estado ya revele la carta.
- [x] Publicar esta ampliación y medir clic → mano en producción: seis robos,
  primer rAF entre 6,8 y 13,4 ms, imágenes provisionales cargadas y sin duplicados.
  CI 645/645 y doce recorridos Chrome aprobados antes de publicar.

La pintura del color definitivo no se midió en esa versión anterior; la
ampliación de envío encadenado registra la medición de su nuevo comportamiento.

Evidencia local en `.qa/draw-feedback/report.json`, `pending-visible-desktop.png`,
`pending-desktop.png` y `pending-mobile-reduced.png`. Comparación CPU en
`connectivity-benchmark.json`: tablero sintético europeo de cinco jugadores y
tres estaciones por jugador, 60 muestras de seis vistas autorizadas, mediana
3,52 → 0,65 ms (p95 3,87 → 0,76 ms), con vistas idénticas. No mide SQL ni red.
Los 42 tests dirigidos de intención, caché, vistas, mapas e historial pasaron.
Suite completa en `.qa/draw-feedback/node-tests.txt`; regresión visual en
`card-ui-tests.txt` y recorrido final en `browser-tests.txt`, en la misma carpeta.
El servidor habitual permaneció sin reiniciar durante la validación local.
La publicación posterior en Render y las salas privadas de QA están en [Producción](../production.md).

## Respuesta inmediata al clic · 2026-11-03

Ampliación aprobada con «implementa» tras el análisis Moti de la demora de cartas.

- [x] Carta visible o reverso del mazo inicia movimiento/sonido al pulsar, sin
  adelantar mano, contadores, turno ni secretos. Conciliación con ACK/evento,
  sin un segundo vuelo/sonido al confirmar.
- [x] Hasta una segunda elección local mientras se guarda la primera; envío
  con nueva revisión, identidad de posición conservada y cancelación al renovar.
- [x] Rechazo, desconexión, fallo de guardado, resize y movimiento reducido;
  reintento idempotente y recibo durable con `drawEventId`.
- [x] Métricas separadas para robos, construcción, bots y lotes mixtos. El
  guardado sigue siendo obligatorio; no se promete reducir su RTT con esta UI.
- [x] Completar regresión y revisión final.
- [x] Publicar: `c5c7bf2`, Live en Render a las 10:11:46 Lima del 2026-11-03.
  CI completo 641/641, recursos iguales y `drawFeedbackVersion:1` verificados.
  Evidencia en [Producción](../production.md).
- [x] Medir clic y confirmación en navegador de producción, sin presentar
  medidas locales o de CI como cifras de Render: completado con la ampliación
  de mano provisional; evidencia remota en [Producción](../production.md).

Verificación final: `node tests/browser-draw-feedback.cjs`, diez recorridos Chrome
con doble remoto y guardado retenido, sin errores del navegador. En 18 clics,
creación del feedback entre 0,9 y 2,7 ms y siguiente rAF entre 13,0 y 46,7 ms.
Las confirmaciones medidas en los casos aceptados llegaron entre 494,6 y 646,2 ms
con guardado retenido por la prueba: la espera no retrasa el movimiento inicial.
Capturas de escritorio y móvil 390×844 inspeccionadas. Informe regenerable en
`.qa/draw-feedback/report.json`; los tiempos incluyen carga local de QA, no son
una promesa para todos los dispositivos. Se distinguen feedback y confirmación.

23 pruebas de intención/recibos/cola y 40 de persistencia, proyecciones, assets y
transporte aprobadas. `tests/browser-card-ui.cjs` también pasó su recorrido
previo completo (actor/rival/espectador, renovación, pagos y móvil).

La suite amplia ejecutó 637 pruebas: 636 pasaron y una esperaba el recibo sin el
nuevo campo opcional. Se actualizó esa aserción para comprobar el evento y su
conservación tras reinicio; la repetición dirigida de ese archivo y proyecciones
pasó 7/7. No quedaron fallos pendientes; no se presenta como una segunda suite
amplia. Logs amplios en `.qa/draw-feedback/node-tests.txt`. Comprobador documental
y `git diff --check` correctos. Este cambio no adelanta construcciones de rutas
ni modifica reglas, SQL, planes de hosting o el servidor real.

## Entrega en producción · 2026-11-02

Publicado en `main` y Render con el commit `f4584c9`; **Live** a las 06:38:26
(Lima). La combinación final pasó 353/353 pruebas y los recorridos Chrome de
túneles y flujo. La verificación remota confirmó archivos idénticos, UI 8,
práctica con bots, resultados, historial anterior y salud de Supabase.
Evidencia y límites en [Producción](../production.md).

## Publicación conjunta · 2026-11-03

La implementación de esta ficha quedó publicada en `ef65487`, Live en Render
tras CI aprobado. El alcance publicado, las comprobaciones de producción y
sus límites están en [Producción](../production.md).

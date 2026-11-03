# Historial, repetición e idiomas

Contrato implementado en este checkout; entrega y evidencia en
[la ficha](work/history-replay.md). La [versión publicada](production.md) se registra
por separado.

## Resultados y conservación

Cada partida recibe un UUID independiente de su código de sala. El servidor
registra el reparto inicial, acciones aceptadas de humanos/bots, vencimientos,
conexión y cambios de control. Guarda resultados reales de los sorteos y estados,
sin volver a sortear para reproducirlos. El archivo permanece aunque desaparezca
la sala. Las partidas anteriores a esta implementación no se pueden reconstruir;
si una sala ya iniciada se recupera, su grabación se marca parcial.

- `active`: en curso; aparece en el historial propio, sin replay aún.
- `completed`: final natural después de la última ronda y elecciones pendientes.
  Conserva puntos de rutas, destinos positivos/negativos, estaciones, Express,
  desempates y procedencia detallada (`result.details`).
- `abandoned`: cierre definitivo por abandono/caducidad o fin anticipado de
  práctica. Conserva progreso y puntos parciales de rutas; no declara ganador
  ni liquida destinos/bonificaciones como resultado completado.

Una desconexión breve no cierra el historial. Continúan las reglas existentes de
reconexión, reserva, plazos y deduplicación por ID de acción. Los recibos nuevos
comparan también la huella de la acción y su dependencia opcional `after`; un ID reutilizado con contenido diferente
se rechaza sin añadir pasos al replay. IDs antiguos y ventana de 128 se conservan
según el [contrato de recibos](architecture.md#recibos-de-comandos). Salas normales se
recuperan desde el checkpoint. La práctica conserva su archivo, pero la sesión
activa sigue siendo efímera y no se reanuda tras reiniciar el proceso.

## Acceso

Durante la partida se conserva el filtrado por puesto. Desde UI 8, las vistas
públicas nuevas conservan la base comprometida de un túnel y, al construir, su
extra pagado; no incluyen alternativas de pago ni el resto de la mano. Los
archivos anteriores mantienen sus proyecciones originales, sin reconstruir
composiciones de pago ausentes. Al cerrarse:

| Solicitante | Sala privada | Sala pública |
| --- | --- | --- |
| Participante con identidad verificada | Replay completo y auditoría | Replay completo y auditoría |
| Cualquier otra persona con el enlace | Sin acceso | Replay sin manos, destinos, ofertas ni orden de mazos |

El resultado público muestra puntos, pero no identidades de destinos privados.
Ese filtro se aplica también al espectador en vivo al terminar. Los bots fijos y
los reemplazos usan icono de robot; la vista espectadora no incluye el panel vacío
de mano. Un enlace de observación caducado muestra una alerta visible en Partidas.

`guest-identity.js` crea una cookie aleatoria HttpOnly/SameSite=Lax/Secure en HTTPS,
con duración de un año. Solo su SHA-256 se asocia a los puestos. Borrar esa cookie
sin vincular una cuenta puede perder el acceso; un nombre igual no recupera nada.
OAuth y la consulta autenticada de cuenta vinculan el invitado al UUID del perfil
verificado. La unión es idempotente, conserva el historial previo de la cuenta y
rechaza apropiación por otra. Una identidad ya reclamada no da acceso anónimo;
logout rota la cookie. Los enlaces privados de puesto siguen siendo independientes.

La composición de vistas de lobby, partida y grabación vive en
[authorized-views.js](../game/queries/authorized-views.js), compartida por servidor
y archivo. El transporte verifica sesión y permiso de observar la sala; la
consulta no toma una identidad ni un puesto enviados por el cliente como prueba
de acceso.

[history-queries.js](../game/application/history-queries.js) aplica propiedad,
reclamaciones, visibilidad, cierre y versión antes de solicitar pasos remotos.
[replay-view.js](../game/queries/replay-view.js) construye resúmenes y respuestas
con las perspectivas guardadas. También listado, acciones, eventos y auditoría
se devuelven como copias, sin permitir cambios del archivo desde una consulta.
El puente público `archive.list`/`archive.replay` y las rutas HTTP se conservan.
El encabezado aditivo de definición se comprueba después de autorizar y antes
de cargar pasos remotos. Una versión desconocida o referencia incompleta devuelve
409; no se sustituye por Europa. La ausencia de los tres campos conserva el lector
original de archivo v1.

## Grabación y almacenamiento

[match-archive.js](../backend/match-archive.js) recibe observaciones del motor y conserva
estado completo, vistas autorizadas y miembros públicos. [replay-state.js](../shared/replay-state.js)
guarda diferencias y un estado completo cada 32 pasos (y al recuperar un proceso).
Cada paso incluye fecha, acción, eventos y una cadena SHA-256. La cadena detecta
alteraciones accidentales; no equivale a una firma externa contra un administrador
con acceso para reescribir el archivo entero.

Antes de captar un paso nuevo se normaliza la partida viva mediante
`Engine.normalize`; sus vistas ya son copias independientes. Esto completa los
detalles de resultados legados sin cambiar sus totales. Leer una repetición usa
sus proyecciones guardadas: no ejecuta el normalizador sobre frames anteriores
ni reescribe sus datos o hashes para añadir detalles actuales.

Las partidas vivas nuevas llevan `schemaVersion:1`, `mapRef` y `rulesRef`.
`Engine.restoreState` valida y adapta partidas al cargar salas; nunca se aplica a
frames históricos. Al continuar una grabación antigua, solo el estado completo
o las diferencias del paso nuevo incorporan la cabecera dentro de `game`. El
prefijo anterior y su cadena de hashes permanecen intactos.

Las nuevas vistas añaden `definitionVersion:1`, `mapRef` y `rulesRef`. El snapshot
guarda una sola `definition` pública junto a `game`, `views` y `members`; forma
parte del hash. Su esquema y campos están en [arquitectura](architecture.md).
Los metadatos guardan esa misma versión y referencias, sin copiar todo el catálogo
en cada fila del listado. `map` es una etiqueta (`Europa`, `Laboratorio`, `Sudamérica · beta` o el ID de un mapa sin etiqueta) y
`rulesVersion` conserva el formato informativo anterior; las referencias exactas
son la identidad normativa. El archivo y el formato de diferencias siguen en v1.

El lector usa la definición grabada aunque ese mapa ya no esté en el catálogo
del servidor. Comprueba versión de definición y coherencia entre referencias de
metadatos, definición y vistas; no ejecuta reglas actuales ni reconstruye datos
desde el estado privado. Público y participantes reciben la misma definición,
pero mantienen sus respectivas vistas y filtros de secretos. La auditoría devuelve
los frames originales completos, con hashes intactos. El verificador de auditoría
comprueba la cadena, no certifica legalidad histórica ni balance.

Una grabación reanudada puede empezar con pasos antiguos sin definición. Los
pasos nuevos introducen el contrato mediante snapshot o diff; desde entonces no
puede desaparecer. Metadatos con referencias nuevas exigen que haya una definición
grabada. Un archivo completamente antiguo se devuelve con su formato anterior,
sin añadir campos ni cambiar sus respuestas para adaptarlo al motor actual.
No hay cambio SQL: metadatos y frames siguen siendo JSON en las mismas columnas.

Archivo local: el manifiesto `version: 2` conserva salas, metadatos y reclamaciones;
los pasos viven en `STATE_FILE.archive/<hash-del-id>.jsonl`, un archivo por partida.
Solo se serializan/anexan pasos nuevos. Se sincronizan antes de reemplazar
atómicamente el manifiesto, que fija bytes y cantidad de pasos confirmados. Al
recuperar se ignoran colas sin confirmar; el siguiente anexo las trunca. La copia
`.bak` referencia su propio prefijo, recuperando sala y grabación coherentes.
Un archivo de pasos faltante o incompleto intenta recuperar la copia y, si tampoco
es válida, falla sin sustituir el historial por uno vacío.

Se leen tanto el array antiguo como `{rooms, archive}`; el primer guardado los
migra conservando los pasos y una copia del formato previo. Los cambios posteriores
de color escriben solo el manifiesto y su respaldo, sin leer ni serializar el
historial acumulado. Los pasos siguen cargándose al arrancar para servir replay;
esta mejora reduce el coste de guardar, no la memoria total del historial.
Para respaldar/restaurar hay que conservar juntos manifiesto, `.bak` y directorio
`.archive`; [operación local](operations.md) explica el procedimiento.

Una versión local de envoltorio desconocida se rechaza y no intenta sustituirse
por un respaldo antiguo. La validación del estado de partida sucede antes del
primer commit, también en Supabase. Si falla, no se cierra ni reescribe el historial
como consecuencia de una restauración parcial.

Supabase: [003_match_archive.sql](../supabase/003_match_archive.sql)
crea metadatos, pasos y reclamaciones de invitados. La lectura usa
[004_archive_paging.sql](../supabase/004_archive_paging.sql): primero
metadatos/permisos y después páginas de hasta 16 pasos, tres solicitudes simultáneas.
Se verifica la secuencia completa y se limita al cierre leído; una respuesta parcial
no se presenta como replay válido. El plazo de lectura es 15 s por página, sin cambiar
el plazo ni la autoridad de las escrituras. El RPC v2 guarda checkpoint y
pasos en la misma transacción, valida secuencia y rechaza conflictos, conserva
idempotencia y exclusión de escritores. RLS y permisos impiden acceso directo de
`anon`/`authenticated`; solo Node utiliza las RPC con credenciales del servidor.
Un fallo de guardado pausa también la práctica y sus bots: no se confirma una
jugada cuyo historial no pudo conservarse. El cierre sella el archivo: desconexiones
posteriores o la caducidad de la sala no agregan eventos de abandono a una partida
ya completada. No hay borrado automático del historial. Vigilar el crecimiento de la base; el
archivo no sustituye backups ni recuperación punto en el tiempo.

Al arrancar, los archivos activos sin una sala recuperable se cierran como
abandonados. Un archivo conserva `schemaVersion:1` y los estados ya proyectados:
el replay no ejecuta reglas nuevas sobre partidas antiguas. Europa, Laboratorio y Sudamérica beta
son seleccionables y renderizables. Cualquier mapa/modo
futuro debe pasar por esta misma autoridad, privacidad y grabación.

API HTTP sin caché:

- `GET /api/history`: partidas del invitado/cuenta verificados.
- `GET /api/history/:uuid`: repetición cerrada filtrada; activa 409, privada ajena 404.
- `GET /api/history/:uuid/audit`: JSON completo solo para participantes.

Ninguna respuesta contiene tokens de puesto, cookies o identificadores de propiedad
privados. La auditoría sí contiene las cartas/destinos y el orden de mazos registrado;
compartirla revela esa información de la partida cerrada.

## Interfaz e idiomas

El historial en vivo muestra «nombre robó» y una miniatura por robo. `history.draw`
conserva el origen y la carta en el estado privado; `engine.historyEntryView`
omite el color de robos del mazo para rivales y espectadores, que ven el reverso.
El filtro se aplica también a eventos de pasos del replay público, además de sus
vistas. El propietario conserva sus colores tras reconectar. Los registros
anteriores sin metadatos siguen mostrando su texto, sin inventar cartas.
Los avatares del historial comparten las proporciones del panel y resultados;
la repetición no reproduce avisos de cuenta atrás de los plazos archivados.
Las variaciones decorativas de Pasajeros y Midsommar Express se reconstruyen con el código de sala,
puesto, ruta y celda. Cada ruta recorre tandas barajadas de seis sin repeticiones
internas ni entre el final e inicio de tandas; no se guardan variantes ni
personajes en los pasos. El
catálogo visual puede evolucionar sin migrar la grabación.

Perfil → Historial filtra todas/en curso/completadas/abandonadas y presenta filas
compactas con fecha, puesto, jugadores, duración, estado y replay; dos líneas
por partida en móvil. La fila abre un único desglose de puntos y el icono de
repetición navega directamente. La duración es tiempo de calendario entre inicio
y cierre; lleva `~` si la grabación es parcial y `—` mientras siga en curso.
El servidor añade `ownSeat` y `rank` al listado privado a partir de la identidad
verificada y sus reclamaciones de invitado, nunca del nombre. El puesto solo
existe al completar: compara puntos, destinos completados, puntos de estaciones
y Express, compartiendo puesto en empate exacto. No expone IDs de propiedad.
Resumen cuenta los estados por separado. `/replay?id=UUID`
reutiliza el tablero, mano y resultados, sin conexión de juego ni envío de acciones.
Tiene inicio/final, pasos, búsqueda por acción, barra de posición, pausa y velocidades
0,5×, 1×, 2×, 4× y 8×. Los participantes pueden elegir cualquier perspectiva y consultar
cartas/destinos del paso; la vista pública recibe únicamente su proyección.

El cliente recibe la definición reconstruida de cada paso junto a su vista.
Usa los nombres de ciudades guardados incluso en el panel privado, y conserva
IDs numéricos o de texto al seleccionar destinos y vías. Solo el protocolo
antiguo completo usa el contexto europeo legado; un paso actual sin definición
o sin layout compatible detiene la reproducción y muestra el error. Los controles
se cierran de forma segura si la pestaña cambia de visibilidad tras ese error.
El layout no está en los frames: se resuelve por referencia exacta en el bundle,
que incluye Europa, Laboratorio y Sudamérica beta. Contrato del cliente en
[arquitectura](architecture.md#contexto-y-layout-del-cliente).

`i18n.js` y `translations.js` localizan HTML, accesibilidad, mensajes y registros.
Español es el valor inicial; Más → Idioma permite ESP o ENG y guarda `rr-language`.
Durante la partida se accede desde el engranaje, también en móvil. El cambio
recarga la misma URL y conserva credencial y borradores locales; no reinicia
los plazos del servidor.
El cambio recarga la ruta actual, conservando los mecanismos de reconexión.
Las plantillas se traducen antes de interpolar nombres, códigos y otros valores:
los datos del jugador no se traducen ni cambian de identidad. Las ciudades conservan
sus nombres propios. No se han inventado contenidos para Jugar, amigos, chat o las
secciones futuras.

## Verificación y auditoría local

```sh
node --test tests/authorized-views.test.js tests/history-queries.test.js tests/match-archive.test.js tests/archive-sql.test.js tests/history-server.test.js tests/account-auth.test.js tests/i18n.test.js
node scripts/verify-match-audit.js /ruta/a/trencitos-partida.json
node tests/helpers/history-preview.js
```

El helper crea dos partidas completas y una abandonada en datos temporales, arranca
localhost:3143 y ofrece `/__qa/setup` para una identidad de invitado de prueba.
Nunca cargar ese helper en producción. La ruta de fixture solo existe en el helper,
no en `server.js`. Las pruebas SQL usan PGlite y las de OAuth un proveedor simulado.


## Análisis por paso y controles compactos

`GET /api/history/:id?analysis=1` añade una lista `analysis`, alineada con los
frames. La respuesta ordinaria y la auditoría conservan sus cuerpos anteriores.
Cada paso contiene recursos públicos, rutas construidas, longitud del camino más
largo y líderes empatados. Solo participantes reciben cantidades/puntos de destinos
completados y pendientes y una proyección «Puntuación si terminara ahora».
Los destinos se leen de `ticketProgress` grabado, que ya incluye la asignación de
estaciones histórica; la longitud usa `longestTrail` sobre las rutas de ese paso.
Las longitudes se cachean por red propia. La proyección requiere parámetros de
puntuación grabados; en un registro antiguo incompleto se muestra dato no disponible.
No se confunden bonificaciones provisionales con puntos concedidos en vivo.

La interfaz muestra un modal de carga con tren y reintento, conserva la perspectiva
seleccionada al avanzar y distingue el actor del paso. El historial acumula todos
los eventos grabados: pasado, paso actual y futuro navegable. Los controles viven
junto al historial en escritorio y en un panel plegable en móvil. Hay saltos a
construcción e hito (destinos, liderazgo/empate, estaciones, túnel desistido, última
ronda y final). Buscar un paso es instantáneo y cancela sonidos/efectos pendientes;
la reproducción usa la velocidad elegida y conserva la cámara.

## Entrega con memoria acotada

HTTP autoriza el registro antes de leer frames y entrega el mismo JSON mediante
un flujo con backpressure. Supabase se consulta en páginas secuenciales de 16
frames; solo se retienen la página actual, dos estados reconstruidos y el análisis
compacto. La auditoría también se entrega por partes. Cancelar la descarga cierra
el iterador; un error posterior al inicio interrumpe la respuesta en vez de
publicar una grabación parcial válida. Los hashes y snapshots almacenados no cambian.

Esto evita cargar y volver a copiar de golpe grabaciones antiguas de decenas de MB.
El navegador mantiene el historial completo recibido; no se modificó el formato
ni se ejecutan jugadas para reconstruirlo.

# Modelo de partida y contratos de transición

Diseño iniciado en fase 1 el 2026-11-02 bajo la
[decisión modular acordada](modular-game-platform.md). Conserva el destino de la
transición y señala los contratos que ya se concretaron; la
[arquitectura existente](../architecture.md) describe el código actual.
La [fase 2](../work/modular-platform-domain.md) registra las políticas extraídas,
la [fase 3](../work/modular-platform-application.md) su coordinación y la
[fase 4](../work/modular-platform-maps.md) los mapas versionados. Cada ficha
conserva su aceptación y límites; lo pendiente no es capacidad disponible.

## Responsabilidades y vocabulario

| Módulo | Responsabilidad y límite |
| --- | --- |
| Partida (`match`) | Unidad de consistencia: jugadores por puesto, cartas, destinos, propiedad de vías, piezas, fases, relojes y resultado. Toda jugada valida y cambia este conjunto. |
| Sala (`room`) | Admisión, anfitrión, puestos antes de empezar, conexiones, control humano/bot, pausa y revancha. Una partida conserva sus puestos al iniciarse; una revancha tiene otra identidad. |
| Mapas y reglamentos | Definiciones inmutables y versionadas. El mapa describe conexiones y billetes; el reglamento describe pagos, acciones, recursos y puntuación. |
| Identidad | Verifica cuenta/invitado y propiedad del puesto. El dominio recibe un puesto autorizado, nunca cookies, WebSockets ni tokens. |
| Historial | Conserva estados/resultados observados, permisos y replay. No vuelve a ejecutar reglas ni sorteos para reproducir una partida. |
| Presentación y cosméticos | Composición visual del mapa, vagones, colores de jugador, sonidos y textos. No decide costes, conexiones ni legalidad. |

Estos son límites de módulos dentro del mismo proceso, no servicios nuevos. La
frontera entre partida y sala no permite guardar una jugada sin su historial:
la aplicación coordina esa confirmación conjunta.

**Vía** es una conexión construible con identidad propia. **Corredor** agrupa las
vías paralelas entre las mismas ciudades. **Recorrido** es una secuencia de vías
para conectar destinos o calcular Express. **Casilla** representa una unidad de
longitud/pieza, no un agregado persistido. **Puesto** identifica al participante
dentro de una partida; no es una cuenta. **Oferta** es una elección pendiente de
destinos con ID y vencimiento propios. **Pago** es una composición de un color
y locomotoras, distinta del color del vagón del jugador.

Una intersección dibujada sin ciudad no crea conectividad. Las estaciones toman
prestada una vía para destinos conforme al reglamento, sin cambiar su propietario.

## Cuatro contratos de datos

Formas objetivo, expresadas como datos JavaScript; no exigen TypeScript ni una
librería de esquemas. Los nombres definitivos se materializan al extraer cada
límite, sin añadir ahora carpetas vacías ni duplicar todos los datos actuales.

| Contrato | Contenido |
| --- | --- |
| `MapDefinition` | `schemaVersion`, `id`, `version`, ciudades `{id,name}`, corredores `{id,cityIds}`, vías `{id,corridorId,a,b,length,color,tunnel,ferry}`, billetes `{id,a,b,points,kind}`. Sin dueño ni coordenadas. |
| `RuleSet` | `schemaVersion`, `id`, `version`; colores/cartas, reparto y recursos iniciales, límites de jugadores, pagos, dobles, estaciones, túneles, reciclado, última ronda y puntuación. Opciones de reloj validadas más parámetros elegidos al crear la partida. |
| `MatchState` | `schemaVersion`, identidad de partida, referencias exactas a mapa/reglas, configuración inicial, puestos, manos/mazos/ofertas, dueños por ID de vía, turno/fase/túnel, resultado y contadores de eventos. Sin sockets, repositorios ni generadores aleatorios serializados. |
| `MapLayout` | `id`, `version`, referencia al mapa; coordenadas, curvas, offsets de dobles, etiquetas y colocación de casillas por ID. Ajustar geometría no cambia una conexión ni una regla. |

Los reglamentos comparten código cuando las reglas son las mismas. Los valores
configurables son datos; una mecánica nueva requiere una política implementada y
probada. No se acepta código ejecutable cargado desde JSON.

El registro valida antes de iniciar: IDs únicos, extremos existentes y distintos,
billetes válidos, longitudes positivas con puntuación definida, colores admitidos,
`0 <= ferry <= length`, corredores coherentes y capacidades requeridas por el
reglamento. La conectividad del mapa se comprueba explícitamente; la disposición
de casillas y etiquetas se valida aparte. Una longitud sin puntuación no obtiene
un valor inventado por el renderizador o el bot.

El primer corte de [fase 4](../work/modular-platform-maps.md) ya implementa
`MapDefinition`, su catálogo validado y la tabla europea congelada. `RuleSet`,
`MatchState` versionado y `MapLayout` por definición siguen siendo contratos
objetivo. El puente conserva temporalmente los números del runtime anterior.

### Identidades y versiones

- En el destino final, IDs de dominio son cadenas opacas dentro de cada mapa.
  Sudamérica conserva `SA001`, etc. Europa conserva códigos de ciudad como `PAR`;
  sus vías/billetes reciben claves explícitas `eu-route-000` / `eu-ticket-000`.
  La tabla que vincula cada clave con el ID numérico anterior se congela desde la
  base, **no se regenera según el orden de un array**. Validarla es requisito de fase 4.
- En fase 2, las políticas tratan un ID existente como opaco (`number | string`)
  y lo comparan por igualdad; no convierten guardados ni cambian el protocolo.
  El adaptador de Europa sigue entregando IDs numéricos al motor legado.
- Referencia de mapa prevista: `{id:"europe",version:"1"}`; para Sudamérica,
  `{id:"south-america",version:"3.3-beta"}`. El nombre del paquete y el alias de
  selección `south-america-v3.3-beta` no sustituyen esa referencia.
- La etiqueta histórica `rulesVersion: "europe-classic-1"` queda intacta en replay.
  La referencia de reglas equivalente será `{id:"europe-classic",version:"1"}`;
  describe las variantes actuales de Trencitos, no promete reglas comerciales
  literales. Otro mapa puede compartir esa referencia si admite esas reglas.
- Separar versión del esquema de estado, revisión de partida/sala, versión de
  mapa/reglas, protocolo de vista y versión visual. `revision`, `turnSerial`,
  `eventSerial` y `archiveSeq` tienen funciones distintas; no intercambiarlos.
- Las referencias de una partida iniciada son inmutables. Conservar las
  definiciones antiguas mientras existan guardados que las necesiten. Una versión
  desconocida se rechaza explícitamente; nunca cae silenciosamente en Europa.

## Invariantes que protege la partida

1. Solo el puesto autorizado actúa y solo cuando la fase/turno lo permite. Las
   selecciones iniciales y ofertas admiten confirmación fuera del turno principal.
2. Cada vía tiene a lo sumo un dueño. Los carriles dobles respetan la restricción
   del mismo dueño y de 2–3 jugadores; se consulta el corredor, no la geometría.
3. Validar el pago completo antes de gastar. Una construcción ordinaria actualiza
   mano, vagones, dueño y puntos juntos, y avanza exactamente un turno.
4. Se conserva el multiconjunto de cartas. La base de túnel sigue en la mano
   durante la reserva; las reveladas se cuentan aparte solo hasta resolverlo.
   En `result` son un recibo visual, ya recicladas, no cartas adicionales.
5. El túnel pasa por `reveal → decision → result` o `reveal → result` si no hay
   suplemento. La base y el extra se deben poder pagar conjuntamente; desistir
   no gasta la mano. Se avanza después del resultado, incluso en la última ronda.
6. Ningún consumidor puede extender plazos al consultar/reconectar. Las pausas
   autorizadas y restauraciones ajustan relojes mediante una transición explícita.
7. Destinos, resultado y desempates usan el reglamento de esa partida. Se esperan
   las ofertas pendientes antes del cierre natural; abandono no simula un ganador.
8. Vistas de rivales/espectadores y observaciones de bots no reciben secretos ajenos.
   Los eventos internos no se consideran seguros para transmisión directa.

Las reglas y variantes actuales se mantienen en [dominio](../domain.md); esta
lista fija responsabilidades, no crea un segundo reglamento.

## Comandos, efectos y consultas

### Entrada y autoridad

La aplicación recibe un sobre validado:

```js
{ commandId, matchId, expectedRevision, type: "claim_route",
  payload: { routeId, color, wildCount } }
```

`actorSeat` procede de la sesión verificada y se añade en servidor. `now` y
`randomInt(maxExclusive)` son dependencias del servidor, nunca campos confiables
del cliente. La revisión describe el estado que vio el cliente; no da autoridad.
Durante el puente, `{type:"action",id,revision,action:{type:"claim",...}}` y las
acciones de bots siguen funcionando; el adaptador traduce sin exigir un cliente
nuevo. El sobre interno no cambia el protocolo de red en fase 1/2.

El primer corte de fase 3 extrae la coordinación humana a `player-action.js`,
con sala/puesto resueltos y sobre `{commandId, expectedRevision, action}`.
Todavía consume el formato legado y `Engine`; no implementa el sobre objetivo
ni los repositorios/committer completos. `stageRoom` enlaza con el guardado y
publicación actuales, y su aceptación remota solo se transmite después del
commit de la cola global. Contrato implementado en [arquitectura](../architecture.md)
y avance en [fase 3](../work/modular-platform-application.md).

El segundo corte añade `automatic-play.js` para vencimientos, bots permanentes,
reemplazos y práctica, ensamblado por `legacy-automatic-play.js`. Los
temporizadores delegan dentro del mismo `dispatch`; se mantienen las diferencias
de revisión y preparación entre entradas, descritas en arquitectura. La gestión
de conexiones permanece en los controladores. El tercer corte separa la
preparación, confirmación y publicación mediante los puertos transitorios
descritos abajo; aún se conserva el formato legado.

Separar dos operaciones explícitas:

```js
advanceDeadlines(match, { map, rules, now, randomInt })
execute(match, command, { map, rules, now, randomInt })
// -> { ok: true, next, events } | { ok: false, error: { code, details } }
```

`execute` aplica un comando sobre un estado ya avanzado a `now`; un rechazo no
modifica ese estado ni consume azar. Las transiciones de reloj sí pueden producir
efectos aunque después se rechace la petición del jugador. La aplicación guarda
esos efectos y comunica el rechazo con la nueva vista. No hacer rollback de un
vencimiento válido por un `claim` tardío. No recorrer automáticamente todos los
turnos vencidos tras un reinicio: preservar el avance acotado actual.

El núcleo no realiza I/O ni usa `Date.now`, `crypto`, traducciones o constantes
globales de Europa. Un estado de trabajo pertenece al ejecutor hasta validarlo;
el consumidor no obtiene referencias mutables al agregado. La firma objetivo
no obliga a clonar toda la partida en cada política pequeña.

### Errores y hechos

Los rechazos de negocio usan códigos estables, inicialmente
`NOT_YOUR_TURN`, `INVALID_PHASE`, `DRAW_IN_PROGRESS`, `ROUTE_UNAVAILABLE`,
`INSUFFICIENT_TRAINS`, `INVALID_PAYMENT_COLOR`, `INSUFFICIENT_PAYMENT`,
`TUNNEL_BUSY` y `TUNNEL_PAYMENT_REQUIRED`. Los detalles se limitan a datos
autorizados. No distinguir al cliente una mano rival ni alternativas privadas.
La fachada traduce esos códigos a los mensajes españoles actuales y mantiene
su comportamiento de excepción; las pruebas no dependen del idioma del núcleo.
`STALE_ACTION`, autenticación, validación de sobre y fallos de almacenamiento
pertenecen a aplicación/adaptadores, no al cálculo del pago.

Hechos internos previstos: `RouteClaimed` (vía, puesto, pago, puntos),
`TunnelStarted` (base y revelación), `TunnelResolved` (resultado y pago),
`TurnAdvanced` y `FinalRoundStarted`. Son objetos sin texto traducido. No todos
se publican con todo su contenido: la proyección conserva el contrato actual de
eventos `build`, `tunnel_reveal`, etc. Un pago ordinario no expone nuevos detalles
privados solo porque estén disponibles internamente. Orden e identidad de eventos
se asignan una vez y se conservan en guardado; no constituyen un bus externo.

### Lecturas

`getPlayerView(match, seat)`, `getSpectatorView(match)` y la observación del bot
devuelven DTOs filtrados sin mutación ni alias que permitan cambiar el agregado.
El reloj de transporte añade `serverNow`; los plazos se leen del estado. La
normalización de guardados y el completado de resultados suceden al cargar o
terminar, antes de consultar. La proyección espectadora incluye también el filtro
final hoy llamado `safePublic`; `Engine.view(g,-1)` aislado no basta para ese caso.

El sexto corte de fase 2 materializa `projectMatch` y `Engine.normalize`. La
fachada conserva `view` y su reloj predeterminado, con `{now}` opcional; la consulta
recibe el tiempo explícito y devuelve copias. El cuarto corte de fase 3 reúne
lobby, estado y grabación en `authorized-views.js`, incluida la composición de
`safePublic`. `history-queries.js` decide el acceso antes de cargar pasos remotos y
`replay-view.js` devuelve copias de las proyecciones ya grabadas, sin adaptar
frames antiguos. Transporte conserva la identidad y el permiso de observación
en vivo. Contrato implementado en [arquitectura](../architecture.md).

## Repositorios y confirmación durable

Puertos objetivo para la plataforma modular:

- `MatchRepository.get(matchId)`: carga la unidad de partida y revisión, no cartas
  o vías como entidades guardables de forma independiente.
- `MapRegistry.resolve(mapRef, rulesRef)`: obtiene definiciones validadas e inmutables.
- `MatchCommitter.commit(batch)`: confirma conjuntamente estado de partida/sala,
  revisión, deduplicación y pasos/metadatos nuevos del historial.
- Lectura de historial autorizada mantiene un puerto propio, pues sobrevive a la sala.

No añadir `save()` separados a partida e historial ni una transacción por carta.
El adaptador inicial del repositorio puede resolver la partida dentro de `rooms`;
`MatchCommitter` envuelve la infraestructura existente. El checkpoint actual es
global: conservar su serialización global y autoridad de escritor mientras esa
sea la unidad durable. Tener un repositorio por partida no permite escrituras
concurrentes de checkpoints ni varias instancias activas.

Implementado en el tercer corte de fase 3: `createRoomStager` coordina preparación,
solicitud de checkpoint y vistas encoladas; `createCheckpointHandler` usa
`committer.prepare(repository)` / `committer.commit(batch)`. El repositorio
transitorio es el `Map` existente mediante `get(code)` / `values()`, no la búsqueda
objetivo por `matchId`. Los adaptadores de archivo/remoto confirman conjuntamente
DTOs de sala e historial, manteniendo sus formatos físicos. Archivo confirma de
forma síncrona; remoto confirma una vez al final del trabajo en la cola global.
`stageRoom=true` sigue significando preparado, no confirmación remota. El outbox
permanece en transporte/cola. Detalle en [arquitectura](../architecture.md).

El registro de mapas versionados y la búsqueda por identidad de partida
continúan pendientes; este puerto mínimo no los da por implementados. Las
lecturas autorizadas se centralizan en el cuarto corte, descrito arriba.

Orden para una petición válida: autenticar y validar sobre → comprobar duplicado
→ resolver vencimientos → comprobar control/revisión → decidir jugada → preparar
estado, historial y deduplicación → confirmar → publicar vistas y ACK.
Si el vencimiento vuelve obsoleta la revisión o la jugada falla, confirmar solo
los cambios automáticos que existan. Las elecciones privadas mantienen su
excepción actual a revisión global y se validan por oferta/estado pendiente.

Duplicados: el quinto corte de fase 3 conserva los últimos 128 IDs aceptados
en `member.actionIds` y añade huellas para nuevos comandos en `actionReceipts`.
La ubicación en el miembro acota partida/puesto/ID. Mismo ID con otro payload
produce `COMMAND_ID_CONFLICT`; los IDs legados sin huella mantienen su semántica
hasta salir de la ventana. No se reconstruye una huella usando un reintento.

La huella versionada usa todo el JSON de la acción, con claves ordenadas y arrays
en su orden original. Excluye la revisión porque su función es validar una jugada
nueva: el reintento de una ya aceptada conserva ACK aun con otra revisión, como
antes. Los IDs tampoco se refrescan al repetirlos. Se conserva el límite de 128;
fuera de esa ventana se deben pasar de nuevo controles de fase/revisión. No se
promete entrega exactamente una vez indefinida ni se habilitan reintentos antiguos
sin conciliarlos con una vista actual. Formato y orden implementados en
[arquitectura](../architecture.md).

Supabase reintenta el mismo ID de commit, no vuelve a ejecutar el dominio ni
sortear. Un resultado remoto incierto o pérdida de autoridad pausa el proceso
y exige recuperar el checkpoint; no sobrescribirlo con memoria revertida.
En fallo de guardado se descartan notificaciones y se recuperan juntos estado,
recibos e historial. Un fallo de entrega posterior al commit no revierte el juego.
En archivo, conservar el manifiesto que confirma el prefijo de replay y su `.bak`.

## Puente y compatibilidad

| Situación observada al diseñar la fase 1 | Tratamiento acordado |
| --- | --- |
| `engine.js` exporta `action`, `expire`, `view`, utilidades y datos; modifica objetos existentes. | Mantener la fachada y las referencias que esperan los consumidores durante las primeras extracciones. El nuevo núcleo se prueba también directamente. |
| `g.routes[id]` se usa en construcción, túneles y rutas prestadas; bots también usan constantes y ordenación numérica de IDs. | Buscar por identidad en el núcleo nuevo. Migrar todos los consumidores y comparadores antes de activar mapas con cadenas; no basta con cambiar `claim`. |
| `newGame` baraja con `crypto`; `newRandomGame(random)` inyecta el sorteo del primer puesto, no todos los mazos; `finish(force)` usa `crypto` directamente. | Extraer creación/cierre con la misma dependencia de azar. No declarar que todo el motor ya es determinista por tener `action({random})`. |
| `action` llama `expire` antes de validar y el servidor también avanza vencimientos. | Unificar la coordinación en aplicación, manteniendo los efectos automáticos ante comandos tardíos. |
| `ensureTiming` migra fases/temporizadores; `view` añade detalles de resultados antiguos y devuelve algunas referencias del estado. | Normalizar fuera de consultas, sin reiniciar plazos. Proyecciones copiadas/autorizadas; retirar la mutación solo al tener todos los puntos de carga cubiertos. |
| Archivo local v2, formatos antiguos array / `{rooms,archive}`, esquema RPC de checkpoint y archivo `schemaVersion:1`. | Son envoltorios diferentes. Adaptadores leen cada formato conocido; no incrementar todos los números al cambiar solo `MatchState`. |
| Partidas activas y archivos anteriores no tienen `mapRef`. | Identificar únicamente esos formatos legados conocidos como Europa/reglas históricas. Adaptar en memoria y guardar mediante el commit habitual; preservar original/backups. Formato nuevo sin referencia es inválido. |
| Replay conserva vistas, estados, diferencias y hashes. | No reescribir frames históricos ni sus hashes. Seleccionar lector/renderizador por versión; nuevos campos de mapa se incorporan en formato compatible o con lector versionado. |

El tercer corte de fase 2 permite inyectar azar en reparto/mercado inicial y
elecciones de cierre forzado. Conserva el parámetro legado del sorteo de primer
puesto y añade opciones para el reparto. Firmas implementadas y límites actuales
en [arquitectura](../architecture.md); esto no completa todos los adaptadores.

La migración debe ser idempotente y validar todos los lugares con IDs: vías,
`pending.routeId`, eventos, asignaciones de estaciones, recorridos y detalles de
resultado; billetes de manos, ofertas y mazos. Los frames históricos se interpretan
con su formato original. No asignar IDs usando el orden actual de una lista.

## Primer recorrido extraíble y límites de archivos

La fase 2 empieza por políticas de pago y construcción: el pago pertenece junto
a la construcción porque normal, ferri, estación y base/extra de túnel comparten
la composición. Propuesta inicial de módulos a crear solo al extraer:

```text
game/domain/payment.js       composición y reserva de cartas, sin textos
game/domain/route-claim.js   disponibilidad, dobles y decisión de construcción
game/compat/legacy-errors.js mensajes existentes para los errores extraídos
engine.js                  fachada temporal; orquesta lo aún no extraído
```

`decideRouteClaim(state, command, {map,rules})` devuelve un error o un plan
`{kind:"build"|"tunnel", routeId, payment, length, points}` sin gastar ni sortear.
La fachada aplica el plan mediante `spend`, eventos, registro y `next` existentes.
En el primer corte, para túneles solo inicia la reserva/revelación. El segundo
extrae la resolución temporizada a `tunnel.js` y el avance a `turn.js`, usando
el mismo estado persistido; detalle y evidencia en la ficha de fase 2.

Antes de llamar a esa política, la fachada conserva los controles de fase/turno
y el avance de vencimientos. La política verifica vía, corredor, vagones, color
y composición. Los errores conservan su orden observable. Los mensajes del
cliente no fijan dueño, longitud, puntos ni datos del mapa. Después se extraen
transiciones de túnel/turno, creación, destinos, estaciones y puntuación; solo
entonces se declara completada la fase 2.

Compatibilidad de pago: en vía de color, el motor usa el color de la vía salvo
petición de pagar todo con locomotoras; en gris usa el color elegido. Omitir
`wildCount` permite al motor calcular la composición mínima legal. Conservar
ambos comportamientos en el puente; no exigir campos nuevos a bots/clientes.

Mantener archivos por responsabilidad y API pequeña. No mover el frontend,
`data.js` ni los modelos de vagones en el primer subhito. Antes de fase 3, integrar
un checkpoint revisado del trabajo visual; cada worktree mantiene sus propios docs.

## Pruebas de aceptación

| Frontera | Evidencia antes de extraer / aceptación posterior |
| --- | --- |
| Construcción normal/ferri | [Contrato de construcción](../../tests/route-claim-contract.test.js): todas las vías no túnel con pago mínimo, locomotora adicional y solo locomotoras; compara mano, dueño, puntos, turno y las 110 cartas. |
| Dobles y rechazo | Mismo contrato: 2–5 jugadores, prohibición de ambas vías al mismo dueño, rechazos sin cambio/azar antes del vencimiento. |
| Túneles | Contrato nuevo para todas las vías túnel sin suplemento; [túnel compartido](../../tests/shared-tunnel.test.js) cubre pagos, desistimiento, plazos, privacidad y recuperación; [reciclado](../../tests/recycling.test.js) cubre conservación y reserva. |
| Vencimiento | Contrato nuevo conserva robos automáticos cuando una construcción tardía se rechaza. Las pruebas futuras distinguen transición de reloj y comando rechazado. |
| Persistencia y privacidad | [Cola](../../tests/durable-queue.test.js), [almacenamiento](../../tests/room-store.test.js), [multijugador](../../tests/multiplayer-server.test.js) y [historial](../../tests/match-archive.test.js) siguen como contratos de integración. |
| Núcleo extraído | [Políticas de construcción](../../tests/domain-route-claim.test.js) y suites `domain-*`: IDs desordenados/de cadena, contexto inyectado, rechazo sin mutar y ejecución sin reloj/azar/red ambientales. Las suites de contratos contrastan el comportamiento vía fachada. |
| Mapas/versiones, pendiente de fase 4 | Europa y mapa mínimo simultáneos, orden de vías permutado, estaciones/túneles/bots/replay con IDs opacos; guardados legados y versiones desconocidas. |
| Consultas y carga explícita | [Consultas](../../tests/match-queries.test.js) sobre estados congelados sin alias ni mutación; [carga legada](../../tests/legacy-load-server.test.js) normaliza antes de persistir/publicar; [archivo](../../tests/match-archive.test.js) conserva hashes y privacidad. |
| Aplicación, fase 3 activa | Jugadas humanas/automáticas y checkpoint preservan guardado incierto, deduplicación y elecciones simultáneas. [Vistas](../../tests/authorized-views.test.js), [historial](../../tests/history-queries.test.js) e [integración HTTP/WebSocket](../../tests/history-server.test.js) comprueban permisos, filtro público común y copias sin alterar el archivo. [Recibos](../../tests/command-receipts-server.test.js) y pruebas de aplicación comprueban huellas, ventana legada, reinicio y rollback. Pendiente: organización de interfaz. |

Las pruebas de fase 1 caracterizaron el motor de esa base. La implementación y
evidencia de las políticas/consultas posteriores viven en la [fase de dominio](../work/modular-platform-domain.md).
Los contratos pendientes de aplicación y mapas se verificarán contra código real
en sus fases, sin tests de frases de documentos ni mocks que solo reproduzcan el diseño.

## Organización física en fase 3

Se mantienen un repositorio, una instalación npm y un despliegue. `frontend/`
contiene presentación; `backend/`, transporte/composición y adaptadores legados;
`shared/`, módulos públicos realmente usados por ambos. `game/` conserva los
límites de dominio, aplicación y consultas. El arranque raíz y las URLs se
preservan mediante delegación y una lista explícita de assets. Separar servicios
o paquetes queda condicionado a una necesidad operativa; no es requisito de DDD
ni de CQRS. La compatibilidad de mapas/IDs sigue siendo trabajo de fase 4.

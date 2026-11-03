# Modelo de partida y contratos de transición

Diseño de fase 1, concretado el 2026-11-02 bajo la
[decisión modular acordada](modular-game-platform.md). **No describe módulos ya
extraídos.** Estado, validación y siguiente entrega en
[la ficha de fase 1](../work/modular-platform-contracts.md). La
[arquitectura existente](../architecture.md) sigue describiendo el código actual.
La [fase 2](../work/modular-platform-domain.md) materializa el primer corte de
pagos/construcción; los demás contratos de este documento siguen siendo el
destino de la transición, no capacidades ya disponibles.

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

## Repositorios y confirmación durable

Puertos de aplicación mínimos al llegar a fase 3:

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

Orden para una petición válida: autenticar y validar sobre → comprobar duplicado
→ resolver vencimientos → comprobar control/revisión → decidir jugada → preparar
estado, historial y deduplicación → confirmar → publicar vistas y ACK.
Si el vencimiento vuelve obsoleta la revisión o la jugada falla, confirmar solo
los cambios automáticos que existan. Las elecciones privadas mantienen su
excepción actual a revisión global y se validan por oferta/estado pendiente.

Duplicados: hoy `member.actionIds` conserva los últimos 128 IDs aceptados; un
duplicado se confirma sin volver a ejecutar. Mantener ese alcance durante el
puente, sin prometer entrega exactamente una vez indefinida. Para el nuevo
contrato, asociar el recibo a partida/puesto/ID y guardar también una huella del
comando; mismo ID con distinto contenido debe rechazarse. Migrar los recibos
anteriores sin inventar una huella, conservando su semántica hasta que caduquen.
Conservar el límite de 128; una repetición fuera de esa ventana no está cubierta
por deduplicación y debe pasar de nuevo controles de fase/revisión. No habilitar
reintentos automáticos antiguos sin conciliarlos con una vista actual.

Supabase reintenta el mismo ID de commit, no vuelve a ejecutar el dominio ni
sortear. Un resultado remoto incierto o pérdida de autoridad pausa el proceso
y exige recuperar el checkpoint; no sobrescribirlo con memoria revertida.
En fallo de guardado se descartan notificaciones y se recuperan juntos estado,
recibos e historial. Un fallo de entrega posterior al commit no revierte el juego.
En archivo, conservar el manifiesto que confirma el prefijo de replay y su `.bak`.

## Puente y compatibilidad

| Situación actual observada | Tratamiento acordado |
| --- | --- |
| `engine.js` exporta `action`, `expire`, `view`, utilidades y datos; modifica objetos existentes. | Mantener la fachada y las referencias que esperan los consumidores durante las primeras extracciones. El nuevo núcleo se prueba también directamente. |
| `g.routes[id]` se usa en construcción, túneles y rutas prestadas; bots también usan constantes y ordenación numérica de IDs. | Buscar por identidad en el núcleo nuevo. Migrar todos los consumidores y comparadores antes de activar mapas con cadenas; no basta con cambiar `claim`. |
| `newGame` baraja con `crypto`; `newRandomGame(random)` inyecta el sorteo del primer puesto, no todos los mazos; `finish(force)` usa `crypto` directamente. | Extraer creación/cierre con la misma dependencia de azar. No declarar que todo el motor ya es determinista por tener `action({random})`. |
| `action` llama `expire` antes de validar y el servidor también avanza vencimientos. | Unificar la coordinación en aplicación, manteniendo los efectos automáticos ante comandos tardíos. |
| `ensureTiming` migra fases/temporizadores; `view` añade detalles de resultados antiguos y devuelve algunas referencias del estado. | Normalizar fuera de consultas, sin reiniciar plazos. Proyecciones copiadas/autorizadas; retirar la mutación solo al tener todos los puntos de carga cubiertos. |
| Archivo local v2, formatos antiguos array / `{rooms,archive}`, esquema RPC de checkpoint y archivo `schemaVersion:1`. | Son envoltorios diferentes. Adaptadores leen cada formato conocido; no incrementar todos los números al cambiar solo `MatchState`. |
| Partidas activas y archivos anteriores no tienen `mapRef`. | Identificar únicamente esos formatos legados conocidos como Europa/reglas históricas. Adaptar en memoria y guardar mediante el commit habitual; preservar original/backups. Formato nuevo sin referencia es inválido. |
| Replay conserva vistas, estados, diferencias y hashes. | No reescribir frames históricos ni sus hashes. Seleccionar lector/renderizador por versión; nuevos campos de mapa se incorporan en formato compatible o con lector versionado. |

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
Para túneles solo inicia la reserva/revelación actual; su resolución temporizada
es el siguiente subhito, no una nueva implementación paralela.

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
| Núcleo extraído, pendiente | Casos directos con IDs desordenados/de cadena y contexto inyectado; mismo resultado vía fachada; rechazo sin mutar; sin imports de red, disco, navegador, i18n o datos globales. |
| Mapas/versiones, pendiente de fase 4 | Europa y mapa mínimo simultáneos, orden de vías permutado, estaciones/túneles/bots/replay con IDs opacos; guardados legados y versiones desconocidas. |
| Aplicación/consulta, pendiente | Guardado incierto, duplicado con contenido distinto, elecciones simultáneas y consulta sobre estado congelado; replay público al terminar sin destinos privados. |

Las pruebas de fase 1 caracterizan el motor actual, no acreditan que estas APIs
futuras existan. Las garantías nuevas se probarán contra código real en su fase,
sin tests de frases de documentos ni mocks que solo reproduzcan el diseño.

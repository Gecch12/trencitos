# Dominio y reglas existentes

Describe el comportamiento de Trencitos contrastado con [engine.js](../backend/engine.js),
[Europa v1](../shared/maps/europe-v1.js), su [puente de datos](../shared/data.js) y pruebas. No equivale a una transcripción del reglamento
comercial: conserva las variantes del proyecto.

La composición/reserva de pagos y la decisión de construir están extraídas a
[políticas de dominio](../game/domain/route-claim.js), con
[pagos compartidos](../game/domain/payment.js). Reciben los datos de mapa y
reglamento; devuelven un plan sin gastar cartas. Las transiciones de
[túnel](../game/domain/tunnel.js) y [turno](../game/domain/turn.js) también devuelven
planes, con tiempo y duraciones explícitos. El motor aplica sus efectos.
El [reparto](../game/domain/setup.js) recibe recursos y mazos definidos por reglas;
las [elecciones y ofertas de destinos](../game/domain/destinations.js) reciben
mínimos, cantidad ofrecida, reloj y generador de azar para decisiones automáticas.
Las [estaciones](../game/domain/stations.js), [red](../game/domain/network.js) y
[puntuación](../game/domain/scoring.js) también son políticas independientes:
reciben mapa/propiedad, billetes y parámetros de puntuación, sin textos o efectos.
El [robo y mercado de cartas](../game/domain/train-cards.js) recibe pilas, límites
y azar explícitos. Devuelve cambios sin alterar el estado recibido; la fachada
conserva el orden de eventos, privacidad y resolución de turno.
Las [consultas](../game/queries/match-view.js) devuelven copias independientes de
la partida. La adaptación de relojes/resultados antiguos es una escritura explícita
(`normalize`) previa a consultar; no ocurre al leer ni cambia frames históricos.
La extracción conserva las reglas descritas aquí; avance y límites en
[fase 2](work/modular-platform-domain.md).

La red y los billetes de Europa tienen una definición inmutable versionada.
La correspondencia entre IDs nuevos y números anteriores está congelada; los
mensajes y guardados aún conservan estos números. El registro rechaza versiones
inexistentes y redes inválidas. El motor ya resuelve mapa y reglamento por partida
y construye vías por igualdad de ID, sin usar su posición en un array. Sus
partidas nuevas conservan versión de estado y ambas referencias después de
serializar; las partidas legadas sin referencias se validan como Europa antes de
añadir su cabecera. Un estado versionado sin referencias o con versión desconocida
falla, sin elegir un mapa alternativo. El único reglamento
incorporado es `europe-classic@1`, con los valores existentes; al iniciar se
comprueba además que el mapa pueda repartir todos los billetes iniciales.
La restauración valida las identidades guardadas de red, billetes, túneles,
estaciones y resultados sin recalcular puntos anteriores. Bots de práctica y
reemplazo ya usan el contexto de su partida; sus simulaciones conservan ese mapa
y solo infieren secretos desde cantidades públicas. La estrategia no cambia.
La selección por sala y adaptación de vistas, archivo y frontend siguen pendientes en
[fase 4](work/modular-platform-maps.md); detalles del puente en
[arquitectura](architecture.md).

## Conceptos e invariantes

- **Sala:** código público, anfitrión y 2–5 puestos para iniciar. La credencial
  privada recupera un puesto; el código público no autentica a su propietario.
  Las nuevas salas son públicas por defecto, con opción privada; las antiguas sin
  este campo siguen privadas. El anfitrión fija capacidad 2–5 y añade/retira bots
  antes de empezar. La capacidad incluye humanos y bots. Configura además turno
  e iniciales de 30/60/90 s y extra de billetes de 15/30 s (defaults 60/60/+30).
  La configuración se guarda en sala y partida, solo cambia antes del inicio y
  se conserva en la revancha. El directorio anuncia el turno real de la sala.
- **Jugador:** puesto, nombre, color, mano privada, destinos y piezas. Empieza con
  45 vagones, 3 estaciones y 4 cartas. Veintiún colores seleccionables de jugador no equivalen a
  los ocho colores de cartas/rutas. El lobby reserva colores únicos; iniciada la
  partida quedan fijos. Ver [lobby-ui.js](../shared/lobby-ui.js) y [pruebas](../tests/lobby-server.test.js).
  La clave persistida de color es estable; cambiar su pintura visible no cambia
  el propietario, la reserva del lobby ni los colores de cartas/pagos.
  Blanco (`#ffffff`) incorpora la familia Midsommar Express; se reserva como cualquier
  otro color, también para bots. No añade reglas ni cartas nuevas.
  Rosa (`#edadd0`) solo se conserva al restaurar puestos anteriores; no se acepta
  para nuevos jugadores ni selecciones. Su presentación pasa a Pasajeros.
  Al añadir un bot, el servidor sortea uniformemente entre los colores libres,
  excluyendo también reservas de humanos desconectados. Guarda esa elección;
  retirarlo libera el color y reconectar/iniciar no vuelve a sortearlo.
- **Cuenta opcional:** UUID persistente distinto del puesto. Guarda apodo y color/vagón;
  vincular exige la credencial privada y recuperar exige la cuenta propietaria. Nunca
  concede otra mano ni prolonga la vida de una sala. Práctica invitada sigue disponible.
  Contrato y activación: [identidad](GOOGLE_AUTH.md).
- **Espectador:** observa una partida pública sin ocupar puesto ni recibir secretos.
  No ejecuta acciones ni mantiene la sala viva. El listado excluye salas privadas,
  práctica, abandonadas y partidas terminadas.
- **Red:** 47 ciudades y 101 rutas, con 300 casillas. Una ruta tiene extremos,
  longitud, color, posibles túnel/ferri y propietario. La geometría no cambia su
  coste ni conectividad.
- **Mazos:** 12 cartas por cada uno de ocho colores y 14 locomotoras (110 total);
  40 billetes cortos y 6 largos. Mesa de hasta cinco cartas.
- La vista rival expone cantidades, piezas y vías públicas, nunca mano, oferta
  privada ni orden de mazo. Los efectos no deben filtrar un robo oculto.
  Esto incluye miniaturas del historial y eventos del replay público: el robo
  de una carta visible muestra su cara; el del mazo muestra el reverso a los demás.

## Fases y turno

`initial` → `play` ↔ `tunnel` → `closing` si quedan ofertas → `finished`.

El primer jugador se sortea una vez. Cada jugador recibe un billete largo y tres
cortos y conserva al menos dos, simultáneamente, dentro del plazo compartido configurado de 30, 60 o 90 segundos.
Al terminar todos, juega el sorteado. El vencimiento conserva dos al azar por
jugador pendiente. Reconectar no reinicia los plazos.
Los billetes iniciales no elegidos salen de la partida, incluidos los cortos.
Los largos que no se repartieron tampoco entran en el mazo de nuevas ofertas.

Una acción por turno: robar cartas, construir ruta, pedir destinos o construir
estación. El turno dura los 30, 60 o 90 segundos configurados. Tras robar la primera carta hay que resolver
el robo; no se puede cambiar a construcción.

| Acción | Regla |
| --- | --- |
| Cartas | Hasta dos. Locomotora visible como primera termina el turno; como segunda está prohibida. Locomotora del mazo cuenta como una carta. |
| Ruta | Paga su longitud con un color y locomotoras; ruta gris admite cualquier color único. Necesita vagones disponibles. |
| Ferri | El pago incluye al menos las locomotoras señaladas. |
| Túnel | Revela hasta tres cartas; cada coincidencia de color o locomotora añade coste. Pago íntegramente con locomotoras solo coincide con locomotoras. |
| Decisión del túnel | Reserva pago base al calcular disponibilidad. Sin suplemento se construye automáticamente; con suplemento paga o desiste. Desistir conserva la mano y consume turno. |
| Ruta doble | Un jugador no toma ambos carriles; con 2–3 jugadores solo puede ocuparse uno. |
| Nuevos destinos | Ofrece hasta tres cortos, conserva al menos uno y devuelve rechazados al mazo corto. La elección recibe el tiempo restante del turno más 15 o 30 s configurados; el siguiente jugador continúa. Si vuelve su turno sin confirmar, espera antes de comenzar su tiempo completo. |
| Estación | Una por ciudad; costes sucesivos 1/2/3 cartas de un color, con locomotoras permitidas. Máximo tres por jugador. |
| Pasar | Solo cuando no existe ninguna otra acción legal. |

Las partidas iniciadas sin `timing` conservan los relojes anteriores de 60 s
y la oferta independiente de 60 s. Nunca se reemplazan plazos existentes.
`ticketOffer.duration` conserva la duración original para dibujar la barra
correctamente al recargar o durante una pausa.

El túnel tiene etapas persistidas `reveal`, `decision` y `result`, coordinadas
por el servidor. La revelación muestra una carta cada 700 ms y deja 700 ms tras
la última. Congela el tiempo restante del constructor; la decisión lo reanuda.
Solo el constructor puede pagar/desistir. El resultado se mantiene 3000 ms antes
de avanzar turno o calcular el cierre final. Durante todo el modal se congelan
ofertas de destinos y se rechazan sus confirmaciones; al cerrar recuperan el
tiempo restante. Bots y humanos cumplen la misma secuencia. Las cartas reveladas,
ruta, color usado y suplemento son públicos. Desde UI 8 también se publica la
composición de la base comprometida y, solo al construir, el extra efectivamente
pagado. El resto de la mano y las opciones de pago son privados. El resultado
conserva `resultStartedAt` y distingue desistimiento voluntario de tiempo agotado;
al desistir, la base se recupera y el gasto total es cero.
Si no se indica una composición de suplemento, se calcula con las cartas que
quedan después de reservar la base; nunca reutiliza una carta comprometida.
Una elección explícita insuficiente rechaza el pago completo sin gastar la base.
La reconexión conserva la etapa y los plazos. Un túnel guardado con el formato
anterior entra en decisión compartida sin reiniciar su reloj.

## Variantes y puntuación

- **Reciclado inmediato:** los descartes de cada evento resuelto se barajan de
  vuelta al mazo. Las cartas reveladas de un túnel pendiente esperan su resolución.
  Si hay tres locomotoras visibles, se renueva la mesa; el motor evita bucles
  cuando no existen suficientes cartas normales. [Pruebas](../tests/recycling.test.js).
- Al acabar un turno con dos vagones o menos, todos reciben un turno adicional,
  incluido quien disparó la última ronda. Las ofertas pendientes se resuelven
  antes de calcular el resultado.
- Rutas: longitudes 1/2/3/4/6/8 dan 1/2/4/7/15/21 puntos.
- Cada destino suma su valor si está conectado y lo resta en caso contrario.
  Cada estación puede prestar una vía rival adyacente: se elige una asignación
  conjunta que maximiza la puntuación de destinos y sirve para todos ellos.
- Cada estación sin construir suma 4. Express suma 10 a todos los empatados en
  el recorrido propio más largo, sin repetir vías; las prestadas no cuentan.
  Se permiten ciclos y volver a pasar por una ciudad. Se conserva la regla
  existente de conceder Express a todos si todos tienen recorrido de longitud 0.
- Desempates: puntuación, destinos completados, puntos de estaciones sin usar y
  Express. Puede haber varios ganadores si persiste el empate.

El desglose de resultados guardados conserva sus totales, clasificación,
ganadores y asignaciones. Si faltaba el detalle, se reconstruyen sus recorridos
y se explica cualquier diferencia de puntos de rutas con `routeAdjustment`;
no se sustituye el total histórico por uno recalculado.

## Ausencia y práctica

Las políticas viven en [multiplayer.js](../backend/multiplayer.js),
[game-clock.js](../backend/game-clock.js) y [practice.js](../backend/practice.js), con coordinación
de vencimientos y jugadas en [automatic-play.js](../game/application/automatic-play.js):

- Sala previa: desconexión reserva puesto humano 60 s; salida explícita lo libera.
  Los bots añadidos permanecen en su plaza hasta retirarlos o eliminar la sala.
  En salas normales usan la política estratégica de práctica y se guardan con ella.
- Partida: dos turnos consecutivos agotados activan reemplazo; salida voluntaria
  lo activa directamente. Recuperar control respeta el turno automático en curso.
- Todos desconectados: pausa durante 60 s; después se elimina la sala. La
  caducidad general de 24 h no promete una recuperación de 24 h tras abandono.
- Práctica: un humano y tres bots, sin invitados ni recuperación de sesión tras reinicio; conserva historial. Pausa al
  desconectar; elimina a los 30 s. Los bots de práctica pueden conservar 2–4
  billetes iniciales, tomar destinos nuevos y construir estaciones conforme a
  las mismas reglas del motor. Resuelven ofertas pendientes también fuera de
  turno y al cerrar. Los reemplazos usan otra política. Ninguno consulta secretos
  de rivales.

Regresiones: [motor](../tests/engine.test.js), [tickets](../tests/tickets.test.js),
[privacidad y multijugador](../tests/multiplayer.test.js),
[cierre](../tests/initial-results.test.js), [simulación](../tests/simulation.test.js).

## Historial y repetición

Las partidas completas conservan el desglose final; las abandonadas conservan
progreso parcial y no cuentan como resultados completados. Desconexión breve no
es abandono. Acceso de invitados/cuentas, privacidad y retención se definen en
[el contrato de historial](history-replay.md). Esa autoridad se aplica a todos los
modos; un mapa futuro no puede omitir validación, filtrado ni grabación.

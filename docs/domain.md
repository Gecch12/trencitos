# Dominio y reglas existentes

Describe el comportamiento de Trencitos contrastado con [engine.js](../engine.js),
[data.js](../data.js) y pruebas. No equivale a una transcripción del reglamento
comercial: conserva las variantes del proyecto.

## Conceptos e invariantes

- **Sala:** código público, anfitrión y 2–5 puestos para iniciar. La credencial
  privada recupera un puesto; el código público no autentica a su propietario.
- **Jugador:** puesto, nombre, color, mano privada, destinos y piezas. Empieza con
  45 vagones, 3 estaciones y 4 cartas. Once colores de jugador no equivalen a
  los ocho colores de cartas/rutas. El lobby reserva colores únicos; iniciada la
  partida quedan fijos. Ver [lobby-ui.js](../lobby-ui.js) y [pruebas](../tests/lobby-server.test.js).
  La clave persistida de color es estable; cambiar su pintura visible no cambia
  el propietario, la reserva del lobby ni los colores de cartas/pagos.
- **Red:** 47 ciudades y 101 rutas, con 300 casillas. Una ruta tiene extremos,
  longitud, color, posibles túnel/ferri y propietario. La geometría no cambia su
  coste ni conectividad.
- **Mazos:** 12 cartas por cada uno de ocho colores y 14 locomotoras (110 total);
  40 billetes cortos y 6 largos. Mesa de hasta cinco cartas.
- La vista rival expone cantidades, piezas y vías públicas, nunca mano, oferta
  privada ni orden de mazo. Los efectos no deben filtrar un robo oculto.

## Fases y turno

`initial` → `play` ↔ `tunnel` → `closing` si quedan ofertas → `finished`.

El primer jugador se sortea una vez. Cada jugador recibe un billete largo y tres
cortos y conserva al menos dos, simultáneamente, dentro de un minuto compartido.
Al terminar todos, juega el sorteado. El vencimiento conserva dos al azar por
jugador pendiente. Reconectar no reinicia los plazos.

Una acción por turno: robar cartas, construir ruta, pedir destinos o construir
estación. El turno dura 60 segundos. Tras robar la primera carta hay que resolver
el robo; no se puede cambiar a construcción.

| Acción | Regla |
| --- | --- |
| Cartas | Hasta dos. Locomotora visible como primera termina el turno; como segunda está prohibida. Locomotora del mazo cuenta como una carta. |
| Ruta | Paga su longitud con un color y locomotoras; ruta gris admite cualquier color único. Necesita vagones disponibles. |
| Ferri | El pago incluye al menos las locomotoras señaladas. |
| Túnel | Revela hasta tres cartas; cada coincidencia de color o locomotora añade coste. Pago íntegramente con locomotoras solo coincide con locomotoras. |
| Decisión del túnel | Reserva pago base al calcular disponibilidad. Sin suplemento se construye automáticamente; con suplemento paga o desiste. Desistir conserva la mano y consume turno. |
| Ruta doble | Un jugador no toma ambos carriles; con 2–3 jugadores solo puede ocuparse uno. |
| Nuevos destinos | Ofrece hasta tres cortos, conserva al menos uno y devuelve rechazados al mazo corto. La elección tiene plazo propio y el juego continúa. Si vuelve su turno sin confirmar, espera antes de comenzar su minuto. |
| Estación | Una por ciudad; costes sucesivos 1/2/3 cartas de un color, con locomotoras permitidas. Máximo tres por jugador. |
| Pasar | Solo cuando no existe ninguna otra acción legal. |

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
- Desempates: puntuación, destinos completados, puntos de estaciones sin usar y
  Express. Puede haber varios ganadores si persiste el empate.

## Ausencia y práctica

Las políticas viven en [multiplayer.js](../multiplayer.js),
[game-clock.js](../game-clock.js) y [practice.js](../practice.js):

- Sala previa: desconexión reserva puesto 60 s; salida explícita lo libera.
- Partida: dos turnos consecutivos agotados activan reemplazo; salida voluntaria
  lo activa directamente. Recuperar control respeta el turno automático en curso.
- Todos desconectados: pausa durante 60 s; después se elimina la sala. La
  caducidad general de 24 h no promete una recuperación de 24 h tras abandono.
- Práctica: un humano y tres bots, sin invitados ni persistencia. Pausa al
  desconectar; elimina a los 30 s. Los bots de práctica pueden conservar 2–4
  billetes iniciales, tomar destinos nuevos y construir estaciones conforme a
  las mismas reglas del motor. Resuelven ofertas pendientes también fuera de
  turno y al cerrar. Los reemplazos usan otra política. Ninguno consulta secretos
  de rivales.

Regresiones: [motor](../tests/engine.test.js), [tickets](../tests/tickets.test.js),
[privacidad y multijugador](../tests/multiplayer.test.js),
[cierre](../tests/initial-results.test.js), [simulación](../tests/simulation.test.js).

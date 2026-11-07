# Chat de la mesa

Contrato del checkout. Alcance y evidencia en [la ficha](work/room-chat.md).

## Participación y conservación

Cada sala tiene una conversación continua en espera, partida y resultados.
Invitados y cuentas pueden escribir. Los espectadores de salas públicas leen
durante la partida y pueden escribir/reaccionar al finalizar; no mantienen viva
la sala. No hay chat global ni mensajes privados.

La conversación se recupera al reconectar o reiniciar el servidor. Se elimina
cuando se elimina realmente la sala, no al terminar el juego ni cuando una
persona sale. La revancha crea otra sala y otra conversación. El cierre
definitivo se distingue de la salida individual en el mensaje del servidor.
Los plazos existentes siguen siendo 60 segundos sin conexión en espera,
120 segundos para partidas multijugador/resultados, y 24 horas para un humano
con bots; abandonar explícitamente una partida solo con bots la cierra.
También se mantiene la limpieza periódica por 24 horas de inactividad.

Los mensajes no entran en el motor, diario, archivo histórico ni replay.
`room.chat` es un componente separado del estado `room.game`, guardado en el
checkpoint privado de la sala; no requiere una nueva tabla/RPC de Supabase.
El manifiesto local de respaldo elimina el chat de las salas retiradas para que
no reaparezca al recuperar la copia. Las copias externas del proveedor conservan
su propia política de retención, fuera de este contrato de acceso de la app.

## Texto, menciones y reacciones

- Hasta 500 caracteres por mensaje y 32 fragmentos estructurados; texto, saltos
  de línea y emoji. El compositor crece de dos a cinco renglones; el scroll interno
  aparece después. Enter envía en escritorio, Shift+Enter inserta un salto; en
  pantallas táctiles Enter inserta un salto y el botón de enviar confirma.
- Escribir `@` abre un selector ascendente de jugadores y tramos del mapa actual,
  con avatares y miniaturas de vías; no hay botón `@`. Flechas, Enter y Escape
  permiten recorrer, elegir y cerrar sin ratón. El servidor
  reconstruye las referencias con identidades públicas y los IDs exactos del
  mapa. No admite billetes de destino ni etiquetas/ciudades inventadas.
- El texto de las vías muestra solo sus dos ciudades. Las miniaturas distinguen
  las vías dobles por color y posición; referencias con etiquetas iguales
  conservan sus IDs diferentes aunque se inserte texto antes o entre ellas.
  Al tocar una referencia,
  solo ese usuario enfoca la vía, con sombra alrededor y sin añadir vagones.
  El foco dura 3,5 segundos, permite volver antes al encuadre anterior y cede
  prioridad a construcciones/túneles y al recuento de resultados.
- Reacciones permitidas: 👍 ❤️ 😂 😮 😢 👏. Una por persona y mensaje;
  se puede cambiar o retirar. Los permisos de espectadores también se aplican.
- Las seis reacciones se dibujan con ilustraciones SVG originales de Trencitos
  en [chat-art.js](../frontend/chat-art.js), conservando sus códigos semánticos.
  La carita con `+` abre el selector al pasar/enfocar el mensaje; en táctil también
  funciona la pulsación prolongada. Solo las reacciones usadas y sus contadores
  permanecen bajo el texto. No hay un catálogo abierto ni otro `+` sin función.
  La animación breve respeta la preferencia de movimiento reducido.
- Silenciar oculta los mensajes, reacciones y avisos de menciones de esa persona
  únicamente para quien silencia. Es reversible, por sala, y sobrevive a la
  reconexión. No expulsa jugadores ni modifica las relaciones de amigos.
- El icono de altavoz de la cabecera abre el menú de silencios por jugador, con
  estado visible y nombres accesibles. Pulsar el nombre de un autor no silencia.
  Los menús flotantes quedan fuera del recorte de los paneles; Escape o pulsar
  fuera los cierra, sin modificar ni perder el borrador.
- El indicador de nuevos mensajes se conserva al leer mensajes anteriores.
  El historial del chat se consulta en páginas de 100; máximo 1.000 entradas por
  sala. Alcanzar el límite detiene nuevos envíos con una explicación, sin borrar
  silenciosamente los mensajes anteriores.

## Moderación y autoridad

`chat-moderation.js` utiliza `@2toad/profanity` 3.3.0 en el servidor con español
e inglés, palabras completas, límites Unicode, vocabulario adicional y
normalización de variantes. Evita coincidencias dentro de palabras normales y
excluye términos neutrales de identidad. El texto de usuario se presenta mediante
nodos de texto; nunca se interpreta como HTML.

Un rechazo por lenguaje conserva el borrador del autor y publica un aviso anónimo
en esa mesa: «Un mensaje no superó el filtro de lenguaje. Mantengamos el respeto
para que todos disfruten la partida». No se distribuye ni guarda el texto rechazado.
Los reintentos del mismo envío no duplican el aviso. El filtro es léxico: puede
equivocarse y no comprende todo el acoso contextual. No activa sanciones globales.

El límite de ocho envíos/reacciones por diez segundos se aplica antes de moderar,
por identidad de sala; reconectar no lo reinicia. Un exceso no genera avisos
públicos. Los [reportes y revisión humana](work/social-competitive-followups.md)
quedan pendientes.

## Entrega y pruebas

`room-chat.js` autoriza cada operación contra la conexión vigente. Cada envío
incluye la identidad de la conversación y un identificador idempotente. El servidor
confirma/publica después del guardado; rollback y recuperación incluyen chat y
silencios. Las mutaciones de chat usan la cola de su sala y no vuelven a emitir
el tablero ni alteran la revisión del juego. La reconexión recupera una página;
las nuevas entradas/reacciones se entregan como eventos del chat.

Se conserva el recibo de cada envío durante toda la vida de la conversación y
una ventana de 1.000 recibos recientes de reacciones. No requiere RabbitMQ:
utiliza el WebSocket y la cola transaccional por sala existentes.

Fuentes: [servicio](../backend/room-chat.js), [filtro](../backend/chat-moderation.js),
[interfaz](../frontend/room-chat.js), [transporte](../backend/server.js),
[guardado](../backend/room-store.js). Pruebas de [contrato](../tests/room-chat.test.js),
[WebSocket](../tests/chat-server.test.js), [fallos remotos](../tests/chat-remote.test.js)
y [navegador](../tests/browser-chat.cjs).

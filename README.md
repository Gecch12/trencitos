# Trencitos — beta privada v0.6.1

Para trabajar en el código, empieza por el [centro de operaciones](docs/README.md):
arquitectura, dominio, decisiones y pendientes con hitos. Esta página conserva
la guía detallada del juego; la evidencia de cada iteración está en el
[índice de QA](docs/qa-index.md).

Juego ferroviario multijugador web **no oficial**, para 2 a 5 jugadores. Incluye rutas, billetes y mecánicas de la versión base europea; el arte es propio y simplificado. No está afiliado a Days of Wonder ni Asmodee. No se distribuyen ilustraciones oficiales.

## Uso local para pruebas

Requiere **Node.js 20 o superior**. Three.js se instala con npm y se sirve localmente.

```bash
npm ci
npm test
npm start
```

Abre `http://localhost:3000` en tu navegador. Para probar con otro jugador abre una ventana privada y únete mediante el código mostrado; para otros dispositivos, utiliza un servidor accesible desde la red.

## Inicio, perfil y salas

La navegación principal tiene **Partidas**, **Jugar**, **Más** y **Perfil**. En
escritorio está a la izquierda; en tablet y móvil, abajo. El nombre se consulta
en el perfil; la cabecera no muestra usuario ni campana. **Perfil → Editar perfil**
permite cambiar el nombre y conserva el avatar básico. La cuenta guarda el perfil;
un invitado conserva su preferencia en este navegador. Cuenta, Historial y Resumen
tienen contenido; Amigos y Jugar siguen preparados para próximas integraciones.
**Más → Idioma** cambia entre español (predeterminado, ESP) e inglés (ENG),
también en móvil. Durante la partida está en **Menú de partida → Idioma**;
recarga conservando el puesto, los plazos y los billetes pendientes seleccionados.
Los seis iconos sociales siguen sin enlaces; Privacidad abre el aviso existente.

**Perfil → Historial** conserva partidas completas y abandonadas por separado,
en filas compactas con fecha, puesto propio, jugadores, duración, estado y acceso
a la repetición. Tocar una fila abre su desglose; solo uno permanece abierto.
En móvil cada partida ocupa dos líneas. Las partidas en curso o abandonadas no
tienen puesto final; la duración parcial lleva `~`. El icono de información
explica el acceso al historial. La repetición muestra el primer estado mientras
carga el resto y avanza por pasos a 0,5×, 1×, 2×, 4× y 8×. Reutiliza el tablero,
mercado, mano y animaciones de la partida; tocar un avatar cambia de jugador.
El historial permite saltar a una acción y muestra cada destino una sola vez,
con ✓/✕ para su elección. Vincular Google conserva el historial previo de invitado
en esa cuenta. Al cerrar la partida, cualquiera que tenga acceso a su replay puede
consultar todos los POV, manos, destinos y robos registrados. Las salas privadas
siguen limitadas a sus participantes. [Detalles de conservación y acceso](docs/history-replay.md).

Editar perfil solicita al navegador desactivar el autocompletado del apodo;
conserva el nombre actual como valor editable. Los avatares personalizables
siguen [pendientes](docs/work/commerce.md).

**Partidas → Partidas abiertas** muestra las salas públicas en espera. **Crear partida** crea
una sala con código numérico automático; **Unirse a una partida** permite entrar por código.
Las nuevas salas son públicas por defecto. El anfitrión puede hacerlas privadas,
elegir entre 2 y 5 plazas, añadir o retirar bots e iniciar la partida. Las salas
anteriores sin visibilidad explícita siguen siendo privadas. Las invitaciones
antiguas y los enlaces privados de recuperación siguen funcionando.

Cada bot añadido recibe al azar uno de los colores libres, todos con la misma
probabilidad. Se respetan también los colores reservados por jugadores
desconectados. El color queda guardado al añadirlo y se conserva al reconectar o
iniciar la partida; retirar el bot vuelve a dejar ese color disponible.

**Observar** lista partidas públicas en curso. Observar no ocupa un puesto,
no permite jugar y no entrega manos, destinos, ofertas ni credenciales privadas.
Los espectadores tampoco prolongan la vida de una sala abandonada. Las salas
privadas solo admiten jugadores con invitación; no se pueden observar.

La sala de espera distribuye jugadores/amigos, configuración y chat en tres
columnas; en pantallas pequeñas se usan pestañas. Amigos y chat son componentes
preparados para una integración posterior. Modo Clásico, selector y miniatura de mapa,
visibilidad pública/privada y número destacado de jugadores aparecen en una fila.
El anfitrión puede elegir **Europa**, **Sudamérica · beta** o **Laboratorio** antes de iniciar;
Laboratorio es un tablero ficticio de prueba con las mismas reglas. La selección
se guarda y se conserva en la revancha.
La sección **Tiempos** agrupa turno (30/60/90 s), extra para nuevos billetes
(+15/+30 s) e iniciales (30/60/90 s). El anfitrión ajusta plazas y tiempos con
flechas. La invitación es compacta y la paleta acompaña una miniatura de un vagón
en vista 3/4. **Ver los 6 vagones** abre un modal compacto con las seis variantes
de Pasajeros enganchadas en una fila de perfil. La franja se desplaza solo en
horizontal; el título y el cierre permanecen visibles. Las otras familias abren
**Ver detalle** con su único diseño.
La configuración conserva desplazamiento cuando
lo necesita y un pie reservado para **Iniciar partida**. Los valores predeterminados son
5 plazas y 60/+30/60 s;
no se pueden reducir plazas ocupadas. El primer jugador sigue siendo al azar.
Los ajustes se guardan y quedan bloqueados al comenzar; la revancha los conserva.

En la sala de espera cada participante elige uno de veinte colores libres: rojo, azul, verde, ámbar, morado, marrón, amarillo, negro, gris, magenta, turquesa, azul noche, borgoña, verde oliva, marfil, coral, lavanda, azul hielo, jade e índigo. Jade lleva un vagón vivienda e índigo uno de circo. Rosa se conserva únicamente en partidas anteriores y se representa con Pasajeros; ya no se ofrece en el selector. Amarillo lleva deportivos y ámbar lleva grano; ambos usan pintura normal, sin presentación dorada. El servidor reserva el color incluso durante la ventana de reconexión, rechaza elecciones simultáneas duplicadas y lo guarda tanto en disco como en Supabase. Cambiar de puesto por la salida de otro participante no cambia tu color. Tras empezar, la elección queda bloqueada y se usa en trenes, estaciones, avatar e historial. El navegador recuerda nombre y color preferido (si está libre); al recargar una sala conocida recupera el puesto con su credencial local.

Los vagones de Pasajeros combinan seis composiciones: clásico sin personas, una persona asomada, dos personas, tres personas, alguien apoyado de medio cuerpo y alguien saludando. Los torsos se inclinan desde dentro de la ventana, con hombros redondeados y codos doblados al apoyarse o saludar. Las cabezas son esferas sin rasgos faciales; piel, color y forma del pelo y prendas se combinan por separado. Cada ruta baraja las seis variantes y las usa sin repetir hasta agotarlas; luego empieza otra tanda, evitando repetir justo entre tandas. Una ruta de ocho utiliza las seis y dos de una tanda nueva. La selección permanece estable al resaltar, reconectar y ver el replay, sin añadir datos decorativos al historial. Circo y Vivienda sustituyen a Hongos, Cristales y Confitería.

Cada composición de Pasajeros tiene además su propia decoración: cortinas crema,
verdes, vino, mostaza, turquesa o azules; ventanas cerradas, entreabiertas o con
interior cálido; franjas simples o dobles y dos o tres respiraderos en el techo.
Todas comparten puertas en los extremos, manijas y pasamanos de latón, escalones
y uniones del techo. El color del propietario sigue identificando la carrocería.

Durante una partida no hay cabecera superior. Una columna de iconos arriba a la
izquierda ofrece menú, pantalla completa y resaltado de destinos. El menú contiene
invitación, sonido, idioma, recuperación privada y abandono; cierra al tocar fuera,
pulsar Escape o ejecutar una opción. La conexión solo aparece cuando requiere atención; los avisos de desconexión y
fallos de guardado no se ocultan. Las listas y paneles tienen desplazamiento
propio para conservar navegación y controles en pantallas bajas.

**H** alterna el resaltado de destinos y muestra un aviso, igual que **M** para
el sonido. No actúa al escribir ni dentro de los diálogos. El menú agrupa
**Copiar enlace de recuperación** y **Cambiar enlace de recuperación** bajo
**Recuperar mi puesto**, para invitados o puestos aún sin vincular. Cambiarlo invalida el anterior; luego debes copiar el
nuevo. No reinicia la partida ni prolonga la vida de la sala.

En H se ven todos tus tramos construidos con resaltado azul claro. Los caminos
que conectan destinos cumplidos tienen un halo dorado suave; los préstamos de
estación se distinguen con trazo discontinuo. El efecto es personal y respeta la
preferencia de reducir movimiento.

El círculo muestra puntos públicos de construcción. Al tocar tu jugador,
«Tu puntuación» desglosa construcción, destinos privados, camino largo provisional, destinos pendientes y
estaciones sin usar, con una estimación «Si terminara ahora». El `+10` del camino
largo es público, se comparte en empate y cambia al construir. El historial nuevo
agrupa cada turno en una fila, incluidos ambos robos o el túnel completo; permite
consultar toda la partida después de reconectar. Conexiones y cambios de control
aparecen como eventos separados.

## Sala de pruebas con bots

El nuevo inicio conserva **Jugar** vacío. La implementación de práctica y sus controles de prueba siguen disponibles en código para una futura integración; no tienen acceso visible en esta etapa. Para jugar con bots desde la interfaz actual, crea una sala y pulsa **Añadir bot**. La práctica original enfrenta a un humano con tres bots. El primer jugador se sortea entre los cuatro; todos eligen los billetes iniciales a la vez. Los tres bots confirman entre dos y cuatro billetes compatibles tras 800–1000 ms sin esperar al humano; conservan los adicionales cuando comparten un recorrido viable. Comparan recorridos alternativos y redes que conecten varios destinos, calculando las cartas y los vagones necesarios para el conjunto. Ahorran para tramos útiles, prefieren las cartas de la mesa que necesitan y varían entre opciones de valor parecido.

Cada bot conserva planes viables y los replantea ante bloqueos, amenazas o falta de progreso. Prioriza conexiones difíciles de sustituir cuando un rival se acerca, reserva colores para los siguientes tramos y estima el riesgo de los túneles. Puede desistir de un suplemento que perjudique un destino más valioso. Estima los turnos restantes a partir de las construcciones, vagones y cantidades de cartas públicos; al cerrar compara puntos de vías, destinos y la posibilidad de conseguir el Express. Solo consulta su propia mano y destinos, las vías y demás información pública; no conoce el orden de los mazos ni las cartas o destinos privados de rivales. Puede colocar estaciones si compensan su coste y pedir nuevos destinos cuando su red ofrece buenas oportunidades. Resuelve las ofertas también fuera de turno y durante el cierre, conservando al menos un billete. Antes de algunas decisiones compara continuaciones de hasta tres turnos propios y posibles respuestas rivales, con manos y robos hipotéticos. Cada acción de un turno automático se separa entre 800 y 1000 ms, incluida la segunda carta y la decisión de pagar o desistir de un túnel. Los bots que sustituyen a jugadores ausentes mantienen su política independiente de robo/construcción aleatoria; esta estrategia se usa en práctica y en los bots añadidos a salas normales; estos últimos actúan cada 900 ms y se guardan con la sala.

El panel **Controles de prueba** aparece abajo a la izquierda, separado de la interfaz del juego y sobre sus diálogos. Arrástralo desde su encabezado con el ratón, o enfoca el encabezado y usa las flechas del teclado. **Terminar partida de pruebas** detiene los bots inmediatamente y muestra la puntuación actual como cierre anticipado. **Volver al inicio** elimina la sala y permite crear otra prueba.

Estas salas son privadas y temporales: no admiten invitados, la sesión no se recupera al reiniciar el servidor, pero su historial sí se conserva. Al desconectarte los bots se pausan; puedes volver con el mismo navegador en menos de 30 segundos para continuar. Si no vuelves, la sala se elimina. Leer sin hacer clic o dejar la pestaña en segundo plano no cuenta como desconexión.

`npm test` comprueba las decisiones de los bots, partidas completas simuladas, tiempos y limpieza de salas con un reloj simulado, y la integración real por WebSocket.

## Mapa y selección de destinos (escritorio)

El tablero inicia en **3D**: mapa plano con vagones y estaciones con volumen.
Cada color de jugador tiene su familia de vagones inspirada en las cartas; el
amarillo es una plataforma que transporta dos deportivos. Las cargas son decorativas y no dependen
de las cartas pagadas. La mano, cartas y paneles siguen en 2D; los mapas de billetes comparten el tablero 3D.
El tablero principal solo usa 3D: si WebGL falla, ofrece **Reintentar** conservando
la sala. Acercar permite ver los detalles; las etiquetas permanecen horizontales.
Antes de comenzar, el selector de color en práctica y sala de espera muestra los
diseños disponibles de esa familia: las seis composiciones de Pasajeros, o un solo
diseño en las demás. Son ejemplos con los mismos modelos del tablero; las
variaciones se combinan automáticamente al construir rutas, sin elegir una fija.

El mapa se mueve arrastrando y se acerca con rueda o pellizco. **Ver mapa completo**
restaura el encuadre; con el mapa enfocado, las flechas desplazan, `+`/`−`
cambian el zoom e **Inicio** centra. El zoom permite de 25 % a 600 %.

La mesa comparte controles en móvil, tablet y escritorio, sin scroll de página.
Los jugadores muestran avatar y nombre arriba, y tres columnas de puntos públicos,
cartas en mano y vagones disponibles debajo. El reloj forma un pie continuo en
la tarjeta activa. **Detalles de jugadores** amplía solo las estaciones; el detalle
individual identifica también destinos conservados y longitud del camino más largo.
El bono provisional **+10** permanece separado; tocarlo resalta su recorrido exacto.
Tocar tu jugador permite consultar el desglose privado. Al finalizar se muestran
los puntos finales.

El mercado reúne cinco cartas con separación constante y el mazo al extremo
derecho, con dorsos apilados horizontalmente. La mano queda separada por un pequeño
espacio y agrupa colores con contadores. Las áreas de robo siguen midiendo al menos
44 px; tras el primero aparece **Roba una carta más**. Los iconos del mapa permiten
consultar destinos o **robar nuevos destinos**: este último pide confirmación y solo
está disponible cuando la acción es legal. Abrir/cancelar no revela billetes ni
gasta el turno; confirmar envía el comando y obliga a conservar el mínimo indicado.
El chat muestra «Próximamente», con escritura/envío deshabilitados.

Los paneles temporales se superponen sin reencuadrar el mapa. El icono **i** abre
una ficha de puntos y última ronda según la definición de la partida. Las existencias
de los mazos se consultan en el mercado y en los controles respectivos. El engranaje
agrupa ajustes, incluida pantalla completa. **Última ronda** conserva el aviso ámbar.

El historial conserva scroll, barra y aviso **Nuevos ↓**. Una ocupación se presenta
como **Ocupó** y su botón **Ver** enfoca el tramo, oscurece el entorno y eleva los
vagones para asentarlos de nuevo en secuencia. Es una consulta visual: no modifica
recursos ni puntuación y cede ante una construcción real. Al terminar recupera
el encuadre anterior; **Volver a mi encuadre** permite salir antes. Con movimiento
reducido solo se resalta. Privacidad del registro en [historial](docs/history-replay.md).

El modal de destinos mantiene el mapa visible y desplaza solo la lista. En móvil y tablet vertical el mapa va encima; en horizontal y escritorio, al lado. La reserva
de vagones ocupa una línea y cada destino agrupa ciudades/puntos y coste/estado en
dos líneas. El ojo indica qué destinos propios se resaltan; el check al robar indica
cuáles se conservarán. Los gestos no reconstruyen las etiquetas ni cambian billetes.

Las cartas conservan sus dibujos y huecos al agotarse. El amarillo es luminoso y
mate; el comodín muestra un tren lateral grabado sobre seis franjas arcoíris,
sin acabado dorado. El reverso del mazo conserva su emblema, sin textos.

Al aparecer tres comodines, un brillo señala la renovación: las cinco cartas se reúnen en abanico, vuelven al mazo y salen las nuevas escalonadas. El efecto dura 1.200 ms después del robo que lo provoca y bloquea los robos locales mientras se muestra; con movimiento reducido se usa un fundido de 120 ms. Una jugada más reciente actualiza el estado sin cortar la renovación visible. El historial registra la renovación y las cinco cartas retiradas. Los robos normales responden sin esperar su animación.

Cada renovación nueva suena como una recogida, barajado y reparto de papel en
940 ms. El sonido respeta silencio y pestaña oculta; reconectar no vuelve a reproducirlo.

Las ocho cartas de color tienen vagones SVG diferentes: rojo/pasajeros, azul/cisterna de combustible, verde/alfalfa, amarillo/tolva de grano, negro/carbón, blanco/piedra, naranja/troncos y morado/mercancías cerrado. Comparten ruedas de radios y marco ornamental, sin nombres de color impresos. Conservan esos nombres en su descripción accesible y tooltip. El fondo mate coincide con la tonalidad de las rutas del mapa; rojo y naranja ya no tienen degradado oscuro y el negro es profundo. Fuera de turno, las cartas y ambos mazos mantienen el 80 % de opacidad, sin desaturación; los controles habilitados siguen al 100 %. Las cargas son decorativas: no modifican ninguna regla.

El clic inicia una recogida de 150 ms. El recorrido propio apunta a 520 ms; una carta oculta avanza mientras llega la respuesta y entra en la mano después de revelar su color real. Una respuesta lenta prolonga la espera fuera de la mano. Los robos observados duran 680 ms, con una pausa para reconocer la carta y separación de 320 ms entre inicios; las cartas ocultas de otros jugadores mantienen el reverso. Una reconexión no repite robos anteriores. Redimensionar, ocultar o desconectar cancela los vuelos sin cancelar jugadas enviadas. Se respeta el movimiento reducido.

Los grupos existentes de la mano se conservan y abren espacio en 230 ms al aparecer un color nuevo. Con dos comodines visibles, tomar una carta de la mesa requiere esperar su reemplazo antes de elegir la segunda; los dos robos del mazo siguen disponibles sin esa espera.

Los efectos de sonido son originales y sintetizados localmente: papel al robar cada carta o pedir una oferta de destinos, barajado al renovar la mesa, golpe de madera al completar una ruta o colocar una estación, y campana solo al comenzar tu turno. Los movimientos públicos de rivales también se oyen, sin revelar cartas ocultas. El altavoz del menú o la tecla **M** permiten silenciar y recuerdan la preferencia;
un toast confirma el cambio y el atajo no actúa al escribir ni se repite al mantener
la tecla pulsada. Marcar un billete inicial o nuevo produce un solo roce continuo
de pluma de 130–150 ms, desmarcarlo uno de 105 ms y confirmar conserva la firma
de varios trazos de 350 ms al recibir la
aceptación del servidor. No suena al comparar destinos, recuperar borradores ni
recibir cambios de otros jugadores; los trazos rápidos no se superponen; el navegador requiere una primera interacción para activar audio. No se reproducen efectos históricos al reconectar ni mientras la pestaña está oculta.

Al quedar menos de cinco segundos de tu turno o de tu elección de billetes
iniciales/nuevos, suena un tic-tac de reloj de pared una vez por segundo.
También avisa con la oferta minimizada; se detiene al resolverla o vencer el
plazo y respeta silencio, pausas y desconexiones. No avisa de relojes ajenos ni
en repeticiones. Varias vistas del mismo reloj no duplican el sonido.

Cada jugador se identifica por su nombre, color y familia de vagones, sin símbolos geométricos por puesto. El avatar conserva el color como fondo. El robot usa relleno marfil y contorno oscuro como la persona, con antena dorada. Pasar el cursor o enfocar al jugador resalta sus rutas. La nueva paleta amarillo/ámbar también se aplica a partidas existentes, sin modificar sus claves de color guardadas. Las rutas neutras son gris medio; las blancas y sus cartas son marfil claro. Esta distinción visual no cambia el reglamento.

Historial, resultados y clasificación del camino más largo comparten
las proporciones del avatar: el robot ocupa el 80 % del interior del círculo,
con un pequeño margen uniforme alrededor.

Pulsa una ruta libre y después **Construir** para abrir el pago. El botón solo aparece durante tu turno jugable, antes de robar una carta y sin elecciones obligatorias pendientes; fuera de turno o al terminar, el menú es informativo. Si ya está ocupada, muestra únicamente al propietario; las propias indican «Esta ruta es tuya». Cada carril de una ruta doble se evalúa por separado. Se comprueban todos los colores legales y los comodines disponibles; si no alcanzan, aparece un aviso. Un túnel requiere poder pagar su coste inicial, no el suplemento todavía desconocido. Al revelarlo, el modal señala qué cartas aumentan el coste, muestra el pago base reservado y ofrece las combinaciones legales del suplemento (color, comodines o ambos), con el total antes de confirmar. No cuenta dos veces las cartas reservadas. Pulsa una ciudad libre para **Construir estación**; una ocupada identifica al dueño. Las estaciones tienen tejado y fachada del color del jugador, borde marfil, contorno oscuro y tamaño mínimo legible al alejar el mapa. Cancelar o Escape antes de confirmar no consume el turno; una vez revelado un túnel, hay que pagar o desistir. Desistir conserva la mano, pero termina el turno.

El pago se muestra como una suma visual de cartas ×cantidad + comodines ×cantidad = total.
**Cambiar cartas** ofrece miniaturas con existencias en la esquina; nombres y
disponibilidad permanecen accesibles por teclado/lector y tooltip. Si faltan
cartas para el túnel, el aviso indica cuántas faltan tras reservar el pago inicial.
Solo el constructor humano ve el modal de revelación, decisión y resultado.
Al construir, muestra **Base pagada + Extra pagado = Total pagado** y anima el
pago seguido por los vagones. Si se desiste, muestra **Base recuperada**,
**Extra no cobrado** y **Total gastado: 0**, con devolución visual a la mano.
El tiempo agotado tiene su propio mensaje.

Los demás jugadores y espectadores siguen el intento desde el tablero, sin modal
ni botón para abrirlo, también al reconectar o cuando construye un bot. Las tres
cartas están apoyadas junto al túnel desde el inicio: se revelan con los mismos
tiempos, señalan coincidencias y permanecen hasta el desenlace. Si el mazo aporta
menos cartas, solo se muestran las que existen. El aviso del tablero muestra el
suplemento y el resultado; el historial conserva el desglose público. Los diálogos
opcionales que un observador esté consultando no se sustituyen por el túnel.
El constructor conserva su decisión obligatoria. El resultado dura tres segundos,
se cierra automáticamente y conserva sus plazos al reconectar; movimiento reducido
muestra el mismo resumen sin desplazamientos.

**Tus destinos** abre los billetes conservados en un panel con scroll interno. Los pendientes son beige; los conectados, dorados con **✓ verde**, también en el modal. El servidor calcula el progreso de forma privada y emplea una asignación compatible de estaciones para todos los billetes; los destinos cumplidos se reflejan en tu desglose privado y se liquidan en el resultado final. **Ver rutas** abre tus billetes conservados, incluso durante turnos ajenos. Pulsar un billete concreto lo abre resaltado. Las casillas del modal solo resaltan conexiones: no descartan billetes ni consumen acciones. Un destino completado resalta un recorrido real de vías construidas; los tramos prestados mediante estación son discontinuos. Se cierra con X o Escape. **Historial** se abre con su icono sin desplazar el tablero ni la mano; su rueda recorre únicamente los movimientos.

Si aparece **Servidor anterior**, el proceso Node todavía ejecuta código anterior al protocolo actual (`uiVersion: 10`: historial completo por turno y puntuación propia, además de desglose público y animaciones de pago/devolución del túnel, renovación animada de la mesa, elección inicial simultánea y desglose final). Los billetes sin datos muestran **?**, no un falso estado pendiente. Termina primero las partidas de pruebas (son temporales), reinicia el backend con `npm start` y recarga la página. Recargar únicamente el navegador no actualiza el motor. La suite cubre específicamente Madrid → Pamplona → Paris → Bruxelles → Dieppe, incluso si Dieppe–Paris pertenece a un rival.

La cartografía está compuesta a mano en `map-layout.js`, separada del reglamento. Las 300 casillas tienen las mismas dimensiones; cada una gira siguiendo la curva de su vía. Las rutas dobles mantienen carriles separados, los túneles tienen bordes dentados, y las casillas obligatorias de ferri contienen un comodín. Casillas libres y marcas están en la escena 3D, debajo de las estaciones. Una ruta ocupada muestra vagones 3D y una franja del color de su propietario sobre el terreno; los mapas de resultados conservan piezas SVG. La descripción accesible identifica al dueño. Los nombres mantienen 15 píxeles de pantalla al cambiar el zoom y se colocan evitando otras etiquetas; cuando deben alejarse de su ciudad, una línea fina conserva la asociación. Al alejar mucho o en un área de mapa reducida se ocultan etiquetas cercanas entre sí; las ciudades seleccionadas, enfocadas o bajo el cursor tienen prioridad. El foco de teclado resalta las casillas de la ruta, no un rectángulo que la englobe.

Los billetes se comparan sobre el mismo tablero 3D de la partida, con vías,
colores, túneles, ferris, piezas y estaciones actuales. Solo llevan nombre las
ciudades de destino. Los recorridos propuestos usan vagones translúcidos de tu
familia y color; los tramos compartidos se dibujan una vez. Los billetes iniciales
muestran el camino de menos vagones, sin indicar cantidades de vagones en las
tarjetas ni mostrar el recuadro de reserva disponible. Durante la partida,
las ofertas nuevas y la consulta de destinos conservados sí muestran la reserva
y los vagones adicionales de cada recorrido. Los nuevos minimizan esos vagones,
aprovechan tus vías y las estaciones ya colocadas, y respetan bloqueos y vías
dobles. Conservan los préstamos que ya completan tus destinos. Cada propuesta es
individual: no reserva vías, no estima las cartas de pago ni garantiza una
asignación conjunta de estaciones para varios billetes todavía pendientes.

Pulsar cualquier parte de un billete (texto, número, casilla o espacio libre)
lo selecciona o desmarca una sola vez. La casilla conserva su manejo nativo por
teclado. Pasar el cursor permite inspeccionar un destino
sin cambiar la selección; seleccionar un billete por toque o tocar un recorrido
del mapa lo enfoca. Retirar el cursor o tocar fuera de las opciones y recorridos
recupera la vista conjunta con únicamente los billetes marcados. Sin selección queda el mapa base, sin
resaltados, nombres especiales ni vagones de previsualización. **Ver todos**
también vuelve al conjunto seleccionado. Los cambios de foco duran 180 ms,
conservan el zoom y no se animan con movimiento reducido.

Al elegir billetes iniciales o nuevos, el mapa empieza oscurecido y mantiene
esa intensidad con cualquier selección o foco, incluso sin billetes marcados.
**Quitar sombra** muestra los colores normales y pasa a **Activar sombra** para
restaurarla. El botón conserva recorridos, casillas, foco y zoom. La elección
de sombra se mantiene al minimizar y reabrir la misma oferta; cada nueva
selección o recarga empieza oscurecida. En **Ver rutas**, la consulta de billetes
conservados mantiene el sombreado medio de la vista conjunta y completo del foco.

**Tus destinos actuales** abre todos tus billetes marcados para comparar en una
oferta nueva, incluidos los completados. Puedes desmarcarlos; esa elección se
respeta al actualizar el tablero y al minimizar/reabrir la misma oferta. Estos
controles no seleccionan billetes nuevos ni cuentan para su mínimo. Rueda, pellizco,
arrastre, teclado y botones de zoom actúan solo dentro del mapa del modal.
Las construcciones confirmadas actualizan los recorridos en vivo, conservando
casillas, foco y cámara. Una alternativa igual de económica no desplaza la
propuesta vigente. **Recorrido actualizado** avisa de los cambios y **Sin conexión
disponible** identifica un destino bloqueado sin desmarcarlo. Los puntos del
billete siguen siendo fijos y distintos de la cantidad de vagones. El modal se
ajusta a la pantalla: las listas largas se desplazan dentro de su columna y el
botón de confirmación permanece visible, sin espacio vacío al final del modal.

Los diálogos de billetes iniciales y nuevos muestran segundos y una barra de tiempo decreciente como la del turno, con una indicación breve de los vagones de previsualización. El mínimo permanece junto al botón de confirmación. Se requieren al menos dos billetes iniciales y uno al robar destinos durante la partida. Las actualizaciones de estado no reinician las casillas elegidas. `npm test` incluye la regresión de confirmar nuevos destinos y continuar con los turnos siguientes. Hay verificaciones de escritorio y emulación móvil; las pruebas en dispositivos físicos siguen pendientes. Consulta el [índice de QA](docs/qa-index.md) para distinguir el alcance de cada ejecución.

### Relojes y elecciones simultáneas

Pasar el cursor o enfocar un mini billete de **Tus destinos** oscurece solo el mapa y destaca sus dos ciudades y nombres sin mover la cámara. Si está completado, también ilumina **una conexión real**, conservando los mismos vagones y estaciones 3D y sus colores; no resalta toda la red. Los tramos prestados llevan halo discontinuo y se destaca la estación utilizada. Los pendientes solo muestran los extremos. Si una ciudad queda fuera del área libre, un indicador en el borde muestra su dirección. Durante el resaltado solo se muestran los nombres de los extremos seleccionados; **Resaltar mis destinos** incluye todos tus billetes, también los completados. Los puntos de las demás ciudades siguen visibles y los nombres habituales vuelven al desactivar el resaltado. El historial añade el mismo avatar de persona del panel de jugadores, en 21 px y con su color; el servidor identifica al actor por asiento, incluso cuando dos nombres coinciden. Los avisos del sistema y el historial antiguo sin actor no reciben un avatar supuesto.

Una construcción aceptada en el tablero principal comienza con **500 ms de
sombreado gradual**, durante los cuales las nuevas piezas permanecen ocultas.
Después aparece la animación existente: piezas elevadas y orientadas sobre sus
casillas que descienden durante **500 ms**, con el mismo desfase entre vagones.
Las estaciones usan el mismo gesto. Al aterrizar suena una sola vez el golpe.
Tras la pausa existente de 150 ms, la iluminación vuelve al mapa normal en
**350 ms**; si hay un resaltado activo, se conserva. La banda de propiedad señala
la conexión aceptada. El servidor conserva los presupuestos de turno y de oferta
durante la secuencia completa de 1.500 ms; en túneles ya está incluida en la pausa
de resultado. No se repite al reconectar. Con movimiento reducido, la colocación
y su sonido son inmediatos; ocultar, desconectar o redimensionar termina los
efectos pendientes sin alterar la jugada ni los plazos del servidor.

- **Elección inicial simultánea: 30, 60 o 90 segundos compartidos.** Cada jugador recibe sus cuatro billetes privados y confirma al menos dos, en cualquier orden. Quien confirma puede explorar el mapa mientras espera; se muestra cuántos están listos. Al confirmar todos comienza el jugador sorteado, no el primero en confirmar. Al vencer el plazo, cada pendiente conserva dos billetes distintos al azar y empieza la partida. Reconectar no reinicia el plazo; las partidas antiguas conservan sus elecciones y usan el plazo que ya tenían.
- **Túneles compartidos:** todos los jugadores y espectadores ven quién intenta la ruta, las cartas reveladas y el resultado; solo el constructor humano recibe el modal. Cada carta aparece cada 700 ms; tras la última se dejan otros 700 ms antes de resolver. Durante la revelación el reloj del constructor está congelado. Con suplemento solo él decide pagar o desistir usando el tiempo que le quedaba; al agotarse, desiste. Sin suplemento se construye automáticamente. El resultado dura tres segundos y se cierra solo, antes de comenzar el siguiente turno. Los bots respetan estas etapas. Los billetes pendientes conservan su borrador y su tiempo restante durante todo el intento, aunque los observadores permanezcan en el tablero. Recargar, reducir movimiento u ocultar una pestaña no adelanta ni prolonga los plazos del servidor.
- **Turno normal: 30, 60 o 90 segundos según la sala.** Una primera carta no reinicia el reloj. Al vencer, se roban del mazo las dos cartas pendientes, o solo la restante. Si no hay suficientes, se toman las disponibles y pasa el turno. Un túnel aún sin resolver se abandona conservando el pago reservado.
- Pedir nuevos destinos consume el turno inmediatamente: el siguiente jugador continúa mientras eliges. Cada oferta privada recibe **el tiempo restante del turno +15 o +30 segundos**,
según la sala. Por ejemplo, 20 s restantes con +30 s dan 50 s para elegir. **Ver mapa** minimiza el diálogo sin detener el reloj ni borrar tu selección; **Elegir billetes** permite volver mientras juegan los demás; si vuelve tu turno pendiente de elegir, se abre y debe resolverse primero. Confirmar (o vencer el plazo de elección) inicia entonces la **duración completa configurada para el nuevo turno**. Confirmar fuera de turno no modifica el reloj del jugador activo.
- No se puede pedir otra oferta sin resolver la anterior. Al vencer la oferta sin confirmar, se conserva exactamente un billete al azar entre los ofrecidos; las casillas marcadas son solo un borrador, no una confirmación.
- Si termina la última ronda con ofertas pendientes, se espera su plazo restante antes de puntuar. Terminar una prueba manualmente las resuelve al azar de inmediato.
- Las partidas ya iniciadas sin configuración mantienen sus turnos y ofertas de 60 s; no se reinician plazos al actualizar.
- El servidor conserva plazos absolutos, resuelve automáticamente incluso sin acciones del navegador y no concede tiempo extra por recargar o reconectar. Las selecciones de la oferta se guardan como borrador local y se restauran mientras siga vigente.

### Revisar el final

**Fin de partida** muestra una tabla ordenada por clasificación, con una fila por jugador y columnas de Rutas, Destinos, Estaciones, Camino más largo y Total. Empieza plegada. Pulsar una celda de categoría abre su mapa y datos debajo de esa fila; las propias celdas cambian de categoría y marcan la selección. Solo hay un detalle abierto; la flecha junto al nombre lo pliega. Las flechas izquierda/derecha permiten navegar entre categorías con teclado. En móvil la tabla admite desplazamiento horizontal y el mapa mantiene el ancho visible.

**Explorar mapa** cierra los resultados sin salir de la sala; **Ver resultados** los vuelve a abrir conservando la selección. El tablero queda en consulta. Cada categoría mantiene su evidencia: rutas y puntos, billetes completados o penalizados, estaciones sin construir ×4 y préstamos, y recorrido más largo con longitud, empates y bonificación. Los destinos rivales se muestran al finalizar a participantes. Un registro antiguo con diferencias entre puntos de rutas y vías guardadas conserva su ajuste explícito.

## Flujo de partida

1. El anfitrión crea sala, comparte enlace y espera 2–5 jugadores.
2. El servidor sortea al primer jugador con igual probabilidad entre los participantes. Después se conserva el orden cíclico de los asientos; reconectar no repite el sorteo.
3. Cada jugador elige al menos 2 de sus 4 billetes iniciales.
4. En cada turno: dos cartas de tren (salvo comodín visible), construir ruta, sacar destinos o colocar estación.
5. Una vez activada la última ronda, todos juegan una vez más, incluido el jugador que la activó. Se calculan destinos, estaciones y ruta más larga.

### Sesiones, ausencias y recuperación

- Los billetes iniciales y las ofertas nuevas empiezan sin casillas marcadas. La confirmación requiere el mínimo y los borradores manuales sobreviven a recargas. Sin confirmar, sigue aplicándose la selección aleatoria al vencer su plazo.
- Solo hay tres estaciones por jugador, con costes 1/2/3. Una vez agotadas, el menú informa de ello sin ofrecer construcción ni un coste de cuatro cartas.
- **Menú de partida**, en el engranaje, permite abandonar, copiar el **enlace privado de recuperación** y renovarlo. La invitación pública solo contiene el código de sala; el enlace de recuperación contiene una credencial en el fragmento, se limpia de la barra al entrar y nunca debe compartirse. En disco se guarda su hash. Renovarlo revoca el anterior. La cuenta de Google recupera automáticamente el puesto vinculado al entrar en la URL de la sala. Si actúa un bot de reemplazo, devuelve el control respetando su turno en curso. Los enlaces privados se ocultan para puestos vinculados; ver [acceso por cuenta](docs/GOOGLE_AUTH.md).
- En la sala previa, salir libera el puesto inmediatamente; una desconexión lo reserva 60 segundos. El anfitrión puede retirar a otro participante antes de empezar. Si sale, la autoridad pasa a otro conectado; si pierde conexión, se espera el margen de 60 segundos.
- En partida, los puestos y las piezas nunca se eliminan por desconexión. Después de **dos turnos consecutivos agotados**, un bot de reemplazo decide al azar entre construir una ruta pagable o robar una fuente legal de mesa/mazo. No pide destinos, no coloca estaciones ni consulta cartas rivales. Resuelve el suplemento de sus túneles según pueda pagarlo. Una salida voluntaria activa el bot directamente.
- Si el bot tiene el control, usa **Menú de partida → Recuperar control**; una reconexión lo solicita automáticamente. Se devuelve al siguiente turno humano, sin interrumpir una primera carta o un túnel del bot. Completar un turno manual rompe la racha de ausencias; tomar solo una carta no la rompe.
- Una segunda pestaña toma la sesión y la anterior deja de reconectarse. Esta ofrece un botón explícito para recuperar el control de la conexión.
- Si **todos** pierden conexión, se detienen relojes y bots durante un margen de reconexión de 60 segundos. Al regresar se conserva el tiempo restante, no se reinicia el turno. Si nadie vuelve, se abandona y elimina la sala, sin simular partidas entre bots. No se ofrece reanudación a las 24 horas. Las salas que sigan existiendo mantienen el límite general de inactividad de 24 horas.
- Al terminar, **Volver al inicio** permite salir y **Revancha** reúne en una sala nueva a quienes acepten. Los resultados anteriores se conservan mientras exista su sala (el mismo margen de abandono se aplica si todos se marchan).
- Las acciones llevan identificadores para evitar duplicados al reconectar y una revisión para rechazar jugadas sobre una mesa desactualizada. El servidor confirma después del guardado local. Si falla, revierte la jugada no guardada y pausa las salas multijugador; se muestra **Reintentar guardado**. Los snapshots usan sustitución atómica y una copia anterior; no sustituyen una base de datos externa ni un disco persistente.

## Arquitectura

### Regla propia: reciclado inmediato de cartas

Las cartas de tren gastadas o descartadas, incluidas comodines, vuelven al mazo oculto y se barajan con él **una sola vez por evento resuelto**, sin esperar a que se agote. Esta variante reemplaza el ciclo de descarte del reglamento de referencia y aplica también a las partidas multijugador normales.

- Una construcción o estación devuelve su pago al terminar la acción.
- Las tres cartas reveladas de un túnel permanecen fuera del mazo durante la decisión. Al aceptar, se barajan juntas con el pago base y el suplemento; al desistir, solo vuelven las reveladas. Terminar una prueba durante un túnel también devuelve sus reveladas, sin cobrar el pago.
- Con tres o más comodines visibles se recicla el mercado y se elige otro válido, sin bucles infinitos si no existen suficientes cartas de color para formarlo.
- Robar una carta visible repone su mismo hueco, salvo cuando se renueva el mercado completo o se agota el mazo. Las demás cartas no cambian de posición.
- Consultar el estado o actualizar la pantalla no baraja. Los billetes de destino usan su propio mazo y no se mezclan con las cartas de tren.

### Componentes

El repositorio organiza la interfaz en `frontend/`, el servidor en `backend/`,
los módulos públicos compartidos en `shared/` y las reglas/casos de uso en `game/`.
La [arquitectura](docs/architecture.md) indica responsabilidades y puntos de entrada.
Sigue habiendo una instalación npm, un proceso Node y el arranque `npm start`.

Las ilustraciones originales están en `frontend/assets/`. `python3 scripts/make_assets.py`
las regenera; `python3 scripts/make_assets.py --check` compara sin sobrescribirlas.
Las URLs del navegador, como `/app.js` y `/assets/cards/red.svg`, se conservan.

Las cartas del mazo y los billetes de los contrincantes **no** se envían a los navegadores. En local, las salas multijugador se guardan en un JSON configurable; por defecto `room-state.json`, junto a `room-state.json.archive/` para los pasos de replay; ambos quedan fuera del paquete de distribución. En Render, `STATE_BACKEND=supabase` guarda un checkpoint remoto privado antes de publicar cada cambio. Una sala multijugador inactiva caduca en 24 horas. Las salas de pruebas se mantienen solo en memoria.

El servidor funciona en una única instancia Node.js. Valida el origen de las conexiones WebSocket y rechaza tramas fragmentadas o con bits reservados. Comprueba las conexiones multijugador cada 25 segundos y cierra las que no responden durante más de 70 segundos, conservando su asiento para reconexión. Las salas con bots usan su propio control de desconexión y limpieza.

## Despliegue de prueba (similar a compartir un enlace)

Se necesita un **servicio Node con WebSockets**, como Railway, Render o Fly.io. No basta con publicar el HTML en Netlify sin backend.

- Publica estos archivos en un repositorio **privado**.
- Configura el comando de inicio `npm start` o utiliza el `Dockerfile`.
- Permite que la plataforma asigne la variable `PORT`.
- Configura HTTPS/WSS (normalmente proporcionado por la plataforma).
- Usa un volumen persistente para `STATE_FILE=/data/rooms.json`; sin almacenamiento persistente, un reinicio o despliegue puede perder las partidas.
- El enlace público será una URL HTTPS para crear salas e invitar amigos. Los códigos de sala permiten entrar solo hasta empezar; los participantes se reconectan con un token guardado en ese navegador.

**No es necesario instalar software en los dispositivos de los invitados.**

## QA y limitaciones

Ejecuta `npm test` para revisar las reglas y la red. Ver `QC.md`.

Los pagos del modal de túnel se contrastan con el motor y con WebSockets reales (color, pago mixto, solo comodines y desistir). Para reproducirlos visualmente de forma aislada, ejecuta `PORT=3002 node tests/helpers/tunnel-preview.js`. Escucha solo en este equipo y crea las salas temporales `QAPAY0`, `QAPAY1`, `QADECL` y `QAWILD`; en el almacenamiento local de ese origen, asigna `rr-room-CODIGO` a `preview-human` antes de abrir `/?room=CODIGO`. No modifica las salas del servidor habitual ni se sirve como recurso del juego.

Para verificar colores y menús de propiedad, `PORT=3001 node tests/helpers/ownership-preview.js` prepara `QAMARK` con cinco rutas construidas mediante el motor. Usa el mismo token local `preview-human` en `rr-room-QAMARK`. Incluye un carril paralelo libre y cartas suficientes para construirlo; los tests de red verifican su transición a ruta propia. Los tests de recursos comprueban que los SVG personalizados coincidan con sus fuentes en `scripts/make_assets.py`.

Las pruebas de cartografía verifican dimensiones y orientación de las casillas, ausencia de superposiciones, separación respecto a ciudades ajenas, límites del mapa y colocación de etiquetas en tamaños de escritorio. El servidor también verifica la entrega del nuevo recurso de cartografía: al actualizar desde una versión anterior, reinicia `npm start` y recarga el navegador.

Esta versión se entrega como **candidata de pruebas privadas**, no como versión oficialmente certificada ni desplegada. Falta una prueba de aceptación manual completa con 2–5 dispositivos físicos, además de pruebas de carga prolongadas y revisión de accesibilidad. La cartografía SVG es una representación funcional propia, no un facsímil artístico del tablero original. Se recomienda usarla únicamente en círculos privados y gestionar permisos si alguna vez se pretende distribución pública.

### Fuentes de verificación

- Reglamento inglés de *Ticket to Ride: Europe* (edición 2015): `https://games-for-you.oozmi-cdn.com/products/db57155a-6ffe-45e5-ad38-93b0ee738d8a/pdfs/ticket-to-ride-europe_rulebook_en.pdf`
- Datos de red y tipos de ruta estudiados: `https://github.com/rkdarst/board-game-networks/blob/master/data/ticket-to-ride/europe.yaml`
- Comprobación de destinos: `https://github.com/leonsi7/ticket-to-ride-europe/blob/main/destinations.csv`


## Despliegue en Render Free + Supabase Free

Guía completa: [docs/RENDER_SUPABASE.md](docs/RENDER_SUPABASE.md).

1. Crea tu proyecto **Supabase Free** y ejecuta `supabase/001_active_games.sql` en su SQL Editor. No habilites acceso público a la tabla.
2. Conecta tu repositorio **privado** a tu cuenta de Render con el Blueprint `render.yaml`, plan **Free**.
3. Configura `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (clave `sb_secret_…`) en **Render → Environment**, nunca en el frontend, Git o el chat. El Blueprint fija `STATE_BACKEND=supabase`.
4. Comprueba `/healthz`: debe responder 200, `ok: true` y `storage: "supabase"`. Realiza la prueba de reinicio indicada en la guía antes de invitar jugadores.

Un único servicio aloja las salas. La cola serializa mensajes, bots y relojes; la respuesta de éxito se publica después del guardado. Un identificador de commit evita duplicar escrituras al perder una respuesta. Un nuevo proceso toma el control del checkpoint y bloquea escrituras de la instancia anterior. Tras un reinicio, los puestos, manos, rutas y tiempo pendiente se recuperan; se abre una ventana de reconexión de 60 segundos. Si todos ya habían abandonado y agotado su ventana, la sala no se revive.

Si falla el guardado remoto, no hay fallback al disco efímero: se pausa y no se confirma la jugada. Ante un resultado de escritura incierto, hay que **reiniciar el servicio** y reconectar para leer el último checkpoint; no se vuelve a guardar a ciegas una copia en memoria. Esto puede interrumpir una partida, pero evita sobrescribir una jugada que sí llegó a la base. Las salas caducadas se retiran del checkpoint, sin mantener un historial ilimitado.

**Límites:** Render Free puede dormir tras 15 minutos sin tráfico y tardar aproximadamente un minuto en despertar, además de reiniciarse en cualquier momento; Supabase Free puede pausar el proyecto tras una semana de inactividad. El almacenamiento externo conserva datos confirmados, no garantiza disponibilidad continua. Evita deploys durante partidas, desactiva auto-deploy y no conectes servidores locales o previews al proyecto de producción: cada arranque reclama su control. No se ha contratado un plan de pago. [Render Free](https://render.com/docs/free) · [Supabase Free](https://supabase.com/pricing).

**Cuenta Google opcional:** el código permite guardar apodo y vagón, cerrar sesión y retomar salas vinculadas desde la cuenta. Conserva la práctica invitada y no publica tu foto/nombre de Google. La aplicación publicada tiene el acceso habilitado; la validación completa con cuentas reales sigue en curso; [configuración](docs/GOOGLE_AUTH.md) y [avance](docs/work/identity.md).

## Interfaz Trencitos v0.6.1

- Mapa continuo de fondo, zoom 25%–300%, arrastre a cualquier escala y pantalla completa conservando los controles.
- Etiquetas de ciudades reforzadas, rutas coloreadas con mayor contraste y selección visible.
- Jugadores compactos arriba, con avatar, puntos públicos, recursos y estaciones ampliables.
- Mano y mercado siempre visibles; destinos e historial por iconos, con scroll independiente y construcción contextual.
- Botón **Invitar** durante partidas multijugador; las salas con bots siguen siendo privadas para su creador.
- Descripción explícita del coste de cada ruta, incluidos los requisitos de comodines de los ferris.
- Botón para pasar cuando se agotan cartas y destinos; el servidor comprueba que no quede otra acción legal.
- Las pruebas cubren ferris, túneles y rutas dobles, además del mapa y del flujo con bots.

La mesa se ha comprobado en 1280×720, 1366×768 y 1920×1080, incluida una vista de cinco jugadores y los nueve grupos de cartas. Las pruebas de `game-ui.js` cubren pagos, disponibilidad, estaciones, paso sin jugadas, encaje entre paneles y zoom centrado en el cursor. Al actualizar, reinicia el proceso `npm start` para servir los nuevos archivos `game-ui.js` y `game.css`, y recarga el navegador. No hace falta iniciar frontend y backend por separado.

- Durante una sala abierta, los navegadores envían un mensaje de mantenimiento cada 3 minutos para evitar la suspensión por inactividad. Esto no impide reinicios de Render ni sustituye almacenamiento persistente.

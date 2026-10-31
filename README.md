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

## Inicio y salas privadas

El inicio separa **Crear sala**, **Unirme** y **Practicar**. Para crear se propone un código aleatorio de ocho números, editable antes de confirmar (entre seis y diez dígitos, incluidos ceros iniciales). Si está ocupado se muestra un error, sin cambiarlo ni entrar en otra sala. Una vez creada la sala, el código queda fijo. Las invitaciones antiguas de seis letras/números y los enlaces privados de recuperación siguen funcionando.

En la sala de espera cada participante elige uno de dieciocho colores libres: rojo, azul, verde, ámbar, morado, marrón, amarillo, negro, gris, magenta, turquesa, azul noche, borgoña, verde oliva, marfil, coral, lavanda y azul hielo. Amarillo lleva deportivos y ámbar lleva grano; ambos usan pintura normal, sin presentación dorada. El servidor reserva el color incluso durante la ventana de reconexión, rechaza elecciones simultáneas duplicadas y lo guarda tanto en disco como en Supabase. Cambiar de puesto por la salida de otro participante no cambia tu color. Tras empezar, la elección queda bloqueada y se usa en trenes, estaciones, avatar e historial. El navegador recuerda nombre y color preferido (si está libre); al recargar una sala conocida recupera el puesto con su credencial local.

La cabecera muestra **Trencitos** y un botón de sonido sin texto, con estado accesible. La conexión solo se muestra cuando requiere atención; los avisos de desconexión y fallos de guardado no se ocultan.

El panel de inicio se centra en el espacio disponible bajo la cabecera. Si su contenido supera la altura de la pantalla, conserva un margen de 24 px (16 px en móvil) y permite desplazarse sin recortar controles.

## Sala de pruebas con bots

En el inicio, abre **Practicar**, elige tu color y pulsa **Jugar** para enfrentarte a tres bots. El primer jugador se sortea entre los cuatro; todos eligen los billetes iniciales a la vez. Los tres bots confirman entre dos y cuatro billetes compatibles tras 800–1000 ms sin esperar al humano; conservan los adicionales cuando comparten un recorrido viable. Comparan recorridos alternativos y redes que conecten varios destinos, calculando las cartas y los vagones necesarios para el conjunto. Ahorran para tramos útiles, prefieren las cartas de la mesa que necesitan y varían entre opciones de valor parecido.

Cada bot conserva planes viables y los replantea ante bloqueos, amenazas o falta de progreso. Prioriza conexiones difíciles de sustituir cuando un rival se acerca, reserva colores para los siguientes tramos y estima el riesgo de los túneles. Puede desistir de un suplemento que perjudique un destino más valioso. Estima los turnos restantes a partir de las construcciones, vagones y cantidades de cartas públicos; al cerrar compara puntos de vías, destinos y la posibilidad de conseguir el Express. Solo consulta su propia mano y destinos, las vías y demás información pública; no conoce el orden de los mazos ni las cartas o destinos privados de rivales. Puede colocar estaciones si compensan su coste y pedir nuevos destinos cuando su red ofrece buenas oportunidades. Resuelve las ofertas también fuera de turno y durante el cierre, conservando al menos un billete. Antes de algunas decisiones compara continuaciones de hasta tres turnos propios y posibles respuestas rivales, con manos y robos hipotéticos. Cada acción de un turno automático se separa entre 800 y 1000 ms, incluida la segunda carta y la decisión de pagar o desistir de un túnel. Los bots que sustituyen a jugadores ausentes mantienen su política independiente de robo/construcción aleatoria; esta estrategia solo se usa en la sala de pruebas.

El panel **Controles de prueba** aparece abajo a la izquierda, separado de la interfaz del juego y sobre sus diálogos. Arrástralo desde su encabezado con el ratón, o enfoca el encabezado y usa las flechas del teclado. **Terminar partida de pruebas** detiene los bots inmediatamente y muestra la puntuación actual como cierre anticipado. **Volver al inicio** elimina la sala y permite crear otra prueba.

Estas salas son privadas y temporales: no admiten invitados, no se guardan en disco y se pierden al reiniciar el servidor. Al desconectarte los bots se pausan; puedes volver con el mismo navegador en menos de 30 segundos para continuar. Si no vuelves, la sala se elimina. Leer sin hacer clic o dejar la pestaña en segundo plano no cuenta como desconexión.

`npm test` comprueba las decisiones de los bots, partidas completas simuladas, tiempos y limpieza de salas con un reloj simulado, y la integración real por WebSocket.

## Mapa y selección de destinos (escritorio)

El tablero inicia en **3D**: mapa plano con vagones y estaciones con volumen.
Cada color de jugador tiene su familia de vagones inspirada en las cartas; el
amarillo es una plataforma que transporta dos deportivos. Las cargas son decorativas y no dependen
de las cartas pagadas. La mano, cartas, paneles y mapas de detalle siguen en 2D.
El tablero principal solo usa 3D: si WebGL falla, ofrece **Reintentar** conservando
la sala. Acercar permite ver los detalles; las etiquetas permanecen horizontales.
Antes de comenzar, el selector de color en práctica y sala de espera muestra una
previsualización del mismo vagón que se colocará en el tablero.

La mesa ocupa la pantalla sin scroll de página: el mapa y el mar forman un fondo continuo, visible entre los paneles flotantes. La mano permanece abajo. La columna derecha contiene **Historial**, siempre abierto con scroll interno; **Robos**, en dos filas de tres posiciones (cinco cartas y el mazo); y **Jugadores**, anclados abajo con altura reservada para cinco, sin tarjetas vacías. El historial muestra los últimos 25 movimientos en orden cronológico: los nuevos aparecen abajo y, si hay pocos, se apoyan en el borde inferior. Sigue los nuevos eventos solo si estás al final; al leer movimientos anteriores conserva la posición y ofrece **Nuevos ↓**. Su barra permanece visible cuando hay desbordamiento, independientemente de la configuración de macOS, y admite arrastre, rueda y teclado. **Encajar** centra la cartografía al 100% en el espacio libre hasta la mano. El zoom permite alejar hasta **25%** y acercar hasta **600%**: con el puntero sobre el mapa, la rueda cambia la escala alrededor del cursor. Arrastra con el botón izquierdo a cualquier escala, incluso al 25% y al 100%; un clic sin arrastre sigue seleccionando una ruta o ciudad. El botón ⛶ activa pantalla completa sin ocultar la mano ni las acciones. El sidebar tiene scroll propio solo cuando falta altura; su rueda no altera el mapa. El icono **i** junto a ROBOS muestra las cantidades restantes de ambos mazos al pasar el ratón o enfocarlo con teclado.

El mercado ocupa **dos filas y tres columnas**: cinco cartas visibles y un mazo apilado en la sexta posición para robar a ciegas. El pequeño mazo beige junto a ROBOS permite pedir nuevos destinos. Ambos tienen descripción al pasar el ratón y nombre accesible para teclado. Los huecos vacíos se conservan si se agotan las cartas. El amarillo es luminoso y mate; el comodín usa la locomotora lateral grabada sobre seis franjas arcoíris, sin acabado dorado. El reverso del mazo conserva solo su emblema, sin textos.

Las ocho cartas de color tienen vagones SVG diferentes: rojo/pasajeros, azul/cisterna de combustible, verde/alfalfa, amarillo/tolva de grano, negro/carbón, blanco/piedra, naranja/troncos y morado/mercancías cerrado. Comparten ruedas de radios y marco ornamental, sin nombres de color impresos. Conservan esos nombres en su descripción accesible y tooltip. El fondo mate coincide con la tonalidad de las rutas del mapa; rojo y naranja ya no tienen degradado oscuro y el negro es profundo. Fuera de turno, las cartas y ambos mazos mantienen el 80 % de opacidad, sin desaturación; los controles habilitados siguen al 100 %. Las cargas son decorativas: no modifican ninguna regla.

Al aceptar un robo, el servidor emite un identificador de movimiento. La carta viaja durante **750 ms** hasta la mano propia o el avatar rival. Los robos de la mesa muestran su color; los del mazo viajan boca abajo y solo se giran para quien roba. El servidor no envía el color oculto a los demás jugadores. Una reconexión no reproduce robos anteriores y los movimientos rechazados no generan animación. Se respeta la preferencia de movimiento reducido y se cancelan vuelos al ocultar la pestaña, redimensionar, desconectar o terminar la partida.

Los efectos de sonido son originales y sintetizados localmente: papel al robar cada carta o pedir una oferta de destinos, golpe de madera al completar una ruta o colocar una estación, y campana solo al comenzar tu turno. Los movimientos públicos de rivales también se oyen, sin revelar cartas ocultas. El altavoz de la cabecera permite silenciar y recuerda la preferencia; el navegador requiere una primera interacción para activar audio. No se reproducen efectos históricos al reconectar ni mientras la pestaña está oculta.

Cada jugador se identifica por su nombre, color y familia de vagones, sin símbolos geométricos por puesto. El avatar conserva el color como fondo. Pasar el cursor o enfocar al jugador resalta sus rutas. La nueva paleta amarillo/ámbar también se aplica a partidas existentes, sin modificar sus claves de color guardadas. Las rutas neutras son gris medio; las blancas y sus cartas son marfil claro. Esta distinción visual no cambia el reglamento.

Pulsa una ruta libre y después **Construir** para abrir el pago. El botón solo aparece durante tu turno jugable, antes de robar una carta y sin elecciones obligatorias pendientes; fuera de turno o al terminar, el menú es informativo. Si ya está ocupada, muestra únicamente al propietario; las propias indican «Esta ruta es tuya». Cada carril de una ruta doble se evalúa por separado. Se comprueban todos los colores legales y las locomotoras disponibles; si no alcanzan, aparece un aviso. Un túnel requiere poder pagar su coste inicial, no el suplemento todavía desconocido. Al revelarlo, el modal señala qué cartas aumentan el coste, muestra el pago base reservado y ofrece las combinaciones legales del suplemento (color, locomotoras o ambos), con el total antes de confirmar. No cuenta dos veces las cartas reservadas. Pulsa una ciudad libre para **Construir estación**; una ocupada identifica al dueño. Las estaciones tienen tejado y fachada del color del jugador, borde marfil, contorno oscuro y tamaño mínimo legible al alejar el mapa. Cancelar o Escape antes de confirmar no consume el turno; una vez revelado un túnel, hay que pagar o desistir. Desistir conserva la mano, pero termina el turno.

**Tus destinos** muestra cuatro billetes junto a la mano, con scroll interno a partir del quinto. Los pendientes son beige; los conectados, dorados con **✓ verde**, también en el modal. El servidor calcula el progreso de forma privada y emplea una asignación compatible de estaciones para todos los billetes; los puntos de destino se suman al final. **Ver rutas** abre tus billetes conservados, incluso durante turnos ajenos. Pulsar un billete concreto lo abre resaltado. Las casillas del modal solo resaltan conexiones: no descartan billetes ni consumen acciones. Un destino completado resalta un recorrido real de vías construidas; los tramos prestados mediante estación son discontinuos. Se cierra con X o Escape. **Historial** permanece abierto arriba a la derecha, sin desplazar el tablero ni la mano; su rueda recorre únicamente los movimientos.

Si aparece **Servidor anterior**, el proceso Node todavía ejecuta código anterior al protocolo actual (`uiVersion: 5`: elección inicial simultánea, desglose final y estaciones asociadas a los recorridos completados). Los billetes sin datos muestran **?**, no un falso estado pendiente. Termina primero las partidas de pruebas (son temporales), reinicia el backend con `npm start` y recarga la página. Recargar únicamente el navegador no actualiza el motor. La suite cubre específicamente Madrid → Pamplona → Paris → Bruxelles → Dieppe, incluso si Dieppe–Paris pertenece a un rival.

La cartografía está compuesta a mano en `map-layout.js`, separada del reglamento. Las 300 casillas tienen las mismas dimensiones; cada una gira siguiendo la curva de su vía. Las rutas dobles mantienen carriles separados, los túneles tienen bordes dentados, y las casillas obligatorias de ferri contienen una locomotora. Casillas libres y marcas están en la escena 3D, debajo de las estaciones. Una ruta ocupada muestra vagones 3D y una franja del color de su propietario sobre el terreno; los mapas de detalle conservan piezas SVG. La descripción accesible identifica al dueño. Los nombres mantienen 15 píxeles de pantalla al cambiar el zoom y se colocan evitando otras etiquetas; cuando deben alejarse de su ciudad, una línea fina conserva la asociación. Al alejar mucho o en un área de mapa reducida se ocultan etiquetas cercanas entre sí; las ciudades seleccionadas, enfocadas o bajo el cursor tienen prioridad. El foco de teclado resalta las casillas de la ruta, no un rectángulo que la englobe.

Los billetes se comparan en un único mapa con la red ferroviaria atenuada y las fichas ya colocadas: las tuyas siempre visibles y las ajenas atenuadas. Cada opción tiene un número y un color estables (amarillo, rojo, azul y verde). Los objetivos pendientes muestran una línea discontinua entre ciudades, no un recorrido obligatorio. En una oferta nueva, las casillas seleccionan qué conservar; debajo, **Tus destinos actuales** usa controles de visualización independientes, sin mezclarlos con la selección. Los objetivos actuales sin resaltar quedan al 25% de opacidad. Pasar el cursor o enfocar una opción permite previsualizarla sin seleccionarla. Las ciudades compartidas muestran varios anillos de color.

Se requieren al menos dos billetes iniciales y uno al robar destinos durante la partida. Las actualizaciones de estado no reinician las casillas elegidas. `npm test` incluye la regresión de confirmar nuevos destinos y continuar con los turnos siguientes. Hay verificaciones de escritorio y emulación móvil; las pruebas en dispositivos físicos siguen pendientes. Consulta el [índice de QA](docs/qa-index.md) para distinguir el alcance de cada ejecución.

### Relojes y elecciones simultáneas

Pasar el cursor o enfocar un mini billete de **Tus destinos** oscurece solo el mapa y destaca sus dos ciudades y nombres sin mover la cámara. Si está completado, también ilumina **una conexión real**, conservando los mismos vagones y estaciones 3D y sus colores; no resalta toda la red. Los tramos prestados llevan halo discontinuo y se destaca la estación utilizada. Los pendientes solo muestran los extremos. Si una ciudad queda fuera del área libre, un indicador en el borde muestra su dirección. El historial añade el mismo avatar de persona del panel de jugadores, en 21 px y con su color; el servidor identifica al actor por asiento, incluso cuando dos nombres coinciden. Los avisos del sistema y el historial antiguo sin actor no reciben un avatar supuesto.

Una construcción aceptada hace descender las piezas 3D, ya orientadas sobre sus casillas, durante **500 ms**, con un ligero desfase entre vagones. Las estaciones usan el mismo gesto. Al aterrizar suena una sola vez el golpe. La banda de propiedad señala la conexión aceptada. No retrasa el turno siguiente ni repite la animación al reconectar. Los túneles esperan a terminar la revelación antes de colocar sus piezas. Con movimiento reducido, la colocación y su sonido son inmediatos; ocultar, desconectar o redimensionar termina los efectos pendientes sin alterar la jugada.

- **Elección inicial simultánea: un minuto compartido.** Cada jugador recibe sus cuatro billetes privados y confirma al menos dos, en cualquier orden. Quien confirma puede explorar el mapa mientras espera; se muestra cuántos están listos. Al confirmar todos comienza el jugador sorteado, no el primero en confirmar. Al vencer el plazo, cada pendiente conserva dos billetes distintos al azar y empieza la partida. Reconectar no reinicia el minuto; las partidas antiguas conservan sus elecciones y usan el plazo que ya tenían.
- **Turno normal: 60 segundos.** Una primera carta no reinicia el reloj. Al vencer, se roban del mazo las dos cartas pendientes, o solo la restante. Si no hay suficientes, se toman las disponibles y pasa el turno. Un túnel aún sin resolver se abandona conservando el pago reservado.
- Pedir nuevos destinos consume el turno inmediatamente: el siguiente jugador continúa mientras eliges. Cada oferta privada tiene **60 segundos propios**. Puedes minimizarla mientras juegan los demás; si vuelve tu turno pendiente de elegir, se abre y debe resolverse primero. Confirmar (o vencer el plazo de elección) inicia entonces los **60 segundos completos del nuevo turno**. Confirmar fuera de turno no modifica el reloj del jugador activo.
- No se puede pedir otra oferta sin resolver la anterior. Al vencer la oferta sin confirmar, se conserva exactamente un billete al azar entre los ofrecidos; las casillas marcadas son solo un borrador, no una confirmación.
- Si termina la última ronda con ofertas pendientes, se espera su plazo restante antes de puntuar. Terminar una prueba manualmente las resuelve al azar de inmediato.
- El servidor conserva plazos absolutos, resuelve automáticamente incluso sin acciones del navegador y no concede tiempo extra por recargar o reconectar. Las selecciones de la oferta se guardan como borrador local y se restauran mientras siga vigente.

### Revisar el final

**Explorar mapa** cierra los resultados sin salir de la sala; **Ver resultados** los vuelve a abrir. El tablero queda en modo consulta: no se puede robar ni construir. Los desplegables **Desglose de puntos** conservan su estado y muestran cada ruta (longitud y puntos), cada billete (éxito o penalización), estaciones sin construir ×4 y la asignación fija de cada estación construida. El Express incluye su recorrido exacto sin repetir tramos, la longitud máxima, empates y bonificación. La suma final reconcilia las cuatro categorías. Cada elemento con ↗ se puede resaltar en el mapa, incluso los billetes de otros jugadores, que solo se revelan al finalizar. Si un registro antiguo tiene un contador de rutas distinto de las vías guardadas, el desglose muestra el ajuste explícitamente sin alterar la puntuación almacenada.

## Flujo de partida

1. El anfitrión crea sala, comparte enlace y espera 2–5 jugadores.
2. El servidor sortea al primer jugador con igual probabilidad entre los participantes. Después se conserva el orden cíclico de los asientos; reconectar no repite el sorteo.
3. Cada jugador elige al menos 2 de sus 4 billetes iniciales.
4. En cada turno: dos cartas de tren (salvo locomotora visible), construir ruta, sacar destinos o colocar estación.
5. Una vez activada la última ronda, todos juegan una vez más, incluido el jugador que la activó. Se calculan destinos, estaciones y ruta más larga.

### Sesiones, ausencias y recuperación

- Los billetes iniciales y las ofertas nuevas empiezan sin casillas marcadas. La confirmación requiere el mínimo y los borradores manuales sobreviven a recargas. Sin confirmar, sigue aplicándose la selección aleatoria al vencer los 60 segundos.
- Solo hay tres estaciones por jugador, con costes 1/2/3. Una vez agotadas, el menú informa de ello sin ofrecer construcción ni un coste de cuatro cartas.
- **Partida**, en la cabecera, permite salir, copiar el **enlace privado de recuperación** y renovarlo. La invitación pública solo contiene el código de sala; el enlace de recuperación contiene una credencial en el fragmento, se limpia de la barra al entrar y nunca debe compartirse. En disco se guarda su hash. Renovarlo revoca el anterior. La cuenta opcional de Google añade recuperación de salas vinculadas; requiere [activación](docs/GOOGLE_AUTH.md).
- En la sala previa, salir libera el puesto inmediatamente; una desconexión lo reserva 60 segundos. El anfitrión puede retirar a otro participante antes de empezar. Si sale, la autoridad pasa a otro conectado; si pierde conexión, se espera el margen de 60 segundos.
- En partida, los puestos y las piezas nunca se eliminan por desconexión. Después de **dos turnos consecutivos agotados**, un bot de reemplazo decide al azar entre construir una ruta pagable o robar una fuente legal de mesa/mazo. No pide destinos, no coloca estaciones ni consulta cartas rivales. Resuelve el suplemento de sus túneles según pueda pagarlo. Una salida voluntaria activa el bot directamente.
- Si el bot tiene el control, usa **Partida → Recuperar control**; una reconexión lo solicita automáticamente. Se devuelve al siguiente turno humano, sin interrumpir una primera carta o un túnel del bot. Completar un turno manual rompe la racha de ausencias; tomar solo una carta no la rompe.
- Una segunda pestaña toma la sesión y la anterior deja de reconectarse. Esta ofrece un botón explícito para recuperar el control de la conexión.
- Si **todos** pierden conexión, se detienen relojes y bots durante un margen de reconexión de 60 segundos. Al regresar se conserva el tiempo restante, no se reinicia el turno. Si nadie vuelve, se abandona y elimina la sala, sin simular partidas entre bots. No se ofrece reanudación a las 24 horas. Las salas que sigan existiendo mantienen el límite general de inactividad de 24 horas.
- Al terminar, **Volver al inicio** permite salir y **Revancha** reúne en una sala nueva a quienes acepten. Los resultados anteriores se conservan mientras exista su sala (el mismo margen de abandono se aplica si todos se marchan).
- Las acciones llevan identificadores para evitar duplicados al reconectar y una revisión para rechazar jugadas sobre una mesa desactualizada. El servidor confirma después del guardado local. Si falla, revierte la jugada no guardada y pausa las salas multijugador; se muestra **Reintentar guardado**. Los snapshots usan sustitución atómica y una copia anterior; no sustituyen una base de datos externa ni un disco persistente.

## Arquitectura

### Regla propia: reciclado inmediato de cartas

Las cartas de tren gastadas o descartadas, incluidas locomotoras, vuelven al mazo oculto y se barajan con él **una sola vez por evento resuelto**, sin esperar a que se agote. Esta variante reemplaza el ciclo de descarte del reglamento de referencia y aplica también a las partidas multijugador normales.

- Una construcción o estación devuelve su pago al terminar la acción.
- Las tres cartas reveladas de un túnel permanecen fuera del mazo durante la decisión. Al aceptar, se barajan juntas con el pago base y el suplemento; al desistir, solo vuelven las reveladas. Terminar una prueba durante un túnel también devuelve sus reveladas, sin cobrar el pago.
- Con tres o más locomotoras visibles se recicla el mercado y se elige otro válido, sin bucles infinitos si no existen suficientes cartas de color para formarlo.
- Robar una carta visible repone su mismo hueco, salvo cuando se renueva el mercado completo o se agota el mazo. Las demás cartas no cambian de posición.
- Consultar el estado o actualizar la pantalla no baraja. Los billetes de destino usan su propio mazo y no se mezclan con las cartas de tren.

### Componentes

- `data.js`: 47 ciudades, 101 rutas, 40 billetes ordinarios y 6 largos.
- `map-layout.js`: posiciones visuales, costas propias, curvas, casillas uniformes y colocación de etiquetas; compartido por el tablero y la miniatura de billetes, sin alterar las reglas.
- `engine.js`: reglas deterministas y puntuación, ejecutadas exclusivamente por el servidor.
- `game-clock.js`: una alarma por sala para su próximo plazo de turno u oferta privada; sus handles no se guardan en el estado persistido.
- `multiplayer.js`: abandono, cambio de anfitrión, reserva de puestos y control de bots de reemplazo.
- `room-store.js`: snapshots locales, copia de seguridad y credenciales de recuperación guardadas como hashes.
- `bots.js`, `practice.js`: decisiones automáticas y ciclo de vida de las salas temporales de pruebas.
- `server.js`: servidor HTTP + WebSocket sin dependencias; salas privadas, validación de turnos, tokens de reconexión, difusión de vistas específicas por jugador.
- `index.html`, `style.css`, `game.css`, `app.js`: interfaz de escritorio con mapa SVG original; `game.css` concentra la composición de la mesa y sus paneles flotantes.
- `game-ui.js`: cálculo de cámara y opciones de pago de la interfaz, probado contra el motor. El servidor sigue siendo la autoridad para validar y ejecutar acciones.
- `assets/cards/*.svg`, `assets/ticket.svg`, `assets/favicon.svg`: ilustraciones vectoriales originales de las cartas, billetes y marca Trencitos. `python3 make_assets.py` permite regenerarlas; `python3 make_assets.py --check` comprueba que las cartas coincidan con el generador sin sobrescribirlas.
- `tests/`: pruebas del reglamento y de red, además de simulaciones de partidas completas.

Las cartas del mazo y los billetes de los contrincantes **no** se envían a los navegadores. En local, las salas multijugador se guardan en un JSON configurable; por defecto `room-state.json`, fuera del paquete de distribución. En Render, `STATE_BACKEND=supabase` guarda un checkpoint remoto privado antes de publicar cada cambio. Una sala multijugador inactiva caduca en 24 horas. Las salas de pruebas se mantienen solo en memoria.

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

Los pagos del modal de túnel se contrastan con el motor y con WebSockets reales (color, pago mixto, solo locomotoras y desistir). Para reproducirlos visualmente de forma aislada, ejecuta `PORT=3002 node tests/helpers/tunnel-preview.js`. Escucha solo en este equipo y crea las salas temporales `QAPAY0`, `QAPAY1`, `QADECL` y `QAWILD`; en el almacenamiento local de ese origen, asigna `rr-room-CODIGO` a `preview-human` antes de abrir `/?room=CODIGO`. No modifica las salas del servidor habitual ni se sirve como recurso del juego.

Para verificar colores y menús de propiedad, `PORT=3001 node tests/helpers/ownership-preview.js` prepara `QAMARK` con cinco rutas construidas mediante el motor. Usa el mismo token local `preview-human` en `rr-room-QAMARK`. Incluye un carril paralelo libre y cartas suficientes para construirlo; los tests de red verifican su transición a ruta propia. Los tests de recursos comprueban que los SVG personalizados coincidan con sus fuentes en `make_assets.py`.

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
- Jugadores en el lateral, con iconos y contadores de puntos, vagones y estaciones.
- Mano de cartas SVG siempre visible, con contadores grandes; cuatro destinos visibles y consulta en **Ver rutas**, construcción contextual e historial abierto con scroll independiente.
- Botón **Invitar** durante partidas multijugador; las salas con bots siguen siendo privadas para su creador.
- Descripción explícita del coste de cada ruta, incluidos los requisitos de locomotoras de los ferris.
- Botón para pasar cuando se agotan cartas y destinos; el servidor comprueba que no quede otra acción legal.
- Las pruebas cubren ferris, túneles y rutas dobles, además del mapa y del flujo con bots.

La mesa se ha comprobado en 1280×720, 1366×768 y 1920×1080, incluida una vista de cinco jugadores y los nueve grupos de cartas. Las pruebas de `game-ui.js` cubren pagos, disponibilidad, estaciones, paso sin jugadas, encaje entre paneles y zoom centrado en el cursor. Al actualizar, reinicia el proceso `npm start` para servir los nuevos archivos `game-ui.js` y `game.css`, y recarga el navegador. No hace falta iniciar frontend y backend por separado.

- Durante una sala abierta, los navegadores envían un mensaje de mantenimiento cada 3 minutos para evitar la suspensión por inactividad. Esto no impide reinicios de Render ni sustituye almacenamiento persistente.

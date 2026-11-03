---
{"id":"hippie-train","status":"validated","parent":"board-3d","depends_on":[],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Midsommar Express

Sustituye la temática Hippie Train, por petición del usuario y siguiendo la foto
aportada de una celebración con trajes de referencia. La familia permanece en
**Blanco `#ffffff`**, disponible durante la beta. La clave técnica `hippie`, los
nombres de módulos y los seis IDs se conservan; no se migra ningún estado.

## Alcance actual

- Seis escenas con actividades y utilería propias, descritas abajo. Cambian
  asientos, orientaciones, agrupaciones, vestuario y poses; no solo los colores.
- **22 personas por vagón**, frente a las 90 del diseño anterior: ocho en la
  terraza, una en cada una de las diez ventanas y dos en cada plataforma. En
  baile y bienvenida hay seis sentadas y dos de pie; en las otras cuatro
  escenas, las ocho están sentadas. No hay personas colgadas ni ventanas dobles.
- Cabezas esféricas sin rostro. Camisas y mangas blancas abultadas, chalecos
  rojos, azules o rayados, corpiños, faldas oscuras con franja roja y delantales,
  pantalones mostaza por debajo de la rodilla, medias y zapatos negros.
  Pañuelos blancos/azules, sombreros oscuros, gorras rojas, algunas coronas
  florales, recogidos y trenzas; también personas sin gorro, peladas o con barba
  corta. Piel y cabello no están ligados al traje.
- Carrocería y borde del techo blancos. Terraza plana con inserto de madera,
  bancos, mesas con mantel y cestas de flores. Barandillas discretas, festones
  verdes por encima de las ventanas, coronas en los extremos, cintas azules y
  amarillas, pequeñas flores y paneles florales pintados. Los adornos laterales
  enmarcan las ventanas y conservan amplias superficies blancas.
- Rutas, galería, espectador y replay comparten los modelos. Las rutas agotan
  tandas barajadas de seis sin repetir entre tandas, con semilla estable.
  No se guardan personajes, trajes ni decoraciones en los pasos históricos.
- Las personas y los adornos se combinan por variante y nivel de detalle en
  un lote instanciado. Comparten animación de construcción y resaltado.
  El detalle bajo conserva todos los viajeros, prendas principales, bancos,
  flores y coronas; simplifica geometrías y omite costuras y pequeños botones.
  Los pasajeros clásicos y las otras familias no cambian.

## Las seis escenas

| ID estable | Nombre visible | Detalles propios |
| --- | --- | --- |
| `picnic` | Merienda de verano | Mesa con mantel blanco y azul, tarta de fresas por capas, crema, jarra, platos y cubiertos. Una persona sirve una porción y otra sostiene una taza con asa. |
| `plaza` | Músicos del sol | Acordeón con fuelle plegado, teclas, botones y correas; violín con cuerpo curvo, mástil, cuerdas y arco. Dos oyentes aplauden y un estuche descansa en el suelo. |
| `towers` | Coronas de abedul | Poste sobre base y riostras de madera, cubierto de hojas; travesaño con dos coronas colgantes abiertas, flores y cintas. Los asientos dejan libre el centro y algunos viajeros miran hacia el poste. |
| `diagonal` | Baile de verano | Pareja de pie, inclinada y tomada de ambas manos, con falda amplia en posición de giro y piernas separadas. Suelo central despejado con ribetes azules y amarillos, seis espectadores sentados. |
| `balcony` | Taller de flores | Una persona teje una corona y otra enseña una terminada. Mesa con cestas, flores, tallos, una corona apoyada y, en detalle alto, carrete y recorte de cinta. |
| `gathering` | Bienvenida floral | Arco bajo de hojas, flores y lazos en un extremo de la terraza; una persona saluda y otra sostiene un ramo. Seis viajeros conversan sentados al otro lado. |

La cabeza puede girar e inclinarse sin mover el torso. Los objetos sostenidos
siguen la escala y orientación de su persona. Las dos manos de cada bailarín
coinciden con los mismos puntos de contacto; no hay bancos bajo ellos. Los
elementos principales de cada escena existen en ambos niveles de detalle.
Las poses son estáticas; la animación compartida es la de construcción.

## Contratos y archivos

La paleta y reserva están en [dominio](../domain.md), la reconstrucción en
[historial](../history-replay.md) y los módulos en [arquitectura](../architecture.md).
[hippie-model.mjs](../../frontend/hippie-model.mjs) define las escenas, personas y adornos;
[hippie-geometry.mjs](../../frontend/hippie-geometry.mjs) genera telas y vegetación y combina
las piezas; [hippie-hair.mjs](../../frontend/hippie-hair.mjs) conserva las formas de pelo.
[La galería de QA](../../tests/helpers/midsommar-preview.html) muestra los seis
modelos mediante el renderizador de producción. No es una pantalla del juego.

## Integración verificada en esta rama

Se incorporó una copia fija de los módulos validados del checkout de `main`
(base `f41e033` más cambios locales), sin escribir en él ni en el prototipo
`passenger-extreme`. [Huellas y procedencia](../qa/modular-platform-layout/visual-checkpoint.json).
Los archivos visuales conservan su contenido tras moverse a `frontend/` y
`shared/`, con una línea vacía final normalizada en `wagon-people.mjs`; las traducciones y la lista HTTP se integraron sobre
el código modular, conservando recibos y contratos anteriores.

En esta rama, las seis escenas pasaron construcción, resaltado, recarga,
espectador y replay en Chrome, con alta/baja resolución geométrica y vista móvil
emulada. La galería validó las 21 familias, cambios de tamaño/idioma, pérdida y
recuperación de contexto WebGL y liberación del canvas.
[Resultados](../qa/modular-platform-layout/visual-tests-result.json) y
[seis escenas](../qa/modular-platform-layout/midsommar/variants.png).
El resto de la aceptación se conserva en [fase 3](modular-platform-application.md).
No se publicaron cambios; la revisión visual del usuario sigue abierta.

## Evidencia recibida de main (histórica)

Los resultados y servidores de esta sección describen el checkout de origen.
No certifican esta rama ni que esos procesos sigan activos. La integración y
verificación propias se registran en [fase 3](modular-platform-application.md).

### Verificación Midsommar del origen

- `node --test tests/hippie-model.test.js tests/wagon-models.test.js
  tests/i18n.test.js tests/board-3d.test.js`: **17/17**. Incluye apoyo de pies,
  espacio entre asientos, ropa blanca visible, identidad entre niveles de
  detalle, ventanas despejadas, utilería de cada escena, aros abiertos, contacto
  de las manos al bailar y tandas estables de seis variantes.
- `BROWSER_HEADED=1 node tests/browser-hippie.cjs`: correcto en Chrome
  156.0.8078.80, sin errores
  de consola. Las seis escenas se generaron en detalle alto/bajo y respetan la
  huella de vagones conectados. Galería en 1441×900, 768×1024 y 390×844, reserva
  del blanco, guardado, recarga e inglés. Construcción real de la ruta de ocho
  vagones Stockholm–Petrograd, resaltado, reconexión, espectador y replay.
- Escena de 225 vagones, 45 Midsommar / 990 personas: **68 llamadas y 2.456.524
  triángulos**. La primera ejecución Midsommar registró 2.294.772 triángulos y
  la anterior de Hippie 4.469.372 triángulos;
  esta comparación geométrica no certifica FPS ni dispositivos físicos.
- En la verificación anterior, `node tests/browser-wagon-gallery.cjs`: las 21 familias pasaron cambios de
  tamaño, idioma y color, recuperación de contexto WebGL, liberación y reposo
  sin redibujado continuo. Las demás familias mantienen su presentación.
- Evidencia actual en `.qa/midsommar-scenes/`: `report.json`, `variants.png`,
  `scene-{id}.png`, capturas de sala/tablero/construcción y `local-server.json`.
  Revisión visual de los seis modelos y sus encuadres, incluidos el poste y el
  arco. El Chrome temporal sin interfaz no terminó de arrancar; la ejecución
  con interfaz completó todas las comprobaciones en un servidor de archivo
  aislado. La evidencia de la primera versión permanece en `.qa/midsommar-main/`.
- Al terminar, `localhost:3000` no estaba escuchando. Se dejó una revisión en
  `http://localhost:3119/midsommar`, con `STATE_BACKEND=file` y un `STATE_FILE`
  temporal propio. El juego está en la raíz del mismo puerto. Los módulos y
  textos responden con `Cache-Control: no-store` y sus hashes HTTP coinciden
  con los archivos de main. No se cargó ni modificó el estado habitual.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

Integrado en los archivos locales de `main`, sin commit, push ni despliegue.
La futura separación comercial sigue en [commerce](commerce.md). Siguiente
paso: revisión visual del usuario y publicación cuando se solicite.

## Evidencia histórica de la integración Hippie

- Pruebas de modelos, salas, historial, traducciones y controles: **39/39**.
- Galería de las 21 familias en Chrome, context loss/reintento, cambios de tamaño,
  vuelta a un color, idioma y liberación del canvas: correcta.
- `node tests/browser-hippie.cjs`: correcto en Chrome 156.0.8078.74. Reserva y
  guardado del blanco, recarga, inglés, preview con seis diseños en escritorio
  1441×900/tablet 768×1024 y uno en móvil 390×844; encuadre real sin recortar
  la multitud. Tablero de 225 vagones (45 Hippie / 4.050 personas): 67 llamadas
  y 4.469.372 triángulos en esa escena. Sin errores de consola o bucle en reposo.
  Construcción aceptada de Stockholm–Petrograd: ocho vagones con tanda completa,
  la multitud participa en la animación y aterriza junto a la carrocería.
  Resaltado, reconexión, espectador y replay preservan las apariencias. No se
  guardan campos decorativos. Esto no certifica FPS ni dispositivos físicos.
- Suite completa `STATE_BACKEND=file node --test --test-concurrency=1
  tests/*.test.js`: **376/376**, 107 s. La primera ejecución identificó una
  aserción que trataba blanco como color inválido (ahora acepta blanco y rechaza
  un color no catalogado) y un doble de UI que no incluía el toast ya existente
  de resaltado (se añadió el stub, sin cambiar la aplicación).
- El conductor nuevo se ajustó al ciclo de render de instancias de Three.js,
  al botón Configuración de tablet y al reparto exacto de 45 piezas por dueño;
  los primeros intentos fallidos de ese conductor no eran fallos del modelo.
- Evidencia regenerable en `.qa/hippie-main/`: informe, capturas de sala/tablero/
  construcción, log completo y comprobación del reinicio. Los navegadores de
  prueba usaron servidores de archivo y puertos temporales propios.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

El servidor habitual de `localhost:3000` se detuvo limpiamente y se reinició
con `STATE_BACKEND=file` y el mismo `room-state.json`, tras respaldar el estado
completo en `.qa/hippie-main/server-backup/`. Se verificó la entrega HTTP de los
módulos nuevos y, por comparación incremental de archivos, la conservación de
**28 partidas y 4.547 registros históricos**. La comparación inicial cargando
ambas copias completas agotó memoria en su proceso de lectura; se sustituyó
por hashes por bloques, sin escribir ni modificar el estado. El servidor siguió
funcionando. La sala anterior ya desconectada quedó sujeta a la caducidad normal
al arrancar; no se restauraron salas expiradas manualmente.

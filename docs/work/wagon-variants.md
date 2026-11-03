---
{"id":"wagon-variants","status":"done","parent":"board-3d","depends_on":[],"branch":"main","delivery":"none","updated":"2026-11-02"}
---
# Circo, Vivienda y variantes de Pasajeros

Revisión aprobada tras Moti sobre `f41e033`: retirar Jardín de hongos, Cristales
y Confitería. Sustituir solo por Circo/índigo y Vivienda/jade. Empezar variaciones
decorativas por Pasajeros, sin almacenar cada diseño en el historial.

## Aceptación

- [x] Catálogo con 20 selecciones. Rosa retirado del selector; puestos anteriores
  conservan ese color y usan Pasajeros, incluidos recuperación e historial.
- [x] Circo con franjas, paneles, estrellas y molduras; Vivienda con techo curvo,
  madera pintada, cortinas, chimenea y balcón. Mismos modelos en preview/tablero.
- [x] Seis composiciones de Pasajeros: clásico, una/dos/tres personas, apoyado y
  saludo. Cabezas esféricas sin cara; piel, ropa y pelo combinados independientemente.
  Cuatro peinados, ocho colores de pelo y cuatro estilos de prendas.
- [x] Tandas de seis variantes por ruta, sin repetir hasta agotarlas y sin repetir
  justo entre tandas. Rutas cortas usan un prefijo; largas usan nuevas tandas.
- [x] Elección visual determinista por código de sala/propietario/ruta/celda;
  mantiene aspecto al resaltar, actualizar, reconectar y recorrer el replay.
  Sin campos nuevos en juego, transporte o archivo; sin modificar reglas.
- [x] Piezas instanciadas y huella compartida; cada variante respeta 70 piezas.
- [x] Verificación final, capturas y revisión documental.

## Contratos

Arquitectura canónica en [arquitectura](../architecture.md), compatibilidad de
colores en [dominio](../domain.md), y representación del replay en
[historial](../history-replay.md). La retirada no cambia las pinturas anteriores.
Las familias de las partidas antiguas se representan con el catálogo vigente.

Fruta queda aplazada por solicitud del usuario: mejorar la forma de sus cargas
para que se distingan frutas concretas, sin modificarla en esta entrega. Las
otras familias podrán recibir variaciones posteriormente; aquí solo Pasajeros.

## Evidencia inicial · cuatro variantes

Verificado el 2026-11-02, con Chrome 156.0.8078.74 y backend local de archivo:

- `STATE_BACKEND=file node --test --test-concurrency=1 tests/wagon-models.test.js
  tests/lobby.test.js tests/lobby-server.test.js tests/board-3d.test.js
  tests/i18n.test.js tests/presentation-controls.test.js tests/history-server.test.js`:
  **32/32**. Todas las combinaciones de variante/personajes respetan la huella y
  presupuesto; las cuatro variantes y ocho combinaciones aparecen en la muestra.
- `node tests/browser-wagon-variants.cjs`: sala y partida antiguas cargadas desde
  disco conservan Rosa, preview y nombre; salir/crear no reasigna el color retirado.
  Circo/Vivienda llegan al servidor y disco, sobreviven recarga y tienen traducción.
  Tablero de 225 vagones: apariencia estable al resaltar, redimensionar, reconectar,
  observar y abrir el replay. El archivo no contiene campos decorativos. Sin
  render continuo en reposo ni errores de consola. Desktop 1440×900, tablet
  768×1024 y móvil 390×844; galería real de seis diseños inspeccionada.
- `node tests/browser-color-preview.cjs`: siete escenarios de clics rápidos,
  confirmaciones demoradas, conflictos, desconexión, rollback, recarga y móvil
  correctos. Reutiliza canvas y la confirmación anterior no pisa la última elección.
  Los mensajes EISDIR son fallos de guardado inyectados intencionalmente.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos; avisos
  semánticos contrastados. No cambian los contratos de materiales ni sonido.

La primera prueba del navegador se detuvo por un token de recuperación no válido
en el fixture; se corrigió a su formato hexadecimal antes de verificar el flujo.
La primera prueba de variedad contaba brazos como ropa; se corrigió el filtro de
la aserción. Ninguno de estos fallos requería cambiar el comportamiento del juego.

Implementación terminada localmente, sin commit ni despliegue. Servidores de prueba
con puerto y archivo propios, sin Supabase ni reiniciar el servidor habitual.
Artefactos regenerables en `.qa/wagon-variants/` (ignorados). La emulación no
certifica dispositivos físicos ni constituye una medición nueva de FPS.
Siguiente paso: integrar/publicar cuando se solicite; Fruta sigue aplazada.

## Refinamiento · seis variantes de Pasajeros

Alcance aprobado: enriquecer solo Pasajeros. Circo y Vivienda conservan sus modelos.
Las seis composiciones son independientes de los conjuntos de ropa/piel/pelo;
seis variantes no significa seis personajes fijos. Se retiró la geometría de ojos
por completo y la esfera de cabeza usa material suave. La ropa incluye franjas,
cuello, chaleco y solapas; los peinados corto, melena, rizos y moño, con tonos
negro/castaños/rubios/pelirrojo/gris/blanco. Las combinaciones no asignan una ropa
ni un peinado únicos a cada tono de piel.

`wagonRouteAppearances` produce tandas deterministas completas. Los cambios de
longitud conservan el prefijo; cada ruta reinicia su tanda y el inicio de una
nueva no repite el último diseño anterior. No añade estado al juego/historial.

Verificación del refinamiento · 2026-11-02:

- `node --test tests/wagon-models.test.js tests/board-3d.test.js
  tests/presentation-controls.test.js`: **15/15**. Cien semillas en rutas de
  0/1/4/6/8/12/13/120 vagones: tandas sin repeticiones, unión sin duplicado,
  prefijos estables y rutas independientes. Las 192 combinaciones de composición
  y conjunto de personajes respetan la huella y el presupuesto (máximo 65 piezas).
  Verificados ocho tonos de piel y pelo, doce colores de ropa, cuatro peinados y
  cuatro prendas; cada tono de piel admite distintas ropas y pelos. Sin ojos,
  nariz ni boca, y cabezas esféricas con material suave.
- `node tests/browser-wagon-variants.cjs`: correcto en Chrome 156.0.8078.74, sin
  errores de consola. Construcción real de Stockholm–Petrograd mediante el botón
  de confirmación: seis variantes y otras dos de una tanda nueva; los vagones ya
  colocados no cambian y la animación termina con la misma apariencia.
- Tablero denso con las familias actuales y prueba adicional con **225 vagones
  de Pasajeros**. Resaltar, cambiar tamaño, reconectar, observar y reproducir el
  archivo mantienen apariencias; sin campos decorativos en el archivo ni render
  continuo en reposo. Escritorio 1440×900, tablet 768×1024 y móvil 390×844.
- Galería de las seis composiciones generada con el renderizador real e
  inspeccionada visualmente. Artefactos separados en `.qa/passenger-six/`.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

Durante la ampliación del conductor QA, reordenar su reparto dejó 223 piezas en
el fixture y el primer envío de construcción usó un mensaje incorrecto. Se
restauró el reparto de 225 y se utilizó el botón real antes de verificar el flujo;
estos dos fallos eran del conductor, sin cambios necesarios en reglas o red.

Refinamiento terminado localmente, sin commit ni despliegue. No se reinició el
servidor habitual. La prueba de carga no mide FPS ni certifica dispositivos
físicos. Siguiente paso: integrar/publicar cuando se solicite.

## Refinamiento · pasajeros inclinados

Implementado tras aprobación de la propuesta Moti del 2026-11-02. Solo cambia
Pasajeros: torsos redondeados y estrechos en la cintura, inclinación hacia fuera
de 24–27° al apoyarse/saludar y 12° al asomarse, con una pequeña inclinación
lateral. La cintura queda dentro de la ventana. Cabezas esféricas sin rostro
casi erguidas, pelo orientado hacia atrás y prendas que siguen el torso curvo.
Los brazos usan segmentos redondeados: codos doblados, manos en el marco y un
brazo levantado en el saludo. Las seis composiciones, colores y tandas mantienen
el mismo contrato; Circo/Vivienda, reglas e historial no cambian.

Las rotaciones locales se componen con el giro de la vía mediante las matrices
de instancias existentes, tanto en preview como en tablero. No hay un objeto
animado por persona. Máximo **67 piezas** por variante, dentro del límite de 70;
la huella se comprueba incluyendo las esquinas después de rotarlas.

Verificación del refinamiento · 2026-11-02:

- Pruebas de modelos, tablero y controles: **16/16**. Tras ajustar el apoyo final,
  se repitieron las de modelos: **6/6**. Las 192 combinaciones respetan huella,
  altura, orientación normalizada y presupuesto. Se verifica cintura interior,
  inclinación exterior bilateral, codos doblados y ropa que sigue al torso.
- `node tests/browser-wagon-variants.cjs`: correcto en Chrome 156.0.8078.74.
  Capturas de seis variantes y detalle de apoyarse/saludar inspeccionadas.
  Matrices reales de cuatro torsos en preview y 26 en tablero: inclinación
  exterior en ambos lados, a 0/35/90/135/180/−90°, sin transmitirla a la cabeza.
- Flujo de construcción de Stockholm–Petrograd, tandas de seis, conservación de
  apariencias al resaltar/reconectar/reproducir, 225 vagones, escritorio/tablet/
  móvil y ausencia de errores de consola y de render continuo: correctos.
  Carga de 225 Pasajeros: 38 llamadas de dibujo y 2.037.280 triángulos en esa
  escena. No es una medición de FPS ni certifica dispositivos físicos.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  El primer intento de navegador no pudo abrir el puerto por el sandbox;
  se repitió con permisos para un servidor temporal de archivo y puerto propios.

Artefactos regenerables ignorados en `.qa/passenger-poses/`, incluido
`poses-detail.png`. Trabajo local terminado, sin commit ni despliegue.
Siguiente paso: integrar/publicar cuando se solicite; Fruta sigue aplazada.

## Refinamiento · personalidad de las seis carrocerías

Alcance aprobado: enriquecer la carrocería de Pasajeros conservando las seis
composiciones y sus poses. Cada una tiene decoración propia independiente del
conjunto de ropa/piel/pelo: clásico con cortinas crema y franja doble; una persona
con verde, persiana y techo más oscuro; dos personas con vino y tres respiraderos;
tres personas con mostaza; apoyado con turquesa y techo oscuro; saludo con azul.
Las ventanas combinan cristal cerrado, apertura parcial, cortinas recogidas y
fondos cálidos. Las ocupadas quedan abiertas y despejadas.

Todos reciben puertas en los extremos con ventanilla, marco, manijas y pasamanos,
doble escalón, franjas y tres uniones del techo. Cada variante distribuye dos o
tres respiraderos. La pintura de la carrocería sigue siendo la del propietario;
el tono oscuro se deriva de ella. No se cambia ninguna otra familia, ni el
reparto por tandas o los datos guardados.

Los diez marcos laterales, las franjas, los herrajes y las costuras se agrupan en
geometrías compartidas. La variante más compleja conserva **67 piezas** y todas
respetan el límite de 70 y la huella anterior, aun con los detalles nuevos.

Verificación · 2026-11-02:

- `node --test tests/wagon-models.test.js tests/board-3d.test.js`: **9/9**.
  Las 192 combinaciones respetan huella, altura y presupuesto. Hay seis
  decoraciones distintas incluso sin contar personas, independientes de su
  ropa; ninguna cortina ocupa una ventana con pasajero. Las poses y las tandas
  sin repetición conservan sus pruebas.
- `node tests/browser-wagon-variants.cjs`: correcto en Chrome 156.0.8078.74,
  sin errores de consola. Se inspeccionaron la galería, el detalle y el tablero.
  Las trece geometrías nuevas usadas en la prueba están normalizadas, con
  normales finitas; las matrices de las poses mantienen orientación correcta.
- Construcción real de Stockholm–Petrograd, 225 vagones, resaltado, reconexión,
  espectador, replay y tamaños de escritorio/tablet/móvil: correctos. El archivo
  no recibe campos decorativos y el tablero no redibuja continuamente en reposo.
  Escena de 225 Pasajeros: 50 llamadas de dibujo y 2.318.428 triángulos. Esto no
  mide FPS ni certifica dispositivos físicos.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.

Artefactos regenerables en `.qa/passenger-personality/`: `catalog.png`,
`poses-detail.png`, tableros de escritorio/tablet/móvil y `report.json`.
Implementación local terminada, sin commit ni despliegue. Servidor de prueba
aislado con archivo y puerto propios, cerrado al terminar.
Siguiente paso: integrar/publicar cuando se solicite; Fruta sigue aplazada.

## Galería de variantes en el selector

Esta presentación inicial fue sustituida por la franja compacta descrita abajo.

Alcance aprobado tras Moti: paleta encima y galería debajo a todo el ancho del
panel central. Se muestran los diseños disponibles al elegir color: seis en
Pasajeros, uno en las demás familias. Se conservan el reparto automático en las
rutas y la respuesta inmediata antes de recibir confirmación del servidor.

- [x] Tarjetas con la misma escala/perspectiva, nombre y cantidad de variantes;
  seis/tres/dos columnas según el ancho disponible, con pie de inicio accesible.
- [x] Catálogo de IDs/etiquetas por familia, sin duplicar un modelo único ni
  presentar las composiciones como una elección fija. Textos en español e inglés.
- [x] Un solo canvas/contexto con mallas y cámara compartidas, redibujado bajo
  demanda, ejemplos estables y liberación al abandonar el selector.
- [x] Verificar galería real, cambios de color, responsive y documentación.

Contrato de presentación en [arquitectura](../architecture.md).

Verificación · 2026-11-02:

- `STATE_BACKEND=file node --test --test-concurrency=1
  tests/wagon-models.test.js tests/lobby.test.js tests/i18n.test.js
  tests/presentation-controls.test.js`: **24/24**.
- `node tests/browser-wagon-gallery.cjs`: correcto en Chrome 156.0.8078.74.
  Capturas inspeccionadas: 2048×1131 (seis columnas), 1440×900 y 768×1024 (tres),
  390×844 y 320×700 (dos). Galería a todo el ancho y sin desbordamiento horizontal.
  Verificados los 20 colores, tarjetas únicas centradas, lienzo reutilizado, ejemplos idénticos al volver al
  color, ausencia de render continuo en reposo, recarga, inglés y pestañas móviles.
  Pérdida de contexto muestra el aviso; otra selección recupera el preview; salir
  libera lienzo/tarjetas. Sin errores de consola.
- `node tests/browser-color-preview.cjs`: siete escenarios correctos de respuesta
  inmediata, clics rápidos, confirmación demorada, conflicto, desconexión, fallo de
  guardado/reintento y recarga/móvil. El aviso EISDIR pertenece al fallo de disco
  inyectado por la prueba.
- Comprobación sintáctica de los módulos cambiados, `git diff --check` y
  `node scripts/check-docs.js --base HEAD`: correctos.

El primer arranque del navegador quedó limitado por el sandbox al abrir un
puerto; se ejecutó con permisos para un servidor temporal de archivo y puerto
propios. Se corrigió un selector ambiguo del conductor QA que también encontraba
el panel, sin cambio de producto asociado. Ambos servidores se cerraron al acabar.

Evidencia regenerable ignorada en `.qa/wagon-gallery/`, incluidos `report.json`,
`lobby-2048.png` y las galerías por ancho. Implementación local terminada, sin
commit ni despliegue; no se reinició el servidor habitual. Las capturas emuladas
no certifican dispositivos físicos. Siguiente paso: integrar/publicar cuando se
solicite; las otras familias conservan un diseño hasta recibir sus variantes.

## Franja compacta de variantes

Esta versión fue sustituida por el tren de perfil y el vagón único móvil
descritos en el siguiente apartado.

Revisión aprobada tras Moti: reducir la presentación a los vagones pequeños,
seguidos en una sola fila debajo de la paleta. Se retiran tarjetas, bordes,
fondos, títulos, nombres visibles, contador y el texto explicativo. La franja
mide 78 px de alto; ocupa el ancho del panel y admite desplazamiento horizontal
si los modelos no caben. La familia con un único diseño muestra solo ese modelo.

Se conserva el canvas compartido y el reparto automático en las rutas. Las
etiquetas quedan solo como nombres accesibles, y el contenedor permite desplazarse
con el teclado. Al cambiar de familia, el desplazamiento vuelve al inicio.

Conductor actualizado: `tests/browser-wagon-gallery.cjs`; artefactos separados
en `.qa/wagon-strip/`. Los conductores anteriores comprueban ahora el nombre
accesible en lugar del título retirado.

Verificación · 2026-11-02:

- `node --test tests/lobby.test.js tests/i18n.test.js`: **9/9**.
- `node tests/browser-wagon-gallery.cjs`: correcto en Chrome 156.0.8078.74,
  sin errores de consola. En 2048, 1440, 768, 390 y 320 px los seis vagones
  permanecen en una fila de 78 px de alto, sin texto visible. En 390/320 px solo
  la franja se desplaza horizontalmente, sin desbordar la página; comprobados
  el teclado y el acceso al último vagón. Capturas de escritorio y móvil
  inspeccionadas. Los 20 colores, regreso estable al mismo color, canvas único,
  ausencia de render continuo, recarga/inglés, pérdida de contexto y limpieza
  al salir conservan sus comprobaciones.
- Sintaxis de los módulos/conductor, `git diff --check` y
  `node scripts/check-docs.js --base HEAD`: correctos. El primer intento de
  navegador agotó el plazo de revisión automática de permisos; el reintento
  autorizado terminó correctamente con servidor y archivo temporales aislados.

Implementación local terminada, sin commit ni despliegue. No se reinició el
servidor habitual y el servidor de prueba se cerró al terminar. Siguiente paso:
integrar/publicar cuando se solicite.

## Tren conectado de perfil y vagón único en móvil

La corrección posterior recupera la vista 3/4 del vagón móvil; véase el ajuste
al final de esta ficha. La vista lateral de escritorio se conserva.

Alcance aprobado tras Moti y precisado durante la implementación: escritorio
muestra las seis composiciones de Pasajeros enganchadas en un único tren de
perfil. En móvil se muestra solo un vagón, también de perfil. Las familias que
todavía tienen un único diseño siguen mostrando ese modelo. Se conservan la
franja de 78 px y la ausencia de tarjetas, bordes, textos y controles adicionales;
se retiran el desplazamiento horizontal y el foco de teclado que lo permitía.

La escena ahora contiene todos los vagones visibles y se dibuja una sola vez.
La cámara ortográfica mira recto al lateral a la misma altura; encuadra el tren
completo. Los centros separados 21,3 unidades hacen coincidir los extremos de
los enganches existentes sin modificar los modelos ni solapar carrocerías.
En móvil se conserva la primera variante estable. Los cambios entre móvil y
escritorio actualizan mallas y accesibilidad, manteniendo el canvas compartido.
Los umbrales de adaptación y los contratos están en
[arquitectura](../architecture.md).

Verificación · 2026-11-02:

- `node --test tests/wagon-models.test.js tests/lobby.test.js tests/i18n.test.js`:
  **16/16**.
- `node tests/browser-wagon-gallery.cjs`: correcto en Chrome 156.0.8078.74,
  sin errores de consola. Ocho tamaños, de 320 a 2048 px, incluyendo 600/601 px,
  móvil horizontal 844×390 y cambio de pestañas. Seis vagones en escritorio/tablet
  y uno en móvil, siempre completos y sin desplazamiento horizontal.
- El conductor inspecciona la cámara y las matrices reales dibujadas: dirección
  lateral sin elevación, cantidad correcta de enganches, extremos adyacentes en
  contacto y límites del tren dentro del encuadre. Capturas de escritorio y móvil
  inspeccionadas. Los 20 colores, canvas reutilizado, estabilidad al regresar,
  ausencia de render continuo, recarga/inglés, recuperación WebGL y limpieza al
  salir mantienen sus comprobaciones.
- Sintaxis, `git diff --check` y `node scripts/check-docs.js --base HEAD`:
  correctos. Servidor temporal de archivo y puerto propios, cerrado al terminar.

Artefactos regenerables separados en `.qa/wagon-side/`: `report.json`, vistas de
sala y recortes por ancho. Implementación local terminada, sin commit ni despliegue.
Siguiente paso: integrar/publicar cuando se solicite.

## Vista 3/4 original en móvil

Corrección aprobada tras Moti: móvil conserva un único vagón pero recupera la
cámara 3/4 original, con frente, lateral, techo y sombra de exposición. Escritorio
mantiene los seis conectados de perfil. El cambio de tamaño actualiza cámara y
encuadre; se conservan los 78 px de alto, el canvas, las variantes y la ausencia
de textos, tarjetas y desplazamiento horizontal.

`node tests/browser-wagon-gallery.cjs` correcto en Chrome 156.0.8078.74 el
2026-11-02: ocho tamaños entre 320 y 2048 px, móvil vertical/horizontal y pasos
600/601 px. Dirección de cámara y vértices reales dentro del encuadre verificados,
además del reparto de seis/uno, enganches, 20 colores, estabilidad, canvas único,
reposo, recarga/inglés, recuperación WebGL y limpieza al salir. Sin errores de
consola; capturas móviles y de escritorio inspeccionadas. La comprobación inicial
usaba esquinas vacías de la caja envolvente general; se corrigió para proyectar
los vértices reales, sin cambiar el encuadre original.

Evidencia regenerable en `.qa/wagon-mobile-three-quarter/`. Sintaxis,
`git diff --check` y `node scripts/check-docs.js --base HEAD` correctos.
Servidor temporal aislado cerrado; implementación local sin commit ni despliegue.
Siguiente paso: integrar/publicar cuando se solicite.

---
{"id":"south-america-proportions","status":"done","parent":null,"depends_on":["south-america-release"],"branch":"main","delivery":"integrated","updated":"2026-11-03"}
---
# Proporción y encuadre de Sudamérica

## Alcance

Corregir el continente excesivamente ancho y el recorte oriental de Brasil en
miniatura de sala, billetes y tablero. Ángel autorizó implementación y un
worktree independiente. Base `20c1a7b`, snapshot local que ya incorpora el mapa
de billetes 3D; no incluye cambios concurrentes posteriores de otros chats.
Worktree de origen: `trains/south-america-proportions`. Por solicitud posterior
de Ángel, el cambio se trasladó a `trains/trencitos`, rama `main`, desde el commit
`409a3f2`, preservando los cambios locales de los demás trabajos.

## Decisión visual

Las imágenes aportadas el 2026-11-03, especialmente la superposición 4 y la
referencia ilustrada 5, son la guía de proporción. No son una nueva fuente de
reglas ni una proyección cartográfica exacta. Se conservan el contorno detallado
y la estética actuales.

El layout anterior tenía una relación ancho/alto de 1,072, incluido el pequeño
fragmento de Panamá. Además, su costa llegaba a x=1856,75 pero el área de dibujo
terminaba en x=1700. La cámara existente comprime la altura con cos(π/7).

Se aplicó x×0,75 e y×1,125 a contornos, ciudades, curvas y posiciones de rótulos
marinos del archivo de layout. La relación resultante es 0,715 en la miniatura
y 0,793 en la proyección 3D; se conserva la inclinación común a los tableros.
Los límites incluyen toda la costa con margen de agua. Los datos son estáticos:
no hay transformaciones CSS ni geometrías alternativas según la pantalla.

Las casillas mantienen 22×8,5 unidades, separación y cantidad. Arica–Uyuni
(`SA056`) incorpora una curva hacia el sur para alojar sus cuatro casillas sin
colisiones. La curva de Puerto Natales–Ushuaia se transforma junto a las ciudades.
Las 46 ciudades, 101 vías, 300 casillas, 46 billetes, reglas, IDs y puntos se
conservan. La referencia del mapa sigue siendo `south-america/3.3-beta` porque
el cambio es de presentación; guardados y replays resuelven el mismo layout.

## Aceptación

- [x] Silueta vertical y costa completa en los tres consumidores del layout.
- [x] Dimensiones uniformes, vías sin casillas superpuestas ni ciudades ajenas.
- [x] Reglas y compatibilidad de Europa conservadas; partida natural de bots.
- [x] Verificación final en navegador con construcción sobre Arica–Uyuni.
- [x] Documentación y diff verificados.

## Evidencia y siguiente paso

Las pruebas de regresión están en `tests/south-america.test.js` y el recorrido
de navegador en `tests/browser-south-america-proportions.cjs`. El navegador usa
Chrome, HTTP/WebSocket reales, backend de archivo temporal y puerto aleatorio;
no usa Supabase ni producción. El móvil y la tableta son viewports emulados.

Validación local del 2026-11-03, sobre la base y cambios de esta ficha:

- [Pruebas Node](../qa/south-america-proportions/node-tests.txt): 37/37. Geometría
  de Sudamérica/Europa, identidad de reglas, presentación, contexto del motor y
  planificación de billetes. Cuatro bots finalizan naturalmente en 166 turnos.
- [Navegador](../qa/south-america-proportions/browser-report.json): Chrome
  156.0.8078.80, cero errores, viewports 1728×963, 390×844 y 768×1024. Selección
  de mapa y billetes, zoom independiente, contorno completo y alineación de las
  300 casillas SVG/Three.js; construcción real de los cuatro vagones de
  Arica–Uyuni y reconexión conservando la propiedad.
- Capturas inspeccionadas: [sala](../qa/south-america-proportions/lobby-desktop.png),
  [billetes](../qa/south-america-proportions/tickets-desktop.png),
  [tablero](../qa/south-america-proportions/board-1728.png),
  [móvil](../qa/south-america-proportions/board-390.png) y
  [curva construida](../qa/south-america-proportions/constructed-detail.png).
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  La ficha histórica de extracción de aplicación fue revisada; sus afirmaciones
  pertenecen a su revisión original y no requieren cambios por este ajuste visual.

## Integración local en main

La integración aplica únicamente el diff de `409a3f2` sobre el checkout local de
main, que conserva trabajos concurrentes sin commit. El índice de trabajo se
reconcilió conservando los enlaces de sombreado e historial. No se fusionó la
instantánea completa `20c1a7b` ni se sustituyeron archivos de otros trabajos.

Validación del conjunto local el 2026-11-03:

- [Node](../qa/south-america-proportions/integration-main/node-tests.txt): 37/37.
- [Chrome](../qa/south-america-proportions/integration-main/browser-report.json):
  recorrido completo correcto en escritorio, móvil y tableta; cero errores,
  construcción real de Arica–Uyuni y reconexión. Incluye las mejoras locales de
  sombreado e historial. Se inspeccionaron el
  [tablero](../qa/south-america-proportions/integration-main/board-1728.png) y los
  [billetes](../qa/south-america-proportions/integration-main/tickets-desktop.png).
- El código de layout y sus dos archivos de pruebas coinciden byte a byte con
  `409a3f2`. Se verificaron por SHA-256 los archivos preexistentes ajenos al cambio:
  permanecen intactos. Los dos documentos compartidos conservan sus cambios
  previos y añaden únicamente el enlace a esta ficha.
- Comprobador documental y diff pertinentes: correctos.

Integración terminada en el árbol de trabajo local de main, sin crear un commit
ni incluir los demás trabajos pendientes. Se conserva el worktree de origen.
La publicación remota y el despliegue no forman parte de esta integración.

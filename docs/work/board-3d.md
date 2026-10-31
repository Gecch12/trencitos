---
{"id":"board-3d","status":"validated","parent":null,"depends_on":["docs-system"],"branch":"experiment/threejs-board","delivery":"worktree","updated":"2026-10-31"}
---
# Tablero 3D y familia de vagones

Objetivo aceptado: Three.js como presentación oficial predeterminada; mapa plano,
vagones y estaciones 3D. Mano, cartas, paneles y etiquetas siguen HTML/SVG.
Sin física de simulador, cámara libre, cambios de reglas, auth ni pagos.
El usuario aprobó integrar en `main`; este checkpoint está validado en el worktree.

## Hitos

- [x] M1: plano cartográfico y cámara ortográfica con pan/zoom.
- [x] M2: piezas, estaciones y selección/pagos equivalentes en 2D/3D, incluido túnel.
- [x] M3: etiquetas con prioridades y sin colisiones visibles; teclado y móvil emulado.
- [x] M4: partida normal completa, reconexión, caída a 2D y rendimiento medidos.
- [x] M5: once familias inspiradas en cartas, cargas reconocibles, oro metálico,
  marca de propietario y huella compartida. Modelo/pintura/acabado independientes.
- [ ] M6: integrar código y documentos en `main`, preservando el trabajo concurrente.

## Implementación y decisiones

[Arquitectura](../architecture.md) conserva los componentes y límites;
[decisión de producto](../decisions/product-direction.md) conserva el alcance.
`syncBoard3D` entrega solo campos públicos de la vista autorizada. La red, motor,
privacidad y objetivos SVG de selección siguen siendo los existentes.

[WAGON_STYLES](../../wagon-models.mjs) es el catálogo visual por color de jugador:
no depende del color de la ruta ni de las cartas pagadas. Marrón toma troncos,
gris piedra; dorado, magenta y turquesa añaden coche de lujo, correo y bobinas.
Las cargas no tienen reglas. Todo está disponible sin cobros, sin selector nuevo.

[Renderizador](../../wagon-renderer.js): geometrías compartidas e instanciadas,
acabado de oro con reflejos de estudio procedurales, símbolos superiores y
atenuación completa al resaltar un propietario. Misma huella y altura acotada.
Render bajo demanda, DPR máximo 2, limpieza de recursos al cambiar a 2D.
3D inicia sin preferencia previa; la elección 2D/3D persiste y WebGL puede caer a 2D.

## Evidencia — 2026-10-31

Base `a85f1f4` más implementación local del experimento y vagones. Node 25.6.1,
Chrome 156.0.8078.74 / Playwright 1.64.1, Apple M1 Pro, macOS Darwin 25.5 arm64.
Servidores QA en loopback 3120/3122 con `STATE_BACKEND=file` y `.qa` propios;
sin conexiones a producción. Comandos en [operación](../operations.md).

- `npm test`: 275 correctas, 0 fallos. Incluye selección por color, amarillo
  legado, independencia del modelo/acabado y límites de geometrías.
- `QA_PORT=3120 npm run test:board3d`: correcto, sin errores de consola.
  [Informe](../qa/threejs-report.json): misma construcción/pago por UI en 2D/3D,
  estación por teclado y tejado elevado, túnel sin suplemento, pellizco, foco,
  reposo sin renders y recuperación tras pérdida inducida de contexto WebGL.
- Partida normal automatizada: 235 acciones aceptadas hasta resultados,
  4 puestos, reconexión después de 50 acciones y 144 vagones al terminar.
  Un navegador envía acciones con `act`; tres clientes independientes usan WS.
  No se fuerza el cierre. Esto no sustituye una partida humana.
- Matriz 1460×940, 768×1024 y 390×844 en zoom 0,25×/1×/6×: sin colisiones
  entre etiquetas visibles ni overflow; alineación Three/SVG con error < 1e-9 px.
- 225 vagones/15 estaciones: 21 llamadas de dibujo, 170.492 triángulos.
  Pan en 79 muestras tras calentamiento: intervalo mediano 16,7 ms / p95 16,9 ms
  en 3D; 41,0 / 42,6 ms en 2D. CPU de cámara mediana 1,8 / p95 2,3 ms en 3D.
  No mide tiempo GPU, consumo ni garantiza estos resultados en otro dispositivo.
- `node tests/browser-wagons.cjs`: once modelos renderizados, preferencia
  conservada al recargar, recursos estables tras desactivar/reactivar 3D,
  resaltado reversible. [Informe](../qa/wagons-report.json) y
  [catálogo de piezas reales](../qa/wagons-catalog.png).
- Capturas vigentes: [escritorio](../qa/threejs-desktop.png),
  [móvil emulado](../qa/threejs-mobile.png), [final](../qa/threejs-finished.png).
  Las capturas `threejs-m1`, `threejs-closeup` y `threejs-mobile-detail` pertenecen
  al prototipo anterior de piezas simples, no a esta familia de vagones.

## Límites y siguiente paso

Safari/iOS, Android físico y GPU modesta siguen pendientes en [calidad](quality.md).
También carga/paquetizado inicial (Three suma unos 2,1 MB sin comprimir), claridad
humana de vías paralelas y animación de caída de construcción: en 3D actualmente
aparecen las piezas aceptadas y su sonido. Al alejar se ocultan nombres en conflicto;
al enfocar o acercar se priorizan. La integración local no implica despliegue.

Próximo paso: promoción local autorizada a `main` y comprobación del resultado.

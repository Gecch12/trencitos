---
{"id":"board-3d","status":"planned","parent":null,"depends_on":["docs-system"],"branch":"experiment/threejs-board","delivery":"none","updated":"2026-10-31"}
---
# Experimento: tablero Three.js

Objetivo: comprobar si volumen en piezas y tablero mejora la experiencia sin
perder claridad ni alterar reglas. Solo en rama/worktree y chat dedicados.
Esta ficha en `main` es el encargo; el avance experimental se consulta en su
worktree o con `git show experiment/threejs-board:docs/work/board-3d.md`.

## Alcance aprobado

Plano con imagen del mapa, vagones y estaciones 3D. Mano privada, cartas, paneles,
diálogos y controles siguen HTML/2D. Reutilizar motor, transporte y vista privada.
Cámara ortográfica con inclinación suave, pan y zoom; sin física ni simulador.

Etiquetas HTML/SVG superpuestas, ancladas a ciudades proyectadas a pantalla.
Tamaño legible y orientación horizontal; colisiones en pantalla, prioridad a
selección/foco/destinos, líneas cortas si se desplazan, reducción de secundarias
al alejar. Evaluar `RailMap.placeLabels`; no prometer reutilización sin comprobar.
Evitar saltos al mover cámara y capturar gestos destinados al mapa.

## Hitos y aceptación

- [ ] M1: mapa y cámara; comprobar etiquetas básicas desde el primer prototipo.
- [ ] M2: vagones, estaciones y selección de rutas/ciudades reflejan la misma
  partida; una acción produce el mismo mensaje/resultado que en 2D.
- [ ] M3: ciudades densas, zoom mínimo/máximo, foco/teclado y móvil/emulación
  legibles; texto no incrustado en textura ni oculto por piezas.
- [ ] M4: partida completa, reconexión y rendimiento medido con dispositivo y
  método registrados; comparar con 2D y recomendar integrar, iterar o aparcar.

## Evidencia y siguiente paso

Diseño aprobado; Three.js aún no implementado. Preparar snapshot revisado con
cambios locales necesarios, puerto/estado propios y encargo al chat experimental.
No copiar `.env` ni conectar Supabase de producción. Conservar ruta de vuelta a
2D para comparación; no convertir resultados positivos en autorización de deploy.

Referencias: [arquitectura](../architecture.md), [operación](../operations.md),
[etiquetas Three.js](https://threejs.org/manual/pages/align-html-elements-to-3d.html),
[cámara](https://threejs.org/docs/pages/OrthographicCamera.html).

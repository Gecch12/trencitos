---
{"id":"materials","status":"idea","parent":null,"depends_on":["board-3d"],"branch":null,"delivery":"none","updated":"2026-10-31"}
---
# Materiales de piezas

Madera, mate, cromado y cobre como opciones intercambiables siguen pendientes.
El tablero 3D ya tiene materiales de pintura, cargas, metal y vidrio, y un transportador
dorado con reflejos procedurales. Modelo, pintura y acabado están separados en
[el renderizador](../../wagon-renderer.js); esto aún no es un selector de materiales.

## Hitos de definición

- [ ] Comparar material y color como dimensiones separadas en una pieza 3D.
- [ ] Mantener identificación de propietario por color/modelo con cada acabado.
- [ ] Evaluar iluminación, coste gráfico y compatibilidad con sets de ambientes.

## Evidencia y siguiente paso

La base gráfica existe en [el tablero 3D](board-3d.md). Próximo paso: comparar
acabados sobre un mismo modelo antes de definir selector y catálogo.

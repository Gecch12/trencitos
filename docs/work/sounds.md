---
{"id":"sounds","status":"idea","parent":null,"depends_on":[],"branch":null,"delivery":"none","updated":"2026-11-02"}
---
# Sonidos personalizables

Pendiente aprobado para pulir después: sonidos al desplegar/desglosar cartas y
construir. Ya existen efectos sintetizados de papel, barajado al renovar la mesa,
construcción, turno, trazos de pluma al elegir billetes y tic-tac de cuenta atrás en
[app.js](../../app.js); eso no implementa selección de packs.

## Hitos de definición

- [ ] Precisar eventos, variaciones y previsualización de un pack.
- [ ] Decidir si sonido es preferencia local o parte del ambiente compartido.
- [ ] Definir volumen/silencio, activación por gesto del navegador y coexistencia
  con animaciones/reconexión; no duplicar eventos ni revelar cartas ocultas.

La selección de billetes, los avisos de reloj y el acceso a sonido/atajo M se implementan y verifican
en [Controles de mesa y sala](table-controls.md); la preferencia de silencio
actual es local. Esta ficha conserva únicamente el futuro alcance de packs.

## Evidencia y siguiente paso

Solo idea. Inventariar eventos existentes y seleccionar un ejemplo de cartas y
otro de construcción antes de producir assets o añadir controles.

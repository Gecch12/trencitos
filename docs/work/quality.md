---
{"id":"quality","status":"planned","parent":null,"depends_on":[],"branch":null,"delivery":"none","updated":"2026-10-31"}
---
# Validación pendiente de beta

Consolidar límites de QA ya registrados sin presentar pruebas históricas como
validación del checkout actual. [Informes disponibles](../qa-index.md).

## Hitos

- [ ] Recorrido multijugador en dispositivos reales, incluyendo Safari/iOS y
  Android, con privacidad, reconexión, gestos y resultados.
- [ ] Prueba remota controlada de checkpoint/reinicio según [la guía](../RENDER_SUPABASE.md),
  cuando se aborde una entrega de despliegue; los tests actuales simulan Supabase.
- [ ] Registrar base de rendimiento para comparar el experimento 3D.

## Evidencia y siguiente paso

Hay verificaciones de Chrome y emulación en los informes de lobby/resultados.
No certifican dispositivos físicos ni estado de producción. Al preparar una
entrega, ejecutar el recorrido pertinente y registrar versión, entorno y límites.

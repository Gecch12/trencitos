---
{"id":"match-performance-isolation","status":"active","parent":"match-performance-architecture","depends_on":["match-performance-baseline"],"branch":"main","delivery":"worktree","updated":"2026-11-06"}
---
# Guardado independiente por partida

Diseño previo a la implementación de la fase 2. Una cola por sala necesita una
unidad SQL por sala: mantener el checkpoint global bajo `FOR UPDATE` conservaría
el bloqueo entre mesas aunque Node lanzara varias peticiones.

## Diseño y aceptación

- Comandos de una misma sala se ordenan; salas diferentes pueden esperar sus
  escrituras simultáneamente. Altas, bajas, cambios de sesión y operaciones que
  abarcan varias salas pasan por una barrera que espera las operaciones previas.
- Cada transacción conserva su rollback, conjunto sucio, archivo y outbox. No
  restaura ni acepta cambios de otra sala. La publicación ocurre tras el commit.
- La RPC mantiene estado, recibos e historial atómicos, versión por sala e ID
  idempotente. Un bloqueo compartido de escritor permite escrituras concurrentes;
  reclamar otro escritor toma bloqueo exclusivo y cerca al proceso anterior.
- Migración aditiva y capacidad negociada. El proceso anterior sigue usando el
  checkpoint; al regresar a él se reconstruye desde las filas actuales. No se
  pierden partidas, frames, hashes, Compromiso ni identidades al volver de versión.
- Las lecturas de directorio no publican estado candidato de otra transacción.
  Una sesión que cambió mientras esperaba no ejecuta en un agregado distinto.
- Verificación: escritura A retenida y B confirmada; mismo ID no repite eventos;
  rollback A no toca B; cambio de escritor, recuperación y regreso al protocolo
  anterior; migración ejecutada antes de activar código en producción.

## Evidencia y siguiente paso

Contrato preparado durante la validación de fase 0. Aún no implementado ni
publicado. Conservar la ruta anterior hasta completar comprobaciones y migración.

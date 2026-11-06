---
{"id":"match-performance-isolation","status":"done","parent":"match-performance-architecture","depends_on":["match-performance-baseline"],"branch":"main","delivery":"released","updated":"2026-11-06"}
---
# Guardado independiente por partida

Fase 2, diseñada antes de modificar el código. Una cola por sala necesita una
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

Implementados scheduler por sala, rollback/outbox/archivo con alcance, versiones
SQL independientes, barrera de ciclo de vida y directorio de vistas confirmadas.
La recuperación relee la sala durable y sus recibos antes de reanudar. Una
incertidumbre de una sala no pausa las otras; un conflicto de escritor sí pausa
el proceso. La ruta anterior permanece para servidores sin la capacidad nueva.

Pruebas deterministas de cola, SQL y servidor verifican independencia, rollback,
respuesta perdida, recuperación y duplicados. El [CI completo de 15636fb](https://github.com/Gecch12/trencitos/actions/runs/42283725508)
pasó 736 pruebas Node y todos los recorridos Chrome. SQL 009 aplicado antes
que el servidor, con permisos de roles comprobados; Render Live a las 15:12 Lima.
[Registro de entrega](../qa/match-performance-delivery.json).

Una partida iniciada con el checkpoint anterior recuperó la misma identidad,
cinco cartas y un robo usado. Su segundo robo dejó seis cartas sin duplicar.
El servidor reporta `persistenceMode:room`. Cuatro pares de comandos simultáneos
en dos salas propias tuvieron esperas de cola de 0,035–0,116 ms, mientras sus
RPC tardaban 99–305 ms: la sala B no esperó a la persistencia de A en la cola.
[Datos](../qa/match-performance-concurrency.json). Es concurrencia acotada, no
capacidad certificada ni fallo inyectado en producción. Las salas de prueba se
cerraron: tres salas previas conservadas, salud correcta y ninguna pausada.

Salas pausadas quedan fuera de limpieza global/caducidad de práctica; se cancelan
sus temporizadores y se conservan al reconectar hasta resolver el guardado.
El procedimiento de regreso al protocolo anterior está documentado y probado
con SQL aislado; no se provocó un rollback de despliegue ni una caída productiva.

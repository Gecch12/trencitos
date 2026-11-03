---
{"id":"modular-platform-contracts","status":"done","parent":"modular-game-platform","depends_on":["modular-platform-baseline"],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Fase 1: modelo y contratos

## Objetivo y alcance

Concretar el diseño autorizado para extraer las reglas sin cambiar Europa ni
interferir con los nuevos modelos de vagones. Esta entrega define límites,
compatibilidad y aceptación; no implementa todavía el nuevo dominio, CQRS o
repositorios. El contrato canónico está en
[modelo de partida y contratos de transición](../decisions/match-domain-contracts.md).

Trabajo realizado en
`/Users/angelaltarodri/Desktop/free/trains/worktrees/modular-game-platform`,
base `0511e264773392fb5c7d2fe6f9a996c3136bdd2c`. El usuario confirmó continuar
en este worktree el 2026-11-02. El chat de vagones mantiene su propio trabajo;
los archivos de presentación y sus cambios posteriores no se copian a esta rama.

## Hitos y aceptación

- [x] Vocabulario y límites de partida, sala, identidad, mapas, historial y presentación.
- [x] Contratos separados de mapa, reglamento, estado y composición visual;
  identidades/versiones y política para formatos antiguos/desconocidos.
- [x] Comandos, rechazos, eventos, consultas y dependencias de tiempo/azar;
  distinguir un vencimiento aceptado de una acción tardía rechazada.
- [x] Repositorios y confirmación conjunta de partida, sala, recibos e historial;
  conservar la serialización global y exclusión de escritores existentes.
- [x] Puente para API/guardados/replay actuales y alcance del primer recorrido.
- [x] Pruebas de aceptación ejecutables para construcción contra el motor existente.
- [x] Validación de pruebas y documentación registrada y revisión final del diff.

## Contraste con el código

| Fuente revisada | Hallazgo que condiciona la extracción |
| --- | --- |
| [engine.js](../../backend/engine.js): `action`, `expire`, `pay`, `block`, `next` | Las acciones pueden resolver vencimientos antes de fallar; pago, reciclado y avance son parte del contrato observable. |
| [engine.js](../../backend/engine.js): `newGame`, `newRandomGame`, `finish`, `view`, `ensureTiming` | Azar parcialmente inyectado; compatibilidad mezclada con reloj/consulta. No se puede declarar puro todo el motor actual. |
| [data.js](../../shared/data.js), [practice-planner.js](../../backend/practice-planner.js) | IDs de vías/billetes generados por posición; constantes de Europa y comparación numérica también en planificación. |
| [server.js](../../backend/server.js): `dispatch`, `persist`, `watchRecording`, acciones | Dos recorridos de persistencia: archivo síncrono y cola remota; revisión, deduplicación, observación y ACK deben seguir coordinados. |
| [durable-queue.js](../../backend/durable-queue.js), [room-store.js](../../backend/room-store.js), [supabase-store.js](../../backend/supabase-store.js) | Conservar rollback, prefijo confirmado de replay, reintento del mismo commit y exclusión del escritor. |
| [match-archive.js](../../backend/match-archive.js): `capture`, `safePublic`, `replay` | Vistas grabadas/versionadas; el filtro espectador final vive fuera de `engine.view`. Los eventos internos no reemplazan el formato de replay. |

## Evidencia

Se añadió [route-claim-contract.test.js](../../tests/route-claim-contract.test.js).
Usa la fachada actual, reloj explícito, azar controlado y el inventario completo
de cartas. Recorre todas las vías de Europa y comprueba efectos observables en
vez de exigir una organización de archivos concreta. Complementa los contratos
de túnel, reciclado, privacidad, cierre, historial y almacenamiento existentes.

Ejecución del 2026-11-02 (hora de Lima), Node `v25.6.1`, base indicada arriba más
los cambios de esta entrega:

- [Resultado reproducible](../qa/modular-platform-contracts/node-tests-result.json)
  y [salida TAP](../qa/modular-platform-contracts/node-tests.tap): **80/80** pruebas
  de los diez archivos indicados en el resultado, sin omisiones ni fallos.
- El contrato nuevo aporta ocho pruebas: sus matrices cubren 83 vías ordinarias/
  ferris en tres composiciones de pago y los 18 túneles sin suplemento, además
  de dobles, rechazos, vencimientos y disparo de última ronda.
- `node scripts/check-docs.js --base HEAD` y `git diff --check`: correctos.
  Los enlaces web/anclas y la verdad semántica no los certifica el validador;
  el contrato se revisó contra las fuentes de la tabla anterior.

La primera ejecución del archivo nuevo falló porque la fixture leía
`PLAYER_COLORS` desde `engine`, que no lo exporta. Se corrigió la fixture para
importarlo desde `data`; no se modificó el motor para hacer pasar las pruebas.

Límites: pruebas locales de motor, simulación, cola y archivo. No se ha repetido
en esta fase la suite completa ni el navegador; la evidencia de fase 0 sigue
siendo histórica. No hubo cambios de ejecución, migración de guardados, pruebas
contra Supabase real, integración del trabajo visual ni despliegue.

## Siguiente paso

Iniciar fase 2 por `payment` y `route-claim` conforme al
[primer recorrido](../decisions/match-domain-contracts.md#primer-recorrido-extraíble-y-límites-de-archivos).
Crear módulos solo al extraer código real, mantener las exportaciones de
`engine.js`, traducir errores en el puente y comparar el comportamiento por las
mismas pruebas. Añadir pruebas directas de las políticas con contexto inyectado
e IDs opacos. La resolución temporizada de túneles sigue en la fachada hasta
su propio subhito; este primer corte no cierra toda la fase 2.

La descomposición del frontend y la integración del trabajo visual corresponden
a fase 3. Integrar un checkpoint revisado de aquel trabajo antes de mover sus
archivos. No publicar en Render como parte de esta entrega.

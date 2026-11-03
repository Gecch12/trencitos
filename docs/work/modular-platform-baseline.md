---
{"id":"modular-platform-baseline","status":"active","parent":"modular-game-platform","depends_on":[],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Fase 0: base reproducible de la reorganización

Preparar la [iniciativa modular](modular-game-platform.md) con una referencia
verificable, antes de modificar comportamiento o estructura del juego.

## Alcance

Inventariar el estado real, preservar los cambios locales, aislar la ejecución,
registrar acuerdos y comprobar la base existente. Un fallo previo debe quedar
identificado; esta fase no convierte correcciones ajenas en una refactorización.

## Hitos y aceptación

- [x] Revisar instrucciones, checkout y cambios locales del origen.
- [x] Crear `codex/modular-game-platform` en un worktree independiente.
- [x] Copiar cambios locales y verificar coincidencia de todos los archivos versionados/no ignorados.
- [x] Crear snapshot local reproducible sin cambiar `main` ni su índice.
- [x] Conservar referencias del encargo y huellas de materiales de Sudamérica.
- [x] Registrar fases, decisión y enlaces mediante el método documental existente.
- [ ] Ejecutar la suite completa de Node y clasificar sus resultados.
- [ ] Ejecutar referencia de navegador/Three.js y clasificar sus resultados.
- [ ] Comprobar documentación y diff; verificar preservación final del origen.
- [ ] Dejar alcance y siguiente paso de fase 1 explícitos.

## Base observada

- Fecha de trabajo: 2026-11-02, zona del usuario America/Lima.
- Origen: `/Users/angelaltarodri/Desktop/free/trains/trencitos`, rama `main`,
  HEAD `f41e033c496395094a352bd06117bd7474a76921`.
- Se preservaron 27 archivos con cambios locales (incluidos tres nuevos) y se
  verificaron las huellas de 264 archivos del checkout.
- Snapshot: `7003904f264dac1e740cefc66fa7dd0c1c58617c`, solo en la rama de trabajo.
  Es una copia del trabajo previo, no cambios funcionales de esta iniciativa.
- Entorno: Node `v25.6.1`, npm `11.9.0`, Three.js `0.187.0`, Playwright `1.64.1`,
  PGlite `0.5.14`. Dependencias copiadas localmente a un `node_modules` propio,
  sin modificar las del origen ni instalar nuevas versiones.
- No se copian `.env`, credenciales, estados de salas ni configuración privada.
  Las pruebas usan entorno limpio, backend de archivo y fixtures locales;
  los escenarios Supabase/OAuth de la suite son dobles de prueba.

## Evidencia

Primera comprobación documental antes de esta iniciativa: `node scripts/check-docs.js`,
correcta (40 documentos, 16 fichas).

La primera ejecución de la suite dentro del sandbox se interrumpió al detectar
restricción de sockets. Una comprobación mínima de `listen(0, '127.0.0.1')`
confirmó `EPERM`. Este resultado describe permisos del entorno, no una regresión
del juego. Se repite la suite con permiso para loopback.

Inventarios: [checkout de origen](../qa/modular-platform-baseline/source-manifest.json)
y [28 archivos del paquete y referencia visual](../qa/modular-platform-baseline/input-manifest.json).
El paquete original se conserva sin cambios y tiene copia local verificada bajo
`.qa/architecture-baseline/inputs/`; esa copia no se publica ni se integra al motor.
La imagen de cruces se conserva en `docs/references/` para evitar depender del
archivo temporal del chat.

Primera suite completa con loopback: 372 pruebas, 371 correctas y un fallo,
`toast is not defined` en `tests/mobile-ui.test.js`. El contexto VM de la prueba
no incluía el aviso que ya usa `toggleDestinationHighlight`; la función real
`toast` sí existe en `app.js`. [Resultado](../qa/modular-platform-baseline/node-tests-before-fixture-result.json)
y [salida completa](../qa/modular-platform-baseline/node-tests-before-fixture.tap).

Primera ejecución de `QA_PORT=0 npm run test:board3d`: los escenarios de tablero
previos a la partida completa se ejecutaron; el conductor falló con
`No action at tunnel` al pedir acción durante una etapa temporizada. El bot
devuelve correctamente `null` mientras `tunnelBusy` es verdadero.
[Resultado de ejecución](../qa/modular-platform-baseline/browser-before-fixture-result.json),
[salida](../qa/modular-platform-baseline/browser-before-fixture.txt) e
[informe del recorrido](../qa/modular-platform-baseline/browser-before-fixture/threejs-report.json).

Correcciones acotadas a los conductores de prueba, sin modificar código del juego:

- Incorporar `toast` al contexto simulado de la prueba móvil.
- Hacer que la partida automática de navegador espere la vista autorizada durante
  revelación/resultado del túnel. Usa el reloj real del servidor, sin forzar
  vencimientos ni omitir la prueba de partida completa.

Prueba móvil tras corregir el contexto: `node --test tests/mobile-ui.test.js`,
10 correctas, cero fallos. Falta repetir suite completa y navegador con estos
conductores. Las capturas históricas de otras tareas no son evidencia de esta base.

## Límites

No se certifica Render, Supabase real, dispositivos móviles físicos ni la versión
publicada. Una prueba de navegador con viewport móvil es emulación. El checkout
de trabajo parte de cambios que todavía no están integrados en `main`.

## Siguiente paso

Completar pruebas, registrar fallos previos si existen y verificar el origen.
Después desarrollar la fase 1 indicada en la ficha principal.

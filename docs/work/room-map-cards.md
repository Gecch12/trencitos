---
{"id":"room-map-cards","status":"done","parent":null,"depends_on":["south-america-release"],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Lobby: mapas visuales y vagón compacto

## Alcance

Reorganizar el lobby siguiendo la referencia de Colonist aportada por Ángel:
mapas en tarjetas, configuración agrupada y personalización compacta. Mantener
la identidad de Trencitos, los tres mapas y permisos existentes. No cambia reglas,
contratos de WebSocket, modelos ni decisiones de backend.

## Aceptación

- [x] Europa, Sudamérica Beta y Laboratorio Pruebas en una fila propia; selección
  confirmada por servidor, teclado y tarjetas desplazables en móvil.
- [x] Configuración y tiempos agrupados; modo Clásico compacto e inicio fijo.
- [x] Un vagón estable con nombre, detalle bajo demanda y seis variantes en un
  canvas; cierre y comienzo de partida liberan recursos.
- [x] Dos clientes reales: elección autorizada, invitado de solo lectura, guardado,
  recarga y comienzo con Sudamérica. ES/EN y escritorio/móvil sin overflow.
- [x] Regresión del preview y documentación completa; integración y publicación
  registradas al terminar en producción.

## Evidencia

Base `933a0fb`. Servidores locales aislados con `STATE_BACKEND=file`, estado temporal,
puerto asignado por el sistema y autenticación desactivada. Sin tocar producción.
`node --test tests/deployment.test.js tests/map-selection-server.test.js tests/lobby-server.test.js tests/wagon-models.test.js`: 28/28.
[Recorrido de lobby](../qa/room-setup/report.json): Chrome, anfitrión e invitado,
selección/guardado/recarga, teclado, modal, móvil y partida en el mapa elegido.
El test fuerza el clic en la tarjeta bloqueada para comprobar que el manejador
no envía cambios; el control conserva `aria-disabled` para usuarios y asistentes.

## Siguiente paso

Entrega publicada. Ajustes posteriores se basarán en las pruebas de uso de Ángel.
El código de backend solo añade los dos recursos estáticos nuevos.

## Validación final

[Suite Node](../qa/room-setup/node-result.json): 633/633.
[Preview](../qa/room-setup/preview/report.json): 21 familias, ocho tamaños de pantalla
(320–2048 px), geometría real dentro de cámara, retorno estable al color, sin
bucle de renderizado en reposo, pérdida/recuperación de WebGL y liberación al salir.
El [recorrido del lobby](../qa/room-setup/report.json) comprueba además la tarjeta
seleccionada visible tras recargar en móvil y el inicio real en ambos clientes.
Capturas: [escritorio](../qa/room-setup/desktop.png), [móvil](../qa/room-setup/mobile.png),
[colección](../qa/room-setup/collection-desktop.png) y
[colección móvil](../qa/room-setup/collection-mobile.png).

## Entrega

Código `8146ffa` en `origin/main`; Render Live el 2026-11-03 a las 09:23:30 Lima.
El checkout local de `main` recibió ediciones concurrentes de otro trabajo durante
la validación. Se preservaron intactas y se publicó directamente desde esta rama
a `origin/main` con avance normal, sin stash, reset ni incluir código ajeno.
Ese checkout local se reconcilió en `e9cb403`, conservando las mejoras de cartas;
la [consolidación](workspace-consolidation.md) registra el resultado y
[producción](../production.md) conserva la revisión efectivamente publicada.

La comprobación remota confirmó 45 recursos idénticos y siete rutas privadas
con 404. En Chrome se creó una sala privada de QA, se eligió Sudamérica por
tarjeta y su colección de variantes; cierre normal y sin
errores de consola. [Captura publicada](../qa/room-setup/production-desktop.png).

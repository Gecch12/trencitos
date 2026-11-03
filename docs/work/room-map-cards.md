---
{"id":"room-map-cards","status":"validated","parent":null,"depends_on":["south-america-release"],"branch":"main","delivery":"worktree","updated":"2026-11-03"}
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
- [x] Ajuste posterior: modal compacto, seis Pasajeros enganchados en una fila,
  scroll solo horizontal en su franja y título/cierre siempre visibles.

## Evidencia

Base `933a0fb`. Servidores locales aislados con `STATE_BACKEND=file`, estado temporal,
puerto asignado por el sistema y autenticación desactivada. Sin tocar producción.
`node --test tests/deployment.test.js tests/map-selection-server.test.js tests/lobby-server.test.js tests/wagon-models.test.js`: 28/28.
[Recorrido de lobby](../qa/room-setup/report.json): Chrome, anfitrión e invitado,
selección/guardado/recarga, teclado, modal, móvil y partida en el mapa elegido.
El test fuerza el clic en la tarjeta bloqueada para comprobar que el manejador
no envía cambios; el control conserva `aria-disabled` para usuarios y asistentes.

## Siguiente paso

El ajuste del modal está implementado y validado localmente en `main`, sin commit
ni publicación. Su entrega puede incorporarse al próximo despliegue autorizado.
La entrega anterior está documentada abajo.

## Ajuste del modal · 2026-11-03

Base `63f404a` más cambios locales. Se preservaron las ediciones ajenas de los
billetes iniciales. La galería sustituye las filas por un tren continuo, fija el
tamaño CSS del canvas independientemente de DPR y encuadra la geometría completa.
La franja usa scroll horizontal nativo, recibe foco para desplazarse con teclado
y reinicia al primer vagón al abrir. Las etiquetas accesibles quedan dentro de
sus límites; no producen un píxel adicional de overflow vertical.

Evidencia regenerable, ignorada por Git:

- `node tests/browser-wagon-collection.cjs`: Chrome 156.0.8078.80, servidor de
  archivo temporal en loopback. Doce combinaciones de seis viewports (320–1440 px,
  incluidos móviles apaisados) y DPR 1/2: geometría de seis vagones en una fila,
  acoples, primer/último vagón alcanzables, teclado, cierre/Escape y recuperación
  de foco. Gesto táctil emulado y cambio de orientación con el diálogo abierto.
  Las otras 19 familias caben sin scroll artificial; cero errores de consola.
  Capturas e informe en `.qa/wagon-collection/`, inspeccionados visualmente en
  escritorio y móvil. No constituye una prueba en dispositivo físico.
- `node tests/browser-wagon-gallery.cjs`: regresión de miniatura del lobby,
  ocho viewports, 20 familias activas, estabilidad, ES/EN, pérdida de contexto y
  liberación de recursos; sin errores. Informe en `.qa/wagon-compact-preview/`.
- `node --test tests/wagon-models.test.js`: 8/8. `node scripts/check-docs.js`,
  revisión de impacto con `--base HEAD` y `git diff --check`: correctos.

## Validación de la entrega anterior

[Suite Node](../qa/room-setup/node-result.json): 633/633.
[Preview](../qa/room-setup/preview/report.json): 21 familias, ocho tamaños de pantalla
(320–2048 px), geometría real dentro de cámara, retorno estable al color, sin
bucle de renderizado en reposo, pérdida/recuperación de WebGL y liberación al salir.
El [recorrido del lobby](../qa/room-setup/report.json) comprueba además la tarjeta
seleccionada visible tras recargar en móvil y el inicio real en ambos clientes.
Capturas: [escritorio](../qa/room-setup/desktop.png), [móvil](../qa/room-setup/mobile.png),
[colección](../qa/room-setup/collection-desktop.png) y
[colección móvil](../qa/room-setup/collection-mobile.png).

## Entrega anterior

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

---
{"id":"replay-experience","status":"done","parent":"history-replay","depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-03"}
---
# Replay ligero y presentación de partida

Ángel autorizó implementar la simplificación revisada con Moti, reutilizar los
paneles y las animaciones del juego y verificar exclusivamente en local. Los
destinos deben usar ✓/✕ sin repetir etiquetas. No se ha publicado ni accedido a
producción. Cambios locales preexistentes de otros chats conservados.

## Aceptación

- [x] Primer estado disponible durante la descarga, sin análisis estadístico
  obligatorio ni repetición del diario por cada POV.
- [x] Cursores incrementales e índice de filas modificadas; historial con nodos
  estables y reproducción/seeking sobre los mismos estados archivados.
- [x] Avatar normal de persona/robot como selector de jugador; mercado, mano,
  destinos y paneles móviles compartidos con la partida.
- [x] Retirados selector de perspectiva/acción, hitos/saltos especiales,
  estadísticas, diálogo de secretos y enlace de auditoría de la interfaz.
- [x] Robos visibles/ocultos, vuelos rivales, renovación y construcciones usan
  los efectos existentes. Velocidad, pausa, cancelación y movimiento reducido
  verificados. La mano suma las cartas al aterrizar.
- [x] Mano inicial con cartas y listado único de destinos, puntos y ✓/✕;
  información faltante en grabaciones antiguas no se inventa.
- [x] Compatibilidad JSON/auditoría, permisos y privacidad en vivo preservados;
  stream interrumpido muestra error y reintento.

## Evidencia local

Grabación de 263 pasos indicada por el usuario, leída sin modificarla:

| Medida | Antes | Después |
| --- | ---: | ---: |
| Respuesta | 31.416.783 bytes | 6.466.716 bytes |
| Proyección completa en Node 22.22.0 | 6.310 ms | 1.738 ms |
| Primer frame de la proyección | Tras preparar todo en el cliente anterior | 3,5 ms |
| Reconstrucción para indexar en Node | 1.227 ms | 56 ms |

Son mediciones locales puntuales, no una garantía de producción. En Chrome
156.0.8078.80 el primer estado visible de esa grabación tardó aproximadamente
0,69–0,80 s en las comprobaciones; no espera a terminar de descargar. Evidencia y capturas en
`.qa/replay-experience/` (excluida de Git).

- 60/60 pruebas Node pertinentes: archivo, privacidad, definición histórica,
  streaming/compatibilidad, consulta, HTTP y eventos de cartas. La prueba HTTP
  se repitió después de añadir comprobaciones NDJSON y acceso privado: 2/2.
- `browser-replay-analysis.cjs`: carga progresiva reteniendo el resto de la
  respuesta, grabación real, efectos, pausa, 4×, movimiento reducido, historial
  sin duplicación y sin reemplazar filas estables, móvil e interrupción.
- `browser-map-replay.cjs`: 4 combinaciones de grabación antigua/actual y acceso
  participante/público, incluyendo apertura directa en móvil. Se corrigió una
  consulta a la ayuda de mano después de que el layout móvil la moviera.
- `browser-card-ui.cjs`: 4 grupos de regresión de la partida en vivo, incluidos
  privacidad, robos, renovación, reconexión y pagos; sin errores de navegador.
- Validación documental y `git diff --check` correctos.

## Entrega y siguiente paso

Implementación local en `main`, sin commit ni publicación. La instancia existente
en localhost:3000 tiene una partida activa: no se reinició durante la validación.
Para adoptar la nueva descarga en esa instancia habrá que reiniciarla al terminar
la partida. Se dejó una vista revisable en localhost:3179 con una copia separada
de esa grabación cerrada en `.qa/replay-experience/preview/`. Las pruebas usaron
puertos y guardados temporales independientes.
Contrato canónico en [historial/replay](../history-replay.md).

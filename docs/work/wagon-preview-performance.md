---
{"id":"wagon-preview-performance","status":"validated","parent":"board-3d","depends_on":[],"branch":"main","delivery":"released","updated":"2026-11-02"}
---
# Respuesta del selector de vagones

Problema: cada selección esperaba el guardado síncrono de salas más todo el
historial local. Volver a un color conocido repetía el trabajo, aunque el canvas,
geometrías y materiales de Three ya se reutilizaban. Implementación integrada en
`main` y publicada; se conservó la separación de archivos que ya estaba
modificada al iniciar esta implementación.

## Alcance

- [x] Previsualización y selección visibles al pulsar; una solicitud en vuelo y
  solo la última elección pendiente. Una respuesta antigua no sustituye el preview.
- [x] Perfil/preferencia persistida y miembros usan solo colores confirmados.
  Rechazos, pérdida de conexión y fallo de guardado restauran el estado confirmado;
  un rechazo anterior conserva una elección posterior. Inicio espera confirmación.
- [x] Guardado local con pasos anexados por partida y manifiesto pequeño; migración
  del formato anterior y recuperación coherente desde backup, sin pérdida de pasos.
  Un archivo de pasos ausente no se interpreta como almacenamiento nuevo vacío.
- [x] Pruebas de almacenamiento, WebSocket, historial y recorrido en Chrome.

Contratos: [arquitectura](../architecture.md), [almacenamiento](../history-replay.md)
y [respaldo/reinicio](../operations.md). El backend Supabase no cambia.

## Evidencia local · 2026-11-02

- 17/17 pruebas de `room-store` y `match-archive`; 9/9 de `lobby-server` e
  `history-server`. Migración, prefijos confirmados, cola de escritura fallida,
  backup, archivo ausente/truncado, no serializar pasos previos, colores únicos,
  recuperación tras reinicio y permisos de replay.
- `node tests/browser-color-preview.cjs`: siete escenarios correctos en Chrome
  156.0.8078.74, con servidor de archivo y sesiones aisladas. Entrega de WebSocket
  controlada para comprobar respuesta antes de confirmar, clics rápidos, volver a
  un color, conflictos entre jugadores, rechazo de elección anterior, desconexión,
  error de disco/reintento, recarga y móvil 390×844; sin errores de consola.
  Captura móvil inspeccionada. Artefactos regenerables ignorados: `.qa/color-preview/`.
- Copia temporal del historial local: 5 partidas/417 pasos, 36.759.793 bytes.
  Igualdad completa del archivo tras migrar. Cinco guardados con el escritor de
  `HEAD` frente al nuevo: medianas **549,1 ms → 14,4 ms**; manifiesto de **16.591
  bytes**. Migración inicial 306 ms. Es una medición local de persistencia, no
  latencia total del clic ni garantía en otros discos. El archivo real no se migró.
- Suite completa en copia temporal de `HEAD` más los cambios del selector y
  almacenamiento: **345/345**, 73 s (`node --test --test-concurrency=1 tests/*.test.js`).
  La ejecución previa sobre la carpeta compartida dio 312/345, con 33 fallos de
  túneles, bots y resultados que estaban cambiando en paralelo. Se preservaron
  esas ediciones; la regresión aislada verifica este alcance, no certifica la
  combinación final de los trabajos concurrentes. Log y parche aislado conservados
  en `.qa/color-preview/`.
- `node scripts/check-docs.js --base HEAD`, comprobación sintáctica y
  `git diff --check`: correctos. Los avisos de otras fuentes concurrentes quedan
  sujetos a la revisión de esos frentes.

## Siguiente paso

Regresión integrada completada y revisión publicada. Recargar producción para
recibir el selector actualizado. El escritor local requiere reiniciar su proceso
al terminar la partida activa; no se reinició el proceso del usuario.

## Entrega en producción · 2026-11-02

Publicado en `main` y Render con el commit `f4584c9`; **Live** a las 06:38:26
(Lima). La combinación final pasó 353/353 pruebas y los recorridos Chrome de
túneles y flujo. La verificación remota confirmó archivos idénticos, UI 8,
práctica con bots, resultados, historial anterior y salud de Supabase.
Evidencia y límites en [Producción](../production.md).

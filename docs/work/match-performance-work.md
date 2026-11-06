---
{"id":"match-performance-work","status":"done","parent":"match-performance-architecture","depends_on":["match-performance-baseline"],"branch":"main","delivery":"released","updated":"2026-11-06"}
---
# Trabajo por jugada

Fase 1. En las primeras seis trazas productivas de `5a57127`, historial consumió
9–27 ms y el guardado remoto 143–190 ms; ambas medidas se solapan con sus padres.
La espera en cola fue menor de 0,1 ms en esta muestra sin carga simultánea.

## Hitos y aceptación

- [x] Identificar trabajo repetido en el recorrido medido: las proyecciones ya
  poseen sus objetos y se volvían a clonar al redactar el observador/grabar.
- [x] Recorrer diferencias de replay una vez por árbol, evitando serializar de
  nuevo cada subárbol a cada nivel. Preservar el formato de patches y aplicación.
- [x] Validar privacidad, propiedad de objetos, replay, CI y versión productiva.
- [x] Comparar la medición bajo el mismo método; no presentar costes de CI como
  latencia del servidor ni prometer eliminar el viaje a la base de datos.

La siguiente fase separa copias y guardado por sala. No se cambia la estrategia
de bots ni se elimina historia para obtener una cifra menor. La RPC sigue siendo
la suma de red y SQL; esta entrega no atribuye su coste al trigger estadístico.

Validación de código: 30 comprobaciones de proyecciones, privacidad, archivo,
patches y replay correctas. No son mediciones de rendimiento productivo. El CI de `43e375e` pasó Node y los primeros recorridos Chrome, pero agotó
sus 20 minutos tras una instalación de Chrome de más de diez minutos
([ejecución](https://github.com/Gecch12/trencitos/actions/runs/42277663209)).
No se publicó ese commit aislado. El CI siguiente validó conjuntamente fases 1–4 con límite de 30 minutos y
todas las pruebas. La comparación y el ajuste posterior se detallan abajo.

## Ajuste adicional tras medir la entrega

`15636fb` está publicado. En 16 robos, captura mediana baja de 9,14 a 0,81 ms,
ejecución de 26,09 a 14,74 ms y RPC de 159,87 a 109,47 ms. Clic→estado todavía
es 566,45 ms de mediana (antes 624,55). No se atribuye la diferencia residual
a Render ni a la red sin medirla. La vista repite rutas e historial: mediana
25.795 caracteres por mensaje, hasta 33.567. Evidencia intermedia en
[comparación](../qa/match-performance-comparison.json).

Siguiente hito, definido antes de implementarlo: protocolo incremental optativo
de vistas ya autorizadas, después del commit. Conservar snapshot completo en
conexión nueva, cambio de sala/puesto y recuperación; secuencia de transporte
independiente de la revisión de juego, que puede repetirse en vistas de reloj.
Cliente anterior recibe el protocolo anterior. Un hueco de secuencia obliga a
reconectar, nunca aplicar un delta sobre otro estado. La caché no comparte vistas
entre jugadores y se mantiene separada de objetos que modifica la UI.

Aceptación: reconstrucción exacta con adiciones/eliminaciones/arrays, privacidad,
rollback sin adelantar caché, sala nueva con revisión menor, dos estados antes
del ACK, reconexión y suite Chrome. Publicar solo tras CI y repetir las 16
interacciones para comprobar el beneficio real, sin prometer que menos bytes
eliminen el coste de SQL o el RTT.

Implementación incremental `271516e`: 741/741 Node correctas, 16 recorridos de
cartas y el recorrido de transporte Chrome correctos, incluida recuperación
real de una nueva vista tras una secuencia inválida en el entorno aislado.
El recorrido quedó en CI mediante `d4de3ae`; [ejecución completa aprobada](https://github.com/Gecch12/trencitos/actions/runs/42289041784),
741/741 Node y todos los recorridos Chrome. Publicado a las 15:43:35 Lima.
La [comparación final](../qa/match-performance-results.md) registra captura
mediana 0,68 ms, ejecución 11,33 ms, mensajes de 6.394 caracteres y clic→estado
390,05 ms. Dieciséis deltas, cero errores y reconexión exacta. El alcance de
reducción/validación está entregado; las metas p95 pendientes permanecen
explícitas en la iniciativa y no se declaran cumplidas.

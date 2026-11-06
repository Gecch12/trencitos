---
{"id":"match-performance-work","status":"active","parent":"match-performance-architecture","depends_on":["match-performance-baseline"],"branch":"main","delivery":"worktree","updated":"2026-11-06"}
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
- [ ] Validar privacidad, propiedad de objetos, replay, CI y versión productiva.
- [ ] Comparar la medición bajo el mismo método; no presentar costes de CI como
  latencia del servidor ni prometer eliminar el viaje a la base de datos.

La siguiente fase separa copias y guardado por sala. No se cambia la estrategia
de bots ni se elimina historia para obtener una cifra menor. La RPC sigue siendo
la suma de red y SQL; esta entrega no atribuye su coste al trigger estadístico.

Validación de código: 30 comprobaciones de proyecciones, privacidad, archivo,
patches y replay correctas. No son mediciones de rendimiento productivo. Sigue
pendiente el CI completo y la entrega/comparación en Render.

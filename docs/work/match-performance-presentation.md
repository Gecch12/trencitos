---
{"id":"match-performance-presentation","status":"active","parent":"match-performance-architecture","depends_on":["match-performance-baseline"],"branch":"main","delivery":"worktree","updated":"2026-11-06"}
---
# Presentación de cartas confirmadas

Fase 3, contrato previo al cambio. La referencia productiva confirma un giro de
aproximadamente 200 ms después de recibir el color oculto y 37–57 ms para la
reposición visible. La carta elegida permanece translúcida hasta la respuesta.

## Hitos y aceptación

- [x] Retirar la cara elegida al clic y mostrar un espacio neutro pendiente;
  no representar una carta futura ni enviar otra jugada sobre ese espacio.
- [x] Incorporar mano/color confirmados al recibir el estado sin esperar el
  aterrizaje o giro. El vuelo puede continuar, sin retrasar la información.
- [x] Mantener preselección de segunda carta, rechazos, renovación, reconexión,
  movimiento reducido y la reproducción histórica con sus animaciones.
- [ ] Comprobar privacidad y ausencia de duplicados en CI; repetir medición
  productiva, con objetivo recepción→información <50 ms y límites registrados.

No se predice el orden del mazo ni se confirma antes del guardado. Una animación
del replay conserva su propósito narrativo; el estado en vivo debe informar al
jugador en cuanto el servidor haya confirmado el resultado.

Los 16 escenarios Chrome de corrección pasan con el estado confirmado visible
sin esperar al vuelo y el hueco pendiente sin imagen. Falta comparación productiva.

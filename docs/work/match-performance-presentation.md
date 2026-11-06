---
{"id":"match-performance-presentation","status":"done","parent":"match-performance-architecture","depends_on":["match-performance-baseline"],"branch":"main","delivery":"released","updated":"2026-11-06"}
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
- [x] Comprobar privacidad y ausencia de duplicados en CI; repetir medición
  productiva, con objetivo recepción→información <50 ms y límites registrados.

No se predice el orden del mazo ni se confirma antes del guardado. Una animación
del replay conserva su propósito narrativo; el estado en vivo debe informar al
jugador en cuanto el servidor haya confirmado el resultado.

Los 16 escenarios Chrome de corrección pasan con el estado confirmado visible
sin esperar al vuelo y el hueco pendiente sin imagen. Publicado y comparado en `15636fb`.

Borde de estado anterior al ACK: la prueba Chrome reprodujo la reaparición
temporal de la segunda carta elegida. `reservedIndexes` conserva el hueco neutro
según la vista confirmada, también si el agotamiento desplaza índices. Seis
pruebas de intención y los 16 escenarios Chrome pasan después del ajuste;
la aserción nueva falla con la implementación anterior. El CI completo de `15636fb` pasó antes de publicar.


Comparación real: recepción→color oculto mediano 46,7 ms frente a 201,7 ms.
Los 16 robos y cuatro altas de bots no produjeron errores. La información ya no
espera un giro/aterrizaje; el máximo recepción→visible fue 59 ms. La meta de
<50 ms en todos los casos aún no se acredita en este navegador, y no se oculta
esa diferencia. [Mediciones](../qa/match-performance-comparison.json).

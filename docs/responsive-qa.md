# Verificación responsive — 31 de octubre de 2026

Implementación local inspirada en la distribución móvil de referencia: jugadores
siempre arriba, mano siempre abajo, mapa central y paneles temporales. En tablet
los paneles ocupan el lateral; en teléfono se superponen sin reducir el mapa a una
miniatura. No se modificaron las reglas ni los plazos de las partidas.

## Entorno y alcance

- Chrome con tamaños de viewport emulados; eventos táctiles para pellizco y swipe.
- Servidor WebSocket real aislado en localhost:3011, con almacenamiento temporal
  en disco. No se usaron ni modificaron las partidas de Render/Supabase.
- Sala privada real de dos participantes, con identidades separadas, y fixtures
  de cinco jugadores para estados difíciles de alcanzar manualmente.
- Los fixtures visuales arrancan con diez minutos para permitir inspeccionarlos.
  Ese reloj de laboratorio aparece en las capturas; producción conserva 60 s.
- No es una certificación de Safari/iOS ni de dispositivos físicos. Queda esa
  comprobación, incluyendo teclado real, áreas seguras y sonido bajo las políticas
  del navegador. La revisión visual se realizó en local, no como prueba de carga
  del servicio de Render.

## Matriz visual

| Viewport | Comprobación |
| --- | --- |
| 320 × 568 | Cabecera sin solapamiento, robos 3 × 2, mano/nav accesibles, selección inicial y nuevos billetes con confirmación visible |
| 360 × 740 | Túnel: evidencia desplazable y acciones de pagar/desistir visibles |
| 390 × 844 | Cinco jugadores, mano horizontal, robos, construcción, estación, destinos y resultados |
| 430 × 932 | Sin desbordamiento horizontal; mano/jugadores permanecen visibles |
| 844 × 390 | Distribución horizontal; panel lateral desplazable y navegación visible |
| 768 × 1024 | Panel lateral, cinco jugadores y mano; etiquetas del mapa fuera del panel |
| 1024 × 768 | Panel lateral, billetes, resultados y rotación sin perder selección |
| 1440 × 900 | Se restaura la distribución de escritorio, sin duplicar controles |

Los ocho tamaños terminaron sin desbordamiento horizontal de la página y con
una única instancia de la mano y de los controles de robo.

## Procedimientos verificados

- Crear una sala privada, unirse desde otro participante e iniciar la partida.
- Elegir billetes iniciales simultáneamente, partiendo de cero seleccionados;
  confirmar el mínimo y comenzar el turno.
- Robar una carta visible y otra del mazo: mano 44 → 45 → 46 y cambio de turno.
- Construir Dieppe–Brest: pago de dos cartas (44 → 42) y ruta propia. Sin botón
  de construir en ruta ocupada ni durante el turno ajeno.
- Construir una estación en Paris: mano 44 → 43 y estaciones 3 → 2.
- Túnel pagable: pago base más suplemento, mano 6 → 2, ruta adjudicada.
- Túnel no pagable: pagar deshabilitado; desistir conserva las tres cartas y
  termina el turno.
- Nuevos billetes: cero seleccionados, confirmar bloqueado hasta elegir; mirar
  destinos anteriores no los confunde con los nuevos. Conservar uno añade un
  destino (8 → 9).
- Ver destinos, desmarcar uno y rotar tablet → móvil: selección 7/8 conservada,
  mapa y botón de retorno accesibles.
- Pellizco real emulado: zoom 100 % → 200 %, sin abrir accidentalmente una ruta.
- Swipe de la mano: scroll horizontal 4 → 128 px, sin desplazar el mapa.
- Pulsar un jugador: nombre completo, puntos, vagones y estaciones disponibles.
- Historial: abre en lo más reciente; barra visible si desborda, navegación
  al principio/final, conserva la posición al cambiar de panel.
- Resultados: cinco puestos, desglose desplazable, inspeccionar un destino en
  el mapa y volver al desglose conservando su estado.
- Menú de sesión accesible en 320 px; consola sin errores/avisos en la revisión final.

## Comprobaciones automatizadas

`npm test`: 173 pruebas. Incluye reglas, pagos, sesiones/reconexión, persistencia,
simulaciones completas de 2–5 jugadores, entrega de responsive.css y pruebas nuevas
de encuadre/pellizco. También se comprueban sintaxis JavaScript y `git diff --check`.

Antes de publicar se retiró por completo la barra de zoom (−, porcentaje, + y
Encajar), también sus estilos y manejadores. Se volvió a comprobar el pellizco
en 390 × 844 y la rueda en escritorio: el mapa sigue ampliándose, sin menús
accidentales ni errores en consola. Una prueba de regresión evita reintroducir
referencias a los controles retirados. Las capturas corresponden a esta revisión.

## Reproducir los estados visuales

```sh
PORT=3011 node tests/helpers/responsive-preview.js
```

El helper imprime enlaces con identidades desechables para juego, construcción,
estaciones, billetes iniciales/nuevos, túneles y resultados. No se importa ni se
sirve en producción. El proceso usa un directorio temporal nuevo en cada inicio.

## Capturas

- [Móvil de 390 × 844](qa/mobile.png)
- [Tablet de 1024 × 768](qa/tablet.png)

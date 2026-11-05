# Iconografía de Trencitos

La familia original está en [shell-icons.js](../frontend/shell-icons.js).
`ShellIcons.svg` genera SVG sin dependencias: viewBox 32×32, trazo 1.8,
extremos/uniones redondos y `currentColor`; `.icon-accent` aplica el acento cálido.
No sustituir estos símbolos por emojis o variantes de otras bibliotecas.

| Clave | Uso y significado |
| --- | --- |
| `routes` | Vías: puntos por tramos ocupados, no cantidad de destinos |
| `ticket` | Billete: puntos por destinos; puede ser negativo |
| `station` | Estación: puntos por estaciones sin utilizar |
| `express` | Vía continua con distintivo: bono del camino más largo |
| `trophy` | Puntuación total |
| `ticket-add` | Pedir nuevos destinos; signo más separado del billete |
| `flag` | Consultar destinos propios; badge completados/conservados |
| `history` | Historial de movimientos, sin contador permanente |

`scoreHeader` comparte significado y ayudas entre historial y resultados. El
icono visible mide 22 px y su control 44 px; los números conservan tamaño legible
y alineación tabular. `mount` habilita explicación por tap, foco y hover;
Escape, pérdida de foco o desplazamiento la cierran. Los SVG decorativos llevan
`aria-hidden`, los controles tienen nombres traducidos. No depender solo del color.

Conservar el estado deshabilitado de acciones fuera de turno. La fracción de
destinos procede únicamente de billetes conservados y progreso autorizado del
servidor; no incluye ofertas sin confirmar ni información rival. El acceso al
historial no muestra cantidad de movimientos; el control interno para volver a
movimientos nuevos permanece disponible al consultar entradas anteriores.

`scrollTrack` acompaña tablas con desbordamiento; se sincroniza con el scroll
nativo, acepta teclado y no desaparece por las preferencias de scroll de iOS.
Se oculta si la tabla cabe. Sus observadores se liberan al reemplazar la vista.

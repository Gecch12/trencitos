# Iconografía de Trencitos

La familia original está en [shell-icons.js](../frontend/shell-icons.js).
`ShellIcons.svg` genera SVG sin dependencias: viewBox 32×32, trazo 1.8,
extremos/uniones redondos y `currentColor`; `.icon-accent` aplica el acento cálido.
No sustituir estos símbolos por emojis o variantes de otras bibliotecas.

El chat amplía la familia en [chat-art.js](../frontend/chat-art.js): seis dibujos
SVG originales de 64×64 para me gusta, corazón, risa, sorpresa, tristeza y
aplausos. Comparten contorno azul petróleo, amarillo cálido, coral y azul suave;
no dependen del dibujo Unicode del dispositivo. Los códigos de reacción siguen
siendo los mismos y los nombres accesibles se traducen. Incluye carita con `+`,
altavoz, silencio y miniaturas de vías paralelas, con significado distinguible
por la forma además del color. El [contrato del chat](room-chat.md) describe
cuándo aparecen y qué acciones permiten.

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
| `map-center` | Mira: recuperar el encuadre del mapa completo |
| `fullscreen` | Pantalla completa del navegador; oculto en la app nativa |

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

El botón de resaltado conserva el símbolo de extremos unidos, sin interruptor.
Al conservar billetes emite arcos dorados: una oleada desde las cuatro esquinas
y otra desde el centro de los cuatro bordes, que se expanden y desvanecen sin
mover el botón. Continúan hasta el primer clic, toque o uso de H en esa partida.
Se recuerda por partida y puesto en el navegador; recargar o reconectar no lo
reinicia, pero una partida nueva o revancha sí. Si aún no se usó, permanece al
explorar el mapa terminado. No se muestra en repeticiones ni como espectador.
Movimiento reducido mantiene un halo estático.
El estado accesible sigue siendo `aria-pressed`; su nombre alterna
resaltar/ocultar y el fondo dorado señala el resaltado activo. La ayuda de texto
inicial aparece una sola vez por navegador al conservar billetes.

`scrollTrack` acompaña las tablas del listado de partidas con desbordamiento; se sincroniza con el scroll
nativo, acepta teclado y no desaparece por las preferencias de scroll de iOS.
Se oculta si la tabla cabe. Sus observadores se liberan al reemplazar la vista.
El diálogo final utiliza desplazamiento directo sobre su tabla, sin barra auxiliar.

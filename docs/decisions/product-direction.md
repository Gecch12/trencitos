# Dirección de producto y personalización

Estado: decisiones de producto aceptadas en conversación, 2026-10-31.
Implementación y avance viven exclusivamente en [las fichas](../work/README.md).

- Todo gratis por ahora. Preparar identidad, catálogo, acceso y selección de
  cosméticos para monetización futura, sin activar cobros. Acceso gratuito de
  beta no implica propiedad permanente. Vendedor en Perú; proveedor pendiente
  de evaluar y contratar. Ver [comercio](../work/commerce.md).
- Identidad persistente empezando por Google; mediante Supabase Auth.
  Apodo/avatar del juego independientes de nombre/foto de Google. Mantener
  práctica como invitado. Ver [identidad](../work/identity.md).
- Fondo del avatar conserva el color del jugador. Se consideran accesorios,
  tono de la personita y placa/emblema rectangular de compañía. La subida de
  fotos no está aprobada: privacidad/moderación siguen por definir.
- Comodines vapor/clásica/moderna como cosmético independiente: descartadas
  por falta de utilidad en la experiencia actual. No reabrir sin nueva evidencia.
- Ambientes como set coherente: tablero/mapa visual + reversos y piezas/sonidos
  compatibles. Un tema visual no cambia red, reglas ni equilibrio. Un mapa con
  reglas/topología nuevas sería otro alcance. Ver [ambientes](../work/ambiences.md).
- Three.js aceptado como vista oficial y predeterminada tras el experimento en
  rama/worktree propio: mapa plano con textura, vagones y
  estaciones 3D. Mano, cartas, paneles y controles siguen 2D. Cámara guiada y
  etiquetas 2D ancladas. Sin física de simulador ni controles libres de tabletop.
  Se retira la alternativa 2D por decisión posterior del usuario. Ante fallo de
  WebGL, reintentar conservando la sala. Los mapas de detalle mantienen SVG.
  Vías libres, marcas, piezas y resaltados del tablero principal comparten la
  profundidad de Three.js; los destinos no sustituyen piezas por copias 2D.
  Ver [tablero](../work/board-3d.md).
- Vagones 3D inspirados en las cartas para los colores de jugador: la
  identidad del propietario determina el modelo, nunca el pago de una ruta.
  Modelo, pintura y acabado separados internamente; todo disponible gratis.
  Amarillo transporta deportivos y ámbar lleva grano. Se retira la identidad
  dorada y su texto de acabado metálico; las claves guardadas siguen siendo compatibles.
  Se aprueban siete familias adicionales con siluetas propias: grúa, vino, tractores,
  cemento, fruta, flores y lancha. No se reabre la propuesta
  descartada de comodines independientes ni se agregan reglas de mercancías.
- Previsualizar el vagón real al elegir color antes de jugar, en práctica y sala.
  Eliminar símbolos geométricos de puesto en toda la interfaz; nombre, color y
  modelo identifican al jugador, incluido el fondo del avatar.
- Materiales madera/mate/cromado/cobre se estudian si 3D aporta valor; deben
  conservar identificación por color. Ver [materiales](../work/materials.md).
- Pulir sonidos de cartas y construcción queda pendiente; ya existe audio
  sintetizado, y eso no equivale a disponer de packs configurables.
  Ver [sonidos](../work/sounds.md).

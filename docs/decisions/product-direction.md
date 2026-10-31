# Dirección de producto y personalización

Estado: decisiones de producto aceptadas en conversación, 2026-10-31.
Implementación y avance viven exclusivamente en [las fichas](../work/README.md).

- Todo gratis por ahora. Preparar identidad, catálogo, acceso y selección de
  cosméticos para monetización futura, sin activar cobros. Acceso gratuito de
  beta no implica propiedad permanente. Vendedor en Perú; proveedor pendiente
  de evaluar y contratar. Ver [comercio](../work/commerce.md).
- Identidad persistente empezando por Google; camino propuesto Supabase Auth.
  Apodo/avatar del juego independientes de nombre/foto de Google. Mantener
  práctica como invitado. Ver [identidad](../work/identity.md).
- Fondo del avatar conserva el color del jugador. Se consideran accesorios,
  tono de la personita y placa/emblema rectangular de compañía. La subida de
  fotos no está aprobada: privacidad/moderación siguen por definir.
- Locomotoras vapor/clásica/moderna como cosmético independiente: descartadas
  por falta de utilidad en la experiencia actual. No reabrir sin nueva evidencia.
- Ambientes como set coherente: tablero/mapa visual + reversos y piezas/sonidos
  compatibles. Un tema visual no cambia red, reglas ni equilibrio. Un mapa con
  reglas/topología nuevas sería otro alcance. Ver [ambientes](../work/ambiences.md).
- Three.js aceptado como vista oficial y predeterminada tras el experimento en
  rama/worktree propio: mapa plano con textura, vagones y
  estaciones 3D. Mano, cartas, paneles y controles siguen 2D. Cámara guiada y
  etiquetas 2D ancladas. Sin física de simulador ni controles libres de tabletop.
  Mantener alternativa 2D y retorno automático si falla WebGL.
  Ver [tablero](../work/board-3d.md).
- Vagones 3D inspirados en las cartas para los once colores de jugador: la
  identidad del propietario determina el modelo, nunca el pago de una ruta.
  Modelo, pintura y acabado separados internamente; todo disponible gratis.
  El dorado recibe acabado metálico de coche de lujo. No se reabre la propuesta
  descartada de locomotoras independientes ni se agregan reglas de mercancías.
- Materiales madera/mate/cromado/cobre se estudian si 3D aporta valor; deben
  conservar identificación por color. Ver [materiales](../work/materials.md).
- Pulir sonidos de cartas y construcción queda pendiente; ya existe audio
  sintetizado, y eso no equivale a disponer de packs configurables.
  Ver [sonidos](../work/sounds.md).

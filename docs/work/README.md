# Trabajo

El estado canónico está en cada ficha. `node scripts/check-docs.js --index`
genera la lista de estados y relaciones; este índice no mantiene otra copia.

Iniciativa acordada:

- [Arquitectura y respuesta de partidas](match-performance-architecture.md):
  medición, trabajo por jugada, independencia entre mesas y prevención de regresiones.
  Inicio en [referencia de latencia y contratos](match-performance-baseline.md).
- [Beta gratuita en teléfonos](mobile-beta.md): APK compartible, iPhone desde
  Xcode y web instalada, conectados al servidor por Internet.
- [Android e iOS con Capacitor](mobile-capacitor.md): apps de desarrollo para
  probar el juego en los dispositivos virtuales de la Mac.
- [Pruebas y despliegue automático](continuous-delivery.md): CI en GitHub y
  publicación de main en Render cuando pasen las comprobaciones.
- [Consolidación de carpeta y main](workspace-consolidation.md): ubicación de
  trabajo, preservación de cambios y retiro de worktrees históricos.
- [Plataforma modular y mapas](modular-game-platform.md): fases de reorganización,
  contratos y posterior integración de Sudamérica. Inicio en la
  [base reproducible](modular-platform-baseline.md) y desarrollo del
  [modelo y contratos](modular-platform-contracts.md). Continuación:
  [extracción del dominio](modular-platform-domain.md) y
  [aplicación e interfaz](modular-platform-application.md) y
  [mapas versionados](modular-platform-maps.md) y
  [Sudamérica y entrega conjunta](south-america-release.md).

Orden de trabajo acordado:

1. [Centro documental y skill](docs-system.md): base compartida del trabajo.
2. [Identidad persistente](identity.md): Google y perfil como base de personalización.
3. [Tablero 3D y familia de vagones](board-3d.md): presentación oficial aceptada;
   evidencia, avance de integración y límites en la ficha.

4. [Navegación y salas públicas](navigation-rooms.md): inicio adaptable, perfil y sala de espera.

5. [Historial, replay e idiomas](history-replay.md): grabación durable y experiencia bilingüe.

Para después:

- [Pendientes sociales, competitivos y de análisis](social-competitive-followups.md).
- [Preparación comercial y personalización](commerce.md).
- [Sets de ambientes](ambiences.md).
- [Materiales personalizables](materials.md), ampliación del acabado 3D existente.
- [Sonidos](sounds.md).
- [Verificación pendiente de la beta](quality.md).

Mejoras solicitadas del juego:

- [Resumen visual y cierre con recuentos](summary-postgame-experience.md).

- [Continuidad móvil, cuenta y skill de publicación](mobile-continuity.md).

- [Mesa compacta con prioridad al mapa](board-first-mobile.md).
- [Controles de mesa y sala](table-controls.md).
- [Circo, Vivienda y variantes de Pasajeros](wagon-variants.md).

- [Inteligencia de bots de práctica](practice-ai.md).
- [Billetes, túneles compartidos y resultados](game-flow-ui.md).
- [Mapas de billetes en vivo y túneles sobre el tablero](destination-map-tunnels.md).
- [Sombreado y foco del mapa de billetes](ticket-map-shading.md).
- [Miniaturas, renovación de cartas y pagos visuales](card-interactions.md).
- [Rendimiento del selector de vagones](wagon-preview-performance.md).

Abre solo la ficha pertinente y sus referencias. El próximo paso está allí.
Los hitos viven dentro de la ficha hasta necesitar una entrega independiente;
entonces usa `parent` y `depends_on`, según [el método](../maintenance.md).

- [Lobby con tarjetas de mapas y vagón compacto](room-map-cards.md).
- [Proporción y encuadre de Sudamérica](south-america-proportions.md).

- [Historial completo, H y puntos propios](match-history-progress.md).
- [Foco temporal, replay transparente y reinicio de partidas](replay-transparency-reset.md).
- [Replay ligero con la vista y animaciones de la partida](replay-experience.md).
- [Perfil, estadísticas, personalización y amigos](profile-social-statistics.md).

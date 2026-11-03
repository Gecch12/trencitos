# Trabajo

El estado canónico está en cada ficha. `node scripts/check-docs.js --index`
genera la lista de estados y relaciones; este índice no mantiene otra copia.

Iniciativa acordada:

- [Plataforma modular y mapas](modular-game-platform.md): fases de reorganización,
  contratos y posterior integración de Sudamérica. Inicio en la
  [base reproducible](modular-platform-baseline.md) y desarrollo del
  [modelo y contratos](modular-platform-contracts.md). Continuación:
  [extracción del dominio](modular-platform-domain.md) y
  [aplicación e interfaz](modular-platform-application.md).

Orden de trabajo acordado:

1. [Centro documental y skill](docs-system.md): base compartida del trabajo.
2. [Identidad persistente](identity.md): Google y perfil como base de personalización.
3. [Tablero 3D y familia de vagones](board-3d.md): presentación oficial aceptada;
   evidencia, avance de integración y límites en la ficha.

4. [Navegación y salas públicas](navigation-rooms.md): inicio adaptable, perfil y sala de espera.

5. [Historial, replay e idiomas](history-replay.md): grabación durable y experiencia bilingüe.

Para después:

- [Preparación comercial y personalización](commerce.md).
- [Sets de ambientes](ambiences.md).
- [Materiales personalizables](materials.md), ampliación del acabado 3D existente.
- [Sonidos](sounds.md).
- [Verificación pendiente de la beta](quality.md).

Mejoras solicitadas del juego:

- [Controles de mesa y sala](table-controls.md).
- [Circo, Vivienda y variantes de Pasajeros](wagon-variants.md).

- [Inteligencia de bots de práctica](practice-ai.md).
- [Billetes, túneles compartidos y resultados](game-flow-ui.md).
- [Miniaturas, renovación de cartas y pagos visuales](card-interactions.md).
- [Rendimiento del selector de vagones](wagon-preview-performance.md).

Abre solo la ficha pertinente y sus referencias. El próximo paso está allí.
Los hitos viven dentro de la ficha hasta necesitar una entrega independiente;
entonces usa `parent` y `depends_on`, según [el método](../maintenance.md).

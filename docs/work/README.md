# Trabajo

El estado canónico está en cada ficha. `node scripts/check-docs.js --index`
genera la lista de estados y relaciones; este índice no mantiene otra copia.

Orden de trabajo acordado:

1. [Centro documental y skill](docs-system.md): base compartida del trabajo.
2. [Identidad persistente](identity.md): Google y perfil como base de personalización.
3. [Tablero 3D](board-3d.md): experimento independiente tras preparar la base;
   puede avanzar en paralelo a identidad, sin depender de ella.

Para después:

- [Preparación comercial y personalización](commerce.md).
- [Sets de ambientes](ambiences.md).
- [Materiales](materials.md), condicionado al resultado del 3D.
- [Sonidos](sounds.md).
- [Verificación pendiente de la beta](quality.md).

Abre solo la ficha pertinente y sus referencias. El próximo paso está allí.
Los hitos viven dentro de la ficha hasta necesitar una entrega independiente;
entonces usa `parent` y `depends_on`, según [el método](../maintenance.md).

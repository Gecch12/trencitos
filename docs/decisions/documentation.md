# Documentación como centro de operaciones

Estado: aceptada por el usuario, 2026-10-31. Alcance: método para este y otros
proyectos; no afirma que todas las herramientas estén ya implementadas.

Se mantienen Markdown en el mismo repositorio, con entrada breve, enlaces por
tema y fichas de trabajo. El método general se ofrece como skill reutilizable;
los hechos del proyecto permanecen en su repo. Se evita otro repositorio de docs
porque separaría la versión de las instrucciones de la versión del código.

Cada dato tiene una ubicación canónica; lectura progresiva y comprobaciones
pequeñas reducen consumo de contexto y drift. Los hitos se verifican con criterios
de aceptación; no se estima avance con porcentajes arbitrarios.

Los docs se versionan por rama. El experimento puede describir otra arquitectura
sin cambiar la documentación de la base. Integrar requiere reconciliar ambos;
no habrá carpeta documental compartida por symlink ni sincronización automática
que pueda llevar afirmaciones experimentales a la versión principal.

Trabajo habitual y experimento usarán worktrees y chats distintos. El estado
verificado en una rama, la integración y la publicación se registran por separado.
Normas concretas: [método](../maintenance.md).

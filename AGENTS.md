# Trabajo en Trencitos

Empieza por [docs/README.md](docs/README.md) y la ficha de la tarea en
[docs/work/README.md](docs/work/README.md). Lee otros documentos solo si la tarea
los necesita. La documentación describe este checkout; comprueba rama y cambios
locales antes de asumir que algo está integrado o publicado.

- Actualiza código, documento afectado y avance de la ficha en el mismo cambio.
  Conserva evidencia y un próximo paso concreto; no conviertas ideas en hechos.
- Aplica [el método documental](docs/maintenance.md) al crear o reorganizar docs.
  Cada dato tiene una ubicación canónica; los índices enlazan.
- Respeta cambios locales ajenos. El repo está en esta carpeta, aunque el proyecto
  de Codex pueda estar registrado en la carpeta superior `trains`.
- El servidor decide las reglas y filtra secretos mediante `engine.view`.
  La presentación no decide jugadas ni recibe información privada rival.
- Three.js es la única vista del tablero principal. Para nuevos experimentos
  usa una rama/worktree propio. Para servidores locales usa puerto y
  `STATE_FILE` propios con `STATE_BACKEND=file`; no copies configuración de
  producción. Un segundo servidor Supabase puede invalidar al primero.
- Verifica el cambio con las pruebas pertinentes y `node scripts/check-docs.js`.
  Para revisar impacto documental: `node scripts/check-docs.js --base HEAD`.
  Las auditorías de QA registran una ejecución histórica, no una garantía actual.

El método general está disponible como `$project-docs-maintainer`; este archivo
y los documentos del repo conservan las decisiones específicas de Trencitos.

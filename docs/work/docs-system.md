---
{"id":"docs-system","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-10-31"}
---
# Centro documental

Objetivo: contexto navegable para agentes, mantenimiento ligado al trabajo y
método reutilizable fuera de Trencitos. Decisión: [documentación](../decisions/documentation.md).

## Hitos

- [x] Entrada breve, arquitectura y dominio contrastados con código.
- [x] Decisiones y pendientes de esta conversación con alcance y siguiente paso.
- [x] Validador: enlaces, estructura, relaciones y revisión de fuentes.
- [x] Skill genérico validado e instalado para otros proyectos.
- [x] Base revisada, worktree y encargo experimental preparados.

## Evidencia

Inspección de `main` en `3494d01` más cambios locales preexistentes el 2026-10-31.
En esa ejecución los cambios eran locales; la integración posterior se registra abajo.
- `npm test`: 267 correctas, 0 fallos en la base local; los tests de red requirieron
  permiso de loopback. Sin acceso a Supabase/Render reales.
- `node --test tests/docs-check.test.js`: 4 correctas, 0 fallos; enlaces rotos,
  dependencias/ciclos, cierres incoherentes y metadatos inválidos.
- `node scripts/check-docs.js --base HEAD`: estructura válida y fuentes revisadas.
- `git diff --check`: sin errores de espacios.
- `quick_validate.py`: skill válido, instalado en los skills personales como
  `project-docs-maintainer`. PyYAML se instaló en un entorno temporal aislado.
- Entrada `AGENTS.md` + índice documental + índice de trabajo: 577 palabras;
  no es un conteo exacto de tokens ni requiere leer todas las fichas.
- Worktree creado en `trains/worktrees/threejs-board`, rama
  `experiment/threejs-board`, desde snapshot local `9aa687c`. Incluye los cambios
  de juego preexistentes y docs, sin archivos de estado ni configuración privada.
  Se comprobó que HEAD, índice y cambios del checkout original se conservaron.
- El snapshot fue la base del experimento. El 2026-10-31 sus documentos se
  integraron junto con el tablero 3D en `main` (`0177ab0`), reconciliando cambios
  comunes y conservando trabajo concurrente sin commit. No hay despliegue.

## Siguiente paso

Usar el método al abordar [identidad](identity.md) o nuevos hitos del juego.
[El tablero 3D](board-3d.md) conserva la evidencia de implementación e integración;
esta ficha conserva la preparación documental.

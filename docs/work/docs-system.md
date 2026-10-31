---
{"id":"docs-system","status":"active","parent":null,"depends_on":[],"branch":"main","delivery":"worktree","updated":"2026-10-31"}
---
# Centro documental

Objetivo: contexto navegable para agentes, mantenimiento ligado al trabajo y
método reutilizable fuera de Trencitos. Decisión: [documentación](../decisions/documentation.md).

## Hitos

- [x] Entrada breve, arquitectura y dominio contrastados con código.
- [x] Decisiones y pendientes de esta conversación con alcance y siguiente paso.
- [x] Validador: enlaces, estructura, relaciones y revisión de fuentes.
- [x] Skill genérico validado e instalado para otros proyectos.
- [ ] Base revisada, worktree y encargo experimental preparados.

## Evidencia

Inspección de `main` en `3494d01` más cambios locales preexistentes el 2026-10-31.
No se han integrado ni desplegado esos cambios como parte de la documentación.
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

## Siguiente paso

Preparar el worktree sin alterar el índice ni los cambios previos de `main` y
entregar el encargo aislado al chat del experimento.

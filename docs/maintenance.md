# Método documental

## Lectura y fuentes

`AGENTS.md` → índice → ficha activa → documentos/código relacionados. Mantén
entrada e índice pequeños (objetivo conjunto: menos de unos 2.000 tokens).
Arquitectura explica responsabilidades; dominio conserva reglas; decisiones
explica motivos; fichas conservan alcance, avance, evidencia y próximo paso.
Los informes QA son evidencia histórica. No dupliques tablas de estado manuales.

Consulta [sources.json](sources.json) para saber qué documentos revisar cuando
cambia código. El mapa es orientativo, no un sustituto de entender el cambio.
Prefiere referencias a archivos y símbolos estables a números de línea.

## Fichas

Cada archivo de `work/`, salvo su índice, empieza con frontmatter JSON entre
líneas `---`. Es un subconjunto válido de YAML que el validador lee sin librerías.

Campos: `id` estable; `status` (`idea`, `planned`, `active`, `blocked`, `validated`,
`done`, `dropped`); `parent` o null; `depends_on` (IDs); `branch` o null;
`delivery` (`none`, `worktree`, `integrated`, `released`); `updated` (YYYY-MM-DD).
IDs sin numeración jerárquica. Cambiar de padre no cambia el ID.

El cuerpo contiene objetivo/alcance, hitos con aceptación comprobable, evidencia
y siguiente paso. `done` significa aceptación del alcance de la ficha, **no**
despliegue: `delivery` conserva esa distinción. `blocked` identifica causa y
condición para continuar. Una dependencia `dropped` requiere revisar el alcance
del dependiente; no equivale a una dependencia satisfecha.

## Descomposición

Normalmente iniciativa → hito → tarea, con checklist corta para pasos técnicos.
Solo crea ficha hija si tiene entrega, bloqueo, contexto o rama independientes.
Usa `parent` para pertenencia y `depends_on` para orden; no dupliques una tarea en
dos padres. Los hijos se descubren con `--index` o buscando el ID del padre.
Las carpetas permanecen planas. Detalla el próximo hito cuando se aborde.

Cerrar un padre requiere resolver sus hijos y verificar el resultado conjunto;
un hijo descartado necesita motivo y revisión del alcance del padre. No calcules
porcentajes de avance sumando tareas de tamaños diferentes.

## Ciclo y ramas

Por decisión de Ángel (2026-11-03), el trabajo habitual se hace en
`trains/trencitos`, rama `main`. Solo se crean ramas/worktrees adicionales cuando
él lo pide explícitamente. Revisa cambios locales y actividad de otros chats
antes de escribir; trabajar en una carpeta compartida requiere evitar editar
simultáneamente los mismos archivos. Publicar en Git y desplegar siguen siendo
entregas distintas y deben contar con autorización de la tarea.

1. Comprueba rama/checkout y lee la ficha. Contrasta los hechos relevantes con
   código y evidencia; distingue decisiones de propuestas.
2. Realiza el trabajo autorizado; actualiza documentos afectados junto al cambio.
3. Valida, registra evidencia y deja el siguiente paso. Si el código contradice
   una regla, determina si es bug o cambio acordado antes de editar esa regla.
4. Antes de integrar, revisa el diff de código **y** docs contra el destino.
   Resuelve conflictos semánticos aunque Git no reporte conflicto textual.

Cada rama describe su versión. Una ficha principal puede apuntar a otra rama,
pero es una referencia, no un espejo en vivo. Consulta la ficha del worktree o
`git show rama:docs/work/ficha.md` para estado confirmado en esa rama; los cambios
sin commit solo están en su carpeta. No uses symlinks de `docs/` entre worktrees.
No actualices dos copias manualmente por rutina. Lleva decisiones compartidas
mediante cambios revisados; nunca copies todos los docs de una rama sobre otra.

El validador comprueba estructura, enlaces locales a archivos, IDs, estados,
dependencias, ciclos y cierres incoherentes. No valida enlaces web, anclas ni
verdad semántica. La revisión de fuentes y las pruebas cubren esa parte.

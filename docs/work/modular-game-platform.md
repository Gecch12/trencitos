---
{"id":"modular-game-platform","status":"active","parent":null,"depends_on":[],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-02"}
---
# Plataforma modular y mapas de Trencitos

## Objetivo y alcance aprobado

Evolucionar el juego existente mediante DDD gradual, separar comandos y consultas,
y aclarar los contratos de persistencia e interfaz antes de integrar Sudamérica.
Conservar Europa, las reglas propias del proyecto, la privacidad, las partidas
guardadas y el historial. Los detalles arquitectónicos acordados y sus motivos
viven en la [decisión de arquitectura](../decisions/modular-game-platform.md).

El usuario aprobó el enfoque y autorizó comenzar con documentación y fase 0 el
2026-11-02. Esta ficha describe trabajo previsto y avance; la arquitectura
implementada sigue descrita en [arquitectura](../architecture.md). No se ha
autorizado publicar esta iniciativa en Render automáticamente.

## Carpeta de trabajo y base

- Worktree: `/Users/angelaltarodri/Desktop/free/trains/worktrees/modular-game-platform`.
- Rama: `codex/modular-game-platform`.
- Origen: `main` en `f41e033c496395094a352bd06117bd7474a76921` más cambios locales.
- Snapshot de esos cambios: `7003904f264dac1e740cefc66fa7dd0c1c58617c`.
- Base, inventario y validación: [fase 0](modular-platform-baseline.md).

Trabajar desde este worktree. El checkout original y otros frentes conservan sus
archivos. Una referencia a otra rama no certifica integración ni despliegue.

## Fases y aceptación

| Fase | Alcance | Resultado necesario para avanzar |
| --- | --- | --- |
| 0. Base reproducible | Preservar trabajo previo, aislar checkout y establecer pruebas de referencia. | Origen preservado, snapshot identificado y resultados/límites registrados, incluidos fallos previos. |
| 1. Modelo y contratos | Precisar vocabulario, límites, invariantes, contratos de partida/mapa/reglamento y compatibilidad. | Diseño contrastado con el código; primer recorrido a extraer y pruebas de aceptación definidos. |
| 2. Dominio | Extraer reglas de textos, vistas, transporte y almacenamiento, empezando por construir una ruta. | Europa conserva comportamiento; reglas ejecutables sin HTTP, navegador ni base de datos; azar y tiempo controlables en pruebas. |
| 3. Aplicación e interfaz | Separar casos de uso del servidor, confirmación durable, proyecciones autorizadas y responsabilidades de `app.js`. | Partidas completas, bots, reconexión, privacidad y replay conservados; frontend y backend separados en código. |
| 4. Varios mapas | Introducir definiciones versionadas, IDs estables, catálogo y adaptación de bots, guardado y renderizado. | Europa y un mapa pequeño de prueba operan simultáneamente; guardados y replay existentes siguen siendo legibles. |
| 5. Sudamérica V3.3 | Integrar materiales, selector, rutas, billetes y composición visual en Three.js. | Beta jugable para evaluación de Ángel, con pruebas técnicas, ajustes visuales y límites de balance documentados. |

El orden es 0 → 1 → 2 → 3 → 4 → 5. Cada fase entrega un resultado revisable y
actualiza documentación y pruebas junto con código. Los detalles del siguiente
hito se desarrollan al abordarlo. Las fichas hijas solo se crean si necesitan
evidencia, entrega o contexto propios.

Hito opcional después de la fase 3: evaluar despliegues independientes de frontend
y backend. Depende de contratos estables y una ventaja operativa concreta; no
bloquea la fase 4 ni Sudamérica. Mantener un solo repositorio está acordado.

## Hitos

- [x] Fase 0 aceptada según [su ficha](modular-platform-baseline.md).
- [ ] Fase 1: modelo y compatibilidad definidos.
- [ ] Fase 2: dominio extraído y Europa verificada.
- [ ] Fase 3: coordinación e interfaz separadas y verificadas.
- [ ] Fase 4: independencia del mapa demostrada.
- [ ] Fase 5: Sudamérica disponible para pruebas del usuario.
- [ ] Resultado conjunto revisado: código, documentación, compatibilidad y evidencia.

La validación técnica de la beta y la revisión manual del usuario se registran
por separado. El cierre de esta ficha no implica publicación.

## Acuerdos específicos de Sudamérica

- Fuente entregada: `trencitos_sudamerica_v3_3_full_angel`, originalmente en
  `/Users/angelaltarodri/Downloads/`. Inventario y huellas en la evidencia de fase 0.
- Integrar `sudamerica_v3_beta`: 46 ciudades, 90 corredores, 101 vías, 300 casillas,
  46 billetes (40 normales y 6 largos), según el paquete revisado.
- `referencia_v2` aporta estilo y materiales; sus conexiones pertenecen a otra
  versión. La acuarela es referencia estética y requiere adaptación al tablero.
- Conservar Europa como opción predeterminada; propuesta de ID de la entrega:
  `south-america-v3.3-beta`. La estrategia de versiones se concretará en fase 1.
- Usar colores, túneles, ferris y billetes actuales como beta. La ausencia de
  simulaciones competitivas no impide implementar: el usuario probará el balance
  jugando. Integridad de datos y corrección de reglas sí requieren verificación.
- Acomodar curvas y casillas siguiendo la [referencia de cruces de Ángel](../references/map-crossing-layout.png):
  dejar espacio en el cruce visual para evitar piezas superpuestas. Un cruce sin
  ciudad no conecta las rutas. Revisar también vagones ocupados, dobles, etiquetas
  y selección. Ángel hará una revisión visual posterior.
- Mantener Three.js, las familias de vagones, cartas y estaciones existentes.
  El SVG provisional y el visor de referencia no sustituyen el tablero principal.

## Siguiente hito: fase 1

Tras cerrar la base, elaborar el modelo dentro de una ficha de diseño con entrega
propia, enlazada a esta iniciativa. Debe especificar:

1. Partida como unidad de consistencia y límites respecto a sala, identidad,
   catálogo e historial; una instancia de datos/reglas por partida.
2. Separación entre definición inmutable del mapa, reglamento, estado mutable y
   composición visual. Identidades de ciudad, vía y billete independientes del
   orden de las listas; lectura compatible de identificadores anteriores.
3. Contratos de comandos, errores estructurados, eventos internos y consultas
   autorizadas sin efectos sobre el estado. Tiempo y azar explícitos.
4. Repositorios/adaptadores y confirmación conjunta de estado e historial;
   publicación de éxito después del guardado, reintentos y rechazo de duplicados.
5. Puente temporal para la API actual de `engine.js`, consumidores, bots y pruebas;
   adaptaciones de formatos antiguos fuera de las consultas.
6. Primer recorrido: construcción normal y doble, pagos, ferris y frontera con
   túneles. Pruebas de comportamiento e invariantes antes/después.

No mover archivos por tamaño ni convertir cada función en un módulo. Los límites
siguen responsabilidades y dependencias verificables.

## Evidencia y próximo paso

La decisión y esta hoja de ruta registran acuerdos de la conversación. La
[fase 0](modular-platform-baseline.md) está cerrada y conserva los resultados,
fallos iniciales de conductores, correcciones y límites de la referencia.
Siguiente paso: desarrollar la fase 1 descrita arriba y concretar el primer
recorrido de extracción sin cambiar todavía el comportamiento de Europa.

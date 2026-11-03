---
{"id":"workspace-consolidation","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-03"}
---
# Una carpeta y main como base de trabajo

Ángel pidió unificar el proyecto y reservar worktrees para solicitudes explícitas.
La carpeta principal es `/Users/angelaltarodri/Desktop/free/trains/trencitos`.
Esta decisión sustituye la recomendación anterior de abrir un worktree por frente.

## Integración

- [x] Preservar las mejoras de cartas terminadas por el chat «Comparar planes de
  Render y DigitalO»: `02b3386`, sin perder ediciones ni archivos nuevos.
- [x] Integrar `origin/main` (`e2a5033`, lobby visual publicado) en `e9cb403`.
  El único conflicto textual era de traducciones; se conservan ambas entradas.
- [x] Revisar el trabajo antiguo de `passenger-extreme`: Circo, Vivienda y
  variantes de Pasajeros ya existen en el catálogo actual, con evolución posterior.
  El prototipo Hippie de 90 personas fue reemplazado por Midsommar de 22; se
  conserva como [estudio independiente](../../experiments/passenger-extreme/README.md),
  con sus dependencias históricas, sin reemplazar modelos ni reglas actuales.
- [x] Guardar cambios locales y evidencia ignorada antes de retirar carpetas.
- [x] Validar la combinación y el estudio recuperado.
- [x] Retirar los cuatro worktrees; dejar únicamente el checkout principal.

## Respaldo local

`.qa/consolidation-2026-11-03/` contiene un `.tar.gz`, un `.patch` y un manifiesto
JSON por checkout (`main`, `lobby-map-cards`, `modular-game-platform`,
`passenger-extreme`, `threejs-board`). Cada manifiesto registra commit base,
estado Git y SHA-256 de cada archivo; el contenido archivado se verificó contra
esas huellas. Se incluyen archivos modificados, nuevos y evidencia ignorada;
no se copian dependencias reinstalables ni metadatos `.git`. En `main` se respaldan
sus cambios, pues su evidencia permanece en la misma carpeta.

Estos archivos son locales e ignorados por Git. Los commits base permanecen en
el historial; el prototipo y sus pruebas sí quedan versionados en main.
Los servidores del usuario en los puertos 3000 y 3119 usan la carpeta principal
y no se reinician para esta operación.

## Verificación y siguiente trabajo

[Resultado conjunto](../qa/workspace-consolidation/result.json), sobre `e9cb403`
más los cambios de consolidación:

- Suite completa: **641/641 pruebas**, 160,8 s, sin fallos ni omitidas.
- [Lobby](../qa/workspace-consolidation/lobby.json): Chrome con dos clientes,
  autorización, persistencia/recarga, teclado, galería, ES/EN, móvil e inicio de
  Sudamérica. Captura móvil inspeccionada, sin desbordamiento horizontal.
- [Cartas](../qa/workspace-consolidation/draw-feedback.json): diez recorridos con
  HTTP/WebSocket reales y doble local de persistencia. Incluyen segundo clic,
  renovación del mercado, rechazo, desconexión, guardado fallido y compatibilidad
  con backend anterior. Cero errores de navegador. No son mediciones de Render.
- [Prototipo](../qa/workspace-consolidation/prototype.json): seis variantes,
  vestuario, cabello, escritorio/móvil, liberación de recursos y 225 vagones;
  cuatro pruebas unitarias incluidas en la suite. Captura principal inspeccionada.
- Acceso HTTP: se comprueba que el experimento y su servidor de preview devuelven
  404 en el juego. `check-docs.js` y `git diff --check` correctos.
- Antes de eliminar cada worktree se volvieron a verificar todos sus archivos
  respaldados y el SHA-256 del archivo comprimido; sus commits base son ancestros
  de main. `git worktree list` conserva solo `trains/trencitos [main]`.

El trabajo posterior parte de esa carpeta. El código publicado en Render se
identifica exclusivamente en [Producción](../production.md): esta consolidación
no desplegó la respuesta inmediata de cartas. La publicación posterior y su
medición real se siguen en [Cartas](card-interactions.md) y
[la entrega continua](continuous-delivery.md).

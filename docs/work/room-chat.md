---
{"id":"room-chat","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"none","updated":"2026-11-06"}
---
# Chat de mesa con moderación y referencias al mapa

Implementación autorizada directamente en `main`, sobre cambios locales previos
de CI, resultados y presentación. Contrato canónico: [chat de mesa](../room-chat.md).
No incluye despliegue, reportes, sanciones automáticas, chat global, mensajes
privados, mensajes rápidos ni referencias a billetes de destino.

## Hitos y aceptación

- [x] Conversación continua, invitados/cuentas y permisos de espectadores.
- [x] Guardado, reconexión, idempotencia y aislamiento del replay.
- [x] Filtro local ES/EN, aviso público anónimo y control de frecuencia.
- [x] Silencio individual persistente en la sala y reacciones limitadas.
- [x] Menciones de jugadores y tramos públicos; foco local sin construcción.
- [x] Verificar escritorio/móvil, fallos de guardado y regresiones del proyecto.
- [x] Completar evidencia, revisión documental y registro de reportes pendientes.

## Ajuste visual aprobado · 2026-11-06

- [x] Compositor de dos a cinco renglones y silencio mediante icono.
- [x] Selector ascendente al escribir `@`, con avatares y vías diferenciables.
- [x] Reacciones contextuales con seis ilustraciones vectoriales propias.
- [x] Revisar capturas, teclado, tacto, referencias dobles y regresiones.

## Evidencia

Validación local del 2026-11-06 sobre `main`, base `9b61839` más cambios locales
preexistentes. Resultados y límites en [la evidencia de QA](../qa/room-chat-2026-11-06.json).
La suite completa pasa, además de los recorridos Chrome de chat, navegación,
mesa y resultados. Se comprobaron reinicio real del servidor local, reconexión,
salida/reentrada de espectadores, rechazo de referencias privadas, borrado al
cerrar la sala y ausencia de chat en el replay. El doble de Supabase comprueba
rollback por sala y respuesta perdida tras un commit; no certifica producción.

Capturas revisadas en escritorio y teléfono vertical/horizontal. El recorrido de
chat se incorpora a CI con artefactos propios. Se conserva la evidencia histórica
anterior del shell y los cambios ajenos al alcance. Los [reportes de abuso](social-competitive-followups.md)
siguen expresamente pendientes. No hay commit, push, despliegue ni prueba nativa
en teléfonos en esta entrega.

## Evidencia del ajuste visual

El rediseño aprobado se implementó y validó en el mismo checkout, conservando
los cambios locales de otros frentes. [Resultados del ajuste visual](../qa/room-chat-design-2026-11-06.json):
suite completa, recorridos Chrome de chat, sala de espera, mesa y resultados,
revisión de capturas en escritorio/teléfono y de las seis ilustraciones reales.
Se verificaron crecimiento de dos a cinco líneas, envío multilínea, navegación
con teclado, pulsación prolongada táctil, silencios y dos menciones paralelas con
texto idéntico e IDs diferentes. No se modificó el catálogo permitido de reacciones
ni se añadió un servicio externo. La evidencia inicial anterior permanece intacta.

Después de revisar la referencia enviada por Ángel, se ajustó únicamente la
ilustración «Me divierte»: expresión inclinada, ojos apretados, sonrisa amplia
con dientes y dos lágrimas laterales. Se revisó el SVG real en Chrome a 144, 64
y 32 px (`.qa/chat-laugh/me-divierte.png`). Sintaxis, comprobadores documental y
de arquitectura, y `git diff --check` correctos. No se repitió la suite funcional
por este cambio exclusivo de geometría; la evidencia anterior no es una nueva
ejecución. Permanece local en `main`, sin publicar.

## Siguiente paso

El alcance local está completo. Cuando se solicite publicación, revisar el diff
compartido, ejecutar el flujo de entrega y comprobar el chat contra el servidor
publicado. El filtro léxico requiere ajustes con casos reales; no reemplaza la
futura revisión humana de reportes.

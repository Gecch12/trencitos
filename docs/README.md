# Centro de operaciones

Lee esta página y la ficha del trabajo activo; sigue enlaces según necesidad.
No cargues todos los documentos ni todos los informes de QA al iniciar un chat.

| Necesidad | Documento canónico |
| --- | --- |
| Qué hace cada componente; dónde cambiarlo | [Arquitectura](architecture.md) |
| Historial, replay, invitados e idiomas | [Contrato de historial](history-replay.md) |
| Conceptos, reglas, privacidad y variantes | [Dominio](domain.md) |
| Ejecutar, probar y aislar entornos | [Operación](operations.md) |
| Ejecutar Android e iOS con Capacitor | [Pruebas móviles](mobile-development.md) |
| Prioridades, avance y próximo paso | [Trabajo](work/README.md) |
| Por qué se eligió una solución | [Decisiones](decisions/README.md) |
| Mantener docs o reconciliar ramas | [Método](maintenance.md) |
| Experiencia de usuario detallada | [Guía del juego](../README.md) |
| Símbolos, significados y ayudas accesibles | [Iconografía](iconography.md) |
| Desplegar en Render/Supabase | [Guía de despliegue](RENDER_SUPABASE.md) |
| Configurar Google y perfiles | [Google Auth](GOOGLE_AUTH.md) |
| Qué revisión está publicada y cómo se verificó | [Producción](production.md) |
| Evidencia de verificaciones anteriores | [Índice de QA](qa-index.md) |

## Alcance de la información

Arquitectura y dominio describen código existente en este checkout. Las fichas
separan propuesta, implementación y entrega. Una rama experimental puede tener
documentos distintos: comprueba su `branch`, `delivery` y evidencia antes de
afirmar que sus resultados existen en `main` o producción.

La documentación inicial se contrastó el 2026-10-31 con `main` sobre `3494d01`
**más cambios locales preexistentes**. Esto no certifica despliegue. La evidencia
posterior vive en las fichas correspondientes, sin actualizar esta fecha por
cada cambio del proyecto.

Consulta estados sin leer fichas completas:

```sh
node scripts/check-docs.js --index
```

Ante contradicciones, compara intención acordada, código y pruebas. Registra la
discrepancia; no redefinas una regla para acomodar un error.

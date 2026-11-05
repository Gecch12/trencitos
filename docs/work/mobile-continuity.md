---
{"id":"mobile-continuity","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-05"}
---
# Continuidad móvil, cuenta y publicación

Ángel aprobó la propuesta Moti: zoom solo dentro de mapas, práctica recuperable
24 horas, continuidad del resaltado al pedir destinos, progreso completados/total,
historial sin badge, iconografía compartida, tablas compactas y skill de entrega.
Incluye completar el acceso nativo con Google mediante el BFF existente.

## Aceptación

- [x] Práctica pausada y durable, recuperación al cerrar/reabrir y reiniciar servidor;
  ofertas y tiempos conservados, abandono explícito y caducidad diferenciados.
- [x] Mapa mantiene gestos/resaltado; el documento móvil no amplía la interfaz.
- [x] Indicadores, iconos accesibles, historial terminado por defecto y resultados
  con desplazamiento horizontal visible, verificados en tres tamaños.
- [x] Inicio/cierre/renovación de sesión nativa; regreso con prueba del solicitante,
  códigos de un uso y almacenamiento seguro, sin exponer tokens de Google/Supabase.
- [x] Skill validado e instalado, documentación y verificaciones pertinentes.

## Fuentes y entrega

Persistencia en `backend/practice.js`, `room-store.js` y committers; cuenta en
`backend/account-auth.js`, `native-client.js`, `frontend/connection.js` y plugins
nativos. La familia de símbolos se describe en [Iconografía](../iconography.md).
El skill canónico vive en [trencitos-publicar](../../skills/trencitos-publicar/SKILL.md).

## Verificación local · 2026-11-05

[Evidencia](../qa/mobile-continuity/verification.json): suite Node completa,
pruebas de navegador en móvil/tablet/escritorio y compilaciones de ambos plugins
nativos correctas. Los casos de reinicio usan procesos reales separados y
comprueban tanto práctica interna como sala normal con un humano y bots.
El flujo de cuenta verifica canje único, caducidad, aislamiento de invitado,
renovación, logout y recuperación del cliente tras reinicio con proveedor simulado.

Capturas revisadas: [resultados móvil](../qa/mobile-continuity/results-390.png),
[tablet](../qa/mobile-continuity/results-768.png),
[escritorio](../qa/mobile-continuity/results-1440.png) e
[historial](../qa/mobile-continuity/history-phone.png).
El guardado de identidad continúa usando prueba de puesto; no cambia privacidad
ni reglas del motor. No hace falta una nueva migración SQL para los DTOs de práctica.

El skill pasó el validador oficial y se instaló en la carpeta personal de skills.
La copia canónica se conserva en el repositorio. Crear el skill no lo invoca.

## Entrega · 2026-11-05

Ángel invocó `$trencitos-publicar`. La revisión `891b2d7` pasó el
[CI completo](https://github.com/Gecch12/trencitos/actions/runs/42075542241) y quedó
Live en Render. Android build 3 está publicado en GitHub con descarga verificada;
iOS build 4 quedó instalado sobre la app existente del iPhone conectado.
[Estado y evidencias de cada destino](../production.md).

Próximo control de uso: Ángel probará Google real y gestos en su iPhone con el
paquete actualizado. Las pruebas de Google usaron un proveedor simulado.
La prueba del zoom de página usa eventos sintéticos de Chrome; el pellizco
del mapa usa eventos táctiles reales de Chrome. No se jugó en el teléfono.

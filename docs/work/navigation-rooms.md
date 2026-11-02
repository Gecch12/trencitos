---
{"id":"navigation-rooms","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"released","updated":"2026-10-31"}
---
# Navegación, perfil y salas públicas

Alcance aprobado: estructura de Colonist adaptada a Trencitos, directorio real de
salas, bots en sala de espera y espectadores. Integrado sobre `main`, con
ediciones del tablero preexistentes conservadas. Publicado por solicitud del
usuario en `bf1c5c1`, Live el 2026-10-31 a las 18:26:06 de Lima; comprobación
remota y límites registrados en [producción](../production.md).

## Aceptación

- [x] Rooms / Play / More / Profile, acceso explícito al perfil y nombre junto a
  campanita provisional; sin karma, monedas, anuncios o cifras ficticias.
- [x] More con Game, Community, Blog vacío, Company, seis iconos sociales sin
  enlaces y Español/ESP como único idioma. Contenidos futuros vacíos, Privacy real.
- [x] Account / Friends / History / Overview y Edit Profile con nombre persistente
  y avatar básico; errores de guardado visibles sin cerrar el modal.
- [x] Open Rooms / Spectate actualizados por WebSocket, crear y unirse por código.
- [x] Nuevas salas públicas por defecto, privadas opcionales, anteriores privadas.
- [x] Anfitrión configura 2–5 plazas, añade/retira bots e inicia. Colores/vagones,
  modo/mapa y reglas disponibles conservados. Amigos y chat preparados sin datos
  inventados; mensaje español cuando la sala está llena.
- [x] Observación real sin puesto, acciones, secretos ni credencial. Bots durables
  y observadores respetan la pausa/caducidad al desconectarse todos los humanos.
- [x] Comparación de referencias, límites responsive, flujo completo y guardado.

## Referencia y adaptación

Se inspeccionaron [escritorio](https://colonist.io/) y
[móvil/tablet](https://colonist.io/mobile/), sus estilos públicos y capturas.
La navegación móvil de la referencia es una aplicación servida por ruta propia;
Trencitos usa los mismos componentes y cambia por tamaño/tipo de puntero.
No se copiaron sus recursos gráficos ni código de aplicación.

| Elemento | Organización verificada/adaptada |
| --- | --- |
| Escritorio | Sidebar 130 px, opciones 101 px, cabecera 86 px; contenido centrado de 1100 px incluyendo márgenes |
| Rooms escritorio | Tabla/lista 732 px, espacio lateral 300 px, separación 28 px; acciones de 56 px |
| Mobile/tablet | Cabecera 132 px y barra inferior 70 px; solo la opción activa muestra etiqueta y ocupa 1,7 partes |
| Botones Rooms | Columna con Join antes de Create cuando el contenedor mide hasta 480 px; corte visible entre 520/521 px de viewport |
| More | Espaciado a 1180 px; columnas apiladas hasta 991 px; separación menor hasta 767 px |
| Perfil | Navegación con solo iconos hasta 991 px; horizontal hasta 767 px en vertical; cuenta compacta hasta 480 px |
| Sala | Tres columnas en escritorio; paneles por pestaña en mobile/tablet; campos 4 columnas desde 767 px y 2 debajo |
| Alturas bajas | Compactación a 768/550 px; se conservan pestañas, salida y controles mediante scroll |

Selección del shell móvil: hasta 1024 px, o puntero táctil hasta 1366 px. Esto
sustituye la selección de `/mobile/` de la referencia. Colores, iconos, usuario a
la derecha, cuatro opciones y contenido disponible son las diferencias pedidas.

## Evidencia del 2026-10-31

- `npm test`: 324/324 pruebas correctas (47,9 s), incluidas regresiones de
  directorio, bots y guardado. Tests de motor conservan simulaciones
  completas de 2, 3 y 5 jugadores y privacidad de vistas.
- [Conductor de navegador](../../tests/browser-shell.cjs) y
  [reporte](../qa/shell-report.json): 55 combinaciones de página/tamaño, Chrome
  156.0.8078.74, sin errores JavaScript inesperados ni desbordamiento horizontal.
  Anchos 1920, 1440, 1280, 1181/1180, 1025/1024, 992/991, 768/767,
  521/520, 390, 360; paisaje 844×390; además tablet táctil 1366×1024.
- Tres sesiones aisladas: creación, privada/pública reflejada en otra ventana,
  capacidad, bot, unión por código, mensaje de lleno, ajustes solo del anfitrión,
  elección de billetes, proyección de espectador, recarga y salida sin ocupar plaza.
- Perfil invitado conservado al recargar; doble HTTP para éxito/fallo de cuenta.
  Comprobación adicional con `tests/helpers/identity-preview.js`: OAuth simulado,
  API Node real y SQL de perfil en PGlite; POST 200 y nombre conservado tras recarga.
  No se usó Google ni base de producción para esta comprobación.
- Fallos de escritura simulados: composición, visibilidad y capacidad vuelven al
  estado confirmado; una entrada fallida no deja una conexión sin puesto válido.
- Regresión de `browser-threejs.cjs`: partida completa de 231 acciones,
  reconexión, resultados, interacción y cámara correctos; cero errores.
  `browser-wagons.cjs`: 18 previews, cambio de color confirmado, límites de
  225 piezas, recarga y reintento WebGL correctos; cero errores.
- `check-docs.js`, `check-docs.js --base HEAD` y `git diff --check`: correctos.
- Emulación de viewport/puntero en Chrome; no certifica Safari ni dispositivos
  físicos. Notificaciones, amigos, chat y páginas futuras siguen sin backend.

Capturas:

- [Rooms escritorio](../qa/shell-rooms-1920.png),
  [tablet](../qa/shell-rooms-768.png), [móvil](../qa/shell-rooms-390.png).
- [More escritorio](../qa/shell-more-1920.png),
  [tablet](../qa/shell-more-768.png), [móvil](../qa/shell-more-390.png).
- [Perfil](../qa/shell-profile-desktop.png), [modal](../qa/shell-edit-profile.png).
- [Sala escritorio](../qa/shell-waiting-desktop.png),
  [jugadores móvil](../qa/shell-waiting-mobile-players.png),
  [configuración móvil](../qa/shell-waiting-mobile-settings.png).
- [Espectador escritorio](../qa/shell-spectate-desktop.png),
  [móvil](../qa/shell-spectate-mobile.png).

## Siguiente paso

Entrega publicada y verificada sobre HTTPS/Supabase, incluido perfil de cuenta,
salas/bots/espectadores y reconexión; [informe](../qa/production-shell-2026-10-31.json).
El desarrollo posterior puede rellenar Play, amigos, chat y secciones informativas
sin cambiar los contratos del directorio. La práctica anterior sigue en código,
con su ciclo efímero, sin entrada visible en Play en esta etapa.

La continuación de historial, idiomas y ajustes de observación se registra en
[su ficha independiente](history-replay.md); no modifica la evidencia histórica
de este despliegue.

La ampliación del menú de partida, controles de sala y relojes configurables
se registra en [Controles de mesa y sala](table-controls.md).

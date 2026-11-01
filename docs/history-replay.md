# Historial, repetición e idiomas

Contrato implementado en este checkout; entrega y evidencia en
[la ficha](work/history-replay.md). La [versión publicada](production.md) se registra
por separado.

## Resultados y conservación

Cada partida recibe un UUID independiente de su código de sala. El servidor
registra el reparto inicial, acciones aceptadas de humanos/bots, vencimientos,
conexión y cambios de control. Guarda resultados reales de los sorteos y estados,
sin volver a sortear para reproducirlos. El archivo permanece aunque desaparezca
la sala. Las partidas anteriores a esta implementación no se pueden reconstruir;
si una sala ya iniciada se recupera, su grabación se marca parcial.

- `active`: en curso; aparece en el historial propio, sin replay aún.
- `completed`: final natural después de la última ronda y elecciones pendientes.
  Conserva puntos de rutas, destinos positivos/negativos, estaciones, Express,
  desempates y procedencia detallada (`result.details`).
- `abandoned`: cierre definitivo por abandono/caducidad o fin anticipado de
  práctica. Conserva progreso y puntos parciales de rutas; no declara ganador
  ni liquida destinos/bonificaciones como resultado completado.

Una desconexión breve no cierra el historial. Continúan las reglas existentes de
reconexión, reserva, plazos y deduplicación por ID de acción. Salas normales se
recuperan desde el checkpoint. La práctica conserva su archivo, pero la sesión
activa sigue siendo efímera y no se reanuda tras reiniciar el proceso.

## Acceso

Durante la partida se conserva el filtrado por puesto. Al cerrarse:

| Solicitante | Sala privada | Sala pública |
| --- | --- | --- |
| Participante con identidad verificada | Replay completo y auditoría | Replay completo y auditoría |
| Cualquier otra persona con el enlace | Sin acceso | Replay sin manos, destinos, ofertas ni orden de mazos |

El resultado público muestra puntos, pero no identidades de destinos privados.
Ese filtro se aplica también al espectador en vivo al terminar. Los bots fijos y
los reemplazos usan icono de robot; la vista espectadora no incluye el panel vacío
de mano. Un enlace de observación caducado muestra una alerta visible en Partidas.

`guest-identity.js` crea una cookie aleatoria HttpOnly/SameSite=Lax/Secure en HTTPS,
con duración de un año. Solo su SHA-256 se asocia a los puestos. Borrar esa cookie
sin vincular una cuenta puede perder el acceso; un nombre igual no recupera nada.
OAuth y la consulta autenticada de cuenta vinculan el invitado al UUID del perfil
verificado. La unión es idempotente, conserva el historial previo de la cuenta y
rechaza apropiación por otra. Una identidad ya reclamada no da acceso anónimo;
logout rota la cookie. Los enlaces privados de puesto siguen siendo independientes.

## Grabación y almacenamiento

[match-archive.js](../match-archive.js) recibe observaciones del motor y conserva
estado completo, vistas autorizadas y miembros públicos. [replay-state.js](../replay-state.js)
guarda diferencias y un estado completo cada 32 pasos (y al recuperar un proceso).
Cada paso incluye fecha, acción, eventos y una cadena SHA-256. La cadena detecta
alteraciones accidentales; no equivale a una firma externa contra un administrador
con acceso para reescribir el archivo entero.

Archivo local: `{rooms, archive}` se escribe atómicamente y conserva compatibilidad
con el array anterior. Supabase: [003_match_archive.sql](../supabase/003_match_archive.sql)
crea metadatos, pasos y reclamaciones de invitados. La lectura usa
[004_archive_paging.sql](../supabase/004_archive_paging.sql): primero
metadatos/permisos y después páginas de hasta 16 pasos, tres solicitudes simultáneas.
Se verifica la secuencia completa y se limita al cierre leído; una respuesta parcial
no se presenta como replay válido. El plazo de lectura es 15 s por página, sin cambiar
el plazo ni la autoridad de las escrituras. El RPC v2 guarda checkpoint y
pasos en la misma transacción, valida secuencia y rechaza conflictos, conserva
idempotencia y exclusión de escritores. RLS y permisos impiden acceso directo de
`anon`/`authenticated`; solo Node utiliza las RPC con credenciales del servidor.
Un fallo de guardado pausa también la práctica y sus bots: no se confirma una
jugada cuyo historial no pudo conservarse. El cierre sella el archivo: desconexiones
posteriores o la caducidad de la sala no agregan eventos de abandono a una partida
ya completada. No hay borrado automático del historial. Vigilar el crecimiento de la base; el
archivo no sustituye backups ni recuperación punto en el tiempo.

Al arrancar, los archivos activos sin una sala recuperable se cierran como
abandonados. Un archivo conserva `schemaVersion: 1`, `rulesVersion: europe-classic-1`
y los estados ya proyectados: el replay no ejecuta las reglas nuevas sobre partidas
antiguas. Europa es el único mapa actual. Cualquier mapa/modo futuro debe pasar por
esta misma autoridad, privacidad y grabación, y declarar su versión de reglas.

API HTTP sin caché:

- `GET /api/history`: partidas del invitado/cuenta verificados.
- `GET /api/history/:uuid`: repetición cerrada filtrada; activa 409, privada ajena 404.
- `GET /api/history/:uuid/audit`: JSON completo solo para participantes.

Ninguna respuesta contiene tokens de puesto, cookies o identificadores de propiedad
privados. La auditoría sí contiene las cartas/destinos y el orden de mazos registrado;
compartirla revela esa información de la partida cerrada.

## Interfaz e idiomas

Perfil → Historial filtra todas/en curso/completadas/abandonadas y muestra el
resumen de puntos. Resumen cuenta esos estados por separado. `/replay?id=UUID`
reutiliza el tablero, mano y resultados, sin conexión de juego ni envío de acciones.
Tiene inicio/final, pasos, búsqueda por acción, barra de posición, pausa y velocidades
0,5×, 1×, 2×, 4× y 8×. Los participantes pueden elegir cualquier perspectiva y consultar
cartas/destinos del paso; la vista pública recibe únicamente su proyección.

`i18n.js` y `translations.js` localizan HTML, accesibilidad, mensajes y registros.
Español es el valor inicial; Más → Idioma permite ESP o ENG y guarda `rr-language`.
El cambio recarga la ruta actual, conservando los mecanismos de reconexión.
Las plantillas se traducen antes de interpolar nombres, códigos y otros valores:
los datos del jugador no se traducen ni cambian de identidad. Las ciudades conservan
sus nombres propios. No se han inventado contenidos para Jugar, amigos, chat o las
secciones futuras.

## Verificación y auditoría local

```sh
node --test tests/match-archive.test.js tests/archive-sql.test.js tests/history-server.test.js tests/account-auth.test.js tests/i18n.test.js
node scripts/verify-match-audit.js /ruta/a/trencitos-partida.json
node tests/helpers/history-preview.js
```

El helper crea dos partidas completas y una abandonada en datos temporales, arranca
localhost:3143 y ofrece `/__qa/setup` para una identidad de invitado de prueba.
Nunca cargar ese helper en producción. La ruta de fixture solo existe en el helper,
no en `server.js`. Las pruebas SQL usan PGlite y las de OAuth un proveedor simulado.

# Perfil, Compromiso y relaciones

Contrato del checkout; entrega y configuración pendiente en
[la ficha de trabajo](work/profile-social-statistics.md). No acredita despliegue.

## Identidad y cuenta

El perfil abre **Resumen → Historial → Personalización → Amigos → Cuenta**.
`game_profiles.id` conserva la identidad del juego; `auth_user_id` pertenece a
Supabase Auth. El username, el nombre visible y el proveedor de acceso no sustituyen
esa identidad. No se fusionan perfiles por texto enviado por el cliente.

- Username: 3–20 caracteres ASCII, empieza con letra, admite `a-z`, `0-9`, `_`.
  Se recortan espacios exteriores y normalizan mayúsculas. Tildes, ñ, espacios
  interiores, puntuación, emoji e invisibles se rechazan. La base de datos garantiza
  unicidad y reserva nombres de sistema y prefijos `guest_`, `bot_`, `trencitos_`.
- Se puede cambiar una vez cada 30 días; el anterior queda reservado a su propietario
  por 30 días. La primera elección inicia ese plazo. Las búsquedas de un nombre
  anterior reservado siguen apuntando al mismo perfil.
- Nombre visible opcional, hasta 20 caracteres; permite tildes, ñ y espacios, sin
  controles ni formato invisible. Es una elección pública del jugador: jamás se
  importa automáticamente el nombre real de Google/Discord.
- En sala y partida se muestra únicamente el username. Los detalles accesibles por
  botón/tap y el título al pasar el cursor muestran el nombre visible. Invitados
  reciben un alias `guest_…` único en la sala. Los registros históricos no se renombrarán.
- Migración de apodos: se conserva `nickname` legado. Si cabe, se copia al nuevo
  `display_name`; apodos más largos permanecen en la columna legada y requieren
  una elección explícita. El jugador elige un username disponible antes de entrar
  a una sala nueva con cuenta; no se asignan handles irreversibles arbitrarios.

Google y Discord usan PKCE, BFF y sesiones cifradas, también en apps nativas.
Vincular exige una sesión vigente; el callback verifica que conserve el UUID.
Desvincular Google exige Discord conectado y habilitado como acceso, y viceversa. La última identidad queda
protegida tanto en BFF como en Supabase. Correo e identidades solo se entregan al
propietario; las proyecciones de partida no contienen `accountId`, `guestId`, emails
ni tokens. Las solicitudes de amigos usan perfiles públicos autorizados por sesión.

`GET /api/account/room-profile` entrega una prueba cifrada de perfil, de 60 segundos,
ligada al invitado del dispositivo. Crear/unirse verifica esa prueba antes de asignar
username, avatar y colores; los mensajes WebSocket no pueden suplantar una cuenta
con un ID o nombre arbitrario. La credencial del puesto sigue controlando reconexión.

Cuenta muestra Membresía y región de clasificación **deshabilitadas**, sin guardar
selecciones o suscripciones ficticias. Región tendrá continente, país y subdivisión;
**un cambio por temporada común de tres meses**, cuando se habilite. Calendario y
frontera exacta de temporada quedan pendientes. No elige el servidor de juego.
Apple queda pendiente. También quedan pendientes acceso por correo y novedades:
el consentimiento a novedades será independiente del acceso, con baja explícita.

## Personalización

Primer color preferido → segundo color si está libre → otro del catálogo.
El servidor resuelve disponibilidad. Ambos colores deben ser distintos. Seleccionar
un color dentro de una sala no cambia automáticamente la preferencia del perfil.
Galería: `person` y `capybara`; ambos son válidos en la migración y API. Sin cuenta,
las preferencias se guardan en el dispositivo.

El capibara es una ilustración original generada con el tool integrado `imagegen`,
fondo transparente, cabeza/hocico grandes, cuerpo ovalado sin brazos ni piernas.
Activo: [capybara.png](../frontend/assets/avatars/capybara.png).
Prompt usado: «Create one original compact game profile avatar: a friendly capybara,
warm brown, big recognizable dark brown snout, tiny black eyes, small round ears,
a single smooth oval body below its head, ABSOLUTELY NO ARMS, NO LEGS, NO FEET,
NO LIMBS. Flat clean cartoon illustration with simple bold dark outlines, clear at
32 pixels, three quarter facing right, head and body centered filling 80% of square
with generous uncut margins. Transparent background with actual alpha. No badge,
no circle, no props, no text, no shadow.» No catálogo comercial ni cobros.

## Compromiso

[commitment.js](../backend/commitment.js) registra política de sala y responsabilidad
por participante dentro del mismo checkpoint que la partida. No usa el estado global
`abandoned` para inferir culpabilidad histórica.

- `max(0, 20 − abandonos penalizados en las últimas 20 participaciones computables)`.
  Solo partidas iniciadas con al menos dos humanos originales; excluye Laboratorio
  y práctica. Cancelaciones sin resultado ni salida personal no entran en la ventana. Mostrar muestra real `n/20` y «Sin datos» antes de la primera.
- Desconexión/salida temporal: **120 segundos continuos** para volver. Si se cumple
  el plazo mientras la penalización sigue activa, se registra una sanción irreversible
  para esa participación; volver después permite recuperar control, pero no borra
  esa sanción. Desconexiones breves antes del cierre no reciben sanción.
- **Abandonar definitivamente**, previa confirmación, fija salida y sanción inmediata
  si corresponde; no permite recuperar ese puesto. Un reemplazo que gana después
  no concede una victoria estadística a quien abandonó.
- Cuando al menos `ceil(humanos originales / 2)` están desconectados o cedieron el control al bot durante **60 segundos
  continuos**, se desactivan nuevas sanciones hasta el cierre. Bots originales no
  cuentan; el reemplazo no altera el número original. Volver no reactiva sanciones.
  Incluye el caso de que ya solo queden bots, incluso por inactividad con la conexión abierta. El reemplazo por inactividad no genera por sí solo una sanción de abandono. En un duelo, un humano ausente durante
  60 segundos basta: es una consecuencia deliberada de la regla adoptada.
- Las sanciones anteriores permanecen. Un tick tardío respeta el orden temporal:
  penalizaciones cuyo plazo terminó antes de la desactivación siguen vigentes.
  En empate exacto de plazos prevalece desactivar. La interfaz informa «Puedes
  salir sin penalización por abandono».
- Pausas conocidas de almacenamiento/reinicio no consumen margen de reconexión.
  No se asigna política retroactiva a partidas anteriores sin estos registros.
  Sala con varios humanos vacía caduca a los 120 s; solo humano + bots, a las 24 h.
- **Votaciones pendientes**. Nombre previsto de la acción: «Permitir salir sin
  penalización»; no termina la partida ni perdona sanciones anteriores. Quórum y
  límites definitivos se validarán al implementarla; no hay botones ficticios.

La sustitución tras dos turnos agotados y la devolución de control en un límite
seguro de turno se conservan. Compromiso mide abandono, no resultados ni habilidad.

## Estadísticas

[player-statistics.js](../backend/player-statistics.js) consulta metadatos durables
autorizados; no lee replays completos ni acepta resultados del cliente. `/api/stats`
funciona para cuenta o invitado reconocido. Mapa, reglas, cantidad de participantes,
modo (humanos, mixto o práctica) y período (histórico, 30 o 90 días) delimitan la muestra.
Laboratorio queda excluido. Compromiso mantiene su ventana propia independiente
 de esos filtros. Las mesas habituales muestran los mismos filtros de cohorte.

Partidas jugadas incluye resultados finales válidos y abandonos personales;
activas se muestran aparte. Primer lugar usa ganador oficial o desempate guardado
(puntos, destinos completados, estaciones, Express). Empates oficiales cuentan.
Porcentaje = victorias / jugadas: salir no mejora el porcentaje. Récord, suma y
promedio usan solo puntuaciones finales válidas; no suman puntos parciales ni el
resultado del bot tras abandono. Datos antiguos sin responsabilidad individual
no generan sanciones. Hay desglose de puntos, billetes, Express, mejor red, rachas
y evolución reciente (requiere fijar mapa, reglas, cantidad y modo). Mostrar muestra y período; ausencia de datos no es un cero
inventado de rendimiento.

En el proyecto de estado, `trencitos_player_results` materializa una fila por
partida/puesto mediante trigger transaccional de metadatos. La migración puede
recalcularla sin duplicados y sin modificar frames ni hashes. Cuenta e invitado
reclamado se resuelven para agregados globales. `trencitos_global_snapshots` conserva
90 días de cortes por cohorte y período: muestra, jugadores, máximo, promedio,
mediana e histogramas exactos. Cron diario 08:15 UTC (03:15 Lima), idempotente;
fecha de actualización visible. En modo local se calcula desde el archivo local.

Comparaciones públicas son agregadas, sin exponer partidas privadas ajenas:
percentil del récord frente a resultados (mínimo 30 resultados / 5 cuentas),
percentil del promedio frente a promedios por cuenta con al menos 5 partidas
(mínimo 5 cuentas calificadas; el solicitante también necesita 5 resultados).
Cada cuenta pesa una vez en esa última distribución. Invitados no reclamados y bots
no alimentan la muestra global. No se implementa todavía un leaderboard regional.

## Amigos y mesas habituales

`game_social` exige sesión vigente. Una fila canónica por pareja evita duplicados;
solo el destinatario acepta/rechaza y solo el emisor cancela. Eliminar y bloquear
son explícitos. Máximo 20 solicitudes nuevas por hora; tras rechazo/cancelación/
eliminación, esperar 24 h antes de reenviar. Bloquear impide nuevas solicitudes
mutuas; solo el dueño del bloqueo puede retirarlo. Perfiles públicos solo contienen
username, nombre visible, avatar y color. Amigos aceptados ven presencia en salas,
sin ubicación ni contenido privado de sus partidas.

Solicitudes desde detalles del jugador en sala, partida y resultados (tocar el avatar
en la tabla final conserva sus filas compactas). Perfil tiene
Amigos, Recibidas, Enviadas y Bloqueados. No se incluyen chat, regalos ni reportes.

Mesas personales: nombre + dueño + 1–4 amigos aceptados, máximo 20 mesas. Se incluyen
solo partidas del historial del dueño con **exactamente el mismo grupo humano**.
No generan combinaciones. Se sugieren hasta cinco grupos que ya coincidieron al
menos tres veces y cuyos integrantes son amigos aceptados. El jugador decide
crearlos. Cambiar integrantes implica crear otra mesa, preservando el significado
de la anterior. Las métricas no consultan el historial privado ajeno.

## Configuración y verificación

Aplicar antes de publicar código:

1. Auth: [006_profiles_social.sql](../supabase/006_profiles_social.sql), después de 002.
2. Estado: [007_statistics.sql](../supabase/007_statistics.sql), después de 005.
3. Estado: habilitar Supabase Cron y ejecutar [008_statistics_cron.sql](../supabase/008_statistics_cron.sql).
4. Discord: crear aplicación OAuth, registrar callback de Supabase, configurar
   Client ID/Secret allí y habilitar **Manual Linking**. En el servidor,
   `AUTH_DISCORD_ENABLED=true` solo cuando esté listo. No poner secretos en Git.
   Mantener `AUTH_ENABLED` y callbacks web/nativos existentes; scopes `identify email`.

No se ejecutaron estas migraciones ni se configuró Discord/Cron en producción por
crear estos archivos. Ver [OAuth](GOOGLE_AUTH.md), [despliegue](RENDER_SUPABASE.md)
y evidencia actual en la ficha.

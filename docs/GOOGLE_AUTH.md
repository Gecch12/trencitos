# Google y perfiles: operación

El código está publicado y Auth habilitado en la [versión actual](production.md).
El cliente/proveedor, perfiles SQL, callbacks y variables de Render están configurados.
Una cuenta real autorizada completó acceso, perfil, recarga, recuperación, logout
y segundo acceso. La marca de Google continúa en modo Testing; la matriz restante
se registra en [identidad](work/identity.md).

## Configuración necesaria

1. Usar el proyecto Google Cloud separado «Trencitos» (`trencitos-game`), elegido
   y creado el 2026-10-31. Conserva marca y configuración independientes de
   `trencitos-hq`; no modificar los proyectos ni clientes de otros productos.
2. Marca Trencitos y público externo guardados el 2026-10-31, con correo personal
   de soporte/contacto y aceptación de la política autorizados por el usuario.
   Configurar únicamente los datos básicos `openid email profile`.
   En modo Testing, revisar los usuarios de prueba y las excepciones de Google
   para los permisos básicos de acceso. No se solicita Gmail,
   contactos, Drive ni otros permisos. Revisar publicación/verificación de marca
   antes de abrir el acceso a todos. Antes de hacerlo público, publicar y enlazar
   una política de privacidad fiel al tratamiento de datos y al canal de eliminación
   de cuenta; requisito de la [política de Google](https://developers.google.com/terms/api-services-user-data-policy).
3. Crear cliente **Aplicación web**. Callback autorizado de Google:
   `https://xnvskxwbibrxhozgcube.supabase.co/auth/v1/callback` para ese proyecto.
   Copiar Client ID y Client Secret directamente a Supabase → Authentication →
   Sign In / Providers → Google; habilitar y guardar. No omitir nonce ni confirmación
   de correo. El secreto de Google no pertenece a Render, el navegador del juego o Git.
   Cliente `Trencitos web — producción` creado y Google habilitado en Supabase por
   el usuario, verificados en los dashboards. No se copiaron credenciales al repo.
4. Ejecutar [002_identity.sql](../supabase/002_identity.sql) en el proyecto Auth.
   Es aditivo e idempotente. Crea perfiles y dos RPC con permisos propios; no toca
   `active_games` ni su lease. Tabla con RLS y sin acceso directo para `anon` o
   `authenticated`; las funciones solo operan sobre la cuenta de la sesión vigente.
   Aplicado el 2026-10-31 mediante SQL Editor, resultado `Success. No rows returned`.
5. Supabase → URL Configuration: Site URL de producción
   `https://trencitos-swamp.onrender.com`; permitir exactamente
   `https://trencitos-swamp.onrender.com/auth/callback`. Desarrollo usa otro proyecto
   Auth y su callback `http://localhost:3000/auth/callback` (o puerto elegido).
   Site URL y retorno exacto de producción guardados el 2026-10-31.
6. Configurar en el servidor, sin pegar secretos en chats:

   - `AUTH_ENABLED=true`
   - `AUTH_BASE_URL=https://trencitos-swamp.onrender.com` (origen exacto, sin ruta).
   - `AUTH_SUPABASE_URL=https://xnvskxwbibrxhozgcube.supabase.co`
   - `AUTH_SUPABASE_PUBLISHABLE_KEY`: clave publicable; admite `anon` legado,
     rechaza `service_role`/`sb_secret_`.
   - `AUTH_COOKIE_SECRET`: 32 bytes aleatorios en hexadecimal; generar con
     `openssl rand -hex 32` y guardar en variables protegidas. Cambiarlo cierra las
     sesiones existentes de la app. No mostrar su valor en evidencia.

El 2026-10-31 el usuario introdujo las dos claves y guardó las cinco variables
en Render con **Save only**. Verificadas las filas guardadas sin revelar valores;
El proceso publicado confirma Auth habilitado y redirige al proveedor Google. No usar una clave `service_role`
para Auth ni el Client Secret de Google como secreto de cookie.

El backend de salas conserva `STATE_BACKEND` y sus variables separadas. Un
servidor local siempre usa `STATE_BACKEND=file` y `STATE_FILE` propio, incluso
si se está probando Auth. Nunca ejecutar dos escritores contra el checkpoint de producción.
Node no carga `.env` automáticamente: usar variables del proceso o
`node --env-file=.env server.js`; `.env` debe permanecer ignorado.

## Contrato de identidad

`account-auth.js` recibe OAuth por PKCE, verifica `/auth/v1/user` y opera con el
token de ese usuario. Cookies cifradas AES-GCM, HttpOnly, SameSite=Lax y Secure
en HTTPS, con prefijo `__Host-`; jamás devuelve tokens o metadata Google al JS.
Las mutaciones exigen JSON y Origin exacto. El callback usa destino fijo.
Las sesiones se renuevan en el servidor; caducidad máxima de cookie 30 días tras
renovación. Logout revoca la sesión local en Supabase y elimina cookies.

`game_profiles.id` es un UUID del juego, separado de `auth.users.id` y de email.
El primer acceso conserva el apodo y color elegidos como invitado. Otro dispositivo
carga el perfil persistente; cambios manuales posteriores guardan apodo/color.
`/profile` concentra Cuenta y el botón **Editar perfil**. Su modal valida el
apodo y espera la respuesta de `/api/account/profile`; un fallo deja el modal
abierto y no sustituye el nombre mostrado. Sin cuenta se guarda localmente.
El avatar actual sigue siendo la personita del juego, única opción del modal. Foto/nombre de Google no
se publican; accesorios, tonos de piel y emblemas siguen en [personalización](work/commerce.md).
`game_profile` y `game_update_profile` comprueban `auth.sessions`/`session_id`,
incluida revocación y `not_after`, además de la verificación del servidor.

`account-seats.js` vincula una sala normal solo tras demostrar su credencial de
puesto. No cambia un propietario previo ni permite dos puestos de la misma cuenta
en una sala. Recuperar desde la cuenta es explícito, rota la credencial y reemplaza
la conexión anterior, con guardado confirmado antes de devolver el resultado.
Las cuentas no eliminan el límite de vida de una sala. Sesiones de práctica siguen efímeras, pero sus archivos se conservan.
Logout de cuenta no revoca por sí solo un enlace de partida: son credenciales
distintas, y el enlace conserva su advertencia y control para renovarlo.

## Privacidad y eliminación

Aviso público: `/privacy.html`, enlazado desde el panel de cuenta. Describe los
datos básicos que recibe Supabase de Google, el perfil público del juego, proveedores,
almacenamiento local y separación entre sesión de cuenta y credencial de sala.
El canal inicial es el mismo correo de soporte aprobado para Google. Inicio y aviso
enlazados en la marca de Google; dominio `trencitos-swamp.onrender.com` registrado
para esos enlaces. Guardado verificado el 2026-10-31; la pantalla de Google enlaza
el aviso correcto. Esto no equivale a publicación/verificación de marca.

Ante una solicitud de eliminación, verificar la titularidad desde el correo
asociado, localizar únicamente esa cuenta en Supabase Auth y pedir confirmación
explícita antes de su borrado permanente. Eliminar el usuario Auth elimina su
`game_profiles` por cascada. Confirmar el borrado y explicar que la sala compartida
puede conservar su estado hasta caducar; una cuenta nueva recibe otro UUID y no
hereda los puestos anteriores. No solicitar contraseñas ni enlaces privados.
El aviso no promete eliminar la cuenta de Google ni el historial ajeno de una partida.

## Validación antes de habilitar

```sh
node --test tests/account-auth.test.js tests/account-seats.test.js tests/identity-sql.test.js
```

`identity-sql.test.js` ejecuta la migración en PostgreSQL/WASM (PGlite, solo dev),
con usuarios/sesiones de fixture. `tests/helpers/identity-preview.js` sirve app en
3141 y proveedor OAuth simulado en 3142, con el SQL real y datos efímeros. **No es
una prueba de Google real.** El helper no se despliega ni se sirve como archivo.

Con proveedor configurado: probar consentimiento/cancelación, dos cuentas reales,
perfil entre dispositivos, expiración/logout, recuperación propia y rechazo ajeno.
Confirmar ausencia de tokens/foto/email en vistas WS, almacenamiento JS y logs.
Dejar `AUTH_ENABLED=false` permite jugar como invitado mientras falta configuración.

Referencias oficiales: [Google en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[contrato REST](https://github.com/supabase/auth/blob/master/openapi.yaml).

## Historial de invitado

OAuth y la consulta autenticada del perfil invocan `linkGuest` con el UUID verificado.
El archivo se vincula por cookie privada, nunca por apodo ni por un ID enviado por
el cliente. Logout rota la cookie. Reglas y pruebas en [historial](history-replay.md).
Una solicitud de borrado debe revisar también las reclamaciones y los registros
compartidos del archivo; borrar Auth no elimina automáticamente esos datos.

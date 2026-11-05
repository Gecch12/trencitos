---
{"id":"identity","status":"active","parent":null,"depends_on":["docs-system"],"branch":"main","delivery":"released","updated":"2026-11-03"}
---
# Identidad persistente

Objetivo aprobado: comenzar con Google mediante Supabase Auth, separado del
checkpoint. Código integrado en `main` (`2a46f58`); proveedor Google, perfiles SQL y callbacks
configurados en Supabase. Publicado y habilitado; acceso real verificado con una
cuenta autorizada. La aceptación completa con dos cuentas sigue pendiente.

## Hitos y aceptación

- [x] UUID estable del juego; perfil SQL con apodo, avatar personita y color/vagón.
  Sin email como identidad, sin publicación de foto/nombre Google.
- [x] Flujo PKCE del servidor, cookies protegidas, renovación, logout y UI opcional.
  Verificación del usuario y sesión viva antes de perfil/vinculación/recuperación.
- [x] Práctica invitada; asociación con prueba de credencial de puesto, recuperación
  propia y rotación. Sin dos puestos de la misma cuenta ni sustitución de otra cuenta.
- [x] Pruebas de CSRF, manipulación, caducidad y revocación; permisos SQL ejecutados
  con dos usuarios. Flujo navegador probado con proveedor simulado y SQL real local.
- [x] Configurar proyecto/cliente Google y proveedor; aplicar migración y callbacks.
- [x] Completar variables de Render y publicar el código; acceso real, perfil,
  recarga, recuperación propia y logout con la cuenta autorizada.
- [ ] Completar la matriz con una segunda cuenta real, aislamiento entre cuentas,
  otro dispositivo, cancelación y expiración.
- [x] Publicar el aviso de privacidad, enlazarlo en Google y definir eliminación
  manual por el canal de soporte aprobado.
- [ ] Revisar/verificar la marca Google antes de pasar de Testing a acceso general.
- [ ] Refrescar la lista de salas al salir: puede mostrar un botón obsoleto hasta
  recargar. El servidor ya elimina el puesto; no permite recuperarlo después.

## Evidencia y siguiente paso

Implementación: `account-auth.js`, `account-seats.js`, `account-ui.js`,
`supabase/002_identity.sql`. Procedimiento y contrato canónico en
[Google Auth](../GOOGLE_AUTH.md). [Prueba móvil local](../qa/identity-local-mobile.png).

2026-10-31: flujo de QA (3141/3142) conserva selección invitada Angel QA/azul hielo,
crea perfil, vincula sala 654321, la recupera desde otra pestaña y reemplaza conexión
anterior. Logout y práctica invitada funcionan; móvil 390 px sin overflow, 18 colores.
SQL se valida en PostgreSQL local; no certifica el proveedor remoto ni un despliegue.
Suite completa `npm test`: 317 pruebas correctas, sin fallos (43,8 s).
Tras incorporar el aviso de privacidad y la grúa revisada, nueva ejecución completa:
317 correctas, cero fallos (47,2 s). Requiere puertos locales fuera del sandbox;
el primer intento restringido falló con `listen EPERM`. Aviso revisado visualmente
en 3143 y enlace accesible desde el inicio; rutas públicas verificadas por HTTP.

Decisión: proyecto Google separado «Trencitos», aprobado y creado el 2026-10-31
con ID `trencitos-game`; `trencitos-hq` permanece sin modificar. Siguiente paso:
validar una segunda cuenta real autorizada y la matriz pendiente, y revisar marca.
Publicación autorizada por el usuario tras esperar su partida; revisión, estado y
QA remotos en [producción](../production.md). Auto-Deploy desactivado por la
publicación manual del commit exacto; verificado en el dashboard.
Marca guardada tras
aceptar la política de Google con autorización explícita del usuario. Correo personal
de soporte aprobado; público externo en modo Testing. Cliente `Trencitos web — producción`
creado y proveedor Google habilitado por el usuario, verificados en los dashboards.
Tras confirmar que no existían perfiles, el usuario autorizó ambos cambios remotos:
`002_identity.sql` ejecutado con éxito; Site URL y único redirect exacto de producción
guardados. El usuario completó las dos claves y guardó las cinco variables en Render
con **Save only**; verificado el listado guardado sin revelar valores. Las credenciales
quedan fuera del chat/Git. Aviso de privacidad y procedimiento manual de eliminación
publicados en `/privacy.html` y la guía canónica; enlaces de inicio/privacidad
guardados en la marca de Google. El selector de Google muestra el enlace correcto.

Fuente técnica: [Google en Supabase Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
Accesorios, emblemas y tonos de piel continúan en [personalización](commerce.md).

2026-10-31, producción HTTPS/Chrome: el usuario autorizó expresamente su cuenta y
los datos básicos de Google. Consentimiento correcto, retorno `auth=ok`, perfil
elegido conservado tras recarga. Sala temporal propia recuperada desde otra
pestaña por el botón de cuenta: mismo puesto, conexión anterior sin control.
Salida voluntaria de la sala, eliminación comprobada al recargar, cierre de sesión
real con retorno a invitado; segundo acceso correcto a la misma cuenta, conservando
el perfil. Sesión dejada iniciada al usuario. Capturas de esta comprobación solo en
`.qa/release-2a46f58/`, fuera de Git, sin subir datos de la cuenta real.
No se usó una segunda cuenta ni otro dispositivo.
La revisión automática inicial bloqueó la selección entre varias cuentas; se
continuó únicamente después de recibir autorización específica del usuario.


## Entrada automática a un puesto vinculado · 2026-11-03

Ampliación aprobada: abrir la URL de la sala recupera el puesto de la cuenta
verificada, aunque este navegador carezca de credencial local. Login conserva
la sala de destino. La recuperación reutiliza la credencial vigente; una antigua
se rota solo tras comprobar propiedad. La pestaña sustituida detiene reconexiones.
El bot devuelve automáticamente el control al reconectar, respetando el límite
existente del turno en curso. Los enlaces privados se ocultan solo después de
verificar la vinculación; «Recuperar control» sigue disponible por separado.

Verificado con proveedor local simulado, cookies reales del servidor y WebSocket:
login conserva la sala, nueva sesión recupera sin almacenamiento local, el bot
cede fuera de turno, la recarga reutiliza la credencial y retomar explícitamente
desde la pestaña anterior no provoca alternancia automática. Invitados no adquieren
el puesto ajeno. [Informe](../qa/card-experience/account.json).
Esta ampliación se publicó en la entrega conjunta siguiente; no se repitió OAuth real de Google.

## Publicación conjunta · 2026-11-03

La implementación de esta ficha quedó publicada en `ef65487`, Live en Render
tras CI aprobado. El alcance publicado, las comprobaciones de producción y
sus límites están en [Producción](../production.md).

Ampliación local del perfil y sus flujos: [perfil, Compromiso y relaciones](profile-social-statistics.md).
La evidencia histórica de esta ficha no acredita el nuevo OAuth Discord ni su despliegue.

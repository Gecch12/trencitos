---
{"id":"identity","status":"active","parent":null,"depends_on":["docs-system"],"branch":"main","delivery":"integrated","updated":"2026-10-31"}
---
# Identidad persistente

Objetivo aprobado: comenzar con Google mediante Supabase Auth, separado del
checkpoint. Código integrado en `main` (`2a46f58`); proveedor Google, perfiles SQL y callbacks
configurados en Supabase. Aplicación todavía sin activar ni probar con Google real.

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
- [ ] Completar variables de Render, publicar código y validar consentimiento,
  perfil/recuperación y logout con dos cuentas reales.
- [ ] Publicar el aviso de privacidad y definir eliminación de cuenta antes de
  abrir Google al público, según el procedimiento de activación.

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
desplegar `2a46f58` cuando termine la sala abierta y probar acceso real;
variables guardadas por el usuario y verificadas. El usuario pidió esperar a que
termine la sala. `/healthz` indicó `ok: true`, `storage: supabase`, `rooms: 1`;
no se inició ningún despliegue. Commit subido con `[skip render]`: el dashboard
tenía Auto-Deploy en On Commit. Publicación manual preparada con ese commit exacto;
el diálogo indica que desactivará Auto-Deploy al ejecutarla.
Marca guardada tras
aceptar la política de Google con autorización explícita del usuario. Correo personal
de soporte aprobado; público externo en modo Testing. Cliente `Trencitos web — producción`
creado y proveedor Google habilitado por el usuario, verificados en los dashboards.
Tras confirmar que no existían perfiles, el usuario autorizó ambos cambios remotos:
`002_identity.sql` ejecutado con éxito; Site URL y único redirect exacto de producción
guardados. El usuario completó las dos claves y guardó las cinco variables en Render
con **Save only**; verificado el listado guardado sin revelar valores. Las credenciales
quedan fuera del chat/Git. Aviso de privacidad y procedimiento manual de eliminación
preparados en `/privacy.html` y la guía canónica; pendientes de publicación/enlace en Google.

Fuente técnica: [Google en Supabase Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
Accesorios, emblemas y tonos de piel continúan en [personalización](commerce.md).

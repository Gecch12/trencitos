# Render Free + Supabase Free

El juego es una aplicación Node con WebSockets y enlaces privados. Esta guía configura
el checkpoint de salas. El acceso opcional con Google requiere además
[su configuración independiente](GOOGLE_AUTH.md); no se activa por configurar
el guardado ni usa su clave secreta. El navegador no accede directamente a la base.

## 1. Preparar Supabase

1. En tu cuenta propia, crea un proyecto en una organización **Free**. Usa una contraseña de base de datos fuerte y guárdala; no la necesitas para configurar esta aplicación.
2. Elige una región próxima a la de Render para reducir la demora al confirmar cada jugada.
3. En **SQL Editor → New query**, copia el contenido completo de [`../supabase/001_active_games.sql`](../supabase/001_active_games.sql) y ejecútalo.
   Para la versión con historial, ejecutar además [003_match_archive.sql](../supabase/003_match_archive.sql) y [004_archive_paging.sql](../supabase/004_archive_paging.sql) antes de desplegar el código. La entrega modular añade [005_checkpoint_delta.sql](../supabase/005_checkpoint_delta.sql) para transferir solo salas modificadas, manteniendo compatibilidad con las RPC previas. Son aditivas y conservan las salas existentes; no inician un segundo escritor.
4. En **Settings → API Keys**, crea o copia una **secret key** (`sb_secret_…`). No uses una publishable key ni una clave legacy `anon`. Copia también el **Project URL**, con formato `https://….supabase.co`, desde el diálogo Connect o la configuración de API.
5. Deja la Data API habilitada para `public`. La tabla tiene RLS activado, sin políticas públicas; `anon` y `authenticated` no pueden leerla ni ejecutar las funciones. Solo el servidor, con su clave secreta, accede a los datos.

El script es aditivo e idempotente: crea su propia tabla y funciones, sin borrar datos ni tocar otras tablas. Vuelve a ejecutarlo únicamente desde una cuenta autorizada. No desactives RLS para solucionar un error de permisos.

## 2. Preparar Render

1. Conecta el repositorio mediante **Git Provider**, con la app Render autorizada
   sobre él por su propietario. Una URL pública permite desplegar manualmente,
   pero no aporta los eventos Git necesarios para autodeploy. No hace falta
   cambiar la visibilidad del repositorio.
2. Usa **New → Blueprint**, selecciona el repositorio y `render.yaml`. Si `trencitos` es una subcarpeta en el repositorio remoto, configura esa ruta como raíz del servicio y la ruta correcta del Blueprint; si el repositorio contiene directamente `package.json`, usa la raíz.
   Si ya existe el Blueprint, reutilízalo: no crees otro. `render.yaml` conserva el nombre `trencitos-swamp` para actualizar el servicio existente.
3. Verifica **Free** antes de crear. No agregues discos ni bases Render de pago.
4. Configura estas variables en Render:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `STATE_BACKEND` | `supabase` |
| `SUPABASE_URL` | El origen HTTPS de tu proyecto, sin `/rest/v1` |
| `SUPABASE_SECRET_KEY` | La secret key `sb_secret_…`, **solo en Render** |

5. Build: `npm install --omit=dev`. Start: `npm start`. Health check: `/healthz`.
6. Configura **Auto-Deploy → After CI Checks Pass**, rama `main`. El Blueprint
   declara `autoDeployTrigger: checksPass`. Verifica primero que el workflow
   [CI](../.github/workflows/ci.yml) esté habilitado y termine correctamente en GitHub.

En un servicio existente, añade las dos variables de Supabase manualmente: `sync: false` evita guardar secretos en Git, pero no los configura automáticamente. Completa primero el SQL y las variables; esta versión no arranca en Render sin Supabase. Un estado **Live** de una versión anterior no confirma que el guardado remoto esté conectado.

No copies la clave en `app.js`, `render.yaml`, capturas o mensajes. `.env*` queda fuera de Git y Docker; `.env.example` solo documenta nombres. La aplicación Node no carga archivos `.env` automáticamente. En un entorno local aislado se puede usar `node --env-file=.env.local server.js`, **con un proyecto de pruebas distinto**.

### Publicación continua

La configuración ya está guardada, pero **la entrega automática aún no está
operativa**: falta el acceso Git de Render a `Gecch12/trencitos`. Diagnóstico,
evidencia y acción del propietario en [la ficha](work/continuous-delivery.md).

El flujo acordado es `push a main → CI → Render`. CI instala con `npm ci`, ejecuta
documentación y toda la suite Node, y comprueba en Chrome el lobby multijugador
y la respuesta/recuperación de cartas. No accede a Supabase real. Si las pruebas
fallan o no hay checks, Render no debe desplegar automáticamente ese commit.
La instalación del servicio sigue usando únicamente dependencias de producción.

Los filtros en [render.yaml](../render.yaml) ignoran cambios exclusivamente en
`docs/**`, Markdown, `experiments/**` y el servidor/pruebas del estudio histórico
de pasajeros. Un push que también cambie código del juego sí activa la entrega.
GitHub continúa validando los cambios documentales aunque Render no los publique.
`[skip render]` se reserva para omitir deliberadamente una publicación, por ejemplo
si el código requiere una migración aún no aplicada; no se añade por rutina a
commits funcionales. No usar `[skip ci]` para publicar saltándose las pruebas.

Los filtros afectan autodeploys de código; los despliegues manuales y cambios de
configuración/Blueprint tienen reglas distintas. Revisa modificaciones de
`render.yaml` antes de subirlas: su sincronización no se omite por estos filtros.
No uses un despliegue manual para sortear un CI fallido. Desplegar un commit
específico puede desactivar Auto-Deploy en Render; tras una recuperación comprueba
que vuelva a `After CI Checks Pass` cuando corresponda.

La política automática se acepta para esta etapa de pruebas. Cada publicación
reemplaza el proceso y requiere reconexión de WebSockets; CI no espera a que
terminen las partidas. Cambios de SQL/credenciales se coordinan antes del código.
El estado Live y la revisión publicada se registran en [Producción](production.md),
y la evidencia de activación en [la ficha](work/continuous-delivery.md).

Referencias: [CI y despliegues](https://render.com/docs/deploys),
[integración Git](https://render.com/docs/git-provider),
[filtros](https://render.com/docs/monorepo-support),
[Blueprint](https://render.com/docs/blueprint-spec),
[conexiones durante despliegues](https://render.com/docs/websocket).

## 3. Prueba de aceptación real

Las pruebas automáticas usan una simulación de la Data API; estos pasos validan el proyecto real, la migración SQL y las credenciales:

1. Abre `https://TU-SERVICIO.onrender.com/healthz`. Debe devolver 200 y `{"ok":true,"storage":"supabase",…}`.
2. En dos navegadores crea y comienza una sala **normal**, no una sala de pruebas. Conserva los enlaces privados de recuperación.
3. Elige destinos y roba una carta. Comprueba que el contador de mano aumenta después de confirmarse.
4. Desde Supabase, verifica que `ferrovia_checkpoint.version` aumenta. No compartas el contenido de `rooms`: incluye manos, mazo y destinos secretos.
5. Reinicia manualmente el servicio en Render. Reconecta los navegadores dentro de los 60 segundos posteriores al arranque: mismo código, puesto, mano, rutas y elección pendiente. Los contadores conservan el tiempo pendiente, descontando el tiempo jugado, no el de caída.
6. Repite con dos o tres salas simultáneas. Las salas con bots de práctica son efímeras intencionalmente y no sirven para probar persistencia.
7. Verifica que `/.env`, `/supabase-store.js`, `/room-state.json` y `/supabase/001_active_games.sql` respondan 404.

## Recuperación y límites

- **Error al arrancar:** revisa Project URL, secret key, migración, Data API y si Supabase está pausado. El servidor no reemplaza un fallo de lectura por una lista vacía.
- **Partida pausada por guardado:** resuelve la conectividad/credencial, reinicia Render y reconecta. Si la respuesta se perdió pero la escritura llegó, se recupera el estado de la base, no se sobrescribe con memoria antigua. La repetición de una acción conserva su ID para evitar robar dos veces.
- **Otro servidor tomó control:** no ejecutes dos servicios/preview/local con el mismo proyecto. El nuevo proceso invalida al anterior para impedir dos autoridades sobre una partida. No es una arquitectura multi-instancia.
- **Todos se fueron:** se mantiene la regla acordada de abandonar tras 60 segundos sin jugadores conectados. Esto es distinto a una caída del proceso con jugadores activos: esa partida se recupera desde el checkpoint.
- **Retención:** el checkpoint contiene las salas vigentes, con caducidad de 24 horas. El archivo histórico separado conserva pasos/resultados sin caducidad automática: [contrato](history-replay.md). Vigilar tamaño de base y backups; no ofrece recuperación punto en el tiempo.
- **Gratuidad:** confirma los planes Free y vigila límites de uso en ambos paneles. Render puede suspender o reiniciar el servicio; Supabase puede pausar proyectos inactivos. No se prometen costes cero fuera de los límites gratuitos ni disponibilidad continua.

Fuentes: [Render Free](https://render.com/docs/free), [Supabase Pricing](https://supabase.com/pricing), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api).

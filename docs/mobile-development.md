# Pruebas móviles con Capacitor

El modo de desarrollo genera **Trencitos Dev** (`com.trencitos.dev`) para el
emulador Android y el simulador iOS en una Mac. Es una integración de desarrollo:
la interfaz se carga desde el servidor local mediante el modo de desarrollo de
Capacitor. El servidor sigue ejecutando reglas, bots, salas e historial.
No es un paquete para tiendas ni una implementación de juego sin conexión.

El modo **beta** genera **Trencitos** (`com.trencitos.beta`), con la interfaz
incluida y conexión al servidor público. No requiere que la Mac esté encendida.
Los comandos de ambos modos se describen abajo; no intercambiar los paquetes.

## Preparación

Desde la raíz del repositorio, ejecutar `npm ci`. Capacitor 8.6.0 y su plugin
App 8.1.2 son dependencias de desarrollo; `npm ci --omit=dev` conserva el servidor
de producción sin instalar herramientas móviles.

- Node.js 22 o superior para la CLI móvil; el servidor conserva su requisito propio.
- Xcode 26 o superior y un runtime de iOS Simulator instalado.
- Android SDK con plataforma 36, herramientas de compilación y un AVD ARM64 en
  Apple Silicon. En esta Mac se preparó `Trencitos_API_36` con Android 16.
- JDK 21. El lanzador busca Java 21 mediante `java_home` en macOS si no se ha
  definido `JAVA_HOME`; respeta un valor proporcionado explícitamente.
- Android Studio 2025.2.1 o superior para abrir y sincronizar el proyecto en el IDE.
  La compilación por consola usa el wrapper Gradle y no necesita actualizar el IDE.

Las primeras compilaciones descargan Gradle/Maven y paquetes Swift. Referencias:
[entorno Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup),
[desarrollo con servidor local](https://capacitorjs.com/docs/guides/live-reload).

## Ejecutar

Terminal 1, mantener abierta:

```sh
npm run mobile:server
```

Para iPhone, en otra terminal, elegir un dispositivo cuando se solicite:

```sh
npm run mobile:ios
```

Para Android, abrir primero el emulador si no está ejecutándose:

```sh
npm run mobile:emulator
```

Esperar a que aparezca Inicio de Android. Mantener esa terminal abierta y,
desde otra, instalar y abrir la app:

```sh
npm run mobile:android
```

Se puede seleccionar uno explícitamente con `-- --target ID`. Los lanzadores
sincronizan recursos y plugins antes de compilar, instalar y abrir la app.
Ambos dispositivos y el navegador pueden compartir partidas del servidor local.

`mobile:emulator` prefiere el AVD `Trencitos_API_36`, o el primero disponible.
Se puede elegir otro con `npm run mobile:emulator -- NOMBRE_AVD` o
`TRENCITOS_ANDROID_AVD`. Usa arranque en frío, 3 GB de RAM y GPU del anfitrión
con Vulkan desactivado. El antiguo AVD API 34 de esta Mac cargaba las etiquetas
pero dejaba el mapa invisible; SwiftShader llegó a fallar dentro del emulador.
La configuración actual usa una imagen reciente y OpenGL, siguiendo las
[opciones gráficas de Android Emulator](https://developer.android.com/studio/run/emulator-acceleration).

Para trabajar desde los IDE:

```sh
npm run mobile:open:ios
npm run mobile:open:android
```

Elegir el simulador/emulador y pulsar Run. Estos comandos sincronizan antes de
abrir el proyecto; mantener igualmente `mobile:server` en ejecución.
`mobile:sync:ios` y `mobile:sync:android` solo sincronizan.

## Red y datos

- Servidor: `http://localhost:3180`, escuchando únicamente en `127.0.0.1`.
- iPhone simulado: `http://localhost:3180`.
- Android emulado: `http://10.0.2.2:3180`, alias del equipo anfitrión.
- Estado e historial locales: `.qa/mobile/rooms.json` y su archivo asociado.
- Cuenta: invitado; el servidor fuerza `AUTH_ENABLED=false`, `STATE_BACKEND=file`
  y su propio archivo antes de cargar módulos, aunque el entorno heredado indique
  Supabase. No carga `.env` ni usa el checkpoint de producción.

Para cambiar de puerto, definir `TRENCITOS_MOBILE_PORT=3181` tanto al arrancar
el servidor como al sincronizar/ejecutar las apps. Solo se admiten puertos
1024–65535 y las direcciones locales indicadas; no hay URL remota configurable.
El comando de ejecución comprueba la identidad y salud del servidor móvil.

La política HTTP de Android se habilita solo en el manifiesto Debug. iOS permite
red local mediante `NSAllowsLocalNetworking`. Las configuraciones generadas con
la dirección del servidor no se versionan. Sin plataforma explícita,
`capacitor.config.js` genera una pantalla de ayuda local, sin URL externa.
`mobile/web/offline.html` explica cómo arrancar el servidor cuando no responde.

Los cambios de HTML, CSS y JavaScript se sirven directamente; terminar la app
y volver a abrirla los carga de nuevo. Cambios nativos, de plugins o de puerto requieren
volver a ejecutar el lanzador. Al volver del segundo plano se renueva el socket
y se usa la recuperación existente del puesto. El botón Atrás de Android cierra
diálogos opcionales o minimiza la app, sin abandonar la sala ni saltar elecciones
obligatorias. Los relojes de la partida siguen avanzando según las reglas.

## Verificación y límites

```sh
node --test tests/mobile-development.test.js tests/mobile-ui.test.js tests/deployment.test.js
node scripts/check-docs.js
```

Las pruebas comprueban aislamiento del servidor, configuración local, eventos
nativos y recursos del cliente. La evidencia de compilación y dispositivos está
en [la ficha de integración](work/mobile-capacitor.md).

Con el servidor y la app Android ya abiertos, se puede repetir el recorrido nativo:

```sh
npm run test:mobile:android
```

La prueba usa el WebView del emulador: crea una sala con bot, confirma destinos,
comprueba que el framebuffer contiene colores del mapa (no solo un fondo
uniforme) y verifica la reconexión al pasar al fondo y regresar.
Guarda capturas e informe en `.qa/mobile/`. Por defecto utiliza `emulator-5554`;
`QA_ANDROID_SERIAL` permite elegir otro. `QA_ROOM` permite entrar en una sala
creada desde iPhone o navegador; su anfitrión debe iniciar la partida y elegir
destinos mientras la prueba espera.

La primera entrega se probó con invitados. El checkout incorpora el flujo de
Google nativo descrito en [Google Auth](GOOGLE_AUTH.md); requiere actualizar tanto
servidor como paquete. Enlaces de invitación que abren directamente la app,
notificaciones y publicación en tiendas requieren trabajo posterior. La beta firmada para Android se describe abajo.
Las pruebas en simulador/emulador no certifican batería ni rendimiento en teléfonos.
El controlador OpenGL de esta Mac emite un aviso inicial `GL_INVALID_ENUM` en
`GetIntegerv`; queda registrado como aviso gráfico. Con la imagen API 36 se
verificaron el mapa visible, sus píxeles y la reconexión, sin errores JavaScript.
El retorno del segundo plano conserva la partida mientras sigue vivo el proceso.
Tras terminar la app, se vuelve a entrar con el código de sala.

Si el servidor no responde, ejecutar `mobile:server` y cerrar/reabrir la app.
Si el puerto está ocupado, comprobar si ya pertenece a este servidor o cambiarlo
en ambos terminales; no detener procesos ajenos. El estado de desarrollo se
conserva al detener el servidor con Ctrl+C.

## Beta para compartir y usar fuera de la Mac

El servidor predeterminado es [Trencitos](https://trencitos-swamp.onrender.com).
`mobile-bundle.js` copia únicamente la lista de recursos públicos y añade una
configuración pública del servidor y CSP. El motor, las claves y el estado no
se incluyen. `mobileConfig` omite `server.url` en beta: Capacitor sirve la
interfaz dentro de la app. Las API y WebSocket usan HTTPS/WSS por Internet.

```sh
npm run mobile:beta:android
npm run mobile:beta:ios
```

Estos comandos sincronizan y ejecutan el paquete en el dispositivo seleccionado.
Para los IDE: `mobile:beta:open:android` y `mobile:beta:open:ios`.
`TRENCITOS_BETA_SERVER` permite otro origen HTTPS, sin credenciales ni rutas.
Solo para QA local, `TRENCITOS_MOBILE_QA=1` permite localhost o `10.0.2.2` por
HTTP y la inspección de WebView. **`mobile:apk` fuerza QA desactivado** y rechaza
servidores locales. La beta distribuida no tiene depuración web ni tráfico HTTP.

Las apps nativas usan un invitado persistente por instalación y servidor,
independiente de Safari/Chrome; puede vincularse a la misma cuenta Google. Su credencial
aleatoria se guarda en localStorage; se envía en `X-Trencitos-Guest` para lecturas
de historial y como subprotocolo WebSocket, nunca en la URL. El servidor acepta
solo los orígenes locales exactos de Capacitor. La sesión de cuenta cifrada viaja
en `X-Trencitos-Session`, se renueva por cabecera expuesta CORS y se conserva en
Keychain/Keystore, nunca localStorage. El servidor conserva el control de los
puestos y filtra el historial privado. Las invitaciones apuntan a la web pública;
para entrar en la app se puede introducir el código. Borrar los datos o
desinstalar elimina la identidad local; conservar el enlace de recuperación.

### Android: generar y entregar el APK

La [beta 0.6.1 build 3 publicada](https://github.com/Gecch12/trencitos/releases/tag/v0.6.1-mobile-beta-build3)
incluye el APK listo para compartir y su hash; no es necesario compilar para
instalar esa versión. Para generar una actualización:

```sh
npm run mobile:apk
```

Produce `dist/trencitos-<versión>.apk` y su SHA-256. La primera ejecución crea
la clave en `.private/android-signing/` con permisos restringidos; las siguientes
la reutilizan. **Respaldar esa carpeta de forma privada:** permite firmar futuras
actualizaciones. Nunca compartirla ni incluirla en Git. `dist/`, `.private/` y
los recursos generados están ignorados. Al publicar una nueva versión, aumentar
también `versionCode` en `android/app/build.gradle`.

Enviar a los amigos únicamente el APK o su enlace de descarga. Deben abrirlo
en Android y autorizar «Instalar aplicaciones desconocidas» para el navegador
o gestor que utilicen si Android lo solicita. No requiere Google Play ni pagar
una membresía. Las actualizaciones se instalan encima con la misma firma.
El juego necesita Internet y depende de la disponibilidad del servidor gratuito.

### iPhone: instalación personal gratuita

1. Conectar y desbloquear el iPhone; activar Modo de desarrollador si iOS lo pide.
2. Ejecutar `npm run mobile:beta:open:ios`.
3. En Xcode → Settings → Accounts, iniciar sesión con la cuenta Apple propia.
4. Seleccionar el target App → Signing & Capabilities → Automatically manage
   signing y el **Personal Team**; elegir el iPhone y pulsar Run.
5. Si iOS lo pide, confiar en la firma en Ajustes → General → VPN y gestión
   de dispositivos. No se necesita compartir la contraseña con el asistente.

La firma gratuita caduca a los siete días. Volver a ejecutar desde Xcode la
renueva; no borrar la app para conservar sus datos. No habilita TestFlight ni
distribución de archivos instalables a otros iPhone. [Límites oficiales de Apple](https://developer.apple.com/help/account/basics/about-your-developer-account).
Si Xcode no puede preparar un iOS reciente, comprobar primero que el teléfono
esté desbloqueado y actualizar sus componentes con
`xcodebuild -runFirstLaunch -checkForNewerComponents`.

### iPhone: web en Inicio sin renovación semanal

En Safari abrir [Trencitos](https://trencitos-swamp.onrender.com), pulsar
Compartir → Añadir a pantalla de inicio y activar «Abrir como app web» si aparece.
Esta opción funciona sin la firma de Xcode ni membresía Apple y mantiene las
funciones de la web, incluido Google cuando esté configurado.

El manifest y los iconos pertenecen al servidor. El service worker conserva solo
una pantalla de desconexión y sus recursos: no almacena partidas, historial,
respuestas de cuenta ni enlaces de recuperación. Al regresar Internet, el botón
de reintento vuelve al juego. No permite jugar sin conexión. Esta pantalla es
distinta de la ayuda del servidor de desarrollo de Capacitor.

### Verificar la beta

```sh
node --test tests/mobile-beta.test.js tests/mobile-development.test.js tests/deployment.test.js
node tests/browser-pwa.cjs
```

Para repetir Android empaquetado contra el servidor local aislado, sincronizar
con `TRENCITOS_MOBILE_QA=1` y `TRENCITOS_BETA_SERVER=http://10.0.2.2:3180`, luego
ejecutar `TRENCITOS_MOBILE_MODE=beta npm run test:mobile:android`.
La prueba exige el origen local de la WebView, el protocolo nativo, historial,
mapa visible y recuperación. `TRENCITOS_MOBILE_PORT` selecciona el puerto QA.
Evidencia y estado de entrega en [la ficha de beta](work/mobile-beta.md).

## Entrega repetible

El skill [trencitos-publicar](../skills/trencitos-publicar/SKILL.md) está instalado
para Ángel como `$trencitos-publicar`. Sigue las instrucciones de este documento
y del despliegue; entrega la página de Release, verifica Render Live e instala
sobre el iPhone conectado. Crear o modificar el skill no ejecuta una publicación.

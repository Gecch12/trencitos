---
{"id":"mobile-capacitor","status":"done","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-04"}
---

# Trencitos en Android e iOS con Capacitor

## Objetivo y alcance

Preparar y probar Trencitos en el emulador Android y el simulador iPhone de esta
Mac, con Capacitor y un servidor local aislado. El usuario autorizó implementar
esta integración después de evaluar Capacitor y Tauri. No incluye publicación
en tiendas, Google nativo ni cambios en producción.

La operación y sus límites se describen en [pruebas móviles](../mobile-development.md).

## Hitos

- [x] Proyectos nativos, configuración local y comandos reproducibles.
- [x] Servidor de invitados con almacenamiento propio, sin Supabase heredado.
- [x] Integración de retorno del segundo plano y botón Atrás de Android.
- [x] Compilar, instalar y abrir en iOS Simulator y Android Emulator.
- [x] Comprobar una partida y recuperación en ambos dispositivos; validar docs.

## Evidencia

- Capacitor 8.6.0 y App 8.1.2; Xcode 26.0.1, JDK 21 y SDK Android 36.
- `node --test tests/mobile-development.test.js tests/mobile-ui.test.js tests/deployment.test.js`:
  22 pruebas correctas en esta revisión local.
- Xcode: `BUILD SUCCEEDED`, Debug para iPhone 17 Pro con iOS 26.0.
- Gradle: `BUILD SUCCESSFUL`; app Debug instalada en `Trencitos_API_36`,
  dispositivo virtual Pixel 7 Pro con Android 16 ARM64.
- `mobile:ios -- --target C41F133B-2631-41FE-B5BF-9E6F46A22BDC` y
  `mobile:android -- --target emulator-5554`: compilación, instalación y apertura correctas.
- iPhone y Android entraron juntos en la sala local `96350560`, confirmaron
  destinos y mostraron el tablero Three.js. En iPhone se comprobó visualmente
  el regreso desde Inicio y la recuperación del control del mismo puesto.
- `npm run test:mobile:android`: recorrido nativo correcto, sin errores JS;
  comprobó plugin App, partida con bot y un nuevo WebSocket al volver del fondo,
  manteniendo sala, puesto y destinos. En API 36/WebView 133 el muestreo del
  framebuffer encontró 17 colores y la captura confirmó mapa y vías visibles.
  El aviso inicial del controlador `GL_INVALID_ENUM / GetIntegerv` permanece
  registrado en `graphicsWarnings`; no se presenta como consola sin avisos.
- `npm run test:ci`: 689 pruebas correctas, cero fallos.
- `node scripts/check-docs.js` y `git diff --check`: correctos.
- En esta Mac se instalaron SDK 36, su imagen Google APIs ARM64 y herramientas
  de compilación; se creó `Trencitos_API_36` sin borrar el AVD anterior. Se actualizó
  el emulador a 37.2.13 y platform-tools a 37.0.1 para arrancar el AVD existente.
  Android Studio sigue en 2023.2; la consola compila con JDK 21 y el wrapper
  Gradle. Para abrir el proyecto en el IDE se necesita actualizar Android Studio.
- El AVD API 34 original tenía WebView 113 y mostró etiquetas sin geometría;
  el modo SwiftShader sufrió un fallo en su implementación Vulkan. Se descartaron
  ambos resultados para la validación visual. `mobile:emulator` reproduce el
  arranque del nuevo AVD con GPU del anfitrión, Vulkan desactivado y 3 GB de RAM.
- Logs y capturas de la ejecución local en `.qa/mobile/` (no versionados).
- Integrado en `main` mediante `fc41133`; la distribución por Internet y los
  paquetes entregados se verificaron en [la beta gratuita](mobile-beta.md).

## Siguiente paso

Probar la experiencia de juego desde ambas apps. El alcance local está terminado
e integrado; instalación en teléfonos y distribución se describen en
[la beta gratuita](mobile-beta.md).

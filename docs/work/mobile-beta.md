---
{"id":"mobile-beta","status":"active","parent":null,"depends_on":["mobile-capacitor"],"branch":"main","delivery":"none","updated":"2026-11-04"}
---

# Beta gratuita en teléfonos

## Alcance acordado

Ángel aprobó una beta con la interfaz incluida y el servidor existente por
Internet: APK firmado para amigos Android, instalación personal gratuita desde
Xcode y web añadida a Inicio en iPhone. Sin membresía Apple de pago, TestFlight,
tiendas ni servicios adicionales de pago. El juego conserva la autoridad del
servidor y los datos existentes.

## Hitos

- [x] Empaquetar únicamente recursos públicos y configurar HTTPS/WSS remoto.
- [x] Invitado nativo persistente, historial privado y recuperación comprobados.
- [x] Manifest, iconos y pantalla sin conexión para la web instalada.
- [x] APK release firmado con clave privada conservada fuera de Git.
- [x] Pruebas locales, compilaciones nativas y recorrido del paquete real.
- [ ] Publicación del servidor compatible y entrega del APK descargable.
- [x] Instalación personal iPhone si la cuenta y el dispositivo permiten firmar.

## Evidencia y estado

- Base `e8c0823` más integración local Capacitor de la ficha anterior.
- Servidor existente `https://trencitos-swamp.onrender.com`: salud correcta,
  almacenamiento Supabase y cero salas al comenzar la preparación.
- Suite Node local: 693 casos; se actualizó una expectativa de `/healthz` por
  el nuevo `mobileProtocolVersion` y sus diez casos de Supabase pasaron de nuevo.
  Los demás casos pasaron. Logs `node-tests.log` y `supabase-retest.log`.
- Chrome: 30 grupos de regresión de lobby, robos, cartas y recuperación de
  cuentas, sin errores, más manifest/iconos/desconexión/privacidad de PWA.
- Android empaquetado: origen `https://localhost`, WebSocket nativo remoto,
  historial del invitado, partida con bot, 17 colores en framebuffer y recuperación
  al volver del fondo, sin errores JS. Persisten avisos GL del controlador emulado.
- iPhone simulado: paquete beta conectado al servidor QA de archivos, sala
  creada y tablero visible. Captura `ios-game.png`.
- APK release: firma RSA-3072 verificada; contiene interfaz, destino HTTPS y
  depuración desactivada. Clave bajo `.private/android-signing/`, fuera de Git.
- iPhone 17 Pro Max físico: compilación Release firmada, instalación y apertura
  correctas después de que Ángel autorizó su firma personal. Perfil válido hasta
  2026-11-11 10:30 Lima. No se contrató membresía Apple.
- Evidencia local bajo `.qa/mobile-beta/`. El paquete físico aún requiere publicar
  el backend compatible para poder iniciar una partida por Internet.
- El primer CI detectó una expectativa de entrega menor a 100 ms en un test
  previo de retorno del turno. Se cambió por límites del plazo respecto a la
  resolución de la oferta, manteniendo el minuto completo; 33 pruebas de servidor
  y reloj pasaron. Sin cambios en el motor. El CI completo se vuelve a ejecutar.

## Siguiente paso

Publicar el backend compatible tras CI aprobado, verificar conexión remota y
entregar el APK descargable. Instalación, firma y límites en
[la guía móvil](../mobile-development.md).

---
{"id":"mobile-beta","status":"done","parent":null,"depends_on":["mobile-capacitor"],"branch":"main","delivery":"released","updated":"2026-11-04"}
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
- [x] Publicación del servidor compatible y entrega del APK descargable.
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
- Integración Capacitor/beta en `fc41133`, seguida del ajuste de test `d2a9438`.
  El APK y el paquete de iPhone se generaron desde una copia limpia de los
  recursos publicados, excluyendo cambios de mapa simultáneos de otro chat.
- El primer CI detectó una expectativa de entrega menor a 100 ms en un test
  previo de retorno del turno. Se cambió por límites del plazo respecto a la
  resolución de la oferta, manteniendo el minuto completo; 33 pruebas de servidor
  y reloj pasaron. Sin cambios en el motor.
- [CI de d2a9438](https://github.com/Gecch12/trencitos/actions/runs/41861164488):
  692/692 pruebas Node, documentos y todos los pasos de navegador y PWA correctos.
  El último paso terminó a las 10:51:07 Lima, pero GitHub seguía mostrando el
  run `in_progress`, sin conclusión global, al verificar la entrega. La repetición
  manual `41863237310` seguía en cola; no se presenta ese estado como CI cerrado.
- Ángel publicó manualmente `d2a9438` en Render; **Live** a las 11:00:21 Lima.
  El protocolo móvil, CORS, historial privado del invitado y 60 recursos públicos
  coincidieron con la revisión. Un cliente nativo de protocolo y uno de navegador
  compartieron una sala privada por Internet y salieron sin iniciar partida.
  Salud final correcta y cero salas. [Informe](../qa/mobile-beta-release/production-report.json).
- Android e iOS Simulator mostraron el lobby de producción conectado. El iPhone
  físico volvió a abrir la app después del despliegue. Esto no sustituye una
  partida completa en el teléfono real, que Ángel probará.
- [APK público](https://github.com/Gecch12/trencitos/releases/tag/v0.6.1-mobile-beta):
  descarga anónima verificada, idéntica al paquete firmado probado.
  [Firma, tamaño y hash](../qa/mobile-beta-release/package-report.json).
- Logs y capturas completos bajo `.qa/mobile-beta/` (no versionados); evidencia
  durable de publicación en [producción](../production.md).

## Siguiente paso

Recoger la prueba de juego de Ángel y sus amigos: partida completa, controles,
fluidez, regreso del fondo y reconexión. La preparación y entrega están terminadas.
Renovar la firma personal del iPhone antes de su vencimiento si se continúa usando
la app nativa; instalación, firma, respaldo de la clave Android y límites en
[la guía móvil](../mobile-development.md).

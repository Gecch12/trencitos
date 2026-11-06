---
{"id":"profile-social-statistics","status":"validated","parent":null,"depends_on":["identity","history-replay"],"branch":"main","delivery":"released","updated":"2026-11-05"}
---
# Perfil, estadísticas y relaciones entre jugadores

Implementar los acuerdos de Ángel del 2026-11-05: identidad Google/Discord,
username, perfil y preferencias, capibara, Compromiso, estadísticas, amigos,
mesas habituales y comparaciones globales. Autorización final explícita:
«implementa todo lo acordado y actualiza la documentación»; termina la revisión Moti.

Contrato canónico: [perfil, Compromiso y relaciones](../profile-social-statistics.md).
Membresía y región siguen deshabilitadas; Apple, correo/novedades y votaciones quedan
pendientes. Región futura: un cambio por temporada de tres meses.

## Hitos

- [x] Migración aditiva de identidad, username único/cooldown/reserva, preferencias
  y capibara. Preservar UUID, apodos legados y registros históricos.
- [x] Flujos Google/Discord de acceso/vinculación/desvinculación con protección de
  última identidad y comprobación de UUID; proveedor externo configurado.
- [x] Política persistida de Compromiso, 120 s, desactivación por ausencias, sin voto.
- [x] Cálculo de estadísticas personales y migración/cron para agregados globales.
- [x] Amigos, bloqueo, grupos personales y sugerencias por composición exacta.
- [x] Resumen predeterminado, Cuenta y Personalización; solicitudes en sala y juego.
- [x] Validar recorridos locales de escritorio/móvil, regresión y cierre documental.
  OAuth productivo y dispositivos físicos quedan en la entrega, no acreditados por QA local.

## Evidencia

Implementación sobre `094644c`, integrada en `66c0299` y publicada desde `2d100e3`
tras los ajustes de QA descritos abajo. La entrega externa se registra en
[Producción](../production.md).

- `npm run test:ci`: **719/719 correctas**, sin omitidas (2026-11-05, Node 25.6.1,
  macOS, almacenamiento local y bases PGlite). Incluye privacidad de proyecciones,
  replays, reconexión, persistencia, bots, mapas y variantes existentes.
- `tests/profile-social.test.js`: reglas de Compromiso, ventana de 20, cancelaciones,
  reemplazos AFK, validación de nombres y SQL 006/007 ejecutado dos veces sobre
  PGlite. Prueba aislamiento, permisos, grupos, unicidad y agregados; no ejecuta
  `pg_cron` (extensión externa).
- `tests/account-auth.test.js`: PKCE, cifrado, UUID estable, protección de última
  identidad ante solicitudes simultáneas, proveedor disponible, rechazo de cambios
  sociales por GET/otro origen y prueba de puesto ligada a invitado/expiración.
- `node tests/browser-profile-social.cjs`: correcto con Chrome y ventanas de
  1440×1000 y 390×844, [proveedor simulado](../../tests/helpers/profile-preview.js)
  y SQL de perfil/amigos real sobre PGlite. Verifica Google → vincular Discord →
  quitar Google → volver a entrar al mismo UUID; dos usernames con nombre visible
  «Patricia»; capibara y color alternativo resueltos por servidor; solicitud en sala,
  aceptación y mesa en móvil; amistad durante la partida y detalles en resultados;
  abandono definitivo reflejado como 19/20; interfaz inglesa y controles futuros
  deshabilitados. Sin errores JavaScript. No acredita OAuth real de los proveedores.
- Revisión visual de Resumen, Cuenta, Personalización y Amigos, con Cuenta sin
  desbordamiento horizontal en 390 px. Capturas reproducibles en `.qa/profile-social/`
  (artefactos locales ignorados, sin datos de producción).
- `node --test tests/i18n.test.js tests/mobile-beta.test.js`: **7/7 correctas** tras
  completar los textos finales de ambos proveedores. Generación de bundle móvil
  en directorio temporal confirma inclusión de vistas, reglas y PNG del avatar;
  no instala aplicaciones ni modifica paquetes iOS/Android existentes.
- `node scripts/check-docs.js` y `git diff --check`: correctos. El contraste con
  `--base HEAD` se revisó; sus avisos de impacto no acreditan drift semántico.

## Entrega y configuración

El 2026-11-05 se aplicaron **006, 007 y 008** en `xnvskxwbibrxhozgcube`, confirmado
como proyecto de Auth y estado por las variables de Render. La proyección inicial
produjo 83 resultados y 72 agregados; las siete tablas nuevas tienen RLS y no
permiten lectura directa de `anon` ni `authenticated`.
[Evidencia de configuración y hashes](../qa/profile-social-setup/configuration.json),
[permisos](../qa/profile-social-setup/table-permissions.png).

El job `trencitos-statistics-nightly` (ID 1) está activo a las **08:15 UTC / 03:15
Lima**, y la función de actualización se ejecutó correctamente al migrar.
[Programación y carga inicial](../qa/profile-social-setup/cron-configured.png).
Su primera ejecución programada todavía no se ha observado. No se cambió la
frecuencia para adelantarla; la revisión automática rechazó esa prueba temporal.

Discord: aplicación `1568045906513633330`, callback de Supabase guardado,
proveedor habilitado y Manual Linking activo. El propietario creó la aplicación
y generó su secreto; se trasladó directamente a Supabase, sin guardarlo en el
repo. [Proveedor activo](../qa/profile-social-setup/discord-enabled.png).
`AUTH_DISCORD_ENABLED=true` activo en Render tras publicar el código validado.
El endpoint público confirma ambos proveedores; Google conserva su configuración.

Los recorridos Chrome de CI se ejecutaron localmente. Se actualizaron las pruebas
de Cuenta, color de sala y retorno offline para el contrato vigente, y se corrigió
la altura de resultados móviles trasladando el acceso al perfil al avatar.
`browser-profile-social.cjs` queda incluido en CI con proveedor simulado.

Render y APK publicados; detalles y límites de la validación externa en
[Producción](../production.md). La comprobación real de Discord llegó al selector
de cuenta del proveedor y requiere renovar la sesión de Ángel; todavía no acredita
consentimiento ni vinculación completada. La instalación en iPhone espera que
el dispositivo vuelva a estar disponible. El primer cron programado sigue pendiente.

## Ajuste de la prueba en CI

El primer CI de `66c0299` pasó las 719 pruebas Node y todos los recorridos previos,
pero agotó la espera del estado inicial en `browser-profile-social.cjs`. La salida
mostraba la partida y sus billetes iniciales, sin errores del producto. Las esperas
de estado de protocolo ahora consultan cada 100 ms, con límite de 20 s, en lugar
de depender de `requestAnimationFrame` en dos páginas con WebGL por software.
Se conservan todas las aserciones. El caso anterior también pasó localmente con
`CI=true`; por tanto, no se afirma reproducción local determinista del fallo.
La nueva revisión requiere otra ejecución completa de CI antes de publicar.

El segundo intento `880a3de` superó la espera inicial, pero agotó la localización
del primer billete. No confirmó la hipótesis de que bastara cambiar el sondeo.
El recorrido activa la ventana que está operando, espera los billetes de ambos
jugadores y marca sus checkboxes explícitos; conserva trazas de escritorio/móvil
y captura el estado de ambas páginas ante un fallo. La selección y todos los
checks posteriores pasan localmente con `CI=true`. Este recorrido se ejecuta
ahora primero entre los navegadores para detectar antes cualquier fallo; las
demás pruebas y la exigencia de CI completo se mantienen.

La revisión final `2d100e3` pasó el [CI completo](https://github.com/Gecch12/trencitos/actions/runs/42134951114),
incluido el recorrido de perfiles, 719 pruebas Node y todos los navegadores.
[Resultado final](../qa/profile-social-setup/ci-result.json),
[primer intento](../qa/profile-social-setup/ci-first-attempt.json),
[segundo intento](../qa/profile-social-setup/ci-second-attempt.json). El recorrido
también pasó localmente con CPU de Chrome ralentizada seis veces mediante CDP.
Los ajustes de pruebas no modificaron código ni recursos de la aplicación.

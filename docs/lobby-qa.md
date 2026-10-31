# Inicio y colores de Trencitos — 2026-10-31

Flujo: crear o abrir una invitación → WebSocket → reserva de código/color → guardado → sala sincronizada → partida con esos colores.

## Comprobaciones

- `node --test --test-reporter=spec tests/*.test.js`: **250 correctas, 0 fallos**.
- `node --check` para `app.js`, `server.js` y `lobby-ui.js`; `git diff --check` sin errores.
- `python3 make_assets.py --check`: las diez cartas coinciden con su generador.
- Códigos de 6–10 números, ceros iniciales, colisiones simultáneas, validación en servidor y compatibilidad con enlaces alfanuméricos anteriores.
- Colores sin duplicados, elección limitada al propio puesto, reserva durante desconexión, liberación al salir y bloqueo al empezar.
- Reinicio con recuperación de color/código; rollback ante fallo de escritura local.
- La integración con la **API simulada de Supabase** verifica confirmación posterior al guardado, recuperación tras reiniciar y rollback ante fallo remoto. No se han usado credenciales ni datos de producción.

## Navegador

Revisión en la sesión local de Chrome del usuario con un servidor de prueba aislado en el puerto 3107 y datos temporales, sin reiniciar el servicio de desarrollo que ya estaba abierto.

- Crear sala con diez dígitos y ceros iniciales; invitar desde otro origen local; cambiar colores y comprobar la sincronización en ambas pestañas.
- Recargar recupera el puesto y el color; iniciar llega a la elección de billetes y mantiene los colores de ambos jugadores.
- Un código demasiado corto muestra el error junto al campo. Uno ocupado no cambia ni une al usuario a la sala existente. Generar otro permite crear normalmente.
- Practicar con amarillo asigna amarillo al humano y otros tres colores a los bots, comprobado en el DOM del tablero.
- Inicio revisado a 320, 390 y 768 px mediante emulación de Chrome; escritorio nativo a 1728 y 1920 px. A 320 y 768 px se comprobó que el ancho del documento coincide con el viewport, sin desbordamiento horizontal. Se corrigió el salto de línea de las pestañas a 320 px.
- Sala de espera revisada en móvil estrecho: el código y la copia de invitación se reorganizan, los cinco colores caben y la página permite scroll vertical.
- Sin errores ni avisos de consola en los recorridos comprobados.

No es una certificación de Safari/iPhone físico. Los cambios permanecen locales; esta revisión no publica ni cambia la configuración de Render o Supabase.

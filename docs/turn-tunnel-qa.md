# Turnos, pagos visuales, gestos y revelación de túneles

Verificado localmente el 31 de octubre de 2026. Sin despliegue ni cambios en cuentas externas.

## Comportamiento

- Un único indicador de turno se reubica entre escritorio y HUD compacto. Muestra acción pendiente, contador `mm:ss`, progreso y urgencia a 10/5 segundos. La elección de billetes conserva su plazo independiente.
- La construcción propone el pago válido con menos locomotoras, muestra las cartas y permite cambiar a otra combinación válida. El servidor sigue validando y cobrando el pago.
- Los gestos conservan el punto del mapa bajo el centro de los dedos al escalar y desplazar; al levantar un dedo continúa el arrastre. Zoom máximo 6×; etiquetas de 15 px hasta 2,5× y crecimiento posterior limitado a 24 px.
- La pestaña Robar avisa «1 pendiente» cuando corresponde, sin abrirse sola ni reproducir sonidos repetitivos. Movimiento reducido elimina el pulso.
- El servidor registra las cartas realmente reveladas en un evento privado para quien construye. El cliente revela una cada 700 ms; no vuelve a sortear ni cambia el plazo. Si hay menos cartas disponibles, solo muestra las existentes.
- Sin suplemento, la resolución del servidor sigue siendo inmediata. La presentación local muestra el resultado y después reproduce el efecto de construcción. Los demás jugadores no quedan bloqueados.
- Con suplemento, después de revelar aparecen las combinaciones de pago o la explicación de insuficiencia. Omitir, movimiento reducido, pestaña oculta y proximidad al vencimiento evitan que la animación estorbe la decisión. Reconectar muestra la decisión vigente sin reproducir eventos antiguos.

## Evidencia automatizada

`npm test`: 196 pruebas correctas. Incluye reglas, conservación de cartas, privacidad, persistencia, reconexión, pagos, gestos y nuevos casos:

- Estados del indicador y recordatorio del segundo robo.
- Anclaje del gesto combinado, límites y escala de etiquetas.
- Túneles con suplemento, sin suplemento, pago exclusivo con locomotoras y mazo con solo dos cartas; evento único y plazo sin extensión.
- Secuencia de temporizadores a 700 ms; construcción diferida exactamente una vez; omisión, cancelación y prioridad del siguiente turno.

`node --check` en app.js, engine.js y game-ui.js; `git diff --check` sin errores.

## Navegador y servidor local aislado

Se usaron `tests/helpers/responsive-preview.js` y partidas de QA sin datos reales. Algunas salas tienen 10 minutos deliberadamente para permitir inspección; producción conserva 60 segundos.

- Chromium: 320×568, 390×844, 844×390, 768×1024, 1024×768 y 1440×900, sin desbordamiento horizontal. Navegación compacta oculta en escritorio, contador de 28/30 px.
- Pago normal con alternativa: 3 naranjas + 1 locomotora, ruta otorgada por el servidor. Estación construida en tablet: contador 3 → 2.
- Túnel sin suplemento: 0/1/2/3 cartas visibles a aproximadamente 0/0,7/1,4/2,1 s; siguiente turno ya activo en el servidor; efecto de construcción después del mensaje de éxito.
- Túnel con suplemento: 3 cartas reales, suplemento 2, mismo deadline antes y después de la revelación, mano 6 → 2 al confirmar.
- Insuficiencia: pago deshabilitado; desistir conserva las 3 cartas y no ocupa la ruta.
- Mazo corto: 2 posiciones; recarga durante la secuencia muestra ambas cartas y la decisión, sin reiniciar la animación.
- Movimiento reducido: decisión inmediata con toda la evidencia, sin animación de revelación.
- Robo: «1 pendiente» fuera de Robar; desaparece al completar el segundo robo.
- Eventos táctiles nativos enviados por CDP: escala y centro cambian simultáneamente; el arrastre continúa con el dedo restante. Etiquetas medidas: 15 / 20,4 / 24 px a zoom 2 / 4 / 6.
- Acciones de túnel accesibles y dentro del viewport incluso a 320×568 y 844×390. Última comprobación de consola: 0 errores, 0 avisos.

Capturas locales de QA en `.playwright-mcp/`: `turn-build-desktop.png`, `turn-build-mobile.png`, `tunnel-reveal-mobile.png`, `turn-reminder-mobile.png`, `turn-desktop.png`, `station-payment-tablet.png`.

## Límites

No se ha realizado una prueba física en iPhone/iPad ni una escucha humana de los sonidos. Se validaron emulación responsive, eventos de puntero reales de Chromium y el control de silencio por pruebas automatizadas. No se afirma compatibilidad física certificada con todos los navegadores.

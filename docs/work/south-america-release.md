---
{"id":"south-america-release","status":"active","parent":"modular-game-platform","depends_on":["modular-platform-maps"],"branch":"codex/modular-game-platform","delivery":"worktree","updated":"2026-11-03"}
---
# Sudamérica y entrega conjunta

## Alcance autorizado

Completar la fase 5, jugar una partida de prueba con cuatro bots y resolver los
problemas identificados en los chats «Comparar planes de Render y DigitalO» y
«Mejorar interfaz y animaciones del». El usuario autorizó continuar sin pedir
confirmación entre fases e integrar en main y producción al terminar. No se
contratan planes de pago. Se preserva el trabajo de vagones del checkout original.

## Hitos y aceptación

- [x] Sudamérica: fuente V3.3 conservada, IDs estables, 46 ciudades/101 vías/46
  billetes, selección por sala, geometría y reglas verificadas; balance beta.
- [x] Partida natural con cuatro bots: acciones legales, conservación de recursos,
  ronda final y puntuación; guardado/replay y tablero comprobados en navegador.
- [x] Rendimiento: localizar esperas, medir fases de comandos, reducir mensajes y
  trabajo repetido, conservar confirmación durable y recuperación.
- [x] Interfaz: carga de replay, controles compactos, perspectiva, historial completo,
  estadísticas y navegación por hitos; construcción visible y reloj justo.
- [ ] Integración: reconciliar cambios de main, ejecutar pruebas de regresión,
  publicar revisión exacta y comprobar servicio real.

## Fuentes y decisiones

La fuente inmutable está en `docs/references/south-america-v3.3-source.json`;
su identificador externo `south-america-v3.3-beta` se expresa internamente como
`{id:"south-america",version:"3.3-beta"}`. Se preservan los IDs SA y D del paquete,
colores, longitudes, ferris, túneles y puntos. El layout es independiente de las
reglas: coordenadas ampliadas, contornos del SVG entregado y curva PNT–USH para
separar sus casillas de Punta Arenas. Europa sigue predeterminada.

La conversación de rendimiento encontró RTT de ~237 ms y un intervalo de ~195 ms
entre mensajes lobby/state; sus causas requieren comprobación, no se atribuyen
automáticamente al plan gratuito. También identificó persistencia global, bots
síncronos y animaciones de cartas que bloquean controles. La otra conversación
solicitó replay como herramienta de análisis, sin revelar secretos al público,
y una pausa de construcción coordinada con el reloj del servidor.

## Evidencia y siguiente paso

Integración y primera validación: [motor y geometría](../qa/south-america/engine.json),
12 pruebas correctas. Cuatro bots finalizaron naturalmente en 166 turnos;
recursos conservados y restauración en el paso 50. La verificación visual posterior
se registra abajo y en `docs/qa/south-america-release/`. La revisión visual y el balance
competitivo posterior de Ángel no sustituyen estas comprobaciones técnicas.


## Verificación incremental

- [Motor](../qa/south-america/engine.json): cuatro políticas completas, 166 turnos,
  restauración y conservación de recursos; 12 pruebas de mapa/contexto/geometría.
- [Navegador inicial](../qa/south-america/browser-report.json): anfitrión y cuatro
  bots permanentes, 189 turnos, 201 vagones, final natural, auditoría, replay y
  privacidad; capturas de escritorio/móvil. Corresponde al código anterior al
  worker y a los nuevos controles de replay.
- [Replay de análisis](../qa/replay-analysis/report.json): 264 pasos, participante
  y público, carga, perspectiva persistente, historial completo, hitos,
  puntuaciones y adaptación móvil. Comparación final con los resultados grabados.
- Transporte: negociación `compactMessages:1`, lote de frames por conexión y
  `TCP_NODELAY`; la definición se reutiliza solo con referencias coincidentes.
  Salida/cache se actualizan después del commit, incluido el aviso antes de cerrar
  una sesión reemplazada. Clientes anteriores conservan mensajes completos.
- Bots: cálculo en worker, aplicación serial con huella de estado y comprobación
  de control; propuestas obsoletas se descartan. Espera visual normal 250–350 ms.
- Construcción: foco 180 ms, caída 500 ms, descanso 150 ms. El servidor conserva
  la pausa y desplaza los plazos; túneles usan su pausa existente. Replay adapta
  el efecto a la velocidad y cancela efectos al saltar.

La primera suite conjunta detectó cinco regresiones: compatibilidad del cuerpo
histórico de replay, flush previo al cierre de una conexión, contrato de health y
una prueba que actuaba durante la nueva pausa. Se corrigieron sin regrabar las
fixtures históricas. La suite completa posterior pasó sus 624 pruebas sin regrabar fixtures;
el recorrido con workers y los escenarios gráficos se registran abajo.


## Persistencia y mediciones locales

Se implementaron lotes durables de hasta 16 trabajos pendientes, DTOs incrementales,
SQL 005 compatible con el servidor anterior y eliminación de la segunda proyección
idéntica del historial. SQL 005 se aplicó correctamente en Supabase el 2026-11-03; se comprobó
que el editor contenía exactamente el archivo local, sin iniciar otro escritor.
20 pruebas de servidor remoto/checkpoint/SQL y 24 de historial/compatibilidad pasan.
La [partida con workers](../qa/south-america-worker/browser-report.json) terminó
naturalmente en 190 turnos, con cuatro bots permanentes y 189 vagones renderizados.

Ensayo aislado: cuatro salas y RTT de base simulado de 120 ms, 30 comandos.
[Antes](../qa/latency-update/before.json) / [después](../qa/latency-update/after-final.json):
p95 concurrente 531 → 309 ms; RPCs 30 → 18; bytes de sala 1.778 MB → 0.475 MB.
La mediana de una sola sala fue 129 → 136 ms: no se atribuye una mejora individual
al batching. Estas cifras no incluyen la red pública ni prueban el balance del mapa.
El intervalo de ~195 ms observado en producción se aborda con frames agrupados y
TCP_NODELAY, pero su desaparición solo podrá verificarse tras publicar.

## Aceptación de entrega

- [Suite Node](../qa/south-america-release/node-tests-result.json): **624/624**.
- [Docker](../qa/south-america-release/docker-result.json): **55/55**, arranque
  como usuario node, raíz de solo lectura, sin red ni dependencias de desarrollo.
- [Replay final](../qa/south-america-release/analysis-tests-result.json): escritorio
  y móvil, público y participante, 264 pasos, sin errores de navegador.
- [Midsommar](../qa/south-america-release/midsommar/report.json): seis modelos,
  21 familias, tablero mixto de 225 piezas, construcción, resaltado, reconexión,
  espectador, replay, inglés y móvil; sin errores.
- El checkout original se preservó completo en `2ba28ac` antes de integrar. Los
  módulos visuales coinciden con esta rama; sus pruebas solo adaptan imports,
  temporización de construcción y controles compactos del replay.

- [Three.js](../qa/south-america-release/browser-tests-result.json): partida natural
  de 224 acciones, construcción/ronda final, ocho verificaciones gráficas,
  teclado, pinch, recuperación WebGL y ausencia de bucle de render al estar quieto.
- [Dos mapas](../qa/south-america-release/selection-tests-result.json): Europa
  (131 acciones) y Laboratorio (184), ambas finalizadas, reinicio y reconexión,
  auditoría, privacidad, replay y apariencia conservados.

Pendiente integrar main y verificar el despliegue exacto y la latencia pública.

La fusión con `2ba28ac` conserva los módulos runtime exactamente como se probaron
en `de2a5d2`. Se resolvieron rutas antiguas de imports, duplicados de raíz frente
a `frontend/shared`, IDs opacos y la pausa visual. Se incorporaron dos precisiones
documentales de main sobre el presupuesto de Pasajeros y el encuadre Midsommar.

## Ajuste tras medir producción

El primer despliegue `2e53f46` quedó Live el 2026-11-03 a las 02:00:23 Lima.
Los 43 recursos públicos coinciden y siete rutas privadas devuelven 404. La
medición compacta mejoró la llegada del estado, pero mostró que el ACK todavía
podía retrasarse ~190 ms; agrupar escrituras TCP no bastó. Se añadió negociación
compacta 2 para incluir estado y ACK en el mismo frame JSON, conservando clientes
anteriores. Pasaron 44 pruebas dirigidas y [Chrome](../qa/south-america-release/transport/report.json)
con construcción real, desbloqueo de controles, privacidad y reconexión.

La suite final del protocolo compacto 2 pasó **625/625**: [informe](../qa/south-america-release/final-node-result.json).

## Grabaciones grandes

La comprobación de un replay antiguo de cinco jugadores quedó pendiente y el
proceso de Render reinició. La consulta de solo lectura en Supabase confirmó
330 frames y 50.003.274 bytes de JSON. No se atribuye el reinicio a una causa
no registrada; la ruta anterior sí retenía toda la grabación antes de proyectarla.
Se sustituyó por páginas de 16 frames y respuesta HTTP con backpressure,
sin modificar contenido, autorización ni auditoría. [Prueba de memoria](../qa/south-america-release/stream-memory.json):
500 frames / 111,6 MB procesados con pico RSS de 104 MB bajo heap de 192 MB.
Ocho pruebas nuevas comparan respuestas completas/antiguas, cancelación y errores.

El ajuste de lectura incremental pasó **633/633 pruebas**, incluyendo equivalencia
exacta del contrato y cancelación del flujo: [informe](../qa/south-america-release/stream-node-result.json).
El recorrido de replay de 264 pasos sigue correcto como participante y público,
en escritorio y móvil: [navegador](../qa/south-america-release/stream-replay/report.json).

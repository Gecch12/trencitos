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
- [ ] Rendimiento: localizar esperas, medir fases de comandos, reducir mensajes y
  trabajo repetido, conservar confirmación durable y recuperación.
- [ ] Interfaz: carga de replay, controles compactos, perspectiva, historial completo,
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
recursos conservados y restauración en el paso 50. Pendiente verificación visual. Los informes de
ejecución se añadirán a `docs/qa/south-america/`. La revisión visual y el balance
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
fixtures históricas. La siguiente validación debe repetir la suite completa,
los escenarios gráficos y el recorrido con workers antes de integrar/publicar.

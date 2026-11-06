# Resultado de arquitectura y latencia · 2026-11-06

Código web/servidor final `d4de3ae`, [Render Live](https://dashboard.render.com/web/srv-dbim81vlk1mc73f4f900/deploys/dep-dbn3nj8n74is73ehu760)
a las 15:43:35 Lima. [CI completo](https://github.com/Gecch12/trencitos/actions/runs/42289041784):
741/741 Node y todos los recorridos Chrome. [Entrega, migración y recuperación](match-performance-delivery.json).
Los paquetes nativos mantienen su publicación anterior; esta entrega actualiza web/servidor.

## Comparación observada

Medianas en milisegundos, salvo caracteres. Mismo Chrome/Mac/conexión en Lima,
ventana 1728 × 907 y movimiento normal. Cada muestra incluye cuatro altas de bots,
doce robos individuales y dos pares a 30 ms. Referencia: siete visibles/nueve
ocultos; posteriores: ocho/ocho. Diferentes momentos y partidas aleatorias:
no es un experimento que aísle cada cambio ni una garantía de capacidad.

| Medida | Referencia `5a57127` | Primera entrega `15636fb` | Final `d4de3ae` |
| --- | ---: | ---: | ---: |
| Clic → estado confirmado | 624,55 | 566,45 | 390,05 |
| Clic → carta visible repuesta | 662,80 | 606,40 | 427,40 |
| Clic → color oculto reconocible | 829,40 | 619,05 | 443,75 |
| Estado → color oculto visible | 201,70 | 46,70 | 41,00 |
| Clic → bot visible | 419,60 | 345,60 | 414,75 |
| Captura para rollback | 9,14 | 0,81 | 0,68 |
| Ejecución del comando | 26,09 | 14,74 | 11,33 |
| Historial (dentro de ejecución) | 20,71 | 11,65 | 8,65 |
| RPC de guardado | 159,87 | 109,47 | 123,36 |
| Caracteres del mensaje | 27 903,50 | 25 795,00 | 6 394,00 |

La muestra final recibió 16 deltas, sin errores. Respuesta visual inicial al clic:
mediana 3,55 ms. El jugador ve un espacio neutro al elegir una carta visible;
la reposición y el color oculto provienen del estado confirmado del servidor.
La animación ya no agrega el giro obligatorio de unos 200 ms.

## Metas que todavía no se acreditan

El p95 por rango más próximo de 16 observaciones coincide aquí con el máximo:
clic→estado baja de 959,4 a **567,9 ms**, pero la meta original **<500 ms** no se
cumple en la muestra completa. Los doce robos individuales quedaron entre
355,2 y 474,6 ms. Las segundas cartas de los dos pares tardaron 520,9 y 567,9 ms,
con 89,23/120,68 ms de espera detrás del guardado de su primera carta. La cola
por sala conserva deliberadamente orden y confirmación durable.

Recepción→visible: mediana 39,1 ms, máximo 52,9 ms; el objetivo <50 ms tampoco
queda acreditado para todos los casos. No redefinir las metas eliminando las
segundas cartas ni seleccionar solo muestras favorables para declarar cierre.

**Bots:** la mediana final 414,75 ms apenas cambia frente a 419,6 ms iniciales.
La primera entrega dio 345,6 ms, pero esa mejora no fue estable en la repetición.
En la muestra final, ejecutar el alta llevó 0,28–0,61 ms, captura 5,77–7,32 ms y
RPC 77,79–220,1 ms. No afirmar que reescribir ese comando en Rust elimina su espera.

## Qué demuestra cada capa

- Código: menor captura, ejecución e historial; deltas autorizados más pequeños;
  color confirmado sin espera de giro; rollback, recibos y privacidad conservados.
- Cola/SQL: unidades por partida y recuperación aislada. [Cuatro pares en dos salas](match-performance-concurrency.json)
  tuvieron esperas de cola 0,035–0,116 ms con RPC de 99–305 ms. Los casos de fallo,
  respuesta perdida, rollback y cambio de escritor se verifican con dobles/SQL
  aislados; no se inyectaron fallos en producción. Ciclo de vida sigue usando barrera.
- Conexión: ping/pong de aplicación final 239,6–296,8 ms, mediana 241,45 ms;
  referencia complementaria 235–244 ms. Incluye despacho; no es propagación pura.
- Infraestructura: Render y Supabase están en Oregón. Render tiene 0,5 CPU/512 MB;
  el proyecto de estado de Supabase está en organización Free. No se cambiaron
  planes ni regiones. La geografía entre cliente y servicios sigue importando.
- Base de datos: `pg_stat_statements` mostró 77 RPC nuevas, ejecución SQL media
  17,58 ms/máxima 142,86 ms. Es agregado histórico, distinto de la muestra de
  cartas y del tiempo total HTTP/RPC; no repartir el resto entre proveedores con
  porcentajes inventados ni atribuir todo al trigger de estadísticas.

Las mediciones sostienen mantener Node en esta entrega: la espera completa no
se explica por el tiempo de ejecutar la jugada. Comparar otra región, otro modo
de acceso a SQL o un comando doble requiere una evaluación propia. No cambiar
la durabilidad ni adelantar secretos para cumplir una cifra.

## Memoria y continuidad

En intervalos de cinco segundos de la muestra final, RSS observado máximo
127.799.296 bytes (~128 MB) y heap usado 21.742.272 bytes (~22 MB); CPU máxima
muestreada 9,25 %. Después de limpiar salas: RSS 120.844.288 y heap 22.777.584.
No son picos instantáneos ni un ensayo de 200 jugadores. No hay base para afirmar
una reducción de RAM total frente a la referencia; sí se redujo el alcance de
las copias. Los deltas mantienen una vista previa por conexión, un coste explícito.

La migración 009 preservó una partida del servidor anterior: cinco cartas y un
robo usado al volver; la segunda carta dejó seis. En la entrega final, la
reconexión conservó exactamente la misma mano y partida. Los relojes continuaron
durante la observación; el recuento usado al comparar reconexión fue 19. Salas de
QA cerradas, observador retirado por recarga, tres salas previas conservadas,
servicio sano y ninguna sala pausada. No se borró historial de jugadores.

## Reproducción y prevención

Datos: [referencia](match-performance-baseline.json), [entrega intermedia](match-performance-comparison.json)
y [entrega final](match-performance-final.json). [Observador](match-performance-probe.js):
instalar en consola de una página conectada antes de crear una sala privada
propia; realizar las interacciones descritas y correlacionar por recibo. Exportar
solo tiempos/tamaños/agregados, cerrar la sala y recargar para retirar observadores.
La marca `visible` es el primer fotograma muestreado con reemplazo o imagen de
color decodificada; los spans anidados no se suman.

[Reglas](../architecture-rules.md) y CI cubren límites, consultas autorizadas,
repositorio/unidad de trabajo, fallo, reintento y transporte. No hace falta un
skill nuevo en cada implementación. Ángel eligió mantener `main` directo: la
protección administrativa mediante PR/CI queda pospuesta y un push puede saltarse
la disciplina. Persisten módulos legados y un único servidor dueño; no se afirma
DDD perfecto ni escalado horizontal resuelto.

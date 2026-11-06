# Rendimiento de partidas: contratos y medición

La [iniciativa](work/match-performance-architecture.md) conserva avance y fases.
Este documento conserva el contrato y método; [arquitectura](architecture.md)
describe los componentes existentes. Node se mantiene durante esta evolución.

## Contrato de una jugada

1. **Pendiente:** el cliente envió una intención. Puede representar la carta
   visible elegida o un reverso; no conoce el orden del mazo ni el resultado oculto.
2. **Preparada:** el servidor validó/aplicó la intención en una transacción aún
   pendiente. No equivale a éxito durable ni habilita publicación anticipada.
3. **Confirmada:** estado, historial y recibo quedaron guardados de forma atómica.
   Solo entonces pueden publicarse el resultado y las vistas autorizadas.
4. **Recibida/visible:** llegada del mensaje y presentación son hitos distintos.
   Confirmación y reposición viajan en la misma respuesta; la UI no agrega otra
   ida y vuelta ni espera una animación para permitir una acción legal.

El servidor valida turno, revisión, dependencia del segundo robo y permisos.
Deshabilitar controles no protege información. Reintentar un ID no repite el
robo; una reconexión recupera la verdad guardada. Un fallo de entrega después
del commit no revierte una jugada confirmada. Fallos/renovaciones no permiten
elegir una carta futura distinta con una intención antigua.

## Límites y responsabilidad

- Partida: reglas e invariantes, tiempo/azar explícitos; sin transporte o métricas.
- Aplicación: comandos, consultas autorizadas y coordinación del repositorio.
- Persistencia: estado/historial/recibos atómicos, versiones y exclusión de escritor.
- Identidad, Compromiso y estadísticas: conservar sus contratos; medir trabajo
  compartido y no mezclar consultas estadísticas con comandos de juego.
- Presentación: respuesta al clic, reposición y revelado sin adelantar secretos.

El puerto actual de repositorio usa la colección de salas y un committer global.
Es una separación parcial; no es todavía persistencia independiente por partida.
La cola global sigue siendo la base hasta validar su sustitución.

## Método

Medir cada duración con reloj monotónico del mismo proceso. El cliente registra
clic, envío, estado/ACK, primer fotograma, reposición y color reconocible. El
servidor registra espera en cola y costes por operación/lote; no restar relojes
cliente/servidor ni llamar «latencia de red» a la resta sin aislar todos los costes.

Captura de rollback, preparación de checkpoint, serialización y RPC se distinguen.
Acción puede incluir observadores de historial; historial puede incluir vistas.
Esas medidas **se solapan**: no sumarlas como fases exclusivas. Commit de lote se
comparte entre operaciones; cada una tiene su espera, ejecución y total propios.
Entrega local no demuestra recepción del navegador. HTTP ligero aproxima el
recorrido mínimo e incluye procesamiento; no es una medida pura de red.

Las métricas públicas solo contienen agregados acotados y datos del proceso.
Un diagnóstico solicitado por un cliente solo vuelve a su conexión con su ID
efímero, duraciones y tamaño del lote; no registra payloads, mano, mazo, cuentas,
credenciales, códigos de sala ni acciones de otros jugadores. Los errores de
observación no cambian reglas, respuestas, commit ni rollback.

CPU/RSS/heap/GC y retraso del bucle se muestrean con coste acotado. La RPC incluye
red y SQL: separar el disparador de estadísticas requiere medición de base, no
una atribución inventada. Los agregados históricos de health no reemplazan trazas.

## Producción y aceptación

Salas propias privadas, invitados y bots acotados; sin tocar mesas ajenas. Cerrar
la sala y conservar versión, entorno, número de muestras, percentiles, máximos,
errores y límites. No provocar caídas ni realizar carga masiva como parte de una
medición de interacción. Comprobaciones deterministas/CI protegen el código;
ninguna cifra simulada se presenta como latencia productiva.

Comparar conexión y formato equivalentes y registrar movimiento reducido. Medir
también sin depender de animaciones. El umbral final debe incluir una carga y
dispositivos definidos; una pequeña muestra no acredita capacidad para 200 usuarios.

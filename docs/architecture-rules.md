# Reglas de arquitectura verificables

Estas reglas aplican a cada implementación. `AGENTS.md` dirige aquí y CI ejecuta
`node scripts/check-architecture.js`, junto con comprobaciones de privacidad,
recuperación y navegador. Un skill opcional puede explicar el método, pero no
sustituye estos controles ni hace falta adjuntarlo en cada mensaje.

## Dirección de dependencias

- `game/domain`: reglas puras; solo importa dominio. Tiempo, azar y contexto
  llegan explícitamente. No importa transporte, Node, métricas, UI ni persistencia.
- `game/queries`: lectura autorizada; no importa comandos, infraestructura ni
  registradores de mutaciones. La proyección de diario está en `turn-history.js`.
- `game/application`: coordina comandos/consultas y puertos recibidos; no importa
  adaptadores concretos ni obtiene reloj/azar globales.
- Dos puentes puros están permitidos expresamente: `legacy-scoring` y
  `replay-definition`. Sus dependencias también se inspeccionan. El resto de
  `game/compat` y `backend` sigue siendo composición/adaptación del formato legado.

El comprobador cubre dependencias CommonJS estáticas y capacidades ambientales
de esos módulos; no pretende demostrar matemáticamente ausencia de mutaciones.
Las consultas se comprueban además con entradas congeladas y contra filtrado de
manos, billetes y robos ocultos. Una excepción requiere decisión y cobertura,
no silenciar el gate. La fachada Engine y el frontend aún conservan código legado:
estos controles no certifican «DDD perfecto» ni convierten cada objeto en agregado.

## Repositorio y unidad de trabajo

Sí existe una frontera de repositorio: la colección de salas sirve acceso a los
agregados vivos y el committer recibe snapshots separados del estado mutable.
`createCheckpointHandler` coordina `prepare(repository, dirtyCodes, scope)` y
`commit(batch)`; `checkpoint-committer.js` implementa archivo y remoto. El adaptador
remoto negocia las RPC y versiones; el dominio no conoce Supabase.

La sala/partida es la unidad de consistencia: estado, recibo de comando e historial
se confirman juntos. No se crea un repositorio por carta ni se exponen tablas SQL
a los casos de uso. Consultas y comandos tienen responsabilidades separadas,
aunque comparten almacenamiento: CQRS no exige otra base ni un bus de mensajes.

## Criterios para cada entrega

1. Identificar agregado, comando o consulta, invariantes y vista autorizada.
2. Mantener ID idempotente, revisión, autoridad y confirmación después del commit.
   Un fallo de entrega no revierte persistencia; incertidumbre pausa la unidad
   afectada hasta recuperar el estado durable.
3. Probar el riesgo relevante: dos salas, fallo/reintento, reconexión, consulta
   congelada o secretos. No añadir pruebas que solo repitan el código.
4. Si cambia el camino de interacción, conservar una medición comparable de
   producción y el diagnóstico privado. Separar espera, trabajo, RPC y pintura.
5. Actualizar contrato/ficha y comprobar docs + arquitectura + CI. Desplegar solo
   el commit validado y verificar `Live`, protocolo y recuperación.

Metas y método de medición en [rendimiento](match-performance.md). Los gates son
ejecutables, pero para impedir además un bypass administrativo hace falta una
regla de protección de `main` en GitHub; la configuración del proveedor y los
permisos de quien puede saltarla son otra capa, no una propiedad del skill.

Ángel decidió el 2026-11-06 mantener trabajo directo en `main` por ahora.
Los controles siguen ejecutándose, pero la prohibición administrativa de
integrar sin CI queda pospuesta; no crear ramas/PR por defecto para este fin.

La [ficha de guardrails](work/match-performance-guardrails.md) conserva evidencia
de implementación y entrega, no este contrato.

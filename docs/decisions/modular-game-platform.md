# Evolución modular del juego y soporte de varios mapas

Estado: decisión aceptada por el usuario el 2026-11-02; implementación gradual
en curso. Avance y aceptación en [la iniciativa](../work/modular-game-platform.md).
Este documento describe el destino acordado, no sustituye la
[arquitectura existente](../architecture.md).
El [modelo y los contratos de transición](match-domain-contracts.md) concretan
sus límites, compatibilidad y primer recorrido de extracción.

## Contexto al adoptar la decisión

Sudamérica requiere utilizar otra red y billetes sin sustituir Europa. El motor
actual ya es autoritativo y el renderizador 3D está separado, pero motor, interfaz
y bots consumen constantes de Europa; las rutas también usan posiciones numéricas
como identidad. `engine.js` reúne reglas, textos, proyecciones y compatibilidad.
`app.js` y `server.js` concentran varias responsabilidades.

Ya existen pruebas de reglas, privacidad, simulaciones, persistencia e interfaz,
así como recuperación y archivo de partidas. La transición debe conservar estas
garantías y el reglamento propio descrito en [dominio](../domain.md).

## Decisión

### Organización y dominio

- Evolucionar la aplicación existente con DDD gradual y módulos funcionales:
  partida, salas, catálogo, identidad e historial. Afinar límites en fase 1.
- La partida protege la coherencia conjunta de mano, vagones, vías, turno,
  destinos y puntuación. Los consumidores no modifican sus interiores libremente.
- Separar mapa (topología/destinos), reglamento, estado de partida y composición
  visual. Una partida conserva la identidad/versiones que utilizó.
- Los mapas comparten reglas y presentación reutilizables. Reglas nuevas pueden
  requerir código: no se promete un editor universal ni reglas arbitrarias por JSON.
- Organizar archivos por cohesión y responsabilidades, con API pública pequeña.
  El tamaño orienta la revisión; no hay límite rígido ni archivo por función.
- Mantener la tecnología existente durante la transición. No es requisito cambiar
  framework, adoptar clases para todo o migrar todo el código a TypeScript.

### Comandos, consultas y efectos

- Separar los comandos que cambian una partida de las consultas que construyen
  representaciones. CQRS acotado al mismo proceso y almacenamiento.
- Las consultas no modifican estado. Mover completado de resultados/migraciones
  fuera de `view`, manteniendo compatibles los formatos existentes.
- Los comandos aplican reglas y producen hechos estructurados; textos e
  información de interfaz se derivan fuera del núcleo de reglas.
- Conservar proyecciones autorizadas por jugador, espectador y acceso al replay.
  Un evento interno puede contener datos privados y no se transmite sin filtrado.
- Proveer tiempo y azar explícitamente al dominio para pruebas y simulaciones;
  conservar la fuente segura de aleatoriedad del servidor en ejecución normal.
- Expresar fases y transiciones de turno/túnel sin introducir una librería de
  máquinas de estados mientras no aporte una necesidad demostrada.

### Persistencia y comunicación

- Definir repositorios específicos para unidades consistentes; archivos y
  Supabase los implementan mediante adaptadores. No crear repositorios de cada
  carta, casilla o vía ni una capa CRUD genérica para todos los conceptos.
- La aplicación coordina una confirmación durable conjunta de estado e historial,
  conserva exclusión del escritor, deduplicación, recuperación y orden de acciones.
  Los repositorios no pueden guardar partes de una jugada de forma independiente.
- Comunicar el éxito después del guardado. Un fallo de entrega posterior no
  revierte una jugada ya confirmada. La cola durable existente es una base a conservar.
- Mantener el replay basado en resultados registrados. Los eventos internos no
  implican convertir el almacenamiento en Event Sourcing ni repetir sorteos.
- Validar entradas y versionar contratos de mensajes, mapas y guardados.
  Identificadores estables y adaptadores de compatibilidad protegen partidas previas.

### Frontend, backend y despliegue

- Separar frontend y backend en código durante la fase 3, manteniendo un repositorio.
  Compartir solo contratos y datos públicos explícitos; secretos/estado privado
  permanecen en el servidor. Three.js sigue siendo la vista principal.
- Conservar inicialmente un servicio Node en Render. La separación de carpetas
  no exige cambiar al mismo tiempo el alojamiento.
- Evaluar despliegues independientes después de estabilizar contratos, cuando
  publicar interfaz sin reiniciar partidas u otra necesidad concreta lo justifique.
- Esa evaluación debe resolver WebSockets, cookies, OAuth, URLs y versiones de
  clientes ya abiertos. Preferir un único origen público si el enrutamiento
  compatible con WebSockets permite mantener los contratos actuales.
- Separar el frontend no convierte el backend actual en un sistema multiinstancia;
  conservar su autoridad única y el mecanismo que impide dos escritores.

## Alternativas y consecuencias

Integrar Sudamérica directamente sobre constantes globales ahorraría preparación,
pero extendería el acoplamiento. Se elige preparar la arquitectura y demostrar la
independencia con Europa y un mapa pequeño antes de añadir los materiales nuevos.

Una reescritura completa perdería la continuidad de las pruebas y aumentaría el
riesgo para reglas y guardados. Se elige extracción incremental con puentes
temporales para la API existente y aceptación de comportamiento por fase.

Se posponen microservicios, repositorios Git separados, bases independientes de
lectura/escritura, bus externo de eventos, contenedor de dependencias y Event
Sourcing completo. Su complejidad requiere una necesidad adicional concreta.

El coste inicial es separar dependencias y conservar compatibilidad. El beneficio
esperado es cambiar mapas, reglas, presentación o almacenamiento en sus límites
correspondientes. Se comprobará mediante pruebas de contratos, invariantes y
dependencias, junto con recorridos completos del juego.

## Referencias

- [DDD](https://martinfowler.com/bliki/DomainDrivenDesign.html).
- [CQRS y sus costes](https://martinfowler.com/bliki/CQRS.html).
- [Repository](https://martinfowler.com/eaaCatalog/repository.html).
- [Monorepos en Render](https://render.com/docs/monorepo-support).

Estas referencias orientan el diseño; las decisiones específicas de Trencitos y
los acuerdos del usuario prevalecen sobre adoptar patrones por catálogo.

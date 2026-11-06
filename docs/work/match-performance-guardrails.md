---
{"id":"match-performance-guardrails","status":"active","parent":"match-performance-architecture","depends_on":["match-performance-isolation","match-performance-presentation"],"branch":"main","delivery":"worktree","updated":"2026-11-06"}
---
# Prevenir regresiones de arquitectura y respuesta

Fase 4. [Reglas canónicas](../architecture-rules.md) obligatorias desde AGENTS y
CI; no depender de recordar un skill en cada implementación.

## Hitos y aceptación

- [x] Separar la consulta del diario de su registrador de comandos; mantener
  permisos de robos ocultos, destinos y replay terminado.
- [x] Gate de dependencias dominio/aplicación/consultas y tiempo/azar explícitos,
  incluyendo puentes puros permitidos. Casos negativos demuestran el rechazo.
- [x] Contrato del repositorio/unidad de trabajo y criterios de entrega documentados.
- [ ] CI de aislamiento entre salas, rollback, reintento, recuperación, privacidad
  y presentación; comparación productiva y procedimiento de migración/regreso.
- [ ] Revisar el resultado conjunto y dejar explícitos los límites: compatibilidad
  legada, muestra pequeña y protección administrativa de la rama.

Los checks Node/Chrome usan fallos controlados para comprobar corrección; no
inyectar fallos ni hacer pruebas de carga masiva en producción. Las cifras de
rendimiento se obtienen del servicio productivo y conservan su commit/condiciones.

Validación previa a publicación: `npm run test:ci` pasa 734/734 comprobaciones;
`node tests/browser-draw-feedback.cjs` pasa 16 escenarios, incluidos pausa de
guardado, rechazo, reconexión, dos estados antes del ACK y móvil/movimiento reducido.
Docs y gate de 29 módulos correctos. Son pruebas aisladas, no latencia productiva.
CI dispone de 30 minutos: la instalación de Chrome tardó más de diez minutos en
una ejecución; se conserva la suite completa y el timeout sigue acotado.

Consulta de GitHub del 2026-11-06: `main.protected=false`. Los checks se ejecutan
en CI, pero la rama no impide un push directo. Exigir PR/CI mediante protección
cambiaría el flujo actual de trabajo en main; requiere acordar ese cambio de
flujo, y no se presenta como configurado.

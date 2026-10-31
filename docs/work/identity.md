---
{"id":"identity","status":"planned","parent":null,"depends_on":["docs-system"],"branch":null,"delivery":"none","updated":"2026-10-31"}
---
# Identidad persistente

Objetivo aprobado: comenzar con Google. Propuesta técnica: Supabase Auth,
aprovechando el proveedor existente sin confundirlo con el checkpoint de salas.
Hoy solo hay credenciales de puesto; no hay cuentas ni perfiles persistentes.

## Hitos y aceptación

- [ ] Cuenta estable y perfil: apodo, avatar del juego y selección de cosméticos
  sobreviven a otro navegador/dispositivo; identidad del proveedor separada del
  identificador de la cuenta. No usar email como identidad permanente.
- [ ] Login Google: proveedor y callback de desarrollo configurados; servidor
  verifica sesión antes de modificar perfil o asociar un puesto.
- [ ] Recuperación/guest: conservar práctica invitada y definir la asociación de
  un puesto existente sin apropiarse de otra sesión ni duplicar compras futuras.
- [ ] Verificar cierre, expiración, revocación y acceso a datos propios; ninguna
  clave secreta ni mano rival llega al cliente.

## Evidencia y siguiente paso

Diseño acordado; sin implementación ni configuración externa. Al abordar,
inspeccionar sesiones actuales y diseñar el perfil/migración por separado del
checkpoint. Las credenciales se configuran fuera del chat y Git.

Fuente técnica: [Google en Supabase Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
La foto/nombre de Google no se publica automáticamente como identidad del juego.

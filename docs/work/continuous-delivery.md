---
{"id":"continuous-delivery","status":"active","parent":null,"depends_on":[],"branch":"main","delivery":"integrated","updated":"2026-11-03"}
---
# Pruebas en GitHub y publicación automática

Ángel aprobó publicar main en Render después de que pasen las pruebas, evitando
despliegues por documentación y experimentos. Se mantiene una carpeta, una rama
habitual y un servicio; el pipeline no crea previews ni usa Supabase real.

## Aceptación

- [x] Workflow de GitHub Actions para pushes/PR a main y ejecución manual.
- [x] Instalación con lockfile, documentación, suite Node completa y Chrome:
  lobby con dos clientes, diez casos de robos, recuperación y privacidad.
- [x] Token de solo lectura, acciones oficiales fijadas por SHA y evidencia de
  navegador retenida siete días. Sin secretos de Render/Supabase en Actions.
- [ ] Primera ejecución real en GitHub aprobada.
- [ ] Render en `After CI Checks Pass`, rama main, con filtros de documentación
  y experimentos; configuración equivalente en el Blueprint.
- [ ] Despliegue automático verificado y recursos publicados contrastados con Git.
- [ ] Documentación final, evidencia y estado de producción actualizados.

## Implementación

[CI](../../.github/workflows/ci.yml) usa Ubuntu 24.04, Node 26 y Chrome instalado
por Playwright. `npm run test:ci` ejecuta los archivos Node en serie para mantener
aislados los recursos y reducir variabilidad. Los navegadores usan servidores
temporales; el caso remoto de cartas emplea un doble local de Supabase.
En CI, Chrome usa SwiftShader explícito para WebGL sin GPU. Los informes y
capturas se guardan en `.qa/ci/` y en el artefacto `browser-evidence`.

## Próximo paso

Validar el primer run en GitHub antes de habilitar el despliegue. Registrar aquí
la configuración observada y en [Producción](../production.md) el código Live.

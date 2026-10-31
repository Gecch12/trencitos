# Operación local y verificación

## Entorno

Node >=20; comandos en la raíz Git (la carpeta que contiene `package.json`).
`npm start` sirve HTTP y WebSocket en el mismo proceso, puerto 3000 por defecto.
Las pruebas usan `node --test` y abren puertos de loopback; un `listen EPERM`
del sandbox no demuestra un fallo del juego.

```sh
npm test
node scripts/check-docs.js
node scripts/check-docs.js --index
node scripts/check-docs.js --base HEAD
```

El último comando revisa cambios desde una referencia y cambios locales. Sus
avisos de fuentes afectadas solicitan revisión semántica; no exigen editar un
documento que sigue siendo correcto.

## Worktrees y ramas

Cada worktree tiene sus archivos y estado local. Git comparte historial y
referencias; los cambios no aparecen automáticamente en las otras carpetas.
Cada frente usa una rama distinta y registra su avance en su ficha. Sincroniza
desde una base revisada y resuelve documentos junto con código al integrar.

Para ejecutar el experimento, desde **su** worktree, con puerto libre:

```sh
STATE_BACKEND=file STATE_FILE="$PWD/room-state.json" PORT=3118 node server.js
```

No reutilices procesos ni archivos de estado de otra carpeta. Los `.env` no se
cargan automáticamente y no deben copiarse del entorno de producción. No
conectes dos procesos al mismo checkpoint Supabase: el nuevo invalida al anterior.

La app de Codex tiene registrado `trains`, cuyo repo está en `trencitos`.
Un chat local bajo ese proyecto debe usar explícitamente la ruta de su worktree
para herramientas y servidores. La configuración de chat no demuestra aislamiento.

## Verificar y entregar

Ejecuta pruebas pertinentes al comportamiento cambiado; para una base de
experimento o integración amplia, la suite completa. La UI necesita además
verificación en navegador. Documenta dispositivo real frente a emulación.
Cambios de Node requieren reiniciar el proceso de prueba correspondiente;
recargar la página no recarga el backend.

Registra comandos, resultado, límites, rama y revisión en la ficha de trabajo o
informe enlazado. No copies conteos antiguos de QA como resultado nuevo. Un
checkpoint local, un commit y un despliegue son evidencias distintas.

Despliegue, recuperación y validación remota: [Render/Supabase](RENDER_SUPABASE.md).
No se despliega ni se migra producción como parte de preparar documentación o 3D.

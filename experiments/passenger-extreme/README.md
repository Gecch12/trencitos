# Estudio histórico de 90 pasajeros

Prototipo Hippie Train anterior a Midsommar Express, recuperado del worktree
`codex/passenger-extreme` (base `f41e033` y cambios locales) el 2026-11-03.
La familia blanca vigente conserva Midsommar Express y sus 22 personas.

Esta carpeta mantiene el estudio, sus seis multitudes y las versiones de
`wagon-models.mjs` y `wagon-renderer.js` que necesita. Son dependencias congeladas
del experimento: no deben sustituir los módulos actuales de `frontend/`.
Se corrigieron únicamente las rutas de imports al trasladarlo. Three.js se
sirve desde la instalación común del repositorio.

Desde la raíz Git:

```sh
npm run preview:extreme
node --test tests/passenger-extreme.test.js
node tests/browser-passenger-extreme.cjs
```

La vista está en `http://127.0.0.1:3138/`. El servidor de preview usa una lista
explícita de archivos y no carga el servidor del juego, autenticación ni estado.
El runtime público y la imagen Docker no incluyen este experimento.
Las copias exactas previas al traslado y las capturas antiguas se conservan
localmente según [la ficha de consolidación](../../docs/work/workspace-consolidation.md).

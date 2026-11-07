---
name: trencitos-publicar
description: Publicar una entrega de Trencitos en Render, generar el APK firmado con su página de Release en GitHub e instalar la actualización en el iPhone de Ángel. Usar cuando pida publicar o distribuir este proyecto; crear o modificar el skill no ejecuta una publicación.
---

# Publicar Trencitos

El proyecto habitual está en `/Users/angelaltarodri/Desktop/free/trains/trencitos`,
rama `main`, remoto `Gecch12/trencitos`. Comprueba el checkout y cambios locales:
la carpeta superior `trains` no es el repositorio. Sigue `AGENTS.md` y
`docs/README.md`; las instrucciones operativas canónicas están en el repositorio.

Una solicitud de publicación completa comprende Render, APK en GitHub e iPhone.
Respeta el alcance si Ángel pide solo una plataforma. Invocar el skill para
publicar autoriza esos pasos; su mera disponibilidad, creación o revisión no.

## Preparar la entrega

- Lee la entrega vigente de `docs/production.md` y las secciones operativas de
  `docs/work/continuous-delivery.md` y `docs/mobile-development.md` según los
  destinos pedidos. Consulta historial e informes QA solo ante una duda concreta.
  Usa los scripts existentes de `package.json`; no inventes otro pipeline ni firma.
- Fija revisión, versión y builds antes de iniciar CI; agrupa los cambios de
  entrega para evitar pushes que cancelen una validación en curso. Conserva
  trabajo ajeno y ejecuta las pruebas locales pertinentes, documentación y
  arquitectura. No repitas localmente toda la regresión ya verificada para el
  mismo contenido salvo cambios, fallos o una duda concreta.
- Reutiliza un CI completo aprobado del commit exacto; si está en curso, sigue
  ese run sin crear otro. El check final `Tests, docs and browser` debe aprobar
  la suite Node y todos los grupos Chrome del workflow. Un run de alcance `docs` no certifica
  el juego: elige el commit de código ya validado o ejecuta CI manual completo
  sobre la revisión que realmente se entregará. El workflow anterior de un solo
  job también sirve si acredita todas sus pruebas para ese commit.
- Si CI falla, diagnostica/corrige dentro del alcance. Sin cambios de código,
  reutiliza los jobs aprobados del mismo run y reintenta los fallidos solo cuando
  cambie la causa; si cambia el commit, exige la validación completa nueva.

## Aprovechar las esperas

Mientras corre CI remoto, detecta el iPhone, prepara notas y compila/verifica los
paquetes de la revisión fijada. Publicar Render/Release e instalar en el teléfono
esperan al CI completo aprobado. No paralelices las sincronizaciones Android/iOS
en este checkout: ambos scripts regeneran `mobile/bundle` y configuración iOS.
Reutiliza las cachés de Gradle/Xcode y una ruta estable de DerivedData. Reinstala
dependencias cuando cambie el lockfile o falte una instalación válida; reserva
las limpiezas para fallos que las justifiquen. Un artefacto existente solo se reutiliza
si revisión, contenido, versión/build, firma y servidor son los esperados.

Consulta cada estado con esperas acotadas y registra duración de CI, compilación,
despliegue e instalación. Distingue tiempo de ejecución de espera por dispositivo
o servicio; no vuelvas a diagnosticar un bloqueo conocido sin evidencia nueva.

## Render

El servicio habitual es `https://trencitos-swamp.onrender.com`. Sigue
`docs/RENDER_SUPABASE.md` y `docs/work/continuous-delivery.md`: un push no acredita
publicación y el acceso Git de Render puede impedir el despliegue automático.
Usa el mecanismo disponible, confirma estado Live y revisión, y verifica salud
y recursos públicos. No ejecutes un segundo servidor local conectado a Supabase
de producción. No migres ni reemplaces datos como parte de un build rutinario.

## Android

Usa `npm run mobile:apk` con la configuración documentada. Incrementa el build
respecto a la última entrega, conserva applicationId y clave de firma para que
sea una actualización. Nunca incluyas claves o contraseñas en Git ni en el APK.
Comprueba firma, versión y servidor HTTPS del paquete generado.

Publica el APK como asset de una Release de `Gecch12/trencitos`, con etiqueta y
notas que identifiquen la revisión y build. Verifica que el asset exista.
Entrega primero **la página de la Release** (`/releases/tag/...`), que contiene
la descarga y sirve para compartir. El enlace `/releases/download/...` es
opcional y no sustituye al enlace de la página.

## iPhone

Da por hecho que Ángel quiere instalar la actualización y que conectará su
iPhone a la Mac. Detecta dispositivos antes de compilar; selecciona su iPhone
físico emparejado, sin confundirlo con un simulador. Si falta, recuérdale
conectarlo; si está bloqueado, pídele desbloquearlo y mantenerlo conectado.
Continúa el trabajo independiente mientras llega esa condición.

Usa la firma personal y configuración existentes, según
`docs/mobile-development.md`. Compila e instala sobre la aplicación existente,
sin desinstalarla ni borrar datos. Confirma identificador, versión y build
instalados. Ángel se encarga de jugar y evaluar la experiencia: no abras una
partida en su teléfono como parte de esta entrega. No contrates membresías ni
publiques en App Store/TestFlight salvo solicitud específica.

## Cierre y fallos

Registra la entrega y evidencia real en `docs/production.md` y la ficha afectada
una vez terminadas las comprobaciones. El commit documental de cierre conserva
la revisión de código entregada; su CI documental no obliga a recompilar ni
republicar los mismos paquetes. No cambies código en ese cierre sin nueva CI.
Informa por separado Render, APK y iPhone: revisión Live, enlace a Release y
versión instalada. Si una parte falla, conserva lo completado y describe la
causa concreta; reintenta solo después de corregirla o cambiar la condición.
No anuncies publicación o instalación basándote únicamente en una compilación.

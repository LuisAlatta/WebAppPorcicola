# Estado y guía para retomar el desarrollo

Actualizado el 7 de noviembre de 2026. Esta carpeta contiene el contexto necesario para continuar.

## Orden de lectura

1. Este archivo, para conocer el estado y los próximos pasos.
2. [plan.md](plan.md), para leer las 32 tareas, dependencias y criterios de salida.
3. [requisitos.md](requisitos.md), con 111 requisitos y 32 casos de aceptación.
4. [todo.md](todo.md), para registrar evidencia, avances y cobertura.
5. [decisiones.md](decisiones.md), con responsables y datos que la granja debe confirmar.

## Estado real

- **T01, T02, T03, T04, T05 y T06 completadas. T07 (Configurar la granja y sus parámetros) pendiente.**
- Se implementó el módulo exclusivo de administración (`worker/admin.ts`, `migrations/0002_administration_schema.sql` y `src/components/ModuloAdministracion.tsx`):
  - Exclusividad en servidor: rutas bajo `/api/admin/*` protegidas con 401 si no hay sesión y 403 Forbidden si el perfil no es `administrador` (CA-27).
  - Gestión integral de usuarios para los 4 perfiles (`administrador`, `responsable`, `operario`, `veterinario`) con hashing PBKDF2 y preservación de autoría histórica.
  - Gestión de galpones (`CFG-06`): código único, nombre, zona, capacidad en cabezas, estados (`preparacion`, `operativo`, `inactivo`) y eliminación segura si carece de registros.
  - Asignación atómica de equipo operativo (`ADM-02`, `ADM-03`, `CA-28`): asignación conjunta de Responsable, Operario y Veterinario; bloqueo estricto si se intenta activar un galpón con equipo incompleto; registro de cambios en `barn_team_history` con vigencias, autor y titular anterior; revocación inmediata de acceso del profesional sustituido; y reasignación o desactivación atómica si un Responsable activo perdería su último galpón.
  - Invariante de administrador: impedimento de desactivar o degradar de rol al único administrador activo de la granja.
  - Componente de interfaz `ModuloAdministracion.tsx` con navegación por pestañas (Cuentas, Galpones, Asignación de Equipo, Historial y Auditoría), controles táctiles accesibles (>=44px), modales limpios y uso estricto de iconos SVG.
- Se implementó T06 (eventos con reintentos y auditoría) en `worker/events.ts` y `migrations/0003_events_audit_schema.sql`:
  - Operación única con clave de reintento por autor, payload normalizado con JSON canónico y SHA-256, versión, autor, galpón, fecha efectiva y fecha de registro en `operation_log`.
  - Reintento con la misma clave y contenido devuelve el resultado anterior sin duplicar; contenido distinto responde 409 sin escribir (ACC-04).
  - Primer flujo real: asignación de equipo idempotente y corrección con historial (`POST /api/admin/barns/:id/team/correction`). La corrección conserva la fila original con vigencia y autor, y registra el cambio en `audit_log` con motivo, fechas y datos previos/nuevos (GES-03).
  - La auditoría se expone solo al administrador en `GET /api/admin/audit`; la interfaz muestra historial con vigencia/estado, botón de corrección y pestaña de auditoría con detalle JSON.
  - Los formularios inválidos conservan sus campos y la clave de reintento para un nuevo intento.
- Se cuenta con 35 pruebas automatizadas pasando en Vitest (aislamiento Cloudflare, bocetos, Worker 404, rutas E2E, exportaciones PDF/XLSX, D1 Miniflare, autenticación, integración administrativa y eventos idempotentes). En local pasaron las 35 pruebas, TypeScript (`tsc --noEmit`), ESLint (`eslint .`) y la compilación (`vite build`).
- Cero vulnerabilidades en dependencias de producción (`npm audit --omit=dev`).
- El commit previo verificado en GitHub Actions con éxito es `75c2c9f` (ejecución 42425588778).

## Repositorio y archivos de referencia

El repositorio es [LuisAlatta/WebAppPorcicola](https://github.com/LuisAlatta/WebAppPorcicola), rama `main`, remoto `origin`. Antes de editar, comprobar `git status --short --branch` y no sobrescribir trabajo ajeno. Los videos del cliente y la captura están en la carpeta local del proyecto y se excluyen de Git. Es posible que no estén presentes al clonar en otra máquina; la especificación conserva sus hallazgos y marcas de tiempo.

Tras cada cambio significativo, hacer commit con un mensaje breve en español, sin prefijos, y push. Verificar que el hash remoto coincide con el local. No guardar credenciales, archivos locales ni medios del cliente en Git. Si no hay acceso a GitHub o falla el push, dejar el estado y el motivo registrados.

## Cloudflare

El usuario designó la cuenta **newluisalattago@gmail.com**. El Account ID confirmado es `0acfa25b5f619f94d581b8cf882e2eec`. Antes de cualquier operación remota, comprobar la cuenta activa con `npx wrangler whoami` y comparar correo e ID. Si no coinciden, no operar en esa cuenta y pedir al usuario que cambie la sesión. No ejecutar por cuenta propia `wrangler login` ni `wrangler logout`, porque modifican la sesión global.

Las configuraciones están en `wrangler.jsonc`:

| Entorno | Worker configurado | Base D1 | ID de base |
|---|---|---|---|
| Pruebas | `web-porcicola-staging` | `webporcicola-staging` | `0e990468-3530-4e3a-a1df-530721ce38d7` |
| Producción | `web-porcicola-produccion` | `webporcicola-produccion` | `1a6f4451-bde8-46cf-beae-ed4dd76d34c0` |

Ambas bases fueron creadas por separado. La de producción estaba vacía al crearla. La configuración por defecto no declara un binding D1. El plugin de Vite selecciona un entorno nombrado con `CLOUDFLARE_ENV=staging` o `CLOUDFLARE_ENV=production`; los datos locales y remotos son independientes. En PowerShell, para compilar staging, ejecutar `$env:CLOUDFLARE_ENV='staging'; npm run build`. Confirmar que los bindings generados corresponden al entorno deseado antes de operar.

Todavía faltan definir y configurar los secretos separados, migraciones, dominio, cron y despliegue de la aplicación. No se ha verificado la aplicación en producción. No usar datos reales para pruebas ni escribir en la base de producción para comprobar una función. No poner secretos en archivos rastreados ni en el registro de avance.

## Pasos concretos para continuar

1. **Reproducir el estado.** Ejecutar `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run build`. 35 pruebas deben pasar.
2. **Implementar T07 (Configurar la granja y sus parámetros).** Formularios para catálogos, piaras, corrales, lotes, etapas, raciones, unidades, zona horaria y vigencias; separar galpón físico, ubicación, tipo, etapa y estado reproductivo; retirar valores sin romper referencias históricas.
3. **Cerrar Fase 2 con T07 y Cierre 2.** Configuración paramétrica y verificación cruzada de sesiones.

## Instrucción para continuar

Lee esta carpeta, revisa el estado del repositorio y retoma T07. Implementa y verifica el trabajo pendiente, registra evidencia, haz commit y push y continúa con las siguientes tareas del plan. Si necesitas una decisión de la granja, anota su impacto y avanza con el trabajo independiente.

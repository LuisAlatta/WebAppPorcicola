# Estado y guía para retomar el desarrollo

Actualizado el 7 de noviembre de 2026. Esta carpeta contiene el contexto necesario para continuar.

## Orden de lectura

1. Este archivo, para conocer el estado y los próximos pasos.
2. [plan.md](plan.md), para leer las 32 tareas, dependencias y criterios de salida.
3. [requisitos.md](requisitos.md), con 111 requisitos y 32 casos de aceptación.
4. [todo.md](todo.md), para registrar evidencia, avances y cobertura.
5. [decisiones.md](decisiones.md), con responsables y datos que la granja debe confirmar.

## Estado real

- **Fase 2 completa: T01 a T07 y Cierre 2. T08 completa (inventario individual y colectivo). T09 completa (fichas individuales). Siguiente: T10 (traslados, bajas, conciliación y correcciones).**
- Se implementó T08 (`worker/inventory.ts`, `migrations/0005_inventory_schema.sql` y `src/components/ModuloInventario.tsx`):
  - Libro inmutable de movimientos de cabezas con tipo excluyente: saldo inicial, compra, nacimiento, venta, muerte, traslado recibido, traslado enviado y ajuste. Cada fila guarda fecha efectiva, galpón, ubicación, lote, etapa, sexo (incluido pendiente de sexado), cantidad, causa y notas.
  - Existencias a fecha de corte y resumen por etapa calculados desde el mismo libro; el detalle de saldos reconstruye exactamente el total del tablero.
  - Resumen con entradas (iniciales y externas), salidas, muertes, disponibles y mortalidad con denominador explícito (muertes sobre entradas) por etapa y total de la granja.
  - Validación cronológica por grupo (galpón, ubicación, lote, etapa y sexo): ninguna entrada o corrección retroactiva puede dejar saldo negativo (409).
  - Idempotencia con clave de reintento por autor: mismo contenido devuelve el evento previo sin duplicar y contenido distinto responde 409. Auditoría con autor, motivo, fecha efectiva y datos del movimiento.
  - Traslados internos registrados como dos filas del mismo grupo que se cancelan en el total de la granja; su API queda para T10.
  - Permisos: veterinario solo lectura (403 al escribir); operario, responsable y administrador escriben, limitados a los galpones asignados (403 fuera de alcance). El administrador ve toda la granja.
  - Interfaz `ModuloInventario` con fecha de corte, KPIs, resumen por etapa, saldos por grupo, desglose por sexo, formulario de movimiento y listado filtrable. Rutas `/inventario` y `/configuracion` enlazadas en la SPA; Configuración visible solo para administrador.
  - Migración 0005 aplicada en staging y producción; ambos Workers desplegados. Verificación en vivo: producción `/api/inventory` responde 401 sin sesión y 200 autenticado con 2 galpones y 8 etapas; staging registró un saldo inicial de 2 cabezas y el snapshot pasó de 0 a 2 disponibles.
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
- Se implementó T07 (configuración versionada) en `worker/config.ts` y `migrations/0004_farm_config_schema.sql`:
  - Catálogos de sexo, estado del animal (activo, vendido, descartado, muerto), etapa, aptitud (pie de cría, engorde), ubicación, lote, causas de descarte y muerte, tipo de servicio, estado fisiológico y alimento.
  - Ocho etapas productivas con peso y edad inicial/final, duración, ración y consumo diario por cabeza; se calculan consumo a 30 días y total de la etapa. Los límites abiertos quedan en `null` y se distinguen de cero.
  - Parámetros generales de la granja (nombre, zona horaria, moneda y unidad de peso), ubicaciones físicas con jerarquía y lotes de manejo, separados de la etapa productiva (CFG-04).
  - Versionado por fecha efectiva con cierre de la versión anterior, consulta histórica por `asOf`, retiro de valores sin borrar su historial y auditoría reutilizando la convención de T06 (clave de reintento, autor, motivo y datos previos/nuevos).
  - Rutas `/api/config` (lectura autenticada) y escrituras solo para administrador; interfaz `ModuloConfiguracion` con pestañas de Parámetros, Catálogos, Etapas y Raciones, y Ubicaciones y Lotes.
- Se cuenta con 42 pruebas automatizadas pasando en Vitest (aislamiento Cloudflare, bocetos, Worker 404, rutas E2E, exportaciones PDF/XLSX, D1 Miniflare, autenticación, integración administrativa, eventos idempotentes y configuración versionada). En local pasaron las 42 pruebas, TypeScript (`tsc --noEmit`), ESLint (`eslint .`) y la compilación (`vite build`).
- Cierre 2 completado con `tests/cierre2.integration.test.ts`:
  - Dos sesiones de administrador comparten los cambios de inmediato.
  - Matriz de acceso directo: responsable, operario y veterinario reciben 403 en listar/crear cuentas, listar/eliminar galpones, consultar auditoría y escribir configuración, sin efectos secundarios.
  - Revocación inmediata: desactivar una cuenta revoca sus sesiones, invalida `/api/auth/me` y `/api/data/resumen`, y reactivarla no revive el token anterior. El cambio de rol se refleja en la sesión existente y el logout revoca el token en el acto.
  - Total final: 47 pruebas en 11 archivos, todas pasando, con typecheck, lint y build correctos.
- T08 agregó 8 pruebas de integración de inventario: 55 pruebas en 12 archivos en ese hito.
- T09 implementado en `worker/animals.ts`, `migrations/0006_animals_schema.sql` y `src/components/ModuloAnimales.tsx`:
  - Alta y consulta individual con código textual único, arete vigente e historial de aretes, tipo con vigencia, alias, raza, sexo, nacimiento, pesos opcionales, etapa, aptitud, procedencia, galpón, ubicación, lote, observaciones y genealogía interna/externa.
  - Las altas por nacimiento, compra o saldo inicial escriben ficha, pesajes conocidos y una cabeza de inventario dentro de la operación idempotente; un animal ya contado en un grupo consume una cabeza sin crear una entrada adicional. El snapshot histórico separa cabezas identificadas y no identificadas, incluso cuando el animal salió después de la fecha consultada.
  - Búsqueda por código, alias o arete y filtros combinables por tipo, sexo, estado, etapa, galpón, ubicación, lote y disponibilidad. Los registros vendidos o muertos se pueden consultar al filtrar su estado.
  - Validación de progenitores y ciclos; edición de tipo no cambia el ID ni el inventario y valida compatibilidad cerda/verraco con sexo. Desactivar/reactivar ficha pide motivo y no representa una venta o muerte.
  - Cronología actualmente incluye alta, pesos, cambios de arete/tipo y movimientos de inventario. Servicios/partos/crías y eventos clínicos se integrarán al cerrar T12–T18; los traslados individuales y la ubicación derivada de movimientos se completan en T10.
  - 9/9 pruebas específicas; suite `npm test -- --maxWorkers=1`: 64/64; `npm run test:integration`: 52/52; `npm run test:e2e`: 2/2; typecheck, lint, build staging y dry-run correctos. La suite serial evita los timeouts de inicialización de Miniflare observados al competir varias bases en paralelo.
  - Migración 0006 aplicada y Worker staging publicado. Verificación en vivo: `/animales` y `/animal/002` devuelven 200 HTML; `/api/animals` devuelve 401 sin sesión; tablas `animals`, `animal_tags` y `animal_weights` existen en D1. Versión staging: `35816410-622a-40d9-b586-7eeea51fed93`.
  - Commit `f902675` (`se implementaron fichas de animales`) en `main`, push confirmado. T09 no está desplegado en producción; el despliegue final corresponde a T31.
- **Despliegue de producción activo:** https://web-porcicola-produccion.luisalatta.workers.dev (versión `77c622ca-fa59-454a-820b-802d92799d78`). Migraciones 0001–0005 aplicadas en remoto a staging y producción; administrador inicial creado directamente en D1 con el bootstrap ya cerrado. Verificado en vivo: `/` 200 HTML, `/dashboard` 200 (SPA), `/api/auth/me` 401 sin sesión, `/api/no-existe` 404, login 200 con cookie, `/api/config` 200 autenticado y `/api/inventory` 401 sin sesión y 200 autenticado con 2 galpones y 8 etapas. Las rutas `/inventario` y `/configuracion` devuelven 200. La versión T09 no se desplegó en producción.
- **Despliegue de staging activo:** https://web-porcicola-staging.luisalatta.workers.dev (versión actual `35816410-622a-40d9-b586-7eeea51fed93`), con su administrador inicial y galpones base. Migraciones 0001–0006 aplicadas; pruebas T09: `/animales` y `/animal/002` 200 HTML, `/api/animals` 401 sin sesión y tablas del módulo presentes en D1.
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

Todavía faltan definir y configurar los secretos separados, dominio propio y cron. Los Workers de producción y staging están desplegados y verificados en `https://web-porcicola-produccion.luisalatta.workers.dev` y `https://web-porcicola-staging.luisalatta.workers.dev`; staging tiene las migraciones 0001–0006 y producción 0001–0005. El administrador inicial de cada entorno se insertó directo en su D1 para que `/api/auth/bootstrap` quedara cerrado antes de publicar. Cambiar la contraseña inicial débil desde el módulo de administración. No usar datos reales para pruebas ni escribir en la base de producción para comprobar una función. No poner secretos en archivos rastreados ni en el registro de avance.

## Pasos concretos para continuar

1. **Reproducir el estado.** Ejecutar `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `npm run test:integration`, `npm run test:e2e` y `npm run build`. Evidencia local actual: suite 64/64, integración 52/52 y E2E 2/2.
2. **Continuar con T10 (Transferir, dar de baja, conciliar y corregir).** Integrar traslados, ventas, muertes, recuentos físicos y correcciones al libro y fichas. Reproducir primero el estado actual de staging; no usar producción para pruebas.

## Instrucción para continuar

Lee esta carpeta, revisa el estado del repositorio y retoma T10. Implementa y verifica el trabajo pendiente, registra evidencia, haz commit y push y continúa con las siguientes tareas del plan. Si necesitas una decisión de la granja, anota su impacto y avanza con el trabajo independiente.

# Estado y guía para retomar el desarrollo

Actualizado el 7 de noviembre de 2026. Esta carpeta contiene el contexto necesario para continuar.

## Orden de lectura

1. Este archivo, para conocer el estado y los próximos pasos.
2. [plan.md](plan.md), para leer las 32 tareas, dependencias y criterios de salida.
3. [requisitos.md](requisitos.md), con 111 requisitos y 32 casos de aceptación.
4. [todo.md](todo.md), para registrar evidencia, avances y cobertura.
5. [decisiones.md](decisiones.md), con responsables y datos que la granja debe confirmar.

## Estado real

- **T01, T02, T03 y T04 completadas. T05 (Módulo exclusivo de administración) en curso.**
- Se implementó la autenticación completa y gestión de sesiones: inicialización bootstrap de un solo uso del primer administrador (`POST /api/auth/bootstrap`) con bloqueo estricto a segundos intentos (403), hashing criptográfico PBKDF2 WebCrypto con SHA-256 (100k iteraciones), sesiones revocables en D1 con tokens hasheados, cookies `HttpOnly`/`Secure`/`SameSite=Lax` y soporte de cabecera Bearer, revocación inmediata en logout (`POST /api/auth/logout`), protección ante cuentas desactivadas, rate limiting ante intentos fallidos (429) y defensas CSRF por origen.
- Se actualizaron los componentes visuales: login con identidad institucional de la granja (Granja Porcícola San Luis · MiGranjaPro), control táctil de visibilidad de contraseña (ver/ocultar con iconos SVG), y barra de navegación que refleja usuario autenticado y perfil activo.
- Se preparó el esquema inicial de base de datos en `migrations/0001_initial_schema.sql` con usuarios, sesiones, intentos de login, galpones y asignaciones de usuarios.
- Hay 23 pruebas automatizadas pasando en Vitest (aislamiento Cloudflare, bocetos de interfaz, Worker 404, rutas E2E, exportaciones, D1 Miniflare y suite de autenticación e integración). En local pasaron las 23 pruebas, TypeScript, ESLint y la compilación.
- Cero vulnerabilidades en dependencias de producción (`npm audit --omit=dev`). Diez advertencias moderadas en dependencias de desarrollo derivadas de `minimatch` bajo `eslint` 10.
- El commit previo verificado en GitHub Actions con éxito es `666fcb8` (ejecución 42424458900).

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

1. **Reproducir el estado.** Ejecutar `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run build`. 23 pruebas deben pasar.
2. **Implementar T05 (Módulo exclusivo de administración).** Crear endpoints y formularios para alta/edición de cuentas en los cuatro perfiles, gestión de galpones, activación en bloque de equipo completo, vigencias de asignación y prohibición estricta de acceso de otros roles.
3. **Cerrar Fase 2 con T06, T07 y Cierre 2.** Auditoría de eventos, configuración paramétrica y verificación cruzada de sesiones.

## Instrucción para continuar

Lee esta carpeta, revisa el estado del repositorio y retoma T02. Implementa y verifica el trabajo pendiente, registra evidencia, haz commit y push y continúa con las siguientes tareas del plan. Si necesitas una decisión de la granja, anota su impacto y avanza con el trabajo independiente.

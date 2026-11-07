# Estado y guía para retomar el desarrollo

Actualizado el 7 de noviembre de 2026. Esta carpeta contiene el contexto necesario para continuar.

## Orden de lectura

1. Este archivo, para conocer el estado y los próximos pasos.
2. [plan.md](plan.md), para leer las 32 tareas, dependencias y criterios de salida.
3. [requisitos.md](requisitos.md), con 111 requisitos y 32 casos de aceptación.
4. [todo.md](todo.md), para registrar evidencia, avances y cobertura.
5. [decisiones.md](decisiones.md), con responsables y datos que la granja debe confirmar.

## Estado real

- **Fase 1 completada (T01, T02, T03 y Cierre 1). Fase 2 (Acceso: T04 en adelante) lista para iniciar.**
- Se implementaron los bocetos navegables interactivos completos en React con TypeScript estricto: Acceso por perfil, Inicio con paneles específicos para los 4 roles, Listado con filtros y estados de carga/vacío, Alta/Corrección con moneda S/, peso kg y fechas locales, y Detalle zootécnico del animal 002 con alerta de retiro vigente y cronología. Se agregaron comandos npm para test:integration y test:e2e. El Worker devuelve 404 para rutas API no disponibles.
- Se verificó la atomicidad de D1 en el runtime local con Miniflare: reversión de lote ante fallo, restricciones UNIQUE y CHECK, claves foráneas con índice, concurrencia de saldo con precondición, migraciones secuenciales ordenadas y reintentos idempotentes con cabecera de reproducción y rechazo 409 ante modificación de datos.
- Se evaluaron e implementaron los exportadores PDF (`pdf-lib`) y XLSX (`fflate` con OpenXML nativo) comprobando acentos, importes en S/, pesos en kg, paginación y compatibilidad. Se adoptó la decisión técnica de generar reportes en cliente con datos autorizados por la API para preservar los límites de CPU y memoria (128 MB) del Worker y garantizar operatividad en Android PWA.
- Se prepararon React, TypeScript, Vite, Cloudflare Workers, configuración de ESLint, Vitest, y GitHub Actions. La versión de Wrangler está fijada en el archivo de dependencias. Node.js 24 es la versión usada por CI.
- Hay 16 pruebas automatizadas pasando en Vitest (aislamiento Cloudflare, bocetos de interfaz, Worker 404, rutas E2E, exportaciones y D1 local con Miniflare). En local pasaron las dieciséis pruebas, TypeScript, ESLint y la compilación.
- Cero vulnerabilidades en dependencias de producción (`npm audit --omit=dev`). Diez advertencias moderadas en dependencias de desarrollo derivadas de `minimatch` bajo `eslint` 10.
- El commit previo verificado en GitHub Actions con éxito es `6512396` (ejecución 42423802196).

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

1. **Reproducir el estado.** Ejecutar `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run build`. 16 pruebas deben pasar.
2. **Iniciar T04 (Sesiones y primer administrador).** Implementar inicialización única de administrador, contraseñas protegidas con hash, sesiones seguras con cookies HttpOnly/Secure en el Worker, control de concurrencia e interfaz de login conectada.
3. **Continuar con T05 a T07.** Módulo exclusivo de administración para los cuatro perfiles, vigencias, galpones y parámetros configurables.
4. **Seguir según dependencias.** Registrar evidencia y resultado real antes de marcar cada tarea.

## Instrucción para continuar

Lee esta carpeta, revisa el estado del repositorio y retoma T02. Implementa y verifica el trabajo pendiente, registra evidencia, haz commit y push y continúa con las siguientes tareas del plan. Si necesitas una decisión de la granja, anota su impacto y avanza con el trabajo independiente.

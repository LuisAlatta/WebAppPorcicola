# Estado y guía para retomar el desarrollo

Actualizado el 7 de noviembre de 2026. Esta carpeta contiene el contexto necesario para continuar.

## Orden de lectura

1. Este archivo, para conocer el estado y los próximos pasos.
2. [plan.md](plan.md), para leer las 32 tareas, dependencias y criterios de salida.
3. [requisitos.md](requisitos.md), con 111 requisitos y 32 casos de aceptación.
4. [todo.md](todo.md), para registrar evidencia, avances y cobertura.
5. [decisiones.md](decisiones.md), con responsables y datos que la granja debe confirmar.

## Estado real

- **T01 y T02 completadas. T03 en curso.** El resto del plan está pendiente. El siguiente paso es cerrar T03, sin marcar ninguna tarea completa antes de cumplir todos sus criterios.
- Se implementaron los bocetos navegables interactivos completos en React con TypeScript estricto: Acceso por perfil, Inicio con paneles específicos para los 4 roles, Listado con filtros y estados de carga/vacío, Alta/Corrección con moneda S/, peso kg y fechas locales, y Detalle zootécnico del animal 002 con alerta de retiro vigente y cronología. Se agregaron comandos npm para test:integration y test:e2e. El Worker devuelve 404 para rutas API no disponibles.
- Se prepararon React, TypeScript, Vite, Cloudflare Workers, configuración de ESLint, Vitest, y GitHub Actions. La versión de Wrangler está fijada en el archivo de dependencias. Node.js 24 es la versión usada por CI.
- Hay 11 pruebas automatizadas pasando en Vitest (aislamiento Cloudflare, bocetos de interfaz, Worker 404, rutas E2E y D1 local con Miniflare).
- La prueba D1 comprobó un lote que se revierte por una restricción, dos solicitudes concurrentes sobre un saldo de prueba, un identificador duplicado, una clave foránea y el uso de un índice. Aún no comprueba la operación completa de inventario, las migraciones ni una pérdida de respuesta real.
- El último estado de código revisado antes de este documento es `ef7b897`. La ejecución de GitHub Actions para ese commit terminó correctamente: [ejecución 42421923118](https://github.com/LuisAlatta/WebAppPorcicola/actions/runs/42421923118). En local pasaron seis pruebas, TypeScript, ESLint y la compilación. Repetir las comprobaciones al retomar.
- La auditoría registró diez advertencias moderadas en dependencias de desarrollo. Una comprobación anterior de dependencias de producción no encontró vulnerabilidades; repetirla porque los resultados pueden cambiar. Evaluar soluciones compatibles, sin forzar actualizaciones que rompan el proyecto.

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

1. **Reproducir el estado.** Ejecutar `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Abrir la aplicación local con `npm run dev` y verificar la ruta de inicio. Registrar resultados reales, no solo los comandos.
2. **Cerrar T02.** Preparar y comprobar los bocetos navegables previstos en el plan: acceso, inicio por perfil, listado, alta/corrección y detalle. El boceto debe dejar claro si todavía no ejecuta operaciones reales. Comprobar instalación desde un clon limpio, separación de entornos y secretos cuando existan, y que un cambio defectuoso detenga CI. Ya se comprobó un fallo de prueba local al compartir el ID de D1; **aún no se demostró el fallo en CI remoto**. Solo entonces marcar T02.
3. **Cerrar T03.** Repetir las pruebas D1 existentes y ampliar migraciones, restricciones, duplicados, reintento tras pérdida de respuesta y concurrencia. Evaluar generación y lectura de PDF/XLSX con acentos, importes y varias páginas, medir volumen, tiempo y memoria y registrar la elección. Se probó instalar `exceljs` y se retiró al detectar una advertencia moderada en su cadena de dependencias; no se seleccionó una biblioteca definitiva.
4. **Seguir T04 en adelante.** Construir sesiones y primer administrador, después usuarios, permisos por galpón y auditoría. Continuar según dependencias, con pruebas de interfaz, servidor, datos y permisos en cada tarea. Actualizar `todo.md` con evidencia, commit y pendientes antes de marcarla.
5. **Cierre final.** Ejecutar los 32 casos de aceptación, probar instalación y operación en Android real, restaurar una copia en una base aislada y efectuar el piloto con los cuatro perfiles. El despliegue y su comprobación corresponden a las tareas finales del plan.

## Instrucción para continuar

Lee esta carpeta, revisa el estado del repositorio y retoma T02. Implementa y verifica el trabajo pendiente, registra evidencia, haz commit y push y continúa con las siguientes tareas del plan. Si necesitas una decisión de la granja, anota su impacto y avanza con el trabajo independiente.

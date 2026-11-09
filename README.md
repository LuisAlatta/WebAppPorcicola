# Web Porcícola

Plan de desarrollo de una PWA Android para gestión de granja porcina con TypeScript, React, Cloudflare Workers y D1. Empezar por el [plan de ejecución](tasks/plan.md), consultar la [especificación funcional](tasks/requisitos.md) y registrar resultados en la [lista de tareas y pruebas](tasks/todo.md).

El repositorio contiene la aplicación y la documentación de planificación. Los archivos audiovisuales del cliente se conservan localmente.

Para iniciar la base local se necesita Node.js 24 y npm. Ejecutar `npm ci` y después `npm run dev`.

### Comandos de desarrollo y verificación

- `npm run dev`: Inicia Vite con la configuración de producción y D1 local emulada; no conecta por defecto a la base remota. Para cargar el esquema local, usar `npx wrangler d1 migrations apply webporcicola-produccion --local --env production`.
- `npm run typecheck`: Valida los tipos con TypeScript estricto.
- `npm run lint`: Ejecuta el linter ESLint.
- `npm test`: Ejecuta toda la suite de pruebas con Vitest.
- `npm run test:integration`: Ejecuta las pruebas de integración con Miniflare y D1.
- `npm run test:e2e`: Ejecuta pruebas de navegador con Playwright, después de compilar la aplicación.
- Sin seleccionar otro entorno, el build y el despliegue usan `production`, incluido el binding `webporcicola-produccion` y el cron diario de las 00:05 de Lima. Para cambiar a staging cuando se solicite, en PowerShell ejecutar `$env:CLOUDFLARE_ENV='staging'; npm run build`.
- Antes de desplegar, comprobar la cuenta activa y ejecutar `npx wrangler deploy --config dist/web_porcicola_produccion/wrangler.json --dry-run`; verificar nombre del Worker, binding D1 y cron. El despliegue normal es `npx wrangler deploy --config dist/web_porcicola_produccion/wrangler.json --keep-vars`.

### Versiones compatibles fijadas

- Node.js: 24.x
- TypeScript: 5.9.x
- React: 19.2.x
- Vite: 8.3.x
- Cloudflare Wrangler: 4.156.x

El estado implementado y las pruebas físicas pendientes se detallan en [tasks/estado.md](tasks/estado.md).

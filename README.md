# Web Porcícola

Plan de desarrollo de una PWA Android para gestión de granja porcina con TypeScript, React, Cloudflare Workers y D1. Empezar por el [plan de ejecución](tasks/plan.md), consultar la [especificación funcional](tasks/requisitos.md) y registrar resultados en la [lista de tareas y pruebas](tasks/todo.md).

El repositorio contiene la aplicación y la documentación de planificación. Los archivos audiovisuales del cliente se conservan localmente.

Para iniciar la base local se necesita Node.js 24 y npm. Ejecutar `npm ci` y después `npm run dev`.

### Comandos de desarrollo y verificación

- `npm run dev`: Inicia Vite con el entorno `staging` y D1 local por defecto. Para cargar el esquema local, usar `npx wrangler d1 migrations apply webporcicola-staging --local --env staging`. La base local es independiente de la remota.
- `npm run typecheck`: Valida los tipos con TypeScript estricto.
- `npm run lint`: Ejecuta el linter ESLint.
- `npm test`: Ejecuta toda la suite de pruebas con Vitest.
- `npm run test:integration`: Ejecuta las pruebas de integración con Miniflare y D1.
- `npm run test:e2e`: Ejecuta pruebas de navegador con Playwright, después de compilar la aplicación.
- En PowerShell, `$env:CLOUDFLARE_ENV='staging'; npm run build` compila para staging. Para preparar producción, seleccionar `production` explícitamente. Sin entorno, el build no contiene el binding D1.
- Antes de cualquier despliegue, comprobar la cuenta activa y ejecutar `npx wrangler deploy --config dist/web_porcicola/wrangler.json --dry-run`; verificar que el binding sea el entorno previsto. La publicación de producción sigue las condiciones de T31.

### Versiones compatibles fijadas

- Node.js: 24.x
- TypeScript: 5.9.x
- React: 19.2.x
- Vite: 8.3.x
- Cloudflare Wrangler: 4.156.x

El estado implementado y las pruebas físicas pendientes se detallan en [tasks/estado.md](tasks/estado.md).

# Web Porcícola

Plan de desarrollo de una PWA Android para gestión de granja porcina con TypeScript, React, Cloudflare Workers y D1. Empezar por el [plan de ejecución](tasks/plan.md), consultar la [especificación funcional](tasks/requisitos.md) y registrar resultados en la [lista de tareas y pruebas](tasks/todo.md).

El repositorio contiene documentación de planificación. Los archivos audiovisuales del cliente se conservan localmente.

Para iniciar la base local se necesita Node.js 24 y npm. Ejecutar `npm ci` y después `npm run dev`.

### Comandos de desarrollo y verificación

- `npm run dev`: Inicia el servidor de desarrollo local con Vite.
- `npm run typecheck`: Valida los tipos con TypeScript estricto.
- `npm run lint`: Ejecuta el linter ESLint.
- `npm test`: Ejecuta toda la suite de pruebas con Vitest.
- `npm run test:integration`: Ejecuta las pruebas de integración con Miniflare y D1.
- `npm run test:e2e`: Ejecuta las pruebas de rutas y contratos de navegación.
- `npm run build`: Compila la aplicación cliente y el Worker para producción.

### Versiones compatibles fijadas

- Node.js: 24.x
- TypeScript: 5.9.x
- React: 19.2.x
- Vite: 8.3.x
- Cloudflare Wrangler: 4.156.x

La interfaz actual incluye los bocetos navegables interactivos (Acceso, Inicio por perfil, Listado, Alta/Corrección y Detalle) para validar la experiencia de usuario y contratos de diseño antes de conectar las operaciones operativas reales de la granja.

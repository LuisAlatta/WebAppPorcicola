import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      config: {
        name: 'web-porcicola',
        main: './worker/index.ts',
        compatibility_date: '2026-07-01',
        assets: { not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] },
      },
    }),
  ],
});

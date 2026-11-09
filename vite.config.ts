import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export default defineConfig(() => {
  if (!process.env.CLOUDFLARE_ENV) process.env.CLOUDFLARE_ENV = 'production';
  return {
  plugins: [
    react(),
    cloudflare(),
    {
      name: 'porcicola-service-worker',
      apply: 'build',
      generateBundle(_options, bundle) {
        if (this.environment.name !== 'client') return;
        const files = Object.keys(bundle).filter(name => name.startsWith('assets/') && /\.(js|css)$/.test(name)).sort();
        const fixedPaths = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];
        const template = readFileSync(new URL('./pwa/service-worker.template.txt', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(files.join('\n')).update(template);
        for(const path of fixedPaths)hash.update(readFileSync(new URL(`./public${path}`,import.meta.url)));
        const version = hash.digest('hex').slice(0,16);
        const paths = [...files.map(name => `/${name}`), ...fixedPaths];
        const source = template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(paths));
        this.emitFile({type:'asset',fileName:'sw.js',source});
      },
    },
  ],
  };
});

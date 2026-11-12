import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('configuración de Cloudflare', () => {
  it('expone únicamente el entorno de producción', async () => {
    const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    expect(Object.keys(config.env)).toEqual(['production']);
    expect(config.env.staging).toBeUndefined();
  });

  it('usa la base de producción en el binding raíz y en el entorno production', async () => {
    const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases[0].database_name).toBe('webporcicola-produccion');
    expect(config.env.production.d1_databases).toHaveLength(1);
    expect(config.env.production.d1_databases[0].database_name).toBe('webporcicola-produccion');
    expect(config.env.production.d1_databases[0].database_id).toBe(config.d1_databases[0].database_id);
  });
});

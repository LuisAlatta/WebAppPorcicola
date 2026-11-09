import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('aislamiento de Cloudflare', () => {
  it('mantiene la base de pruebas únicamente en staging', async () => {
    const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    const stagingId = config.env.staging.d1_databases[0].database_id;
    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases[0].database_name).toBe('webporcicola-produccion');
    expect(config.d1_databases[0].database_id).not.toBe(stagingId);
    expect(config.env.staging.d1_databases).toHaveLength(1);
    expect(config.env.staging.d1_databases[0].database_name).toBe('webporcicola-staging');
  });

  it('falla si una compilación remota usa la base de pruebas en producción', async () => {
    const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    const stagingId = config.env.staging.d1_databases[0].database_id;
    const productionIds = (config.env.production?.d1_databases ?? []).map(
      (database: { database_id: string }) => database.database_id,
    );
    expect(productionIds).not.toContain(stagingId);
  });
});

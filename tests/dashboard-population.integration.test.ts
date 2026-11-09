import { readFile, readdir } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{ config: {
  name: 'dashboard-population', compatibilityDate: '2026-07-01',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default {fetch(){return new Response("ok")}}' } }, modulesRoot: '/' },
  env: { DB: { type: 'd1', id: 'dashboard-population' } },
} }] });
afterAll(() => runtime.dispose());

it('separa cabezas físicas de fichas identificadas y respeta el alcance del galpón', async () => {
  const db = await runtime.getD1Database('DB');
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
    const sql = (await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(x => x.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) { trigger += part + '; '; if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; } }
      else await db.prepare(part).run();
    }
  }
  let token = '';
  const api = async (path: string, body?: Record<string, unknown>) => {
    const res = await worker.fetch(new Request('https://test.local' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db });
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    return res.json() as Promise<Record<string, unknown>>;
  };
  token = String((await api('/api/auth/bootstrap', { username: 'population@test.local', password: 'PopulationTest2026!', name: 'Population' })).token);
  await api('/api/animals', { code: 'POP-1', animalType: 'lechon', sex: 'hembra', entryDate: '2026-01-01', entryStageCode: 'preinicio', barnId: 1, originType: 'inicial', reason: 'Ficha inicial', operationKey: 'population-animal' });
  await api('/api/inventory/movements', { movementType: 'initial', effectiveDate: '2026-01-01', barnId: 1, stageCode: 'preinicio', sex: 'macho', quantity: 9, reason: 'Lote sin identificar', operationKey: 'population-group-a' });
  await api('/api/inventory/movements', { movementType: 'initial', effectiveDate: '2026-01-01', barnId: 2, stageCode: 'engorde', sex: 'macho', quantity: 5, reason: 'Otro galpón', operationKey: 'population-group-b' });
  const dashboard = await api('/api/reports/dashboard');
  expect(dashboard).toMatchObject({ totalAnimals: 15, identifiedAnimals: 1, unidentifiedAnimals: 14 });
  const { reportDashboard } = await import('../worker/reports');
  const scoped = await reportDashboard(db, null, null, { allowedBarnNames: ['Galpón A'] });
  expect(scoped).toMatchObject({ totalAnimals: 10, identifiedAnimals: 1, unidentifiedAnimals: 9 });
  expect(await reportDashboard(db, null, null, { allowedBarnNames: [] })).toMatchObject({ totalAnimals: 0, identifiedAnimals: 0, unidentifiedAnimals: 0 });
}, 60000);

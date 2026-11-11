import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';

const runtime = new Miniflare({
  workers: [{ config: {
    name: 'animal-tag-toggle-reason-test',
    compatibilityDate: '2026-07-01',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
    env: { DB: { type: 'd1', id: 'animal-tag-toggle-reason' } },
  } }],
});

async function migrate(db: D1Database) {
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(statement => statement.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) {
        trigger += `${part}; `;
        if (/\bEND$/i.test(part)) {
          await db.prepare(trigger.trim()).run();
          trigger = '';
        }
      } else {
        await db.prepare(part).run();
      }
    }
    if (trigger) throw new Error(`Trigger incompleto: ${file}`);
  }
}

describe('Payload de auditoría en cambios de animal', () => {
  afterAll(async () => runtime.dispose());

  it('rechaza la misma clave con otro motivo al cambiar arete o disponibilidad', async () => {
    const db = await runtime.getD1Database('DB');
    await migrate(db);
    const bootstrap = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'animal-reason@granja.test', password: 'PasswordFicticio2026!', name: 'Admin de prueba' }),
    }), { DB: db });
    expect(bootstrap.status, await bootstrap.clone().text()).toBe(201);
    const { token } = await bootstrap.json() as { token: string };
    const api = (path: string, body: Record<string, unknown>) => worker.fetch(new Request(`http://localhost${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    }), { DB: db });
    const today = currentFarmDate();
    const animal = await api('/api/animals', {
      code: 'REASON-TEST-01', animalType: 'cerda', sex: 'hembra', birthDate: today,
      entryDate: today, entryStageCode: 'gestacion', barnId: 1, locationCode: 'galpon_a',
      originType: 'inicial', reason: 'Alta ficticia para validar reintentos', operationKey: 'reason-animal-create',
    });
    expect(animal.status, await animal.clone().text()).toBe(201);

    const tag = { tag: 'REASON-TAG-02', effectiveDate: today, reason: 'Cambio por rotura del arete', operationKey: 'reason-tag-change-1' };
    const tagFirst = await api('/api/animals/REASON-TEST-01/tags', tag);
    expect(tagFirst.status, await tagFirst.clone().text()).toBe(200);
    const tagReplay = await api('/api/animals/REASON-TEST-01/tags', tag);
    expect(tagReplay.status, await tagReplay.clone().text()).toBe(200);
    expect(await tagReplay.json()).toMatchObject({ replayed: true });
    const changedTagReason = await api('/api/animals/REASON-TEST-01/tags', { ...tag, reason: 'Corrección del dato anterior' });
    expect(changedTagReason.status, await changedTagReason.clone().text()).toBe(409);

    const deactivate = { reason: 'Ficha reservada para evaluación', operationKey: 'reason-animal-deactivate-1' };
    const deactivateFirst = await api('/api/animals/REASON-TEST-01/deactivate', deactivate);
    expect(deactivateFirst.status, await deactivateFirst.clone().text()).toBe(200);
    const deactivateReplay = await api('/api/animals/REASON-TEST-01/deactivate', deactivate);
    expect(deactivateReplay.status, await deactivateReplay.clone().text()).toBe(200);
    expect(await deactivateReplay.json()).toMatchObject({ replayed: true });
    const changedDeactivateReason = await api('/api/animals/REASON-TEST-01/deactivate', { ...deactivate, reason: 'Ya no reservar la ficha' });
    expect(changedDeactivateReason.status, await changedDeactivateReason.clone().text()).toBe(409);

    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_log WHERE operation_key IN ('reason-tag-change-1','reason-animal-deactivate-1')").first()).toMatchObject({ count: 2 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM animal_tags WHERE animal_id=(SELECT id FROM animals WHERE code=?)').bind('REASON-TEST-01').first()).toMatchObject({ count: 2 });

    const secondAnimal = await api('/api/animals', {
      code: 'SCOPE-B-01', animalType: 'lechon', sex: 'hembra', entryDate: today,
      entryStageCode: 'preinicio', barnId: 2, locationCode: 'galpon_b',
      originType: 'inicial', reason: 'Animal de otro galpón', operationKey: 'scope-second-animal',
    });
    expect(secondAnimal.status, await secondAnimal.clone().text()).toBe(201);
    const scoped = (path: string, ids: string) => worker.fetch(new Request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Barn-Ids': ids },
    }), { DB: db });
    const selectedOne = await scoped('/api/animals', '1');
    expect(selectedOne.status).toBe(200);
    const selectedOneBody = await selectedOne.json() as { animals: { barnId: number }[]; options: { barns: { id: number }[] } };
    expect(selectedOneBody.animals.map(animal => animal.barnId)).toEqual([1]);
    expect(selectedOneBody.options.barns.map(barn => barn.id)).toEqual([1]);
    const selectedBoth = await scoped('/api/animals', '1,2');
    expect((await selectedBoth.json() as { total: number }).total).toBe(2);
    expect((await scoped('/api/animals/SCOPE-B-01', '1')).status).toBe(404);
    expect((await scoped('/api/animals', '999')).status).toBe(403);
    expect((await scoped('/api/animals', '1,invalid')).status).toBe(400);
    const barns = await worker.fetch(new Request('http://localhost/api/barns', { headers: { Authorization: `Bearer ${token}` } }), { DB: db });
    expect((await barns.json() as { barns: { id: number }[] }).barns.map(barn => barn.id)).toEqual([1, 2]);
    for (const path of ['/api/inventory', '/api/finance/barns']) {
      const response = await scoped(path, '1');
      expect(response.status, await response.clone().text()).toBe(200);
      const data = await response.json() as { barns?: { id: number }[]; options?: { barns: { id: number }[] } };
      expect((data.barns ?? data.options?.barns)?.map(barn => barn.id)).toEqual([1]);
    }
  }, 90000);
});

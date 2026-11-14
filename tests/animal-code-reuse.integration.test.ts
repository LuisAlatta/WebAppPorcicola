import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';

const runtime = new Miniflare({ workers: [{ config: {
  name: 'animal-code-reuse-test', compatibilityDate: '2026-07-01',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
  env: { DB: { type: 'd1', id: 'animal-code-reuse' } },
} }] });

describe('Reutilización confirmada de códigos de animales', () => {
  let db: D1Database;
  let token: string;
  const today = currentFarmDate();
  const api = (path: string, body?: Record<string, unknown>, barns?: string) => worker.fetch(new Request(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(barns ? { 'X-Barn-Ids': barns } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: db });
  const input = (code: string) => ({ code, animalType: 'lechon', sex: 'hembra', entryDate: today, entryStageCode: 'preinicio', barnId: 1, originType: 'inicial', reason: 'Registro de prueba', operationKey: crypto.randomUUID() });
  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
      let trigger = '';
      for (const part of sql.split(';').map(p => p.trim()).filter(Boolean)) {
        if (trigger || /^CREATE TRIGGER/i.test(part)) {
          trigger += `${part}; `;
          if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
        } else await db.prepare(part).run();
      }
      if (trigger) throw new Error(`Trigger incompleto: ${file}`);
    }
    const response = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'reuse@granja.test', password: 'PasswordFicticio2026!', name: 'Admin prueba' }) }), { DB: db });
    expect(response.status, await response.clone().text()).toBe(201);
    token = (await response.json() as { token: string }).token;
  }, 90000);
  afterAll(async () => runtime.dispose());

  it('ofrece recuperar, exige confirmación y separa fichas, aretes, pesajes y reintentos', async () => {
    const originalInput = input('001');
    const original = await api('/api/animals', originalInput);
    expect(original.status, await original.clone().text()).toBe(201);
    const old = (await original.json() as { animal: { id: number } }).animal;
    expect((await api('/api/animals/001/deactivate', { reason: 'Eliminación de prueba' })).status).toBe(200);
    const newInput = input('001');
    const conflict = await api('/api/animals', newInput);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ inactiveAnimal: { id: old.id, code: '001', canReactivate: true } });
    expect((await api('/api/animals/001/reactivate', { reason: 'Recuperar ficha' })).status).toBe(200);
    expect((await api('/api/animals', { ...newInput, reuseInactiveAnimalId: old.id })).status).toBe(409);
    await api('/api/animals/001/deactivate', { reason: 'Registrar otro animal' });
    await db.prepare("INSERT INTO animal_weights(animal_id,weighed_on,weight_kg,recorded_by_user_id,created_at) VALUES(?,?,12,1,?)").bind(old.id, today, new Date().toISOString()).run();
    const confirmed = { ...newInput, reuseInactiveAnimalId: old.id };
    const created = await api('/api/animals', confirmed);
    expect(created.status, await created.clone().text()).toBe(201);
    const fresh = (await created.json() as { animal: { id: number; code: string; weights: unknown[] } }).animal;
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.code).toBe('001');
    expect(fresh.weights).toEqual([]);
    const archived = await db.prepare('SELECT code,is_active FROM animals WHERE id=?').bind(old.id).first<{code:string;is_active:number}>();
    expect(archived).toEqual({ code: `001-ARCH-${old.id}`, is_active: 0 });
    expect(await db.prepare('SELECT tag,is_current FROM animal_tags WHERE animal_id=? ORDER BY id LIMIT 1').bind(old.id).first()).toEqual({ tag: '001', is_current: 0 });
    const replay = await api('/api/animals', confirmed);
    expect(replay.status, await replay.clone().text()).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, animal: { id: fresh.id } });
    const oldReplay = await api('/api/animals', originalInput);
    expect(oldReplay.status).toBe(200);
    expect(await oldReplay.json()).toMatchObject({ replayed: true, animal: { id: old.id, code: archived!.code } });
    expect((await api('/api/animals', input('001'))).status).toBe(409);
  }, 90000);

  it('no revela ni reutiliza fichas fuera de los galpones autorizados', async () => {
    const original = await api('/api/animals', input('SCOPE-REUSE'));
    const old = (await original.json() as { animal: { id: number } }).animal;
    await api('/api/animals/SCOPE-REUSE/deactivate', { reason: 'Desactivar' });
    const response = await api('/api/animals', { ...input('SCOPE-REUSE'), barnId: 2, reuseInactiveAnimalId: old.id }, '2');
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty('inactiveAnimal');
    expect(await db.prepare('SELECT code FROM animals WHERE id=?').bind(old.id).first()).toEqual({ code: 'SCOPE-REUSE' });
  }, 90000);
});

import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{ config: {
  name: 'animal-entry-stage-test', compatibilityDate: '2026-07-01',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
  env: { DB: { type: 'd1', id: 'animal-entry-stage' } },
} }] });

describe('Etapa de ingreso sin restricción de vigencia', () => {
  let db: D1Database;
  let token: string;
  const input = (stage: string) => ({
    code: `HIST-${stage}`, animalType: 'lechon', sex: 'hembra',
    entryDate: '2024-12-14', birthDate: '2024-11-15', weaningDate: '2024-12-15',
    entryStageCode: stage, barnId: 1, originType: 'inicial',
    reason: 'Registro histórico de prueba', operationKey: `historical-stage-${stage}`,
  });
  const create = (body: Record<string, unknown>) => worker.fetch(new Request('http://localhost/api/animals', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), { DB: db });

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
    const response = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'historical-stage@granja.test', password: 'PasswordFicticio2026!', name: 'Admin prueba' }),
    }), { DB: db });
    expect(response.status, await response.clone().text()).toBe(201);
    token = (await response.json() as { token: string }).token;
  }, 90000);
  afterAll(async () => runtime.dispose());

  it.each(['preinicio', 'inicio', 'levante', 'engorde', 'gestacion', 'lactancia', 'vacia', 'reproductor'])('registra %s con las fechas de 2024 y conserva un único movimiento al reintentar', async stage => {
    const body = input(stage);
    const created = await create(body);
    expect(created.status, await created.clone().text()).toBe(201);
    expect(await created.json()).toMatchObject({ animal: { code: body.code, entryDate: body.entryDate, entryStageCode: stage, birthDate: body.birthDate, weaningDate: body.weaningDate } });
    const replay = await create(body);
    expect(replay.status, await replay.clone().text()).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE animal_id=(SELECT id FROM animals WHERE code=?)').bind(body.code).first()).toEqual({ n: 1 });
  });

  it('rechaza códigos de etapa inexistentes sin guardar la ficha', async () => {
    const response = await create(input('inexistente'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'La etapa de ingreso no existe' });
    expect(await db.prepare("SELECT id FROM animals WHERE code='HIST-inexistente'").first()).toBeNull();
  });
});

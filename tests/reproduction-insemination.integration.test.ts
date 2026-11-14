import { readFile, readdir } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{ config: { name: 'insemination-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default {fetch(){return new Response("ok")}}' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'insemination-test' } } } }] });
afterAll(() => runtime.dispose());

it('persiste intervalos, raza real, repetición, confirmación y reintento sin duplicar', async () => {
  const db = await runtime.getD1Database('DB');
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) { trigger += `${part}; `; if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; } }
      else await db.prepare(part).run();
    }
  }
  let token = '';
  const api = (path: string, body: Record<string, unknown>) => worker.fetch(new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), { DB: db });
  const admin = await api('/api/auth/bootstrap', { username: 'insemination@granja.test', password: 'PasswordFicticio2026!', name: 'Prueba' });
  expect(admin.status).toBe(201);
  token = (await admin.json() as { token: string }).token;
  for (const [code, animalType, sex, breed] of [['MADRE-IA', 'cerda', 'hembra', 'Landrace'], ['PADRE-IA', 'verraco', 'macho', 'Duroc']]) {
    const res = await api('/api/animals', { code, animalType, sex, breed, birthDate: '2026-01-01', entryDate: '2026-01-01', entryStageCode: animalType === 'cerda' ? 'gestacion' : 'reproductor', barnId: 1, locationCode: 'galpon_a', originType: 'inicial', reason: 'Registro ficticio de prueba', operationKey: `create-${code}` });
    expect(res.status, await res.clone().text()).toBe(201);
  }
  const payload = { femaleCode: 'MADRE-IA', serviceDate: '2026-10-01', serviceType: 'inseminacion_artificial', sireCode: 'PADRE-IA', sireBreed: 'Incorrecta', heatRepeatDays: '18', gestationDays: '115', operationKey: 'insemination-create' };
  for (const heatRepeatDays of ['0', '121', '2.5']) expect((await api('/api/reproduction/cycles', { ...payload, heatRepeatDays })).status).toBe(400);
  const created = await api('/api/reproduction/cycles', payload);
  expect(created.status, await created.clone().text()).toBe(201);
  const body = await created.json() as { createdCycleId: string; cycles: Record<string, unknown>[] };
  expect(body.cycles[0]).toMatchObject({ heatRepeatDays: 18, gestationDays: 115, probableHeatRepeatDate: '2026-10-19', probableFarrowingDate: '2027-01-24', reproductiveStatus: 'possible_pregnancy', services: [{ sireBreed: 'Duroc' }] });
  const replay = await api('/api/reproduction/cycles', payload);
  expect(replay.status, await replay.clone().text()).toBe(200);
  expect(await db.prepare('SELECT COUNT(*) n FROM reproduction_cycles').first()).toMatchObject({ n: 1 });
  const repeat = await api(`/api/reproduction/cycles/${body.createdCycleId}/services`, { serviceDate: '2026-10-21', serviceType: 'inseminacion_artificial', sireCode: 'PADRE-IA', operationKey: 'insemination-repeat' });
  expect(repeat.status, await repeat.clone().text()).toBe(201);
  expect(await repeat.json()).toMatchObject({ cycle: { probableHeatRepeatDate: '2026-11-08', probableFarrowingDate: '2027-02-13' } });
  const confirmed = await api(`/api/reproduction/cycles/${body.createdCycleId}/events`, { eventType: 'pregnancy_confirmed', eventDate: '2026-11-01', operationKey: 'insemination-confirm' });
  expect(confirmed.status, await confirmed.clone().text()).toBe(201);
  expect(await confirmed.json()).toMatchObject({ cycle: { reproductiveStatus: 'gestation', probableHeatRepeatDate: '2026-11-08' } });
}, 90000);

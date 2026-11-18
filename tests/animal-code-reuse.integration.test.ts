import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';
import { previewCustomReport } from '../worker/reports';

const runtime = new Miniflare({ workers: [{ config: {
  name: 'animal-code-reuse-test', compatibilityDate: '2026-07-01',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
  env: { DB: { type: 'd1', id: 'animal-code-reuse' } },
} }] });

describe('Reutilización automática de códigos de animales', () => {
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

  it('archiva automáticamente la ficha inactiva y separa fichas, aretes, pesajes y reintentos', async () => {
    const originalInput = input('001');
    const original = await api('/api/animals', originalInput);
    expect(original.status, await original.clone().text()).toBe(201);
    const old = (await original.json() as { animal: { id: number } }).animal;
    const newInput = input('001');
    expect((await api('/api/animals', newInput)).status).toBe(409);
    await api('/api/animals/001/deactivate', { reason: 'Registrar otro animal' });
    const weightInput = { weighedOn: today, weighedTime: '12:00', weightKg: 12, operationKey: crypto.randomUUID() };
    const weight = await api('/api/animals/001/weights', weightInput);
    expect(weight.status, await weight.clone().text()).toBe(201);
    const created = await api('/api/animals', newInput);
    expect(created.status, await created.clone().text()).toBe(201);
    const fresh = (await created.json() as { animal: { id: number; code: string; weights: unknown[] } }).animal;
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.code).toBe('001');
    expect(fresh.weights).toEqual([]);
    const archived = await db.prepare('SELECT code,is_active FROM animals WHERE id=?').bind(old.id).first<{code:string;is_active:number}>();
    expect(archived).toEqual({ code: `001-ARCH-${old.id}`, is_active: 0 });
    expect(await db.prepare('SELECT tag,is_current FROM animal_tags WHERE animal_id=? ORDER BY id LIMIT 1').bind(old.id).first()).toEqual({ tag: '001', is_current: 0 });
    const replay = await api('/api/animals', newInput);
    expect(replay.status, await replay.clone().text()).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, animal: { id: fresh.id } });
    const oldReplay = await api('/api/animals', originalInput);
    expect(oldReplay.status).toBe(200);
    expect(await oldReplay.json()).toMatchObject({ replayed: true, animal: { id: old.id, code: archived!.code } });
    expect(await (await api('/api/animals/001/weights', weightInput)).json()).toMatchObject({ replayed: true, animal: { id: old.id, code: archived!.code } });
    expect((await api('/api/animals', input('001'))).status).toBe(409);
  }, 90000);

  it('bloquea códigos en uso real aunque estén en otro galpón, pero permite registrar códigos inactivos o históricos sin revelar la ficha previa', async () => {
    const original = await api('/api/animals', input('SCOPE-REUSE'));
    expect(original.status, await original.clone().text()).toBe(201);
    const old = (await original.json() as { animal: { id: number } }).animal;

    const blockedActive = await api('/api/animals', { ...input('SCOPE-REUSE'), barnId: 2 }, '2');
    expect(blockedActive.status).toBe(409);
    expect(await blockedActive.json()).not.toHaveProperty('inactiveAnimal');
    expect(await db.prepare('SELECT code FROM animals WHERE id=?').bind(old.id).first()).toEqual({ code: 'SCOPE-REUSE' });

    await api('/api/animals/SCOPE-REUSE/deactivate', { reason: 'Desactivar' });
    const response = await api('/api/animals', { ...input('SCOPE-REUSE'), barnId: 2, entryDate: '2024-12-14' }, '2');
    expect(response.status, await response.clone().text()).toBe(201);
    const createdBody = await response.json() as { animal: { id: number; code: string; barnId: number } };
    expect(createdBody.animal.id).not.toBe(old.id);
    expect(createdBody.animal.code).toBe('SCOPE-REUSE');
    expect(createdBody.animal.barnId).toBe(2);
    expect(await db.prepare('SELECT code,is_active FROM animals WHERE id=?').bind(old.id).first()).toEqual({ code: `SCOPE-REUSE-ARCH-${old.id}`, is_active: 0 });
  }, 90000);

  it('permite registrar un código aunque un animal inactivo con otro código conserve ese arete', async () => {
    const first = await api('/api/animals', input('TAG-HOLDER-BASE'));
    expect(first.status, await first.clone().text()).toBe(201);
    const old = (await first.json() as { animal: { id: number } }).animal;
    const tagChange = await api('/api/animals/TAG-HOLDER-BASE/tags', { tag: 'TAG-LIBRE-01', effectiveDate: today, reason: 'Cambio de arete' });
    expect(tagChange.status, await tagChange.clone().text()).toBe(200);

    const blocked = await api('/api/animals', input('TAG-LIBRE-01'));
    expect(blocked.status).toBe(409);

    await api('/api/animals/TAG-HOLDER-BASE/deactivate', { reason: 'Desactivar ficha anterior' });
    const created = await api('/api/animals', input('TAG-LIBRE-01'));
    expect(created.status, await created.clone().text()).toBe(201);
    const fresh = (await created.json() as { animal: { id: number; code: string; currentTag: string } }).animal;
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.code).toBe('TAG-LIBRE-01');
    expect(fresh.currentTag).toBe('TAG-LIBRE-01');
    expect(await db.prepare('SELECT tag,is_current FROM animal_tags WHERE animal_id=? AND is_current=1').bind(old.id).first()).toEqual({ tag: `TAG-LIBRE-01-ARCH-${old.id}`, is_current: 1 });
  }, 90000);

  it('no cruza tratamientos, correcciones ni vacunas al reutilizar el código', async () => {
    const code = 'HEALTH-REUSE';
    const original = await api('/api/animals', input(code));
    const old = (await original.json() as { animal: { id: number } }).animal;
    const treatment = { eventType: 'treatment', effectiveDate: today, animalCodes: [code], product: 'Producto prueba', dosage: 1, dosageUnit: 'ml', reason: 'Tratamiento de prueba', operationKey: crypto.randomUUID() };
    const health = await api('/api/health/events', treatment);
    expect(health.status, await health.clone().text()).toBe(201);
    const event = (await health.json() as { event: { id: number } }).event;
    const vaccine = await api('/api/vaccines/schedules/manual', { animalCode: code, vaccineName: 'Vacuna prueba', scheduledDate: today, reason: 'Programar', operationKey: crypto.randomUUID() });
    expect(vaccine.status, await vaccine.clone().text()).toBe(201);
    await api(`/api/animals/${code}/deactivate`, { reason: 'Archivar ficha anterior' });
    const created = await api('/api/animals', input(code));
    expect(created.status, await created.clone().text()).toBe(201);
    const archivedCode = `${code}-ARCH-${old.id}`;
    const freshHealth = await api(`/api/health/events?animalCode=${code}`);
    expect(await freshHealth.json()).toMatchObject({ events: [] });
    const oldHealth = await api(`/api/health/events?animalCode=${archivedCode}`);
    expect(await oldHealth.json()).toMatchObject({ events: [{ animalCode: archivedCode }] });
    const correction = await api(`/api/health/events/${event.id}/correction`, { ...treatment, reason: 'Corregir dosis histórica', dosage: 2, operationKey: crypto.randomUUID() });
    expect(correction.status, await correction.clone().text()).toBe(201);
    const correctionBody = await correction.json() as { event: { id: number } };
    expect(await db.prepare('SELECT animal_id FROM health_event_animals WHERE health_event_id=?').bind(correctionBody.event.id).first()).toEqual({ animal_id: old.id });
    const schedules = await api('/api/vaccines/schedules');
    expect(await schedules.json()).toMatchObject({ schedules: [{ animalId: old.id, animalCode: archivedCode }] });
    expect(await db.prepare('SELECT animal_code_snapshot FROM vaccine_occurrences WHERE animal_id=?').bind(old.id).first()).toEqual({ animal_code_snapshot: code });
    await api('/api/alerts');
    expect(await db.prepare("SELECT animal_code FROM alert_occurrences WHERE alert_type='vaccine' AND source_id=(SELECT CAST(id AS TEXT) FROM vaccine_occurrences WHERE animal_id=?)").bind(old.id).first()).toEqual({ animal_code: archivedCode });
    for (const source of ['health', 'vaccines']) {
      const report = (animalCode: string) => previewCustomReport(db, { source, name: 'Prueba de historial', purpose: 'Validar identidad', columns: ['animalCode'], filters: { animalCode } }, 'administrador', {});
      expect((await report(code)).rows).toEqual([]);
      expect((await report(archivedCode)).rows).toEqual([{ animalCode: archivedCode }]);
    }
  }, 90000);

  it('revierte el archivo completo si falla el registro nuevo', async () => {
    const code = 'ROLLBACK-REUSE';
    const original = await api('/api/animals', input(code));
    const old = (await original.json() as { animal: { id: number } }).animal;
    await api(`/api/animals/${code}/deactivate`, { reason: 'Archivar' });
    await db.prepare("CREATE TRIGGER reuse_test_abort BEFORE INSERT ON animals WHEN NEW.code='ROLLBACK-REUSE' BEGIN SELECT RAISE(ABORT,'Fallo simulado del alta'); END").run();
    try {
      const response = await api('/api/animals', input(code));
      expect(response.ok).toBe(false);
      expect(await db.prepare('SELECT code FROM animals WHERE id=?').bind(old.id).first()).toEqual({ code });
      expect(await db.prepare('SELECT tag,is_current FROM animal_tags WHERE animal_id=?').bind(old.id).all()).toMatchObject({ results: [{ tag: code, is_current: 1 }] });
      expect(await db.prepare('SELECT COUNT(*) AS n FROM animals WHERE code=?').bind(`${code}-ARCH-${old.id}`).first()).toEqual({ n: 0 });
    } finally { await db.prepare('DROP TRIGGER reuse_test_abort').run(); }
  }, 90000);
});

import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{ config: { name: 'cierre5-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'cierre5-db' } } } }] });
afterAll(async () => runtime.dispose());

async function migrate(db: D1Database) {
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(value => value.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) {
        trigger += `${part}; `;
        if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
      } else await db.prepare(part).run();
    }
    if (trigger) throw new Error(`Trigger incompleto en ${file}`);
  }
}

describe('Cierre 5 · alimentación, tratamiento y vacunas', () => {
  it('concilia una misma ficha, consumo y sanidad, y conserva una sola vacuna al editar el ciclo', async () => {
    const db = await runtime.getD1Database('DB'); await migrate(db);
    let token = '';
    const api = (path: string, payload?: Record<string, unknown>, method = payload ? 'POST' : 'GET') => worker.fetch(new Request(`http://localhost${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}),
    }), { DB: db });
    const expectStatus = async (response: Response, status: number) => { expect(response.status, await response.clone().text()).toBe(status); return response; };
    const bootstrap = await expectStatus(await api('/api/auth/bootstrap', { username: 'cierre5@granja.test', password: 'Cierre5Segura2026!', name: 'Administrador Cierre 5' }), 201);
    token = (await bootstrap.json() as { token: string }).token;
    await expectStatus(await api('/api/animals', { code: 'C5-002', animalType: 'reemplazo', sex: 'hembra', birthDate: '2026-06-06', entryDate: '2026-06-06', entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'inicial', reason: 'Alta ficticia de cierre cinco', operationKey: 'c5-animal' }), 201);
    const rule = await expectStatus(await api('/api/vaccines/rules', { vaccineName: 'Glasser C5', targetCategory: 'reemplazo', baseEvent: 'birth', offsetDays: 60, effectiveFrom: '2026-06-06', reason: 'Regla ficticia para CA13', operationKey: 'c5-rule01' }), 201);
    const ruleKey = (await rule.json() as { ruleKey: string }).ruleKey;
    const agenda = async () => (await (await api('/api/vaccines/schedules?from=2026-08-05&to=2026-08-05')).json() as { schedules: { id: number; animalCode: string; vaccineName: string; scheduledDate: string; status: string }[] }).schedules.filter(row => row.animalCode === 'C5-002' && row.vaccineName === 'Glasser C5');
    expect(await agenda()).toMatchObject([{ animalCode: 'C5-002', scheduledDate: '2026-08-05', status: 'pending' }]);
    await expectStatus(await api('/api/vaccines/generate', { ruleKey }), 200);
    expect(await agenda()).toHaveLength(1);
    const feed = { effectiveDate: '2026-08-03', warehouseId: 1, feedCode: 'preinicio', lotCode: 'C5-ALIMENTO', costPerKg: 3, currencyCode: 'PEN', quantityKg: 8, reason: 'Alimento ficticio cierre cinco' };
    await expectStatus(await api('/api/feed/movements', { ...feed, movementType: 'purchase', supplier: 'Proveedor ficticio', operationKey: 'c5-purchase' }), 201);
    const delivery = { ...feed, movementType: 'delivery', animalCode: 'C5-002', quantityKg: 2, operationKey: 'c5-delivery' };
    await expectStatus(await api('/api/feed/movements', delivery), 201);
    await expectStatus(await api('/api/feed/movements', delivery), 200);
    const treatment = { eventType: 'treatment', effectiveDate: '2026-08-04', animalCodes: ['C5-002'], product: 'Tratamiento C5', productLot: 'C5-MED', dosage: 1.5, dosageUnit: 'ml', reason: 'Tratamiento ficticio cierre cinco', operationKey: 'c5-treatment' };
    await expectStatus(await api('/api/health/events', treatment), 201);
    await expectStatus(await api('/api/health/events', treatment), 200);
    await expectStatus(await api('/api/animals/C5-002', { animalType: 'cerda', effectiveDate: '2026-08-06', reason: 'Cambio ficticio de categoría', operationKey: 'c5-category' }, 'PUT'), 200);
    const cycle = await expectStatus(await api('/api/reproduction/cycles', { femaleCode: 'C5-002', serviceDate: '2026-08-07', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Registro ficticio', operationKey: 'c5-cycle' }), 201);
    const cycleId = (await cycle.json() as { createdCycleId: string }).createdCycleId;
    for (const n of [1, 2]) await expectStatus(await api(`/api/reproduction/cycles/${cycleId}`, { observations: `Observación C5 ${n}`, operationKey: `c5-cycle-edit-${n}` }, 'PUT'), 200);
    const pending = await agenda(); expect(pending).toHaveLength(1); expect(pending[0].status).toBe('pending');
    const application = { appliedDate: '2026-08-05', dosage: 1, dosageUnit: 'ml', reason: 'Aplicación ficticia cierre cinco', operationKey: 'c5-vaccine-apply' };
    await expectStatus(await api(`/api/vaccines/schedules/${pending[0].id}/apply`, application), 201);
    await expectStatus(await api(`/api/vaccines/schedules/${pending[0].id}/apply`, application), 200);
    await expectStatus(await api('/api/vaccines/generate', { ruleKey }), 200);
    const applied = await agenda(); expect(applied).toHaveLength(1); expect(applied[0]).toMatchObject({ id: pending[0].id, scheduledDate: '2026-08-05', status: 'applied' });
    const detail = await (await api('/api/animals/C5-002')).json() as { animal: { code: string; animalType: string } };
    expect(detail.animal).toMatchObject({ code: 'C5-002', animalType: 'cerda' });
    const health = await (await api('/api/health/events?animalCode=C5-002')).json() as { events: { eventType: string; product: string; animalCodes?: string[] }[] };
    expect(health.events.filter(event => event.eventType === 'treatment' && event.product === 'Tratamiento C5')).toHaveLength(1);
    expect(health.events.filter(event => event.eventType === 'vaccination' && event.product === 'Glasser C5')).toHaveLength(1);
    const movements = await (await api('/api/feed/movements?from=2026-08-03&to=2026-08-03')).json() as { movements: { movementType: string; animalCode: string | null; quantityKg: number }[] };
    expect(movements.movements.filter(row => row.movementType === 'delivery' && row.animalCode === 'C5-002')).toMatchObject([{ quantityKg: 2 }]);
    const stock = await (await api('/api/feed/inventory?asOf=2026-08-03')).json() as { inventory: { lotCode: string; availableKg: number }[] };
    expect(stock.inventory.find(row => row.lotCode === 'C5-ALIMENTO')).toMatchObject({ availableKg: 6 });
  }, 60000);
});

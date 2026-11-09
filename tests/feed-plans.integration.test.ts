import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { listFeedPlans, registerFeedPlan, type FeedPlanInput } from '../worker/feed-plans';
import { registerFeedMovement } from '../worker/feed';

const runtime = new Miniflare({ workers: [{ config: { name: 'feed-plans-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'feed-plans' } } } }] });
describe('Programación de turnos pendientes', () => {
  let db: D1Database;
  let actorId: number;
  const base = { effectiveDate: '2026-11-08', shiftCode: 'manana', barnId: 1, stageCode: 'preinicio', feedCode: 'preinicio', plannedKg: 20, reason: 'Programación de alimentación' };
  const plan = (input: FeedPlanInput, connection = db) => registerFeedPlan(connection, actorId, { ...base, ...input });
  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys=ON;');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= 22).sort()) {
      const source = (await readFile(new URL(file, directory), 'utf8')).replace(/^--.*$/gm, '').replace(/\s+/g, ' ');
      let trigger = '';
      for (const statement of source.split(';').map(part => part.trim()).filter(Boolean)) {
        if (trigger || /^CREATE TRIGGER/i.test(statement)) {
          trigger += `${statement}; `;
          if (/\bEND$/i.test(statement)) { await db.exec(trigger.trim()); trigger = ''; }
        } else await db.exec(`${statement};`);
      }
    }
    const response = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'plans@granja.pe', password: 'PlansTest2026!', name: 'Prueba programación' }) }), { DB: db });
    expect(response.status).toBe(201);
    actorId = Number((await db.prepare('SELECT id FROM users WHERE username=?').bind('plans@granja.pe').first<{ id: number }>())!.id);
  });
  afterAll(async () => runtime.dispose());

  it('programa sin retirar alimento y muestra el turno completo pendiente aunque no haya entregas', async () => {
    const before = await db.prepare('SELECT COUNT(*) AS count FROM feed_movements').first();
    const result = await plan({ effectiveDate: '2026-11-10', operationKey: 'plan-turno-futuro' });
    expect(result).toMatchObject({ replayed: false, plan: { effectiveDate: '2026-11-10', plannedKg: 20, version: 1 } });
    expect(await listFeedPlans(db, { from: '2026-11-10', to: '2026-11-10' })).toEqual([expect.objectContaining({ servedKg: 0, pendingKg: 20, plannedKg: 20 })]);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM feed_movements').first()).toEqual(before);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity_type='feed_plan'").first()).toMatchObject({ count: 1 });
  });

  it('descuenta las entregas de varios lotes físicos de una sola programación', async () => {
    await plan({ operationKey: 'plan-turno-parcial' });
    for (const [index, quantityKg] of [[1, 5], [2, 7]]) {
      const supply = { warehouseId: 1, effectiveDate: base.effectiveDate, feedCode: 'preinicio', lotCode: `PLAN-LOTE-${index}`, quantityKg, reason: 'Prueba entregas programadas' };
      await registerFeedMovement(db, actorId, { ...supply, movementType: 'purchase', supplier: 'Proveedor', costPerKg: 3 });
      await registerFeedMovement(db, actorId, { ...supply, movementType: 'delivery', destinationBarnId: 1, turn: { shiftCode: 'manana', stageCode: 'preinicio', plannedKg: 20, servedKg: quantityKg, consumedKg: quantityKg } });
    }
    expect(await listFeedPlans(db, { from: base.effectiveDate, to: base.effectiveDate })).toEqual([expect.objectContaining({ plannedKg: 20, servedKg: 12, pendingKg: 8, consumedKg: 12 })]);
  });

  it('versiona el reemplazo y la cancelación conservando reintentos e historial', async () => {
    const input = { shiftCode: 'tarde', operationKey: 'plan-version-original' };
    const first = await plan(input);
    await plan({ shiftCode: 'tarde', plannedKg: 30, reason: 'Se corrigió la ración prevista', operationKey: 'plan-version-reemplazo' });
    expect(await plan(input)).toMatchObject({ replayed: true, plan: first.plan });
    expect((await listFeedPlans(db, { from: base.effectiveDate, to: base.effectiveDate })).find(row => row.shiftCode === 'tarde')).toMatchObject({ plannedKg: 30, version: 2 });
    await plan({ shiftCode: 'tarde', plannedKg: 0, reason: 'Se canceló el turno previsto', operationKey: 'plan-version-cancelacion' });
    expect((await listFeedPlans(db, { from: base.effectiveDate, to: base.effectiveDate })).find(row => row.shiftCode === 'tarde')).toMatchObject({ plannedKg: 0, pendingKg: 0, version: 3 });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_log WHERE operation_type='feed.plan' AND json_extract(payload,'$.shiftCode')='tarde'").first()).toMatchObject({ count: 3 });
    await expect(plan({ shiftCode: 'tarde', plannedKg: 30, reason: '', operationKey: 'plan-sin-motivo' })).rejects.toMatchObject({ status: 400 });
  });

  it('aplica el acceso por galpón al consultar y al programar', async () => {
    await db.prepare("INSERT INTO barns(id,code,name,created_at) VALUES(99,'PLAN-AJENO','Galpón ajeno','2026-01-01T00:00:00Z')").run();
    await expect(registerFeedPlan(db, actorId, base, { allowedBarnNames: ['Galpón ajeno'] })).rejects.toMatchObject({ status: 403 });
    expect(await listFeedPlans(db, {}, { allowedBarnNames: ['Galpón ajeno'] })).toEqual([]);
  });

  it('rechaza reemplazos concurrentes calculados desde la misma versión', async () => {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const scheduled = new Proxy(db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => { if (++arrivals === 2) release(); await barrier; return target.batch(statements); };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const outcomes = await Promise.allSettled([
      plan({ shiftCode: 'noche', plannedKg: 10, operationKey: 'plan-concurrente-a' }, scheduled),
      plan({ shiftCode: 'noche', plannedKg: 30, operationKey: 'plan-concurrente-b' }, scheduled),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_log WHERE operation_type='feed.plan' AND json_extract(payload,'$.shiftCode')='noche'").first()).toMatchObject({ count: 1 });
  });
});

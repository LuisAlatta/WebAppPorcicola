import { afterAll, expect, it } from 'vitest';
import { healthFixture } from './health-test-helpers';
import { recordFarrowing } from '../worker/litters';

let fixture: Awaited<ReturnType<typeof healthFixture>>;
afterAll(async () => fixture?.runtime.dispose());

it('el parto pasa la madre a lactancia sin duplicar cabezas y conserva el reintento', async () => {
  fixture = await healthFixture('farrowing-stage');
  const { api } = fixture;
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await api(path, body);
    expect(response.status, await response.clone().text()).toBeLessThan(300);
    return response.json() as Promise<Record<string, unknown>>;
  };
  await post('/api/animals', { code: 'ETAPA-MADRE', animalType: 'cerda', sex: 'hembra', birthDate: '2024-01-01', entryDate: '2026-01-01', entryStageCode: 'gestacion', barnId: 1, locationCode: 'galpon_a', originType: 'inicial', reason: 'Alta madre', operationKey: 'farrowing-stage-mother' });
  const cycle = await post('/api/reproduction/cycles', { femaleCode: 'ETAPA-MADRE', serviceDate: '2026-05-25', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Prueba', operationKey: 'farrowing-stage-cycle' });
  const path = `/api/reproduction/cycles/${cycle.createdCycleId}/farrowing`;
  const body = { farrowingDate: '2026-09-16', maleAlive: 2, femaleAlive: 3, reason: 'Parto y lactancia', operationKey: 'farrowing-stage-birth' };
  await post(path, body);
  expect(await post(path, body)).toMatchObject({ replayed: true });
  const detail = await (await api('/api/animals/ETAPA-MADRE')).json() as { animal: { stageCode: string } };
  expect(detail.animal.stageCode).toBe('lactancia');
  const projection = await (await api('/api/feed/projection?asOf=2026-09-16')).json() as { stages: { stageCode: string; heads: number; dailyKg: number }[] };
  expect(projection.stages.find(x => x.stageCode === 'gestacion')?.heads).toBe(0);
  expect(projection.stages.find(x => x.stageCode === 'lactancia')).toMatchObject({ heads: 1, dailyKg: 5.5 });
  const stock = await (await api('/api/inventory?asOf=2026-09-16')).json() as { summary: { total: { available: number } } };
  expect(stock.summary.total.available).toBe(6);
  const listed = await (await api('/api/reproduction/cycles')).json() as { cycles: { id: string; reproductiveStatus: string; femalePresent: boolean }[] };
  expect(listed.cycles.find(x => x.id === cycle.createdCycleId)).toMatchObject({ reproductiveStatus: 'lactation', femalePresent: true });
  const litterId = (await fixture.db.prepare('SELECT id FROM litters WHERE cycle_id=?').bind(cycle.createdCycleId).first<{ id: string }>())!.id;
  const correction = { farrowingDate: '2026-09-18', expectedCurrentDate: '2026-09-16', reason: 'Fecha observada corregida', operationKey: 'farrowing-stage-date' };
  await post(`/api/reproduction/litters/${litterId}/date-correction`, correction);
  expect(await post(`/api/reproduction/litters/${litterId}/date-correction`, correction)).toMatchObject({ replayed: true });
  expect(await fixture.db.prepare("SELECT stage_code FROM animal_location_history WHERE animal_id=(SELECT id FROM animals WHERE code='ETAPA-MADRE') AND valid_from<='2026-09-17' AND (valid_until IS NULL OR valid_until>'2026-09-17')").first()).toMatchObject({ stage_code: 'gestacion' });
  expect(await fixture.db.prepare("SELECT stage_code FROM animal_location_history WHERE animal_id=(SELECT id FROM animals WHERE code='ETAPA-MADRE') AND valid_from<='2026-09-18' AND (valid_until IS NULL OR valid_until>'2026-09-18')").first()).toMatchObject({ stage_code: 'lactancia' });
  const before = await (await api('/api/feed/projection?asOf=2026-09-17')).json() as { stages: { stageCode: string; heads: number; dailyKg: number }[] };
  expect(before.stages.find(x => x.stageCode === 'gestacion')).toMatchObject({ heads: 1, dailyKg: 2.2 });
  expect(before.stages.find(x => x.stageCode === 'lactancia')?.heads).toBe(0);
  const audit = await fixture.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE entity_type='animal' AND entity_id=(SELECT id FROM animals WHERE code='ETAPA-MADRE') AND new_data LIKE '%lactancia%'").first<{ n: number }>();
  expect(audit?.n).toBeGreaterThanOrEqual(1);
}, 60000);

it('concilia ingreso y parto el mismo día y rechaza un parto anterior a un traslado guardado', async () => {
  const { api, db } = fixture;
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await api(path, body);
    expect(response.status, await response.clone().text()).toBeLessThan(300);
    return response.json() as Promise<Record<string, unknown>>;
  };
  await post('/api/animals', { code: 'ETAPA-DIA', animalType: 'cerda', sex: 'hembra', entryDate: '2026-10-01', entryStageCode: 'gestacion', barnId: 1, originType: 'inicial', reason: 'Alta en fecha de parto', operationKey: 'farrowing-stage-day-mother' });
  const cycle = await post('/api/reproduction/cycles', { femaleCode: 'ETAPA-DIA', serviceDate: '2026-10-01', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Prueba', operationKey: 'farrowing-stage-day-cycle' });
  await post(`/api/reproduction/cycles/${cycle.createdCycleId}/farrowing`, { farrowingDate: '2026-10-01', maleAlive: 1, reason: 'Parto el día de ingreso', operationKey: 'farrowing-stage-day-birth' });
  expect(await db.prepare("SELECT current_stage_code FROM animals WHERE code='ETAPA-DIA'").first()).toMatchObject({ current_stage_code: 'lactancia' });

  await post('/api/animals', { code: 'ETAPA-POSTERIOR', animalType: 'cerda', sex: 'hembra', entryDate: '2026-01-01', entryStageCode: 'gestacion', barnId: 1, originType: 'inicial', reason: 'Alta para cronología', operationKey: 'farrowing-stage-later-mother' });
  const laterCycle = await post('/api/reproduction/cycles', { femaleCode: 'ETAPA-POSTERIOR', serviceDate: '2026-05-01', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Prueba', operationKey: 'farrowing-stage-later-cycle' });
  await post('/api/animals/ETAPA-POSTERIOR/transfer', { effectiveDate: '2026-10-01', destinationBarnId: 1, destinationStageCode: 'gestacion', locationCode: 'corral_maternidad', reason: 'Traslado posterior guardado', operationKey: 'farrowing-stage-later-transfer' });
  const response = await api(`/api/reproduction/cycles/${laterCycle.createdCycleId}/farrowing`, { farrowingDate: '2026-09-16', maleAlive: 1, reason: 'Parto anterior al traslado', operationKey: 'farrowing-stage-later-birth' });
  expect(response.status, await response.clone().text()).toBe(409);
  expect(await db.prepare('SELECT COUNT(*) n FROM litters WHERE cycle_id=?').bind(laterCycle.createdCycleId).first()).toMatchObject({ n: 0 });
  expect(await db.prepare("SELECT location_code,current_stage_code FROM animals WHERE code='ETAPA-POSTERIOR'").first()).toMatchObject({ location_code: 'corral_maternidad', current_stage_code: 'gestacion' });
}, 60000);

it('revierte todo el parto si la ficha cambia antes del commit', async () => {
  const { api, db } = fixture;
  const mother = await api('/api/animals', { code: 'ETAPA-CARRERA', animalType: 'cerda', sex: 'hembra', entryDate: '2026-01-01', entryStageCode: 'gestacion', barnId: 1, originType: 'inicial', reason: 'Alta para carrera', operationKey: 'farrowing-stage-race-mother' });
  expect(mother.status).toBe(201);
  const response = await api('/api/reproduction/cycles', { femaleCode: 'ETAPA-CARRERA', serviceDate: '2026-05-01', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Prueba', operationKey: 'farrowing-stage-race-cycle' });
  const cycle = await response.json() as { createdCycleId: string };
  const actor = (await db.prepare("SELECT id FROM users WHERE role='administrador'").first<{ id: number }>())!.id;
  let raced = false;
  const delayed = new Proxy(db, { get(target, key) {
    if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
      if (!raced) { raced = true; await db.prepare("UPDATE animals SET updated_at='changed-concurrently' WHERE code='ETAPA-CARRERA'").run(); }
      return target.batch(statements);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } }) as D1Database;
  await expect(recordFarrowing(delayed, actor, cycle.createdCycleId, { farrowingDate: '2026-09-16', maleAlive: 2, reason: 'Parto concurrente', operationKey: 'farrowing-stage-race-birth' })).rejects.toMatchObject({ status: 409 });
  expect(await db.prepare('SELECT COUNT(*) n FROM litters WHERE cycle_id=?').bind(cycle.createdCycleId).first()).toMatchObject({ n: 0 });
  expect(await db.prepare("SELECT current_stage_code FROM animals WHERE code='ETAPA-CARRERA'").first()).toMatchObject({ current_stage_code: 'gestacion' });
}, 60000);

it('corrige la transición antes de un traslado posterior y revierte historial y movimientos si falla', async () => {
  const { api, db } = fixture;
  const motherId = (await db.prepare("SELECT id FROM animals WHERE code='ETAPA-MADRE'").first<{ id: number }>())!.id;
  const litterId = (await db.prepare('SELECT id FROM litters WHERE female_animal_id=?').bind(motherId).first<{ id: string }>())!.id;
  const transfer = await api('/api/animals/ETAPA-MADRE/transfer', { effectiveDate: '2026-10-01', destinationBarnId: 1, locationCode: 'corral_maternidad', reason: 'Ubicación posterior de la madre', operationKey: 'farrowing-stage-mother-transfer' });
  expect(transfer.status, await transfer.clone().text()).toBe(201);
  const correction = { farrowingDate: '2026-09-20', expectedCurrentDate: '2026-09-18', reason: 'Corrección previa al traslado', operationKey: 'farrowing-stage-before-transfer' };
  const path = `/api/reproduction/litters/${litterId}/date-correction`;
  const response = await api(path, correction);
  expect(response.status, await response.clone().text()).toBe(201);
  expect(await db.prepare('SELECT location_code,current_stage_code FROM animals WHERE id=?').bind(motherId).first()).toMatchObject({ location_code: 'corral_maternidad', current_stage_code: 'lactancia' });
  expect(await db.prepare("SELECT stage_code FROM animal_location_history WHERE animal_id=? AND valid_from<='2026-09-19' AND (valid_until IS NULL OR valid_until>'2026-09-19')").bind(motherId).first()).toMatchObject({ stage_code: 'gestacion' });
  const crossed = await api(path, { ...correction, farrowingDate: '2026-10-02', expectedCurrentDate: '2026-09-20', operationKey: 'farrowing-stage-cross-transfer' });
  expect(crossed.status).toBe(409);
  const state = async () => ({
    history: (await db.prepare('SELECT * FROM animal_location_history WHERE animal_id=? ORDER BY id').bind(motherId).all()).results,
    movements: (await db.prepare('SELECT * FROM inventory_movements WHERE animal_id=? OR litter_id=? ORDER BY id').bind(motherId,litterId).all()).results,
  });
  const before = await state();
  await db.prepare("CREATE TRIGGER farrowing_stage_failure BEFORE UPDATE OF farrowing_date ON litters BEGIN SELECT RAISE(ABORT,'forced_farrowing_failure'); END").run();
  try {
    const failed = await api(path, { ...correction, farrowingDate: '2026-09-21', expectedCurrentDate: '2026-09-20', operationKey: 'farrowing-stage-atomic-failure' });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(await state()).toEqual(before);
    expect(await db.prepare("SELECT COUNT(*) n FROM operation_log WHERE operation_key='farrowing-stage-atomic-failure'").first()).toMatchObject({ n: 0 });
  } finally { await db.prepare('DROP TRIGGER farrowing_stage_failure').run(); }
}, 60000);

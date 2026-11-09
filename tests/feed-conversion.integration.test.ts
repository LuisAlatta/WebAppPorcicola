import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { getFeedProjection, registerFeedMovement } from '../worker/feed';

const runtime = new Miniflare({ workers: [{ config: { name: 'feed-conversion-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'feed-conversion' } } } }] });
const from = '2026-10-10';
const to = '2026-11-08';
describe('Conversión alimenticia con población y periodo comparables', () => {
  let db: D1Database;
  let actorId: number;
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
    const response = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'conversion@granja.pe', password: 'ConversionTest2026!', name: 'Prueba conversión' }) }), { DB: db });
    expect(response.status).toBe(201);
    actorId = Number((await db.prepare('SELECT id FROM users WHERE username=?').bind('conversion@granja.pe').first<{ id: number }>())!.id);
  });
  afterAll(async () => runtime.dispose());

  async function cohort(barnId: number, heads: number, identified: number) {
    await db.prepare('INSERT INTO barns(id,code,name,created_at) VALUES(?,?,?,?)').bind(barnId, `CONV-${barnId}`, `Conversión ${barnId}`, `${from}T00:00:00Z`).run();
    await db.prepare("INSERT INTO inventory_movements(movement_type,effective_date,barn_id,stage_code,sex,quantity,created_by_user_id,created_at) VALUES('initial',?,?,'preinicio','hembra',?,?,?)").bind(from, barnId, heads, actorId, `${from}T00:00:00Z`).run();
    for (let index = 1; index <= identified; index++) {
      const id = barnId * 100 + index;
      await db.prepare("INSERT INTO animals(id,code,animal_type,sex,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,created_by_user_id,created_at,updated_at) VALUES(?,?,'lechon','hembra','inicial',?,'preinicio','preinicio',?,?,?,?)").bind(id, `CONV-${id}`, from, barnId, actorId, `${from}T00:00:00Z`, `${from}T00:00:00Z`).run();
      await db.prepare("INSERT INTO animal_location_history(animal_id,barn_id,stage_code,valid_from,created_by_user_id,created_at) VALUES(?,?,'preinicio',?,?,?)").bind(id, barnId, from, actorId, `${from}T00:00:00Z`).run();
      await weigh(id, barnId, from, 10);
      await weigh(id, barnId, to, 20);
    }
    return barnId * 100 + 1;
  }
  async function weigh(animalId: number, barnId: number, date: string, weight: number, correctsId: number | null = null) {
    const result = await db.prepare("INSERT INTO animal_weights(animal_id,weighed_on,weighed_time,weight_kg,stage_code,barn_id,corrects_weight_id,recorded_by_user_id,created_at) VALUES(?,?,'08:00',?,'preinicio',?,?,?,?)").bind(animalId, date, weight, barnId, correctsId, actorId, `${date}T08:00:00Z`).run();
    return Number(result.meta.last_row_id);
  }
  async function consumption(barnId: number, allDays: boolean) {
    const base = { warehouseId: 1, feedCode: 'preinicio', lotCode: `CONV-${barnId}`, reason: 'Prueba consumo comparable' };
    await registerFeedMovement(db, actorId, { ...base, movementType: 'purchase', effectiveDate: from, quantityKg: 100, costPerKg: 3, supplier: 'Proveedor' });
    const dates = allDays ? Array.from({ length: 30 }, (_, day) => new Date(Date.parse(`${from}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10)) : [to];
    for (const date of dates) await registerFeedMovement(db, actorId, { ...base, movementType: 'delivery', effectiveDate: date, quantityKg: allDays ? 1 : 30, destinationBarnId: barnId, turn: { shiftCode: 'manana', stageCode: 'preinicio', plannedKg: allDays ? 1 : 30, servedKg: allDays ? 1 : 30, consumedKg: allDays ? 1 : 30 } });
  }
  async function conversion(barnId: number) { return (await getFeedProjection(db, to)).conversion.find(row => row.barnId === barnId && row.stageCode === 'preinicio'); }

  it('no divide el consumo de diez cabezas por la ganancia de una muestra de dos', async () => {
    await cohort(101, 10, 2);
    await consumption(101, false);
    expect(await conversion(101)).toMatchObject({ populationHeads: 10, measuredAnimals: 2, coveragePercent: 20, consumedKg: 30, weightGainKg: 20, feedConversionRatio: null, unavailableReason: expect.any(String) });
  });

  it('calcula cuando todos los animales y los días del periodo están cubiertos', async () => {
    await cohort(102, 2, 2);
    await consumption(102, true);
    expect(await conversion(102)).toMatchObject({ populationHeads: 2, measuredAnimals: 2, coveragePercent: 100, consumptionDays: 30, requiredConsumptionDays: 30, weightGainKg: 20, consumedKg: 30, feedConversionRatio: 1.5, unavailableReason: null });
  }, 15000);

  it('descarta el peso reemplazado por una corrección', async () => {
    const animalId = await cohort(103, 1, 1);
    const original = await db.prepare('SELECT id FROM animal_weights WHERE animal_id=? AND weighed_on=?').bind(animalId, from).first<{ id: number }>();
    await weigh(animalId, 103, from, 15, original!.id);
    await consumption(103, true);
    expect(await conversion(103)).toMatchObject({ weightGainKg: 5, feedConversionRatio: 6, unavailableReason: null });
  }, 15000);

  it('descarta un animal trasladado que volvió al mismo galpón entre ambos pesajes', async () => {
    const animalId = await cohort(104, 1, 1);
    await db.prepare('UPDATE animal_location_history SET valid_until=? WHERE animal_id=?').bind('2026-10-18', animalId).run();
    await db.prepare("INSERT INTO animal_location_history(animal_id,barn_id,stage_code,valid_from,valid_until,created_by_user_id,created_at) VALUES(?,1,'preinicio','2026-10-18','2026-10-20',?,?)").bind(animalId, actorId, `${from}T00:00:00Z`).run();
    await db.prepare("INSERT INTO animal_location_history(animal_id,barn_id,stage_code,valid_from,created_by_user_id,created_at) VALUES(?,104,'preinicio','2026-10-20',?,?)").bind(animalId, actorId, `${from}T00:00:00Z`).run();
    await consumption(104, true);
    expect(await conversion(104)).toMatchObject({ feedConversionRatio: null, coveragePercent: 0, unavailableReason: expect.any(String) });
  }, 15000);

  it('no presenta un consumo de un solo día como el total de treinta días', async () => {
    await cohort(105, 1, 1);
    await consumption(105, false);
    expect(await conversion(105)).toMatchObject({ feedConversionRatio: null, consumptionDays: 1, requiredConsumptionDays: 30, unavailableReason: expect.any(String) });
  });

  it('rechaza periodos de peso distintos aunque todos tengan dos pesajes', async () => {
    const animalId = await cohort(106, 1, 1);
    await db.prepare('UPDATE animal_weights SET weighed_on=? WHERE animal_id=? AND weighed_on=?').bind('2026-10-15', animalId, from).run();
    await consumption(106, true);
    expect(await conversion(106)).toMatchObject({ feedConversionRatio: null, coveragePercent: 0, unavailableReason: expect.any(String) });
  }, 15000);
});

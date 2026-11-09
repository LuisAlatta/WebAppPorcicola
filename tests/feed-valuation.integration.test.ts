import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { registerFeedMovement, type FeedMovementInput } from '../worker/feed';
import { canonicalize, createOperationClaim, operationInsertStatement, sha256Hex } from '../worker/events';

const runtime = new Miniflare({ workers: [{ config: { name: 'feed-valuation-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'feed-valuation' } } } }] });

describe('Valorización del alimento desde el almacén', () => {
  let db: D1Database;
  let actorId: number;
  const base = { warehouseId: 1, effectiveDate: '2026-11-08', feedCode: 'preinicio', reason: 'Prueba de valorización' };
  const record = (input: FeedMovementInput, connection = db) => registerFeedMovement(connection, actorId, { ...base, ...input });
  const purchase = (lotCode: string, quantityKg: number, costPerKg: number, effectiveDate = base.effectiveDate) => record({ movementType: 'purchase', lotCode, quantityKg, costPerKg, supplier: 'Proveedor de prueba', effectiveDate });
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
    const response = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'valuation@granja.pe', password: 'ValuationTest2026!', name: 'Prueba almacén' }) }), { DB: db });
    expect(response.status).toBe(201);
    actorId = Number((await db.prepare('SELECT id FROM users WHERE username=?').bind('valuation@granja.pe').first<{ id: number }>())!.id);
  });
  afterAll(async () => runtime.dispose());

  it('deriva el consumo del lote aunque el cliente envíe costo cero', async () => {
    await purchase('COSTO-REAL', 100, 3);
    const result = await record({ movementType: 'delivery', lotCode: 'COSTO-REAL', quantityKg: 10, costPerKg: 0, destinationBarnId: 1, operationKey: 'valor-consumo-1' });
    expect(result.movement).toMatchObject({ costPerKg: 3, totalCost: 30 });
    expect(await db.prepare("SELECT unit_cost_minor,total_cost_minor FROM feed_movements WHERE lot_code='COSTO-REAL' AND movement_type='delivery'").first()).toMatchObject({ unit_cost_minor: 300, total_cost_minor: 3000 });
    expect((await record({ movementType: 'delivery', lotCode: 'COSTO-REAL', quantityKg: 10, costPerKg: 999, destinationBarnId: 1, operationKey: 'valor-consumo-1' })).replayed).toBe(true);
  });

  it('pondera entradas con el saldo y aplica ese valor a mermas y reintegros', async () => {
    await purchase('PROMEDIO', 100, 3);
    await record({ movementType: 'delivery', lotCode: 'PROMEDIO', quantityKg: 10, costPerKg: 0, destinationBarnId: 1 });
    await purchase('PROMEDIO', 90, 5);
    const waste = await record({ movementType: 'waste', lotCode: 'PROMEDIO', quantityKg: 10, costPerKg: 0 });
    expect(waste.movement).toMatchObject({ costPerKg: 4, totalCost: 40 });
    const returned = await record({ movementType: 'return_in', lotCode: 'PROMEDIO', quantityKg: 10, costPerKg: 999 });
    expect(returned.movement).toMatchObject({ costPerKg: 4, totalCost: 40 });
    const consumed = await record({ movementType: 'delivery', lotCode: 'PROMEDIO', quantityKg: 5, destinationBarnId: 1 });
    expect(consumed.movement).toMatchObject({ costPerKg: 4, totalCost: 20 });
  });

  it('reconoce reintentos con el contenido firmado antes de derivar costos', async () => {
    await purchase('REINTENTO-ANTERIOR', 100, 3);
    const input = { movementType: 'delivery', lotCode: 'REINTENTO-ANTERIOR', quantityKg: 10, costPerKg: 3, destinationBarnId: 1, operationKey: 'valor-reintento-anterior' };
    await record(input);
    const operation = await db.prepare('SELECT id,payload FROM operation_log WHERE operation_key=?').bind(input.operationKey).first<{ id: string; payload: string }>();
    const legacyPayload: Record<string, unknown> = { ...JSON.parse(operation!.payload), costPerKg: 3 };
    await db.prepare('UPDATE operation_log SET payload=?,content_hash=? WHERE id=?').bind(canonicalize(legacyPayload), await sha256Hex(canonicalize(legacyPayload)), operation!.id).run();
    expect((await record(input)).replayed).toBe(true);
    await expect(record({ ...input, quantityKg: 11 })).rejects.toMatchObject({ status: 409 });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM feed_movements WHERE lot_code='REINTENTO-ANTERIOR' AND movement_type='delivery'").first()).toMatchObject({ count: 1 });
  });

  it('mantiene el valor del lote agotado al recibir una devolución', async () => {
    await purchase('AGOTADO-VALOR', 10, 3);
    await record({ movementType: 'delivery', lotCode: 'AGOTADO-VALOR', quantityKg: 10, costPerKg: 0, destinationBarnId: 1 });
    expect((await record({ movementType: 'return_in', lotCode: 'AGOTADO-VALOR', quantityKg: 2 })).movement).toMatchObject({ costPerKg: 3, totalCost: 6 });
    await expect(record({ movementType: 'return_in', lotCode: 'SIN-ORIGEN', quantityKg: 2, costPerKg: 0 })).rejects.toMatchObject({ status: 409 });
  });

  it('conserva el importe original de una compra devuelta sin aceptar otro costo', async () => {
    const bought = await purchase('DEVUELTO-VALOR', 10, 3);
    const original = bought.movement as { id: number };
    expect((await record({ movementType: 'return_supplier', lotCode: 'DEVUELTO-VALOR', quantityKg: 10, costPerKg: 0, reversesMovementId: original.id })).movement).toMatchObject({ costPerKg: 3, totalCost: 30 });
    expect(await db.prepare("SELECT amount_minor FROM financial_entries WHERE source_type='reversal' AND reversal_of_id=(SELECT id FROM financial_entries WHERE source_type='feed_purchase' AND source_id=?)").bind(String(original.id)).first()).toMatchObject({ amount_minor: 3000 });
  });

  it('conserva la entrada valorizada de un reintegro registrado antes de este cambio', async () => {
    const claim = await createOperationClaim({ authorUserId: actorId, operationType: 'feed.return_in', entityType: 'feed_movement', entityId: 1700000000000001, effectiveDate: base.effectiveDate, payload: { ...base, movementType: 'return_in', lotCode: 'REINTEGRO-ANTERIOR', quantityKg: 10, costPerKg: 3 }, result: {} });
    await db.batch([operationInsertStatement(db, claim), db.prepare("INSERT INTO feed_movements(id,operation_log_id,warehouse_id,movement_type,effective_date,feed_code,lot_code,quantity_kg,stock_delta_kg,unit_cost_minor,total_cost_minor,reason,created_by_user_id,created_at) VALUES(1700000000000001,?,1,'return_in',?,'preinicio','REINTEGRO-ANTERIOR',10,10,300,3000,'Reintegro anterior',?,?)").bind(claim.id, base.effectiveDate, actorId, claim.recordedAt)]);
    expect((await record({ movementType: 'delivery', lotCode: 'REINTEGRO-ANTERIOR', quantityKg: 2, costPerKg: 0, destinationBarnId: 1 })).movement).toMatchObject({ costPerKg: 3, totalCost: 6 });
  });

  it('rechaza entradas retroactivas que cambiarían el valor de consumos ya registrados', async () => {
    await purchase('RETRO-VALOR', 100, 3, '2026-11-06');
    await record({ movementType: 'delivery', lotCode: 'RETRO-VALOR', quantityKg: 10, costPerKg: 3, destinationBarnId: 1 });
    await expect(purchase('RETRO-VALOR', 100, 5, '2026-11-07')).rejects.toMatchObject({ status: 409 });
    expect(await db.prepare("SELECT COUNT(*) AS count,SUM(stock_delta_kg) AS stock FROM feed_movements WHERE lot_code='RETRO-VALOR'").first()).toMatchObject({ count: 2, stock: 90 });
  });

  it('rechaza una valorización leída antes de otra escritura concurrente y permite reintentar', async () => {
    await purchase('CONCURRENTE-VALOR', 100, 3);
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const scheduled = new Proxy(db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => { if (++arrivals === 2) release(); await barrier; return target.batch(statements); };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const inputs: FeedMovementInput[] = [
      { movementType: 'delivery', lotCode: 'CONCURRENTE-VALOR', quantityKg: 10, costPerKg: 0, destinationBarnId: 1, operationKey: 'valor-concurrente-salida' },
      { movementType: 'purchase', lotCode: 'CONCURRENTE-VALOR', quantityKg: 100, costPerKg: 5, supplier: 'Proveedor', operationKey: 'valor-concurrente-entrada' },
    ];
    const results = await Promise.allSettled(inputs.map(input => record(input, scheduled)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failedIndex = results.findIndex(result => result.status === 'rejected');
    expect(results[failedIndex]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    await record(inputs[failedIndex]);
    const rows = (await db.prepare("SELECT movement_type,total_cost_minor,stock_delta_kg FROM feed_movements WHERE lot_code='CONCURRENTE-VALOR' ORDER BY effective_date,id").all<{ movement_type: string; total_cost_minor: number; stock_delta_kg: number }>()).results!;
    const delivery = rows.find(row => row.movement_type === 'delivery')!;
    expect(delivery.total_cost_minor).toBe(rows[1].movement_type === 'purchase' ? 4000 : 3000);
    expect(rows.reduce((sum, row) => sum + row.stock_delta_kg, 0)).toBe(190);
  });

  it('devuelve el mismo movimiento al repetir simultáneamente la misma clave', async () => {
    await purchase('MISMA-CLAVE', 100, 3);
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const scheduled = new Proxy(db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => { if (++arrivals === 2) release(); await barrier; return target.batch(statements); };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const input = { movementType: 'delivery', lotCode: 'MISMA-CLAVE', quantityKg: 10, costPerKg: 0, destinationBarnId: 1, operationKey: 'valor-misma-clave' };
    const results = await Promise.all([record(input, scheduled), record(input, scheduled)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect((results[0].movement as { id: number }).id).toBe((results[1].movement as { id: number }).id);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM feed_movements WHERE lot_code='MISMA-CLAVE' AND movement_type='delivery'").first()).toMatchObject({ count: 1 });
  });
});

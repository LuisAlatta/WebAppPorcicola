import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{
  config: { name: 'cierre3-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'cierre3-db' } } },
}] });
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

type Balance = { barnId: number; heads: number; identified: number; unidentified: number };
type Snapshot = { balances: Balance[]; summary: { total: { available: number } } };

describe('Cierre 3 · conciliación histórica de identificados y grupos', () => {
  it('reconstruye dos cortes, concilia galpones y serializa dos retiros con reintento', async () => {
    const db = await runtime.getD1Database('DB');
    await migrate(db);
    const request = (path: string, body?: Record<string, unknown>, token?: string) => worker.fetch(new Request(`http://localhost${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), { DB: db });
    const initial = await request('/api/auth/bootstrap', { username: 'cierre3@granja.test', password: 'PruebaCierre3Segura!', name: 'Administrador Cierre 3' });
    expect(initial.status).toBe(201);
    const admin = (await initial.json() as { token: string }).token;
    const operator = await request('/api/admin/users', { username: 'operario-c3@granja.test', name: 'Operario Cierre 3', role: 'operario', password: 'PruebaOperarioCierre3!', barnIds: [1] }, admin);
    expect(operator.status, await operator.clone().text()).toBe(201);
    const login = await request('/api/auth/login', { username: 'operario-c3@granja.test', password: 'PruebaOperarioCierre3!' });
    expect(login.status).toBe(200);
    const operatorToken = (await login.json() as { token: string }).token;
    const group = (barnId: number, locationCode: string, quantity: number, operationKey: string) => ({ movementType: 'initial', effectiveDate: '2026-01-10', barnId, locationCode, lotCode: null, stageCode: 'preinicio', sex: 'hembra', quantity, reason: 'Saldo ficticio del cierre', operationKey });
    const groupA = group(1, 'galpon_a', 10, 'c3-seed-a');
    const createdA = await request('/api/inventory/movements', groupA, admin);
    expect(createdA.status, await createdA.clone().text()).toBe(201);
    expect((await request('/api/inventory/movements', groupA, admin)).status).toBe(200);
    const createdB = await request('/api/inventory/movements', group(2, 'galpon_b', 4, 'c3-seed-b'), admin);
    expect(createdB.status, await createdB.clone().text()).toBe(201);
    for (const [code, barnId, locationCode] of [['C3-A1', 1, 'galpon_a'], ['C3-A2', 1, 'galpon_a'], ['C3-B1', 2, 'galpon_b']] as const) {
      const result = await request('/api/animals', { code, animalType: 'lechon', sex: 'hembra', entryDate: '2026-01-12', entryStageCode: 'preinicio', barnId, locationCode, originType: 'interna', reason: 'Identificación del grupo', operationKey: `c3-${code}` }, admin);
      expect(result.status, await result.clone().text()).toBe(201);
    }
    const readCut = async (date: string) => {
      const response = await request(`/api/inventory?asOf=${date}`, undefined, admin);
      expect(response.status, await response.clone().text()).toBe(200);
      const snapshot = await response.json() as Snapshot;
      const totals = (barnId: number) => snapshot.balances.filter(row => row.barnId === barnId).reduce((result, row) => ({ heads: result.heads + row.heads, identified: result.identified + row.identified, unidentified: result.unidentified + row.unidentified }), { heads: 0, identified: 0, unidentified: 0 });
      for (const barnId of [1, 2]) { const value = totals(barnId); expect(value.identified + value.unidentified).toBe(value.heads); }
      expect(totals(1).heads + totals(2).heads).toBe(snapshot.summary.total.available);
      return { a: totals(1), b: totals(2), total: snapshot.summary.total.available };
    };
    expect(await readCut('2026-01-15')).toEqual({ a: { heads: 10, identified: 2, unidentified: 8 }, b: { heads: 4, identified: 1, unidentified: 3 }, total: 14 });
    const exits = await Promise.all([admin, operatorToken].map((token, index) => request('/api/inventory/movements', { ...groupA, movementType: 'sale', effectiveDate: '2026-01-20', quantity: 7, reason: 'Venta concurrente de prueba', operationKey: `c3-sale-${index}` }, token)));
    expect(exits.map(response => response.status).sort()).toEqual([201, 409]);
    const purchase = await request('/api/inventory/movements', { ...group(2, 'galpon_b', 2, 'c3-purchase-b'), movementType: 'purchase', effectiveDate: '2026-01-20' }, admin);
    expect(purchase.status, await purchase.clone().text()).toBe(201);
    expect(await readCut('2026-01-21')).toEqual({ a: { heads: 3, identified: 2, unidentified: 1 }, b: { heads: 6, identified: 1, unidentified: 5 }, total: 9 });
    expect(await readCut('2026-01-15')).toEqual({ a: { heads: 10, identified: 2, unidentified: 8 }, b: { heads: 4, identified: 1, unidentified: 3 }, total: 14 });
  }, 60000);
});

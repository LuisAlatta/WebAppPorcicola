import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';
import { previewCustomReport, reportDashboard } from '../worker/reports';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'inventory-active-animals-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'inventory-active-animals-db' } },
    },
  }],
});

interface InventoryBalance {
  barnId: number;
  stageCode: string;
  sex: string;
  heads: number;
  identified: number;
  unidentified: number;
}

interface StageSummary {
  stageCode: string;
  initial: number;
  entriesExternal: number;
  entries: number;
  exits: number;
  deaths: number;
  available: number;
}

interface InventoryResponse {
  balances: InventoryBalance[];
  summary: { byStage: StageSummary[]; total: StageSummary };
  movements: { id: number; notes: string | null; stageCode: string; barnId: number }[];
  capacityWarnings: { barnId: number; heads: number }[];
}

describe('Inventario solo con animales activos en los galpones', () => {
  let db: D1Database;
  let token = '';
  const today = currentFarmDate();

  const api = (path: string, body?: Record<string, unknown>, barns?: string) => worker.fetch(new Request(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(barns ? { 'X-Barn-Ids': barns } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: db });

  const createAnimal = (overrides: Record<string, unknown>) => api('/api/animals', {
    animalType: 'cerda',
    sex: 'hembra',
    entryDate: today,
    entryStageCode: 'gestacion',
    barnId: 1,
    originType: 'inicial',
    reason: 'Registro de prueba',
    operationKey: crypto.randomUUID(),
    ...overrides,
  });

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
      let trigger = '';
      for (const part of sql.split(';').map(p => p.trim()).filter(Boolean)) {
        if (trigger || /^CREATE TRIGGER/i.test(part)) {
          trigger += `${part}; `;
          if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
        } else {
          await db.prepare(part).run();
        }
      }
      if (trigger) throw new Error(`Trigger incompleto: ${file}`);
    }
    const boot = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'inv-active@granja.test', password: 'PasswordFicticio2026!', name: 'Admin inventario' }),
    }), { DB: db });
    expect(boot.status, await boot.clone().text()).toBe(201);
    token = (await boot.json() as { token: string }).token;
    await db.prepare('UPDATE barns SET capacity = 2 WHERE id = 1').run();
  }, 90000);

  afterAll(async () => runtime.dispose());

  it('excluye fichas eliminadas o archivadas del saldo, resumen, kardex, alertas de capacidad y reportes', async () => {
    // 1. Creamos dos fichas en Galpón A que luego se eliminan por error (incluye reutilización de código 001).
    expect((await createAnimal({ code: '001', entryStageCode: 'gestacion', originType: 'inicial', barnId: 1 })).status).toBe(201);
    expect((await createAnimal({ code: 'ERR-PRE', animalType: 'lechon', entryStageCode: 'preinicio', originType: 'nacimiento', barnId: 1 })).status).toBe(201);
    expect((await api('/api/animals/001/deactivate', { reason: 'Error' }, '1')).status).toBe(200);
    expect((await api('/api/animals/ERR-PRE/deactivate', { reason: 'Error' }, '1')).status).toBe(200);

    // 2. Creamos los animales realmente activos en Galpón A (2) y Galpón B (1).
    expect((await createAnimal({ code: '001', animalType: 'verraco', sex: 'macho', entryStageCode: 'reproductor', originType: 'inicial', barnId: 1 })).status).toBe(201);
    expect((await createAnimal({ code: '002', entryStageCode: 'gestacion', originType: 'nacimiento', barnId: 1 })).status).toBe(201);
    expect((await createAnimal({ code: '001', entryStageCode: 'gestacion', originType: 'inicial', barnId: 2 })).status).toBe(201);

    // Galpón A tiene capacidad 2 y solo 2 activos (las 2 eliminadas no deben disparar sobre capacidad ni sumar cabezas).
    const snapA = await (await api(`/api/inventory?asOf=${today}`, undefined, '1')).json() as InventoryResponse;
    expect(snapA.summary.total.available).toBe(2);
    expect(snapA.summary.total.entries).toBe(2);
    expect(snapA.summary.total.initial).toBe(1);
    expect(snapA.summary.total.entriesExternal).toBe(1);
    expect(snapA.capacityWarnings).toEqual([]);
    expect(snapA.balances).toHaveLength(2);
    expect(snapA.balances.every(b => b.identified === b.heads && b.unidentified === 0)).toBe(true);
    expect(snapA.summary.byStage.find(s => s.stageCode === 'preinicio')).toMatchObject({ available: 0, entries: 0 });
    expect(snapA.movements).toHaveLength(2);
    expect(snapA.movements.map(m => m.notes).sort()).toEqual(['Alta individual 001', 'Alta individual 002']);

    // Kardex directo también excluye las eliminadas.
    const movsA = await (await api(`/api/inventory/movements?to=${today}`, undefined, '1')).json() as { movements: { notes: string | null }[] };
    expect(movsA.movements).toHaveLength(2);
    expect(movsA.movements.some(m => m.notes?.includes('ERR-PRE'))).toBe(false);

    // Total de ambos galpones: 3 activos, no 5.
    const snapAll = await (await api(`/api/inventory?asOf=${today}`)).json() as InventoryResponse;
    expect(snapAll.summary.total.available).toBe(3);
    expect(snapAll.summary.total.entries).toBe(3);
    expect(snapAll.movements).toHaveLength(3);

    // Dashboard y reportes personalizados coinciden con los activos.
    const dashboard = await reportDashboard(db, null, null, {});
    expect(dashboard).toMatchObject({ totalAnimals: 3, identifiedAnimals: 3, unidentifiedAnimals: 0 });
    const invReport = await previewCustomReport(db, { source: 'inventory', name: 'Inv', purpose: 'Test', columns: ['barn', 'stage', 'heads'] }, 'administrador', {});
    expect(invReport.totals.sum).toBe(3);
    const movReport = await previewCustomReport(db, { source: 'movements', name: 'Mov', purpose: 'Test', columns: ['barn', 'heads'] }, 'administrador', {});
    expect(movReport.rowCount).toBe(3);

    // Reactivar ERR-PRE vuelve a mostrarla en inventario; volver a desactivarla la oculta de nuevo.
    expect((await api('/api/animals/ERR-PRE/reactivate', { reason: 'Reactivar prueba' }, '1')).status).toBe(200);
    const afterReactivate = await (await api(`/api/inventory?asOf=${today}`, undefined, '1')).json() as InventoryResponse;
    expect(afterReactivate.summary.total.available).toBe(3);
    expect(afterReactivate.capacityWarnings).toHaveLength(1);

    expect((await api('/api/animals/ERR-PRE/deactivate', { reason: 'Retirar de nuevo' }, '1')).status).toBe(200);
    const afterSecondDeactivate = await (await api(`/api/inventory?asOf=${today}`, undefined, '1')).json() as InventoryResponse;
    expect(afterSecondDeactivate.summary.total.available).toBe(2);
    expect(afterSecondDeactivate.capacityWarnings).toEqual([]);
  }, 90000);

  it('conserva la reconstrucción histórica y mortalidad cuando la salida es física (muerte o venta)', async () => {
    const pastEntry = '2026-01-10';
    const pastDeath = '2026-01-20';
    const created = await createAnimal({
      code: 'MORT-01',
      entryDate: pastEntry,
      entryStageCode: 'engorde',
      originType: 'compra',
      barnId: 2,
      purchaseAmount: '250.00',
      currencyCode: 'PEN',
    });
    expect(created.status, await created.clone().text()).toBe(201);

    const exitRes = await api('/api/animals/MORT-01/exit', {
      exitType: 'death',
      effectiveDate: pastDeath,
      causeCode: 'enfermedad',
      reason: 'Muerte real para verificar historial',
      operationKey: crypto.randomUUID(),
    }, '2');
    expect(exitRes.status, await exitRes.clone().text()).toBe(201);

    const beforeDeath = await (await api(`/api/inventory?asOf=2026-01-15`, undefined, '2')).json() as InventoryResponse;
    expect(beforeDeath.balances.find(b => b.stageCode === 'engorde')).toMatchObject({ heads: 1, identified: 1, unidentified: 0 });

    const afterDeath = await (await api(`/api/inventory?asOf=2026-01-25`, undefined, '2')).json() as InventoryResponse;
    expect(afterDeath.balances.find(b => b.stageCode === 'engorde')).toBeUndefined();
    expect(afterDeath.summary.byStage.find(s => s.stageCode === 'engorde')).toMatchObject({
      entries: 1,
      exits: 1,
      deaths: 1,
      available: 0,
    });
  }, 90000);
});

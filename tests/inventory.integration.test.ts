import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-inventory-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'inventory-database' } },
    },
  }],
});

interface Balance {
  barnId: number;
  barnName: string;
  locationCode: string | null;
  lotCode: string | null;
  stageCode: string;
  sex: string;
  heads: number;
  identified: number;
  unidentified: number;
}

interface StageSummary {
  stageCode: string;
  entries: number;
  entriesExternal: number;
  initial: number;
  exits: number;
  deaths: number;
  available: number;
  mortalityPct: number | null;
  mortalityDenominator: number;
}

interface Snapshot {
  asOf: string;
  balances: Balance[];
  summary: {
    byStage: StageSummary[];
    total: StageSummary;
  };
  movements: { id: number; movementType: string; quantity: number }[];
  options: { stages: { code: string }[]; deathCauses: { code: string }[]; saleCauses: { code: string }[] };
}

describe('Inventario individual y colectivo · T08 (INV-01..INV-03)', () => {
  let db: D1Database;
  let adminToken: string;
  let operarioToken: string;
  let veterinarioToken: string;
  let adminId: number;

  const api = async (path: string, init: RequestInit = {}, token = adminToken) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), { DB: db });
  };

  const snapshot = async (asOf: string, token = adminToken): Promise<Snapshot> => {
    const res = await api(`/api/inventory?asOf=${asOf}`, {}, token);
    expect(res.status).toBe(200);
    return res.json() as Promise<Snapshot>;
  };

  const movement = (overrides: Record<string, unknown> = {}) => ({
    movementType: 'initial',
    effectiveDate: '2026-01-10',
    barnId: 1,
    locationCode: 'galpon_a',
    lotCode: 'lote_levante_a',
    stageCode: 'levante',
    sex: 'macho',
    quantity: 7,
    reason: 'Carga inicial del inventario',
    operationKey: `inv-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  });

  const register = (overrides: Record<string, unknown> = {}, token = adminToken) =>
    api('/api/inventory/movements', {
      method: 'POST',
      body: JSON.stringify(movement(overrides)),
    }, token);

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');

    const migrationFiles = [
      '0001_initial_schema.sql',
      '0002_administration_schema.sql',
      '0003_events_audit_schema.sql',
      '0004_farm_config_schema.sql',
      '0005_inventory_schema.sql',
      '0006_animals_schema.sql',
      '0007_transfer_and_stock_guard.sql',
      '0008_animal_location_history.sql',
    ];

    for (const file of migrationFiles) {
      const schemaSql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      const statements = schemaSql
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('--'))
        .join(' ')
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      for (const statement of statements) {
        await db.exec(statement + ';');
      }
    }

    const initRes = await worker.fetch(
      new Request('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin.inventario@granja.pe',
          password: 'PasswordInventario2026!',
          name: 'Administrador de Inventario',
        }),
      }),
      { DB: db },
    );
    const initData = await initRes.json() as { token: string; user: { id: number } };
    adminToken = initData.token;
    adminId = initData.user.id;

    const operarioRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'operario.inventario@granja.pe',
        name: 'Operario de Inventario',
        role: 'operario',
        password: 'ClaveOperarioInv1!',
        barnIds: [1],
      }),
    });
    expect(operarioRes.status).toBe(201);

    const vetRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'veterinario.inventario@granja.pe',
        name: 'Veterinario de Inventario',
        role: 'veterinario',
        password: 'ClaveVeterinario1!',
        barnIds: [1, 2],
      }),
    });
    expect(vetRes.status).toBe(201);

    const login = async (username: string, password: string) => {
      const res = await worker.fetch(new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }), { DB: db });
      const data = await res.json() as { token: string };
      expect(res.status).toBe(200);
      return data.token;
    };

    operarioToken = await login('operario.inventario@granja.pe', 'ClaveOperarioInv1!');
    veterinarioToken = await login('veterinario.inventario@granja.pe', 'ClaveVeterinario1!');
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('inicia vacío y expone las opciones vigentes de configuración', async () => {
    const initial = await snapshot('2026-01-01');
    expect(initial.balances).toHaveLength(0);
    expect(initial.summary.total.available).toBe(0);
    expect(initial.options.stages.some((stage) => stage.code === 'preinicio')).toBe(true);
    expect(initial.options.deathCauses.some((cause) => cause.code === 'enfermedad')).toBe(true);
    expect(initial.options.saleCauses.some((cause) => cause.code === 'baja_produccion')).toBe(true);
  });

  it('carga saldo inicial y registra entradas y salidas en fechas distintas', async () => {
    const initialMachos = await register({ sex: 'macho', quantity: 7 });
    expect(initialMachos.status).toBe(201);
    const initialHembras = await register({ sex: 'hembra', quantity: 5, operationKey: 'inv-inicial-hembras' });
    expect(initialHembras.status).toBe(201);

    const compra = await register({
      movementType: 'purchase',
      effectiveDate: '2026-02-01',
      barnId: 2,
      locationCode: 'galpon_b',
      lotCode: 'lote_engorde_a',
      stageCode: 'engorde',
      sex: 'macho',
      quantity: 10,
      reason: 'Compra de lechones para inicio',
    });
    expect(compra.status).toBe(201);

    const nacimiento = await register({
      movementType: 'birth',
      effectiveDate: '2026-02-05',
      stageCode: 'preinicio',
      lotCode: null,
      sex: 'pendiente',
      quantity: 4,
      reason: 'Nacimiento de camada pendiente de sexado',
    });
    expect(nacimiento.status).toBe(201);

    const venta = await register({
      movementType: 'sale',
      effectiveDate: '2026-02-10',
      sex: 'macho',
      quantity: 2,
      causeCode: 'baja_produccion',
      reason: 'Venta de dos machos del lote A',
    });
    expect(venta.status).toBe(201);

    const muerte = await register({
      movementType: 'death',
      effectiveDate: '2026-02-11',
      sex: 'hembra',
      quantity: 1,
      causeCode: 'enfermedad',
      reason: 'Muerte por enfermedad respiratoria',
    });
    expect(muerte.status).toBe(201);

    const corteEnero = await snapshot('2026-01-31');
    expect(corteEnero.summary.total.available).toBe(12);

    const corte = await snapshot('2026-02-15');
    const galponA = corte.balances.filter((balance) => balance.barnName === 'Galpón A');
    expect(galponA.find((balance) => balance.sex === 'macho')?.heads).toBe(5);
    expect(galponA.find((balance) => balance.sex === 'hembra')?.heads).toBe(4);
    expect(galponA.find((balance) => balance.sex === 'pendiente')?.heads).toBe(4);
    expect(galponA.every((balance) => balance.identified === 0 && balance.unidentified === balance.heads)).toBe(true);

    const galponB = corte.balances.filter((balance) => balance.barnName === 'Galpón B');
    expect(galponB).toHaveLength(1);
    expect(galponB[0].heads).toBe(10);

    expect(corte.summary.total.available).toBe(23);
    expect(corte.summary.total.entries).toBe(26);
    expect(corte.summary.total.entriesExternal).toBe(14);
    expect(corte.summary.total.initial).toBe(12);
    expect(corte.summary.total.exits).toBe(3);
    expect(corte.summary.total.deaths).toBe(1);
    expect(corte.summary.total.mortalityDenominator).toBe(26);
    expect(corte.summary.total.mortalityPct).toBe(3.8);

    const levante = corte.summary.byStage.find((stage) => stage.stageCode === 'levante');
    expect(levante?.entries).toBe(12);
    expect(levante?.exits).toBe(3);
    expect(levante?.deaths).toBe(1);
    expect(levante?.available).toBe(9);
    expect(levante?.mortalityPct).toBe(8.3);

    const preinicio = corte.summary.byStage.find((stage) => stage.stageCode === 'preinicio');
    expect(preinicio?.entries).toBe(4);
    expect(preinicio?.available).toBe(4);
    expect(preinicio?.mortalityPct).toBe(0);

    const engorde = corte.summary.byStage.find((stage) => stage.stageCode === 'engorde');
    expect(engorde?.available).toBe(10);

    // El detalle reconstruye cada total del tablero.
    const detalleTotal = corte.balances.reduce((sum, balance) => sum + balance.heads, 0);
    expect(detalleTotal).toBe(corte.summary.total.available);
    expect(corte.movements).toHaveLength(6);
  });

  it('reintenta con la misma clave sin duplicar y rechaza contenido distinto', async () => {
    const payload = movement({ effectiveDate: '2026-03-01', quantity: 3, operationKey: 'inv-reintento-1' });
    const first = await api('/api/inventory/movements', { method: 'POST', body: JSON.stringify(payload) });
    expect(first.status).toBe(201);

    const second = await api('/api/inventory/movements', { method: 'POST', body: JSON.stringify(payload) });
    expect(second.status).toBe(200);
    const secondBody = await second.json() as { replayed: boolean; movement: { id: number } };
    expect(secondBody.replayed).toBe(true);

    const count = await db.prepare('SELECT COUNT(*) AS total FROM inventory_movements').first<{ total: number }>();
    expect(Number(count?.total)).toBe(7);

    const conflicting = await api('/api/inventory/movements', {
      method: 'POST',
      body: JSON.stringify({ ...payload, quantity: 4 }),
    });
    expect(conflicting.status).toBe(409);
    const still = await db.prepare('SELECT COUNT(*) AS total FROM inventory_movements').first<{ total: number }>();
    expect(Number(still?.total)).toBe(7);
  });

  it('impide saldos negativos, incluso en correcciones retroactivas', async () => {
    const excesiva = await register({
      movementType: 'sale',
      effectiveDate: '2026-02-12',
      sex: 'macho',
      quantity: 100,
      reason: 'Intento de salida mayor al saldo disponible',
    });
    expect(excesiva.status).toBe(409);

    const retroactiva = await register({
      movementType: 'sale',
      effectiveDate: '2026-01-12',
      sex: 'macho',
      quantity: 4,
      reason: 'Salida retroactiva válida para dejar un macho',
    });
    expect(retroactiva.status).toBe(201);

    const incompatible = await register({
      movementType: 'sale',
      effectiveDate: '2026-01-13',
      sex: 'macho',
      quantity: 2,
      reason: 'Corrección retroactiva que dejaría saldo negativo',
    });
    expect(incompatible.status).toBe(409);
    const body = await incompatible.json() as { error: string };
    expect(body.error).toContain('Corrección incompatible con');
  });

  it('cancela los traslados internos en el total de la granja', async () => {
    const before = await snapshot('2026-03-31');

    await db.batch([
      db.prepare(`
        INSERT INTO inventory_movements
          (movement_type, effective_date, barn_id, location_code, lot_code, stage_code, sex, quantity,
           transfer_group_id, created_by_user_id, created_at)
        VALUES ('transfer_out', '2026-03-15', 1, 'galpon_a', 'lote_levante_a', 'levante', 'macho', 3,
                'traslado-prueba-1', ?, '2026-03-15T12:00:00.000Z')
      `).bind(adminId),
      db.prepare(`
        INSERT INTO inventory_movements
          (movement_type, effective_date, barn_id, location_code, lot_code, stage_code, sex, quantity,
           transfer_group_id, created_by_user_id, created_at)
        VALUES ('transfer_in', '2026-03-15', 2, 'galpon_b', 'lote_levante_a', 'levante', 'macho', 3,
                'traslado-prueba-1', ?, '2026-03-15T12:00:00.000Z')
      `).bind(adminId),
    ]);

    const after = await snapshot('2026-03-31');
    expect(after.summary.total.available).toBe(before.summary.total.available);
    const a = after.balances.find((balance) => balance.barnName === 'Galpón A' && balance.sex === 'macho');
    const b = after.balances.find((balance) => balance.barnName === 'Galpón B' && balance.stageCode === 'levante');
    expect((a?.heads ?? 0) + (b?.heads ?? 0)).toBe(
      (before.balances.find((balance) => balance.barnName === 'Galpón A' && balance.sex === 'macho')?.heads ?? 0)
      + (before.balances.find((balance) => balance.barnName === 'Galpón B' && balance.stageCode === 'levante')?.heads ?? 0),
    );
  });

  it('valida causas, etapas y tipos de movimiento', async () => {
    const sinCausa = await register({
      movementType: 'death',
      effectiveDate: '2026-04-01',
      quantity: 1,
      reason: 'Muerte sin causa indicada',
    });
    expect(sinCausa.status).toBe(400);

    const etapaInvalida = await register({
      movementType: 'purchase',
      effectiveDate: '2026-04-01',
      stageCode: 'inexistente',
      quantity: 1,
      reason: 'Compra con etapa inexistente',
    });
    expect(etapaInvalida.status).toBe(400);

    const trasladoDirecto = await register({
      movementType: 'transfer_in',
      effectiveDate: '2026-04-01',
      quantity: 1,
      reason: 'Traslado registrado fuera del módulo de traslados',
    });
    expect(trasladoDirecto.status).toBe(400);

    const futura = await register({
      movementType: 'purchase',
      effectiveDate: '2027-01-01',
      quantity: 1,
      reason: 'Compra con fecha futura',
    });
    expect(futura.status).toBe(400);
  });

  it('aplica permisos por perfil y por galpón', async () => {
    const lecturas = await api('/api/inventory?asOf=2026-02-15', {}, veterinarioToken);
    expect(lecturas.status).toBe(200);

    const vetWrite = await register({ quantity: 1, reason: 'Intento de escritura del veterinario' }, veterinarioToken);
    expect(vetWrite.status).toBe(403);

    const operarioA = await register({
      movementType: 'purchase',
      effectiveDate: '2026-04-02',
      barnId: 1,
      quantity: 1,
      reason: 'Compra registrada por operario en su galpón',
    }, operarioToken);
    expect(operarioA.status).toBe(201);

    const operarioB = await register({
      movementType: 'purchase',
      effectiveDate: '2026-04-02',
      barnId: 2,
      quantity: 1,
      reason: 'Compra intentada en un galpón no asignado',
    }, operarioToken);
    expect(operarioB.status).toBe(403);

    const alcanceOperario = await snapshot('2026-04-02', operarioToken);
    expect(alcanceOperario.balances.every((balance) => balance.barnName === 'Galpón A')).toBe(true);
  });

  it('consulta movimientos por tipo y fecha', async () => {
    const res = await api('/api/inventory/movements?type=death&from=2026-01-01&to=2026-12-31');
    expect(res.status).toBe(200);
    const body = await res.json() as { movements: { movementType: string }[] };
    expect(body.movements).toHaveLength(1);
    expect(body.movements[0].movementType).toBe('death');
  });

  it('traslada cabezas en una sola operación y exige acceso a ambos galpones', async () => {
    const seeded = await register({ movementType: 'initial', barnId: 1, locationCode: null, lotCode: null, effectiveDate: '2026-05-01', quantity: 12, operationKey: 't10-source' });
    expect(seeded.status).toBe(201);
    const destinationSeeded = await register({ movementType: 'initial', barnId: 2, locationCode: 'galpon_b', lotCode: null, effectiveDate: '2026-05-01', quantity: 8, operationKey: 't10-destination' });
    expect(destinationSeeded.status).toBe(201);
    const body = {
      effectiveDate: '2026-05-02', sourceBarnId: 1, destinationBarnId: 2,
      sourceLocationCode: null, sourceLotCode: null, destinationLocationCode: 'galpon_b', destinationLotCode: null, stageCode: 'levante', sex: 'macho', quantity: 5,
      reason: 'Traslado de prueba', operationKey: 't10-transfer',
    };
    const denied = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify(body) }, operarioToken);
    expect(denied.status).toBe(403);
    const transferred = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify(body) });
    expect(transferred.status).toBe(201);
    const replay = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify(body) });
    expect(replay.status).toBe(200);
    const legs = await db.prepare("SELECT movement_type, COUNT(*) AS n FROM inventory_movements WHERE transfer_group_id = (SELECT transfer_group_id FROM inventory_movements WHERE operation_log_id = (SELECT id FROM operation_log WHERE operation_key = 't10-transfer') LIMIT 1) GROUP BY movement_type").all<{ movement_type: string; n: number }>();
    expect(legs.results).toHaveLength(2);
    expect(legs.results?.map((row) => row.movement_type).sort()).toEqual(['transfer_in', 'transfer_out']);
    const stock = await snapshot('2026-05-02');
    expect(stock.balances.find((row) => row.barnId === 1 && row.locationCode === null && row.lotCode === null && row.stageCode === 'levante' && row.sex === 'macho')?.heads).toBe(7);
    expect(stock.balances.find((row) => row.barnId === 2 && row.locationCode === 'galpon_b' && row.lotCode === null && row.stageCode === 'levante' && row.sex === 'macho')?.heads).toBe(13);
  });

  it('permite trasladar un grupo entre ubicaciones del mismo galpón sin alterar su total', async () => {
    const seeded = await register({ movementType: 'initial', barnId: 1, locationCode: null, lotCode: null, effectiveDate: '2026-05-03', quantity: 3, operationKey: 'same-barn-seed' });
    expect(seeded.status).toBe(201);
    const before = await snapshot('2026-05-03');
    const response = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify({
      effectiveDate: '2026-05-03', sourceBarnId: 1, destinationBarnId: 1,
      sourceLocationCode: null, sourceLotCode: null, destinationLocationCode: 'galpon_a', destinationLotCode: null,
      stageCode: 'levante', sex: 'macho', quantity: 3, reason: 'Cambio de ubicación', operationKey: 'same-barn-transfer',
    }) });
    expect(response.status).toBe(201);
    const after = await snapshot('2026-05-03');
    const total = (s: typeof before) => s.balances.filter((b) => b.barnId === 1).reduce((sum, b) => sum + b.heads, 0);
    expect(total(after)).toBe(total(before));
    expect(after.balances.find((b) => b.barnId === 1 && b.locationCode === 'galpon_a' && b.lotCode === null && b.stageCode === 'levante' && b.sex === 'macho')?.heads).toBe(3);
  });

  it('cambia la etapa de un grupo sin cambiar el total de la granja', async () => {
    const seeded = await register({ movementType: 'initial', barnId: 1, locationCode: null, lotCode: null, effectiveDate: '2026-05-04', quantity: 4, operationKey: 'stage-group-seed' });
    expect(seeded.status).toBe(201);
    const before = await snapshot('2026-05-04');
    const payload = { effectiveDate: '2026-05-04', sourceBarnId: 1, destinationBarnId: 1, sourceLocationCode: null, sourceLotCode: null, destinationLocationCode: null, destinationLotCode: null, stageCode: 'levante', destinationStageCode: 'engorde', sex: 'macho', quantity: 4, reason: 'Cambio de etapa', operationKey: 'stage-group' };
    const response = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify(payload) });
    expect(response.status, await response.clone().text()).toBe(201);
    const after = await snapshot('2026-05-04');
    expect(after.summary.total.available).toBe(before.summary.total.available);
    expect(after.balances.find((row) => row.barnId === 1 && row.locationCode === null && row.lotCode === null && row.stageCode === 'engorde' && row.sex === 'macho')?.heads).toBe(4);
    expect(after.summary.byStage.find((row) => row.stageCode === 'engorde')?.available).toBe((before.summary.byStage.find((row) => row.stageCode === 'engorde')?.available ?? 0) + 4);
    const replay = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify(payload) });
    expect(replay.status).toBe(200);
  });

  it('concilia el conteo físico con un ajuste aprobado y auditable', async () => {
    const seed = await register({ movementType: 'initial', barnId: 1, effectiveDate: '2026-06-01', quantity: 12, operationKey: 't10-count-seed' });
    expect(seed.status).toBe(201);
    const payload = { barnId: 1, locationCode: 'galpon_a', lotCode: 'lote_levante_a', stageCode: 'levante',
      sex: 'macho', effectiveDate: '2026-06-01', countedHeads: 10, reason: 'Conteo físico aprobado', operationKey: 't10-count' };
    const response = await api('/api/inventory/reconciliations', { method: 'POST', body: JSON.stringify(payload) });
    expect(response.status).toBe(201);
    const result = await response.json() as { expectedHeads: number; countedHeads: number; variance: number };
    expect(result.countedHeads).toBe(10);
    expect(result.variance).toBe(10 - result.expectedHeads);
    const replay = await api('/api/inventory/reconciliations', { method: 'POST', body: JSON.stringify(payload) });
    expect(replay.status).toBe(200);
    const audit = await db.prepare(`SELECT r.expected_heads, r.counted_heads, r.variance, r.adjustment_movement_id,
      r.created_by_user_id, m.quantity AS adjustment_quantity FROM inventory_reconciliations r
      LEFT JOIN inventory_movements m ON m.id = r.adjustment_movement_id
      WHERE r.operation_log_id = (SELECT id FROM operation_log WHERE operation_key = ?)`)
      .bind('t10-count').first<{ expected_heads: number; counted_heads: number; variance: number; adjustment_movement_id: number; created_by_user_id: number; adjustment_quantity: number }>();
    expect(audit).toMatchObject({ counted_heads: 10, variance: 10 - result.expectedHeads, adjustment_quantity: 10 - result.expectedHeads, created_by_user_id: adminId });
    expect(audit?.adjustment_movement_id).toBeGreaterThan(0);
  });

  it('serializa dos retiros concurrentes para que el stock nunca sea negativo', async () => {
    const seed = await register({ barnId: 1, sex: 'pendiente', effectiveDate: '2026-08-01', quantity: 10, operationKey: 't10-concurrent-seed' });
    expect(seed.status).toBe(201);
    const requests = await Promise.all([
      register({ movementType: 'sale', barnId: 1, sex: 'pendiente', effectiveDate: '2026-08-02', quantity: 7, reason: 'Venta concurrente uno', operationKey: 't10-concurrent-a' }),
      register({ movementType: 'sale', barnId: 1, sex: 'pendiente', effectiveDate: '2026-08-02', quantity: 7, reason: 'Venta concurrente dos', operationKey: 't10-concurrent-b' }),
    ]);
    const outcomes = await Promise.all(requests.map(async (response) => ({ status: response.status, error: (await response.clone().json() as { error?: string }).error })));
    expect(outcomes.map((outcome) => outcome.status).sort(), JSON.stringify(outcomes)).toEqual([201, 409]);
  });

  it('corrige un movimiento sin borrar el original y actualiza el saldo derivado', async () => {
    const before = await snapshot('2026-09-01');
    const baseline = before.balances.filter((row) => row.barnId === 1 && row.stageCode === 'preinicio' && row.sex === 'pendiente' && row.locationCode === null && row.lotCode === null).reduce((sum, row) => sum + row.heads, 0);
    const created = await register({ barnId: 1, stageCode: 'preinicio', sex: 'pendiente', locationCode: null, lotCode: null,
      effectiveDate: '2026-09-01', quantity: 10, operationKey: 't10-correction-seed' });
    expect(created.status).toBe(201);
    const movement = await created.json() as { movement: { id: number } };
    const sale = await register({ movementType: 'sale', barnId: 1, stageCode: 'preinicio', sex: 'pendiente', locationCode: null, lotCode: null,
      effectiveDate: '2026-09-02', quantity: 7, reason: 'Salida posterior para previsualización', operationKey: 't10-correction-sale' });
    expect(sale.status).toBe(201);
    const allowedPreview = await api(`/api/inventory/corrections/preview?movementId=${movement.movement.id}&correctedQuantity=8`);
    expect((await allowedPreview.json() as { preview: { allowed: boolean } }).preview.allowed).toBe(true);
    const blockedPreview = await api(`/api/inventory/corrections/preview?movementId=${movement.movement.id}&correctedQuantity=2`);
    const previewBody = await blockedPreview.json() as { preview: { allowed: boolean; incompatibleMovements: { type: string; balanceAfter: number }[] } };
    expect(previewBody.preview.allowed).toBe(false);
    expect(previewBody.preview.incompatibleMovements).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'sale', balanceAfter: -5 })]));
    const corrected = await api('/api/inventory/corrections', { method: 'POST', body: JSON.stringify({
      movementId: movement.movement.id, correctedQuantity: 8, reason: 'Corrección de conteo', operationKey: 't10-correction-01',
    }) });
    expect(corrected.status).toBe(201);
    const replay = await api('/api/inventory/corrections', { method: 'POST', body: JSON.stringify({
      movementId: movement.movement.id, correctedQuantity: 8, reason: 'Corrección de conteo', operationKey: 't10-correction-01',
    }) });
    expect(replay.status).toBe(200);
    const after = await snapshot('2026-09-02');
    const final = after.balances.filter((row) => row.barnId === 1 && row.stageCode === 'preinicio' && row.sex === 'pendiente' && row.locationCode === null && row.lotCode === null).reduce((sum, row) => sum + row.heads, 0);
    expect(final).toBe(baseline + 1);
    const movements = await db.prepare('SELECT movement_type, quantity, reverses_movement_id FROM inventory_movements WHERE reverses_movement_id = ?').bind(movement.movement.id).all<{ movement_type: string; quantity: number; reverses_movement_id: number }>();
    expect(movements.results).toHaveLength(2);
    expect(movements.results?.some((row) => row.movement_type === 'adjustment' && row.quantity === -10)).toBe(true);
    const original = await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE id = ?').bind(movement.movement.id).first<{ n: number }>();
    expect(original?.n).toBe(1);
  });

  it('revierte el traslado completo si D1 falla al insertar el destino', async () => {
    const seed = await register({ barnId: 1, sex: 'pendiente', locationCode: null, lotCode: null,
      effectiveDate: '2026-10-01', quantity: 4, operationKey: 't10-atomic-seed' });
    expect(seed.status).toBe(201);
    await db.prepare(`CREATE TRIGGER fail_transfer_destination BEFORE INSERT ON inventory_movements
      WHEN NEW.operation_log_id = (SELECT id FROM operation_log WHERE operation_key = 't10-atomic-transfer') AND NEW.movement_type = 'transfer_in'
      BEGIN SELECT RAISE(ABORT, 'fallo forzado en destino'); END`).run();
    try {
      const response = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify({
        effectiveDate: '2026-10-02', sourceBarnId: 1, destinationBarnId: 2, locationCode: null, lotCode: null,
        stageCode: 'levante', sex: 'pendiente', quantity: 2, reason: 'Prueba de rollback', operationKey: 't10-atomic-transfer',
      }) });
      expect(response.status).toBe(400);
      const legs = await db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE operation_log_id = (SELECT id FROM operation_log WHERE operation_key = 't10-atomic-transfer')").first<{ n: number }>();
      expect(legs?.n).toBe(0);
    } finally {
      await db.exec('DROP TRIGGER IF EXISTS fail_transfer_destination;');
    }
  });
});

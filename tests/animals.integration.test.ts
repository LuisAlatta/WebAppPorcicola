import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-animals-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'animals-database' } },
    },
  }],
});

interface AnimalSummary {
  id: number;
  code: string;
  currentTag: string;
  animalType: string;
  sex: string;
  status: string;
  isActive: boolean;
  birthDate: string | null;
  ageDays: number | null;
  ageLabel: string | null;
  currentWeightKg: number | null;
  currentWeightDate: string | null;
  birthWeightKg: number | null;
  weaningWeightKg: number | null;
  barnId: number;
  barnName: string;
  stageCode: string;
  locationCode: string | null;
  lotCode: string | null;
  exitDate: string | null;
  exitType: string | null;
}

interface AnimalDetail extends AnimalSummary {
  originType: string;
  mother: { id: number | null; code: string | null; external: string | null } | null;
  father: { id: number | null; code: string | null; external: string | null } | null;
  tags: { tag: string; validFrom: string; validTo: string | null; isCurrent: boolean }[];
  typeHistory: { animalType: string; validFrom: string; isCurrent: boolean }[];
  weights: { id: number; weighedOn: string; weighedTime: string; weightKg: number; note: string | null;
    stageCode: string | null; barnId: number | null; locationCode: string | null; lotCode: string | null;
    corrected: boolean; correctsWeightId: number | null; gainKg: number | null; gainDays: number | null }[];
  chronology: { date: string; kind: string; title: string }[];
}

interface ListResponse {
  animals: AnimalSummary[];
  total: number;
  options: {
    barns: { id: number; name: string }[];
    stages: { code: string }[];
    aptitudes: { code: string }[];
    origins: { code: string }[];
  };
}

describe('Fichas individuales de animales · T09 (ANI-01..ANI-08, INV-04)', () => {
  let db: D1Database;
  let adminToken: string;
  let operarioToken: string;
  let veterinarioToken: string;
  let operarioSinGalponToken: string;

  const api = async (path: string, init: RequestInit = {}, token = adminToken) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), { DB: db });
  };

  const baseAnimal = (overrides: Record<string, unknown> = {}) => ({
    code: `A-${Math.random().toString(36).slice(2, 8)}`,
    animalType: 'lechon',
    sex: 'hembra',
    entryDate: '2026-01-10',
    entryStageCode: 'preinicio',
    barnId: 1,
    locationCode: 'galpon_a',
    originType: 'nacimiento',
    reason: 'Alta de ficha de prueba',
    operationKey: `ani-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  });

  const create = (overrides: Record<string, unknown> = {}, token = adminToken) =>
    api('/api/animals', { method: 'POST', body: JSON.stringify(baseAnimal(overrides)) }, token);

  const list = async (query = '', token = adminToken): Promise<ListResponse> => {
    const res = await api(`/api/animals${query}`, {}, token);
    expect(res.status).toBe(200);
    return res.json() as Promise<ListResponse>;
  };

  const inventoryTotals = async (asOf: string) => {
    const res = await api(`/api/inventory?asOf=${asOf}`);
    expect(res.status).toBe(200);
    const data = await res.json() as {
      balances: { heads: number; identified: number; unidentified: number; stageCode: string; sex: string; barnName: string }[];
      summary: { total: { available: number } };
    };
    return data;
  };

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
      '0009_weight_measurement_order.sql',
      '0010_reproduction_cycles.sql',
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
          username: 'admin.animales@granja.pe',
          password: 'PasswordAnimales2026!',
          name: 'Administrador de Animales',
        }),
      }),
      { DB: db },
    );
    const initData = await initRes.json() as { token: string };
    adminToken = initData.token;

    const operarioRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'operario.animales@granja.pe',
        name: 'Operario de Animales',
        role: 'operario',
        password: 'ClaveOperarioAni1!',
        barnIds: [1],
      }),
    });
    expect(operarioRes.status).toBe(201);

    const vetRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'veterinario.animales@granja.pe',
        name: 'Veterinario de Animales',
        role: 'veterinario',
        password: 'ClaveVeterinarioAni1!',
        barnIds: [1, 2],
      }),
    });
    expect(vetRes.status).toBe(201);

    const sinGalponRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'operario.sin.galpon@granja.pe',
        name: 'Operario sin Galpón',
        role: 'operario',
        password: 'ClaveSinGalpon1!',
        barnIds: [],
      }),
    });
    expect(sinGalponRes.status).toBe(201);

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

    operarioToken = await login('operario.animales@granja.pe', 'ClaveOperarioAni1!');
    veterinarioToken = await login('veterinario.animales@granja.pe', 'ClaveVeterinarioAni1!');
    operarioSinGalponToken = await login('operario.sin.galpon@granja.pe', 'ClaveSinGalpon1!');
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('inicia vacío y expone los catálogos de la ficha', async () => {
    const data = await list();
    expect(data.total).toBe(0);
    expect(data.animals).toHaveLength(0);
    expect(data.options.stages.some((stage) => stage.code === 'preinicio')).toBe(true);
    expect(data.options.aptitudes.some((item) => item.code === 'pie_de_cria')).toBe(true);
    expect(data.options.origins.map((origin) => origin.code)).toEqual(['nacimiento', 'compra', 'interna', 'inicial']);
    expect(data.options.barns.map((barn) => barn.name)).toEqual(['Galpón A', 'Galpón B']);
  });

  it('crea el código 002 con ceros, reintenta sin duplicar y rechaza duplicados', async () => {
    const payload = baseAnimal({
      code: '002',
      birthDate: '2026-01-05',
      birthWeightKg: 1.4,
      weaningDate: '2026-02-20',
      weaningWeightKg: 7.5,
      operationKey: 'ani-alta-002',
    });

    const first = await api('/api/animals', { method: 'POST', body: JSON.stringify(payload) });
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { animal: AnimalDetail; replayed: boolean };
    expect(firstBody.replayed).toBe(false);
    expect(firstBody.animal.code).toBe('002');
    expect(firstBody.animal.currentTag).toBe('002');
    expect(firstBody.animal.birthWeightKg).toBe(1.4);
    expect(firstBody.animal.weaningWeightKg).toBe(7.5);
    expect(firstBody.animal.currentWeightKg).toBe(7.5);
    expect(firstBody.animal.currentWeightDate).toBe('2026-02-20');
    expect(firstBody.animal.ageDays).toBeGreaterThanOrEqual(300);
    expect(firstBody.animal.chronology.some((item) => item.kind === 'alta')).toBe(true);

    // Una única entrada al inventario por el alta individual.
    const movements = await db.prepare(
      'SELECT movement_type, quantity FROM inventory_movements WHERE animal_id = ?',
    ).bind(firstBody.animal.id).all<{ movement_type: string; quantity: number }>();
    expect(movements.results).toHaveLength(1);
    expect(movements.results?.[0].movement_type).toBe('birth');
    expect(Number(movements.results?.[0].quantity)).toBe(1);

    // Los pesos al nacer y al destete alimentan la serie de pesajes.
    const weights = await db.prepare(
      'SELECT weight_kg FROM animal_weights WHERE animal_id = ? ORDER BY weighed_on',
    ).bind(firstBody.animal.id).all<{ weight_kg: number }>();
    expect((weights.results ?? []).map((row) => row.weight_kg)).toEqual([1.4, 7.5]);

    const again = await api('/api/animals', { method: 'POST', body: JSON.stringify(payload) });
    expect(again.status).toBe(200);
    const againBody = await again.json() as { animal: AnimalDetail; replayed: boolean };
    expect(againBody.replayed).toBe(true);
    expect(againBody.animal.id).toBe(firstBody.animal.id);

    const count = await db.prepare('SELECT COUNT(*) AS total FROM animals').first<{ total: number }>();
    expect(Number(count?.total)).toBe(1);

    const conflicting = await api('/api/animals', {
      method: 'POST',
      body: JSON.stringify({ ...payload, birthWeightKg: 1.5 }),
    });
    expect(conflicting.status).toBe(409);

    const duplicate = await create({ code: '002' });
    expect(duplicate.status).toBe(409);
    const duplicateBody = await duplicate.json() as { error: string };
    expect(duplicateBody.error).toContain('Ya existe un animal');

    const detail = await api('/api/animals/002');
    expect(detail.status).toBe(200);
    const detailBody = await detail.json() as { animal: AnimalDetail };
    expect(detailBody.animal.code).toBe('002');
  });

  it('vincula una ficha interna sin sumar cabezas y rechaza cuando no hay saldo', async () => {
    const seed = await api('/api/inventory/movements', {
      method: 'POST',
      body: JSON.stringify({
        movementType: 'initial',
        effectiveDate: '2026-01-10',
        barnId: 1,
        locationCode: 'galpon_a',
        lotCode: null,
        stageCode: 'inicio',
        sex: 'hembra',
        quantity: 2,
        reason: 'Carga inicial de hembras sin identificar',
        operationKey: 'ani-grupo-inicio-hembras',
      }),
    });
    expect(seed.status).toBe(201);

    const primera = await create({
      code: '100',
      entryStageCode: 'inicio',
      originType: 'interna',
      operationKey: 'ani-interna-100',
    });
    expect(primera.status).toBe(201);

    const segunda = await create({
      code: '101',
      entryStageCode: 'inicio',
      originType: 'interna',
      operationKey: 'ani-interna-101',
    });
    expect(segunda.status).toBe(201);

    const tercera = await create({
      code: '102',
      entryStageCode: 'inicio',
      originType: 'interna',
      operationKey: 'ani-interna-102',
    });
    expect(tercera.status).toBe(409);
    const terceraBody = await tercera.json() as { error: string };
    expect(terceraBody.error).toContain('sin identificar');

    const snapshot = await inventoryTotals('2026-01-11');
    const bucket = snapshot.balances.find((balance) => (
      balance.barnName === 'Galpón A'
      && balance.stageCode === 'inicio'
      && balance.sex === 'hembra'
    ));
    expect(bucket?.heads).toBe(2);
    expect(bucket?.identified).toBe(2);
    expect(bucket?.unidentified).toBe(0);

    const movements = await db.prepare(
      'SELECT COUNT(*) AS total FROM inventory_movements WHERE animal_id IS NOT NULL',
    ).first<{ total: number }>();
    // Solo la ficha 002 generó movimiento; las internas no suman cabezas.
    expect(Number(movements?.total)).toBe(1);
  });

  it('valida sexo de progenitores, fechas incompatibles y parentescos circulares', async () => {
    const madre = await create({
      code: 'M-01',
      animalType: 'cerda',
      sex: 'hembra',
      birthDate: '2025-01-01',
      entryDate: '2026-01-05',
      entryStageCode: 'gestacion',
      originType: 'inicial',
      operationKey: 'ani-madre-m01',
    });
    expect(madre.status).toBe(201);
    const madreBody = await madre.json() as { animal: AnimalDetail };

    const padre = await create({
      code: 'P-01',
      animalType: 'verraco',
      sex: 'macho',
      birthDate: '2025-02-01',
      entryDate: '2026-01-05',
      entryStageCode: 'gestacion',
      originType: 'inicial',
      operationKey: 'ani-padre-p01',
    });
    expect(padre.status).toBe(201);
    const padreBody = await padre.json() as { animal: AnimalDetail };

    const madreInvalida = await create({
      code: 'C-00',
      motherId: padreBody.animal.id,
      birthDate: '2026-02-01',
      entryDate: '2026-02-01',
      reason: 'Intento con progenitor del sexo equivocado',
      operationKey: 'ani-c00-sexo',
    });
    expect(madreInvalida.status).toBe(400);
    expect((await madreInvalida.json() as { error: string }).error).toContain('sexo hembra');

    const fechasInvalidas = await create({
      code: 'C-00',
      motherId: madreBody.animal.id,
      birthDate: '2024-06-01',
      reason: 'Intento con fecha anterior al progenitor',
      operationKey: 'ani-c00-fechas',
    });
    expect(fechasInvalidas.status).toBe(400);
    expect((await fechasInvalidas.json() as { error: string }).error).toContain('anterior');

    const hija = await create({
      code: 'C-01',
      motherId: madreBody.animal.id,
      fatherId: padreBody.animal.id,
      birthDate: '2026-02-01',
      entryDate: '2026-02-01',
      reason: 'Alta con genealogía interna conocida',
      operationKey: 'ani-hija-c01',
    });
    expect(hija.status).toBe(201);
    const hijaBody = await hija.json() as { animal: AnimalDetail };
    expect(hijaBody.animal.mother?.code).toBe('M-01');
    expect(hijaBody.animal.father?.code).toBe('P-01');

    const ciclo = await api('/api/animals/M-01', {
      method: 'PUT',
      body: JSON.stringify({ motherId: hijaBody.animal.id, reason: 'Intento de parentesco circular' }),
    });
    expect(ciclo.status).toBe(400);
    expect((await ciclo.json() as { error: string }).error).toContain('anterior');

    const tipoIncompatible = await api('/api/animals/P-01', {
      method: 'PUT',
      body: JSON.stringify({ animalType: 'cerda', reason: 'Prueba de coherencia de tipo' }),
    });
    expect(tipoIncompatible.status).toBe(400);
    expect((await tipoIncompatible.json() as { error: string }).error).toContain('debe registrarse como hembra');

    // Fuerza un vínculo circular preexistente para comprobar la detección.
    await db.prepare('UPDATE animals SET mother_id = ? WHERE id = ?')
      .bind(hijaBody.animal.id, madreBody.animal.id).run();
    const circulo = await api('/api/animals/C-01', {
      method: 'PUT',
      body: JSON.stringify({ motherId: madreBody.animal.id, reason: 'Intento de parentesco circular' }),
    });
    expect(circulo.status).toBe(400);
    expect((await circulo.json() as { error: string }).error).toContain('ciclo');
    await db.prepare('UPDATE animals SET mother_id = NULL WHERE id = ?')
      .bind(madreBody.animal.id).run();

    const propia = await api('/api/animals/M-01', {
      method: 'PUT',
      body: JSON.stringify({ motherId: madreBody.animal.id, reason: 'Intento de ser su propia madre' }),
    });
    expect(propia.status).toBe(400);

    const externa = await create({
      code: 'C-02',
      motherExternal: 'CERDA-EXTERNA-7',
      fatherExternal: 'VERRACO-EXTERNO-3',
      birthDate: '2026-02-05',
      entryDate: '2026-02-05',
      reason: 'Alta con progenitores externos',
      operationKey: 'ani-c02-externa',
    });
    expect(externa.status).toBe(201);
    const externaBody = await externa.json() as { animal: AnimalDetail };
    expect(externaBody.animal.mother?.external).toBe('CERDA-EXTERNA-7');
    expect(externaBody.animal.father?.external).toBe('VERRACO-EXTERNO-3');
    expect(externaBody.animal.mother?.code).toBeNull();
  });

  it('cambia el arete conservando el histórico y rechaza aretes en uso', async () => {
    const cambio = await api('/api/animals/002/tags', {
      method: 'POST',
      body: JSON.stringify({
        tag: 'A-2002',
        effectiveDate: '2026-03-01',
        reason: 'Reemplazo de arete dañado',
        operationKey: 'ani-arete-002',
      }),
    });
    expect(cambio.status).toBe(200);
    const cambioBody = await cambio.json() as { animal: AnimalDetail };
    expect(cambioBody.animal.currentTag).toBe('A-2002');
    expect(cambioBody.animal.tags).toHaveLength(2);
    const anterior = cambioBody.animal.tags.find((tag) => !tag.isCurrent);
    expect(anterior?.tag).toBe('002');
    expect(anterior?.validTo).toBe('2026-03-01');
    expect(cambioBody.animal.tags.find((tag) => tag.isCurrent)?.tag).toBe('A-2002');

    const repetido = await api('/api/animals/002/tags', {
      method: 'POST',
      body: JSON.stringify({ tag: 'A-2002', reason: 'Intento de repetir el arete vigente' }),
    });
    expect(repetido.status).toBe(400);

    const enUso = await api('/api/animals/002/tags', {
      method: 'POST',
      body: JSON.stringify({ tag: 'M-01', reason: 'Intento de reutilizar un arete vigente' }),
    });
    expect(enUso.status).toBe(409);
    expect((await enUso.json() as { error: string }).error).toContain('ya está asignado');
  });

  it('desactiva la ficha sin registrar salida física ni alterar el inventario', async () => {
    const antes = await inventoryTotals('2026-06-30');
    const salidasAntes = await db.prepare(`
      SELECT COUNT(*) AS total FROM inventory_movements
      WHERE movement_type IN ('sale', 'death')
    `).first<{ total: number }>();

    const baja = await api('/api/animals/002/deactivate', {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Ficha retirada del padrón de selección',
        operationKey: 'ani-baja-002',
      }),
    });
    expect(baja.status).toBe(200);
    const bajaBody = await baja.json() as { animal: AnimalDetail };
    expect(bajaBody.animal.isActive).toBe(false);
    expect(bajaBody.animal.exitDate).toBeNull();
    expect(bajaBody.animal.exitType).toBeNull();
    expect(bajaBody.animal.status).toBe('activo');

    const despues = await inventoryTotals('2026-06-30');
    expect(despues.summary.total.available).toBe(antes.summary.total.available);

    const salidasDespues = await db.prepare(`
      SELECT COUNT(*) AS total FROM inventory_movements
      WHERE movement_type IN ('sale', 'death')
    `).first<{ total: number }>();
    expect(Number(salidasDespues?.total)).toBe(Number(salidasAntes?.total));

    const inactivas = await list('?active=0');
    expect(inactivas.animals.map((animal) => animal.code)).toContain('002');
    const activas = await list('?active=1');
    expect(activas.animals.map((animal) => animal.code)).not.toContain('002');

    const reactivar = await api('/api/animals/002/reactivate', {
      method: 'POST',
      body: JSON.stringify({
        reason: 'La ficha vuelve al padrón de selección',
        operationKey: 'ani-reactivar-002',
      }),
    });
    expect(reactivar.status).toBe(200);
    expect((await reactivar.json() as { animal: AnimalDetail }).animal.isActive).toBe(true);
  });

  it('reconstruye como identificada una ficha que salió después de la fecha de corte', async () => {
    const alta = await create({
      code: 'HIST-01',
      animalType: 'lechon',
      sex: 'hembra',
      entryDate: '2026-01-20',
      entryStageCode: 'inicio',
      originType: 'inicial',
      operationKey: 'ani-historico-01',
    });
    expect(alta.status).toBe(201);
    const { animal } = await alta.json() as { animal: AnimalDetail };

    await db.prepare('UPDATE animals SET exit_date = ?, status = ? WHERE id = ?')
      .bind('2026-03-01', 'vendido', animal.id).run();

    const historical = await inventoryTotals('2026-02-28');
    const bucket = historical.balances.find((balance) => (
      balance.barnName === 'Galpón A' && balance.stageCode === 'inicio' && balance.sex === 'hembra'
    ));
    expect(bucket?.heads).toBe(3);
    expect(bucket?.identified).toBe(3);
    expect(bucket?.unidentified).toBe(0);

    const vendido = await list('?status=vendido');
    expect(vendido.animals.map((item) => item.code)).toContain('HIST-01');
  });

  it('traslada una ficha, el libro y la ubicación histórica en una operación', async () => {
    const created = await create({ code: 'T10-MOVE-01', entryDate: '2026-05-01', entryStageCode: 'preinicio', originType: 'nacimiento' });
    expect(created.status).toBe(201);
    const payload = { destinationBarnId: 2, locationCode: null, lotCode: null, effectiveDate: '2026-11-07',
      reason: 'Traslado de prueba', operationKey: 't10-animal-transfer-01' };
    const denied = await api('/api/animals/T10-MOVE-01/transfer', { method: 'POST', body: JSON.stringify(payload) }, operarioToken);
    expect(denied.status).toBe(403);
    const oldCapacity = await db.prepare('SELECT capacity FROM barns WHERE id = 2').first<{ capacity: number }>();
    await db.prepare('UPDATE barns SET capacity = 0 WHERE id = 2').run();
    const transferred = await api('/api/animals/T10-MOVE-01/transfer', { method: 'POST', body: JSON.stringify(payload) });
    expect(transferred.status).toBe(201);
    expect((await transferred.json() as { warning: string | null }).warning).toContain('sobre capacidad');
    await db.prepare('UPDATE barns SET capacity = ? WHERE id = 2').bind(oldCapacity?.capacity ?? 60).run();
    const replay = await api('/api/animals/T10-MOVE-01/transfer', { method: 'POST', body: JSON.stringify(payload) });
    expect(replay.status, JSON.stringify(await replay.clone().json())).toBe(200);
    const detail = await api('/api/animals/T10-MOVE-01');
    const detailBody = await detail.json() as { animal: AnimalSummary };
    expect(detailBody.animal.barnId).toBe(2);
    const before = await inventoryTotals('2026-11-06');
    const after = await inventoryTotals('2026-11-07');
    const identifiedA = (snapshot: typeof before, barnName: string) => snapshot.balances.filter((bucket) => bucket.barnName === barnName && bucket.stageCode === 'preinicio' && bucket.sex === 'hembra').reduce((total, bucket) => total + bucket.identified, 0);
    expect(identifiedA(before, 'Galpón A') - identifiedA(after, 'Galpón A')).toBe(1);
    expect(identifiedA(after, 'Galpón B') - identifiedA(before, 'Galpón B')).toBe(1);
    const legs = await db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE animal_id = (SELECT id FROM animals WHERE code = 'T10-MOVE-01') AND movement_type IN ('transfer_out','transfer_in')").first<{ n: number }>();
    expect(legs?.n).toBe(2);
  });

  it('cierra venta o muerte de ficha con su descuento de inventario atómico', async () => {
    const created = await create({ code: 'T10-EXIT-01', entryDate: '2026-11-06', entryStageCode: 'preinicio', originType: 'nacimiento' });
    expect(created.status).toBe(201);
    const payload = { exitType: 'death', causeCode: 'enfermedad', effectiveDate: '2026-11-07',
      reason: 'Muerte registrada por prueba', operationKey: 't10-animal-exit-01' };
    const response = await api('/api/animals/T10-EXIT-01/exit', { method: 'POST', body: JSON.stringify(payload) });
    expect(response.status).toBe(201);
    const replay = await api('/api/animals/T10-EXIT-01/exit', { method: 'POST', body: JSON.stringify(payload) });
    expect(replay.status).toBe(200);
    const detail = await api('/api/animals/T10-EXIT-01');
    expect((await detail.json() as { animal: AnimalSummary }).animal.status).toBe('muerto');
    const linked = await db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE animal_id = (SELECT id FROM animals WHERE code = 'T10-EXIT-01') AND movement_type = 'death'").first<{ n: number }>();
    expect(linked?.n).toBe(1);
  });

  it('respeta el alcance por galpón y el perfil de solo lectura', async () => {
    const otraGranja = await create({
      code: 'G-B-01',
      animalType: 'lechon',
      sex: 'macho',
      entryDate: '2026-01-15',
      entryStageCode: 'inicio',
      barnId: 2,
      locationCode: 'galpon_b',
      originType: 'compra',
      reason: 'Alta de animal en el galpón B',
      operationKey: 'ani-galpon-b-01',
    });
    expect(otraGranja.status).toBe(201);

    const ajenoOperario = await api('/api/animals/G-B-01', {}, operarioToken);
    expect(ajenoOperario.status).toBe(404);

    const sinGalpon = await api('/api/animals/G-B-01', {}, operarioSinGalponToken);
    expect(sinGalpon.status).toBe(404);

    const propioAdmin = await api('/api/animals/G-B-01');
    expect(propioAdmin.status).toBe(200);

    const filtroAjeno = await api('/api/animals?barnId=2', {}, operarioToken);
    expect(filtroAjeno.status).toBe(403);

    const altaAjena = await create({ barnId: 2, code: 'G-B-02' }, operarioToken);
    expect(altaAjena.status).toBe(403);

    const listaOperario = await list('', operarioToken);
    expect(listaOperario.animals.every((animal) => animal.barnId === 1)).toBe(true);
    expect(listaOperario.options.barns.map((barn) => barn.name)).toEqual(['Galpón A']);

    const vetEscritura = await create({ code: 'V-01' }, veterinarioToken);
    expect(vetEscritura.status).toBe(403);

    const vetLectura = await api('/api/animals', {}, veterinarioToken);
    expect(vetLectura.status).toBe(200);
  });

  it('busca por código, alias o arete y filtra por tipo y galpón', async () => {
    const porCodigo = await list('?q=002');
    expect(porCodigo.animals.map((animal) => animal.code)).toEqual(['002']);

    const porArete = await list('?q=A-2002');
    expect(porArete.animals.map((animal) => animal.code)).toEqual(['002']);

    const cerdas = await list('?type=cerda');
    expect(cerdas.animals.map((animal) => animal.code)).toEqual(['M-01']);

    const galponB = await list('?barnId=2');
    expect(galponB.animals.map((animal) => animal.code)).toEqual(expect.arrayContaining(['G-B-01']));

    const ubicacionA = await list('?location=galpon_a');
    expect(ubicacionA.animals.some((animal) => animal.code === '002')).toBe(true);

    const lote = await create({
      code: 'LOT-01',
      animalType: 'lechon',
      sex: 'hembra',
      entryDate: '2026-01-15',
      entryStageCode: 'levante',
      locationCode: 'galpon_a',
      lotCode: 'lote_levante_a',
      originType: 'compra',
      operationKey: 'ani-lote-01',
    });
    expect(lote.status).toBe(201);
    const porLote = await list('?lot=lote_levante_a');
    expect(porLote.animals.map((animal) => animal.code)).toEqual(['LOT-01']);

    const cambioTipo = await api('/api/animals/G-B-01', {
      method: 'PUT',
      body: JSON.stringify({
        animalType: 'reemplazo',
        effectiveDate: '2026-01-16',
        reason: 'Selección como reemplazo',
        operationKey: 'ani-tipo-reemplazo',
      }),
    });
    expect(cambioTipo.status).toBe(200);
    const reemplazos = await list('?type=reemplazo');
    expect(reemplazos.animals.map((animal) => animal.code)).toContain('G-B-01');
    const fichaCambiada = await api('/api/animals/G-B-01');
    const fichaCambiadaBody = await fichaCambiada.json() as { animal: AnimalDetail };
    expect(fichaCambiadaBody.animal.typeHistory).toHaveLength(2);

    const pendientes = await list('?sex=pendiente');
    expect(pendientes.total).toBe(0);

    const ficha = await api('/api/animals/002');
    const fichaBody = await ficha.json() as { animal: AnimalDetail };
    expect(fichaBody.animal.currentWeightKg).toBe(7.5);
    expect(fichaBody.animal.birthWeightKg).toBe(1.4);
    expect(fichaBody.animal.ageDays).toBeGreaterThanOrEqual(300);
    expect(fichaBody.animal.chronology.some((item) => item.kind === 'pesaje')).toBe(true);
    expect(fichaBody.animal.chronology.some((item) => item.kind === 'arete')).toBe(true);
    expect(fichaBody.animal.chronology.some((item) => item.kind === 'inventario')).toBe(true);

    const desconocida = await api('/api/animals/NO-EXISTE');
    expect(desconocida.status).toBe(404);
  });
  it('calcula ciclos con parámetro vigente, conserva servicios y retira cierres de pendientes', async () => {
    await db.prepare(`INSERT INTO stage_versions
      (code,name,sort_order,duration_days,effective_from,effective_to,status,created_at)
      VALUES ('gestacion','Gestación histórica',5,116,'2021-01-01','2026-01-01','active','2021-01-01T00:00:00Z')`).run();
    const oldSow = await create({ code: 'T12-116', animalType: 'cerda', sex: 'hembra', breed: 'Landrace',
      birthDate: '2020-01-01', entryDate: '2021-01-01', entryStageCode: 'gestacion', locationCode: null,
      originType: 'compra', operationKey: 'ani-t12-alta-116' });
    expect(oldSow.status).toBe(201);
    const service116 = { femaleCode: 'T12-116', serviceDate: '2021-01-23', serviceType: 'inseminacion_artificial',
      materialSource: 'external', externalSource: 'Banco genético externo', operationKey: 'rep-t12-serv-116' };
    const created116 = await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify(service116) });
    expect(created116.status, await created116.clone().text()).toBe(201);
    const created116Body = await created116.json() as { createdCycleId: string; replayed: boolean };
    expect(created116Body.replayed).toBe(false);
    const replay116 = await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify(service116) });
    expect(replay116.status).toBe(200);
    expect((await replay116.json() as { createdCycleId: string; replayed: boolean })).toMatchObject({ createdCycleId: created116Body.createdCycleId, replayed: true });
    const oldList = await api('/api/reproduction/cycles?from=2021-01-23&to=2021-01-23&status=open');
    expect(oldList.status).toBe(200);
    const oldCycles = (await oldList.json() as { cycles: { probableFarrowingDate: string; gestationDays: number; services: Service[] }[] }).cycles;
    expect(oldCycles).toHaveLength(1);
    expect(oldCycles[0]).toMatchObject({ probableFarrowingDate: '2021-05-19', gestationDays: 116 });
    const repeated = await api(`/api/reproduction/cycles/${created116Body.createdCycleId}/services`, { method: 'POST', body: JSON.stringify({
      serviceDate: '2021-02-01', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Dosis externa',
      operationKey: 'rep-t12-repeticion-1',
    }) });
    expect(repeated.status).toBe(201);
    const repeatedBody = await repeated.json() as { cycle: { probableFarrowingDate: string; services: { serviceNumber: number }[] } };
    expect(repeatedBody.cycle).toMatchObject({ probableFarrowingDate: '2021-05-28' });
    expect(repeatedBody.cycle.services.map((service) => service.serviceNumber)).toEqual([1, 2]);

    const sow114 = await create({ code: 'T12-114', animalType: 'cerda', sex: 'hembra', breed: 'Yorkshire',
      birthDate: '2024-01-01', entryDate: '2026-01-01', entryStageCode: 'gestacion', locationCode: 'galpon_a',
      originType: 'compra', operationKey: 'ani-t12-alta-114' });
    expect(sow114.status).toBe(201);
    const boar = await create({ code: 'T12-VERRACO', animalType: 'verraco', sex: 'macho', breed: 'Duroc',
      birthDate: '2023-01-01', entryDate: '2026-01-01', entryStageCode: 'reproductor', locationCode: 'galpon_a',
      originType: 'compra', operationKey: 'ani-t12-alta-verraco' });
    expect(boar.status).toBe(201);
    const service114 = { femaleCode: 'T12-114', serviceDate: '2026-05-25', serviceType: 'monta_natural',
      materialSource: 'internal', sireCode: 'T12-VERRACO', operationKey: 'rep-t12-serv-114' };
    const created114 = await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify(service114) });
    expect(created114.status).toBe(201);
    const created114Body = await created114.json() as { createdCycleId: string };
    const list114Response = await api('/api/reproduction/cycles?from=2026-05-25&to=2026-05-25');
    const list114 = (await list114Response.json() as { cycles: { id: string; probableFarrowingDate: string; dueDateSource: string; dueLabel: string; services: { id: number; sireCode: string; sireBreed: string }[] }[] }).cycles;
    expect(list114.find((cycle) => cycle.id === created114Body.createdCycleId)).toMatchObject({ probableFarrowingDate: '2026-09-16', dueDateSource: 'calculated', dueLabel: 'vencido' });
    expect(list114[0].services[0]).toMatchObject({ sireCode: 'T12-VERRACO', sireBreed: 'Duroc' });
    expect((await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify({ ...service114, operationKey: 'rep-t12-second-cycle' }) })).status).toBe(409);

    const edited = await api(`/api/reproduction/cycles/${created114Body.createdCycleId}`, { method: 'PUT', body: JSON.stringify({
      dueDate: '2026-09-18', dueDateReason: 'Palpación y criterio veterinario', observations: 'Sin destete previo conocido', operationKey: 'rep-t12-manual-due',
    }) });
    expect(edited.status).toBe(200);
    const palpationBody = { eventType: 'palpation', eventDate: '2026-06-20', physiologicalStatus: 'gestation',
      serviceId: list114[0].services[0].id, operationKey: 'rep-t12-palpacion' };
    const palpation = await api(`/api/reproduction/cycles/${created114Body.createdCycleId}/events`, { method: 'POST', body: JSON.stringify(palpationBody) });
    expect(palpation.status).toBe(201);
    const abortionBody = { eventType: 'abortion', eventDate: '2026-07-01', reason: 'Aborto registrado en prueba', operationKey: 'rep-t12-aborto' };
    const abortion = await api(`/api/reproduction/cycles/${created114Body.createdCycleId}/events`, { method: 'POST', body: JSON.stringify(abortionBody) });
    expect(abortion.status).toBe(201);
    expect((await api(`/api/reproduction/cycles/${created114Body.createdCycleId}/events`, { method: 'POST', body: JSON.stringify(abortionBody) })).status).toBe(200);
    const pending = await api('/api/reproduction/cycles?from=2026-05-25&to=2026-05-25&status=pending');
    expect((await pending.json() as { cycles: { id: string }[] }).cycles.some((cycle) => cycle.id === created114Body.createdCycleId)).toBe(false);
    const all = await api('/api/reproduction/cycles?from=2026-05-25&to=2026-05-25&status=aborted');
    const closedCycle = (await all.json() as { cycles: { id: string; dueDateSource: string; events: { eventType: string }[]; services: { id: number }[] }[] }).cycles[0];
    expect(closedCycle).toMatchObject({ id: created114Body.createdCycleId, dueDateSource: 'manual' });
    expect(closedCycle.services).toHaveLength(1);
    expect(closedCycle.events.map((event) => event.eventType)).toEqual(['palpation', 'abortion', 'manual_due_date']);
    expect((await api(`/api/reproduction/cycles`, {}, operarioToken)).status).toBe(200);
    const operarioWrite = await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify(service114) }, operarioToken);
    expect(operarioWrite.status).toBe(403);

    const antecedentSow = await create({ code: 'T12-ANTEC', animalType: 'cerda', sex: 'hembra', birthDate: '2024-01-01',
      entryDate: '2026-01-01', entryStageCode: 'gestacion', originType: 'compra', operationKey: 'ani-t12-alta-antec' });
    expect(antecedentSow.status).toBe(201);
    const antecedent = await api('/api/reproduction/antecedents', { method: 'POST', body: JSON.stringify({ femaleCode: 'T12-ANTEC',
      serviceDate: '2026-10-01', dueDate: '2026-11-20', gestationDays: 114, lastFarrowingDate: '2026-05-01',
      observations: 'Ingresó gestante; se verificó por palpación', operationKey: 'rep-t12-antecedente' }) });
    expect(antecedent.status, await antecedent.clone().text()).toBe(201);
    const antecList = await api('/api/reproduction/cycles?from=2026-11-20&to=2026-11-20&status=open');
    const antecCycle = (await antecList.json() as { cycles: { femaleCode: string; antecedent: boolean; serviceAnchorDate: string | null; services: unknown[] }[] }).cycles[0];
    expect(antecCycle).toMatchObject({ femaleCode: 'T12-ANTEC', antecedent: true, serviceAnchorDate: null, services: [] });
  }, 15000);

  it('registra pesajes fuera de orden cronológico, calcula ganancias, conserva ubicación y corrige sin borrar el original', async () => {
    const created = await create({ code: 'T11-PESO', entryDate: '2026-06-01', operationKey: 'ani-t11-alta-peso' });
    expect(created.status).toBe(201);
    const later = { weighedOn: '2026-06-20', weighedTime: '10:00', weightKg: 44, operationKey: 'ani-t11-peso-44' };
    const lateFirst = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify(later) });
    expect(lateFirst.status).toBe(201);
    const earlier = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify({
      weighedOn: '2026-06-05', weighedTime: '08:00', weightKg: 38, operationKey: 'ani-t11-peso-38',
    }) });
    expect(earlier.status).toBe(201);
    let detailResponse = await api('/api/animals/T11-PESO');
    let detail = (await detailResponse.json() as { animal: AnimalDetail & { currentWeightKg: number } }).animal;
    expect(detail.currentWeightKg).toBe(44);
    expect(detail.currentWeightDate).toBe('2026-06-20');
    expect(detail.weights.find((weight) => weight.weighedOn === '2026-06-20')).toMatchObject({ gainKg: 6, gainDays: 15, lotCode: null });

    const sameDayA = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify({
      weighedOn: '2026-06-21', weighedTime: '08:00', weightKg: 45, operationKey: 'ani-t11-mismo-08',
    }) });
    const sameDayB = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify({
      weighedOn: '2026-06-21', weighedTime: '16:00', weightKg: 46, operationKey: 'ani-t11-mismo-16',
    }) });
    expect(sameDayA.status).toBe(201);
    expect(sameDayB.status).toBe(201);
    detailResponse = await api('/api/animals/T11-PESO');
    detail = (await detailResponse.json() as { animal: AnimalDetail & { currentWeightKg: number } }).animal;
    expect(detail.currentWeightKg).toBe(46);
    expect(detail.weights.filter((weight) => weight.weighedOn === '2026-06-21').map((weight) => weight.weighedTime)).toEqual(['08:00', '16:00']);
    expect(detail.weights.find((weight) => weight.weighedTime === '16:00' && weight.weighedOn === '2026-06-21')).toMatchObject({ gainDays: null, gainKg: null });

    const weight44 = detail.weights.find((weight) => weight.weighedOn === '2026-06-20')!;
    const correctionBody = { weightKg: 45, reason: 'Báscula recalibrada', operationKey: 'ani-t11-corr-44' };
    const corrected = await api(`/api/animals/T11-PESO/weights/${weight44.id}/correction`, { method: 'POST', body: JSON.stringify(correctionBody) });
    expect(corrected.status).toBe(201);
    const retry = await api(`/api/animals/T11-PESO/weights/${weight44.id}/correction`, { method: 'POST', body: JSON.stringify(correctionBody) });
    expect(retry.status).toBe(200);
    detailResponse = await api('/api/animals/T11-PESO');
    detail = (await detailResponse.json() as { animal: AnimalDetail & { currentWeightKg: number } }).animal;
    expect(detail.currentWeightKg).toBe(46);
    expect(detail.weights.find((weight) => weight.id === weight44.id)?.corrected).toBe(true);
    expect(detail.weights.find((weight) => weight.correctsWeightId === weight44.id)?.weightKg).toBe(45);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM animal_weights WHERE animal_id = ?').bind(detail.id).first<{ n: number }>()).toMatchObject({ n: 5 });

    const zero = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify({
      weighedOn: '2026-06-22', weighedTime: '12:00', weightKg: 0, operationKey: 'ani-t11-peso-cero',
    }) });
    expect(zero.status).toBe(400);
  });

});

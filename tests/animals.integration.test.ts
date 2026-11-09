import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';
import { applyVaccineOccurrence } from '../worker/vaccines';

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
  let responsableToken: string;
  let veterinarioToken: string;
  let operarioSinGalponToken: string;
  let operarioGalponBToken: string;

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
    ...(overrides.originType === 'compra' && overrides.purchaseAmount === undefined ? { purchaseAmount: '1.00', purchaseCurrencyCode: 'PEN' } : {}),
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
      summary: { total: { available: number; entries: number; exits: number; mortalityPct: number | null } };
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
      '0011_litters_and_farrowing.sql',
      '0012_weaning_events_and_cycles.sql',
      '0013_feed_warehouses_and_ledger.sql',
      '0014_feed_projections_and_turns.sql',
      '0015_health_events_and_withdrawals.sql',
      '0016_vaccine_rules_and_schedules.sql',
      '0017_financial_ledger.sql',
      '0018_trade_links.sql',
      '0019_feed_purchase_reversals.sql',
      '0020_financial_settlements.sql',
      '0021_alert_occurrences.sql',
      '0022_alerts_critical_notifications.sql',
      '0023_report_definitions.sql',
      '0023_report_definitions.sql',
      '0024_litter_discard.sql',
    ];

    for (const file of migrationFiles) {
      const schemaSql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      if (file === '0020_financial_settlements.sql') {
        const sql = schemaSql.replace(/^--.*$/gm, '').replace(/\s+/g, ' ');
        const statements = sql.split(';').map((part) => part.trim()).filter(Boolean);
        let trigger = '';
        for (const statement of statements) {
          if (trigger || /^CREATE TRIGGER/i.test(statement)) {
            trigger += `${statement}; `;
            if (/\bEND$/i.test(statement)) {
              await db.exec(trigger.trim());
              trigger = '';
            }
          } else {
            await db.exec(`${statement};`);
          }
        }
        continue;
      }
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

    const responsableRes = await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: 'responsable.animales@granja.pe', name: 'Responsable de Galpón A', role: 'responsable', password: 'ClaveResponsable1!', barnIds: [1] }) });
    expect(responsableRes.status).toBe(201);

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

    const operarioGalponBRes=await api('/api/admin/users',{method:'POST',body:JSON.stringify({username:'operario.galpon.b@granja.pe',name:'Operario Galpón B',role:'operario',password:'ClaveOperarioGalponB1!',barnIds:[2]})});expect(operarioGalponBRes.status).toBe(201);

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
    responsableToken = await login('responsable.animales@granja.pe', 'ClaveResponsable1!');
    veterinarioToken = await login('veterinario.animales@granja.pe', 'ClaveVeterinarioAni1!');
    operarioSinGalponToken = await login('operario.sin.galpon@granja.pe', 'ClaveSinGalpon1!');
    operarioGalponBToken = await login('operario.galpon.b@granja.pe','ClaveOperarioGalponB1!');
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

  it('traslada una ficha entre ubicaciones del mismo galpón', async () => {
    const created = await create({ code: 'MOVE-INTERNO', entryDate: '2026-05-01', entryStageCode: 'preinicio', originType: 'nacimiento' });
    expect(created.status).toBe(201);
    const response = await api('/api/animals/MOVE-INTERNO/transfer', { method: 'POST', body: JSON.stringify({ destinationBarnId: 1, locationCode: null, lotCode: null, effectiveDate: '2026-11-07', reason: 'Cambio interno', operationKey: 'move-interno' }) });
    expect(response.status, await response.clone().text()).toBe(201);
    const animal = await db.prepare("SELECT location_code FROM animals WHERE code = 'MOVE-INTERNO'").first<{ location_code: string }>();
    expect(animal?.location_code).toBeNull();
  });

  it('cambia la etapa de un animal conservando el total y el historial', async () => {
    const created = await create({ code: 'CAMBIO-ETAPA', entryDate: '2026-05-01', entryStageCode: 'preinicio', originType: 'nacimiento' });
    expect(created.status).toBe(201);
    const before = await inventoryTotals('2026-11-07');
    const payload = { destinationBarnId: 1, locationCode: 'galpon_a', lotCode: null, destinationStageCode: 'inicio', effectiveDate: '2026-11-07', reason: 'Cambio de etapa', operationKey: 'cambio-etapa-individual' };
    const response = await api('/api/animals/CAMBIO-ETAPA/transfer', { method: 'POST', body: JSON.stringify(payload) });
    expect(response.status, await response.clone().text()).toBe(201);
    const after = await inventoryTotals('2026-11-07');
    expect(after.summary.total.available).toBe(before.summary.total.available);
    const animal = await db.prepare("SELECT current_stage_code FROM animals WHERE code = 'CAMBIO-ETAPA'").first<{ current_stage_code: string }>();
    expect(animal?.current_stage_code).toBe('inicio');
    const history = await db.prepare("SELECT stage_code FROM animal_location_history WHERE animal_id = (SELECT id FROM animals WHERE code = 'CAMBIO-ETAPA') ORDER BY id").all<{stage_code:string}>();
    expect(history.results.map(row => row.stage_code)).toEqual(['preinicio', 'inicio']);
    const replay = await api('/api/animals/CAMBIO-ETAPA/transfer', { method: 'POST', body: JSON.stringify(payload) });
    expect(replay.status).toBe(200);
  });

  it('rechaza dos cambios concurrentes de etapa para la misma ficha', async () => {
    const created=await create({code:'ETAPA-CONCURRENTE',entryDate:'2026-11-06',entryStageCode:'preinicio',originType:'nacimiento',locationCode:'galpon_a',lotCode:'lote_engorde_a'});
    expect(created.status).toBe(201);
    const seed=await api('/api/inventory/movements',{method:'POST',body:JSON.stringify({movementType:'initial',effectiveDate:'2026-11-06',barnId:1,locationCode:'galpon_a',lotCode:'lote_engorde_a',stageCode:'preinicio',sex:'hembra',quantity:2,reason:'Saldo adicional concurrente',operationKey:'etapa-concurrente-saldo'})});
    expect(seed.status,await seed.clone().text()).toBe(201);
    const responses=await Promise.all(['inicio','engorde'].map((stage,index)=>api('/api/animals/ETAPA-CONCURRENTE/transfer',{method:'POST',body:JSON.stringify({destinationBarnId:1,locationCode:'galpon_a',lotCode:'lote_engorde_a',destinationStageCode:stage,effectiveDate:index===0?'2026-11-07':'2026-11-08',reason:'Cambio concurrente',operationKey:`etapa-concurrente-${index}`})})));
    expect(responses.map(response=>response.status).sort(),JSON.stringify(await Promise.all(responses.map(response=>response.clone().text())))).toEqual([201,409]);
    const count=await db.prepare("SELECT COUNT(DISTINCT operation_log_id) AS n FROM inventory_movements WHERE animal_id=(SELECT id FROM animals WHERE code='ETAPA-CONCURRENTE') AND movement_type='transfer_in'").first();
    expect(count).toMatchObject({n:1});
  });

  it('impide cambiar por grupo una cabeza que ya tiene ficha individual', async () => {
    const created = await create({ code: 'ETAPA-IDENTIFICADA', entryDate: '2026-11-06', entryStageCode: 'inicio', originType: 'nacimiento', locationCode: null, lotCode: 'lote_engorde_a' });
    expect(created.status).toBe(201);
    const response = await api('/api/inventory/transfers', { method: 'POST', body: JSON.stringify({ sourceBarnId: 1, destinationBarnId: 1, sourceLocationCode: null, sourceLotCode: 'lote_engorde_a', destinationLocationCode: null, destinationLotCode: 'lote_engorde_a', stageCode: 'inicio', destinationStageCode: 'engorde', sex: 'hembra', quantity: 1, effectiveDate: '2026-11-06', reason: 'Cambio grupal', operationKey: 'grupo-identificada' }) });
    expect(response.status, await response.clone().text()).toBe(409);
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
    const exitDetail=(await detail.json() as {animal:AnimalSummary & {exitCauseCode:string|null;exitCauseLabel:string|null}}).animal;
    expect(exitDetail).toMatchObject({status:'muerto',exitCauseCode:'enfermedad',exitCauseLabel:expect.any(String)});
    const linked = await db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE animal_id = (SELECT id FROM animals WHERE code = 'T10-EXIT-01') AND movement_type = 'death'").first<{ n: number }>();
    expect(linked?.n).toBe(1);
    const linkedHealth = await db.prepare("SELECT COUNT(*) AS n FROM health_events WHERE event_type='death' AND id=(SELECT health_event_id FROM inventory_movements WHERE animal_id=(SELECT id FROM animals WHERE code='T10-EXIT-01') AND movement_type='death')").first<{ n: number }>();
    expect(linkedHealth?.n).toBe(1);
  });

  it('conserva historial sanitario grupal, bloquea retiro y enlaza muerte en una sola baja', async () => {
    await create({ code: 'T17-SALUD-01', entryDate: '2026-11-05', entryStageCode: 'engorde', lotCode: 'lote_engorde_a', originType: 'nacimiento', operationKey: 'ani-t17-salud-01' });
    await create({ code: 'T17-SALUD-02', entryDate: '2026-11-05', entryStageCode: 'engorde', lotCode: 'lote_engorde_a', originType: 'nacimiento', operationKey: 'ani-t17-salud-02' });
    const healthPayload={eventType:'treatment',effectiveDate:'2026-11-06',animalCodes:['T17-SALUD-01','T17-SALUD-02'],product:'Tratamiento T17',productLot:'MED-LOTE-8',dosage:2.5,dosageUnit:'ml',nextDueDate:'2026-11-08',withdrawalUntil:'2026-11-06',reason:'Tratamiento respiratorio',observations:'Aplicación grupal',operationKey:'health-t17-group'};
    const response=await api('/api/health/events',{method:'POST',body:JSON.stringify(healthPayload)},veterinarioToken);expect(response.status).toBe(201);
    expect((await api('/api/health/events',{method:'POST',body:JSON.stringify(healthPayload)},veterinarioToken)).status).toBe(200);
    expect((await api('/api/health/events',{method:'POST',body:JSON.stringify({...healthPayload,operationKey:'health-t17-denied'})},operarioToken)).status).toBe(403);
    const history=await api('/api/health/events?animalCode=T17-SALUD-01&product=Tratamiento');const historyData=await history.json() as {events:{barnName:string;lotCode:string|null;productLot:string|null}[]};expect(historyData.events[0]).toMatchObject({barnName:'Galpón A',lotCode:'lote_engorde_a',productLot:'MED-LOTE-8'});
    const alerts=await api('/api/health/withdrawals?asOf=2026-11-06');const alertData=await alerts.json() as {alerts:{animalCode:string;withdrawalUntil:string}[]};expect(alertData.alerts.map(row=>row.animalCode)).toContain('T17-SALUD-01');
    const upcoming=await api('/api/health/upcoming?asOf=2026-11-07');const upcomingData=await upcoming.json() as {events:{animalCode:string;nextDueDate:string}[]};expect(upcomingData.events).toEqual(expect.arrayContaining([expect.objectContaining({animalCode:'T17-SALUD-01',nextDueDate:'2026-11-08'})]));
    const blockedSale=await api('/api/animals/T17-SALUD-01/exit',{method:'POST',body:JSON.stringify({exitType:'sale',causeCode:'edad',effectiveDate:'2026-11-06',reason:'Venta de prueba bloqueada',operationKey:'t17-blocked-sale'})});expect(blockedSale.status).toBe(409);
    const transfer=await api('/api/animals/T17-SALUD-01/transfer',{method:'POST',body:JSON.stringify({destinationBarnId:2,locationCode:null,lotCode:null,effectiveDate:'2026-11-07',reason:'Traslado posterior al tratamiento',operationKey:'t17-health-transfer'})});expect(transfer.status).toBe(201);
    const historyAfter=await api('/api/health/events?animalCode=T17-SALUD-01');const historyAfterData=await historyAfter.json() as {events:{barnName:string}[]};expect(historyAfterData.events[0].barnName).toBe('Galpón A');
    const stockBeforeSale=(await inventoryTotals('2026-11-07')).summary.total.available;
    const salePayload={exitType:'sale',causeCode:'edad',effectiveDate:'2026-11-07',saleAmount:'180.00',currencyCode:'PEN',counterparty:'Cliente prueba',documentReference:'VTA-T17-01',reason:'Venta posterior al retiro',operationKey:'t17-sale-after-withdrawal'};const saleAfterWithdrawal=await api('/api/animals/T17-SALUD-01/exit',{method:'POST',body:JSON.stringify(salePayload)});expect(saleAfterWithdrawal.status).toBe(201);
    const saleReplay=await api('/api/animals/T17-SALUD-01/exit',{method:'POST',body:JSON.stringify(salePayload)});expect(saleReplay.status).toBe(200);
    const saleFinance=await db.prepare("SELECT f.id,f.amount_minor,f.currency_code,f.source_type,m.id AS movement_id FROM financial_entries f JOIN operation_log o ON o.id=f.operation_log_id JOIN inventory_movements m ON m.operation_log_id=o.id WHERE f.source_type='animal_sale' AND f.source_id=(SELECT id FROM animals WHERE code='T17-SALUD-01')").first<{id:number;amount_minor:number;currency_code:string;source_type:string;movement_id:number}>();expect(saleFinance).toMatchObject({amount_minor:18000,currency_code:'PEN',source_type:'animal_sale'});expect(saleFinance?.movement_id).toBeTruthy();
    const saleReturn={effectiveDate:'2026-11-08',reason:'Cliente devuelve el animal',operationKey:'t20-sale-return'};expect((await api('/api/animals/T17-SALUD-01/sale-return',{method:'POST',body:JSON.stringify({...saleReturn,operationKey:'t20-sale-return-denied'})},operarioToken)).status).toBe(403);const returned=await api('/api/animals/T17-SALUD-01/sale-return',{method:'POST',body:JSON.stringify(saleReturn)});expect(returned.status,await returned.clone().text()).toBe(201);expect((await returned.json() as {animal:{status:string;exitDate:string|null}}).animal).toMatchObject({status:'activo',exitDate:null});expect((await api('/api/animals/T17-SALUD-01/sale-return',{method:'POST',body:JSON.stringify(saleReturn)})).status).toBe(200);expect((await inventoryTotals('2026-11-08')).summary.total.available).toBe(stockBeforeSale);
    expect(await db.prepare('SELECT reversed_at FROM financial_entries WHERE id=?').bind(saleFinance!.id).first()).toMatchObject({reversed_at:expect.any(String)});expect(await db.prepare('SELECT direction,amount_minor,reversal_of_id FROM financial_entries WHERE reversal_of_id=?').bind(saleFinance!.id).first()).toMatchObject({direction:'expense',amount_minor:18000,reversal_of_id:saleFinance!.id});
  },15000);

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

  it('limita el resumen reproductivo a los servicios del galpón autorizado en cada fecha', async () => {
    const sow=await create({code:'SOW-SCOPE-HISTORY',animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:'2026-01-01',entryStageCode:'gestacion',barnId:2,locationCode:null,originType:'compra'});
    expect(sow.status).toBe(201);
    const cycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'SOW-SCOPE-HISTORY',serviceDate:'2026-06-01',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'ORIGEN-PRIVADO-B',operationKey:'scope-history-cycle'})});
    expect(cycle.status,await cycle.clone().text()).toBe(201);
    const cycleId=(await cycle.json() as {createdCycleId:string}).createdCycleId;
    const transfer=await api('/api/animals/SOW-SCOPE-HISTORY/transfer',{method:'POST',body:JSON.stringify({destinationBarnId:1,locationCode:'galpon_a',lotCode:null,effectiveDate:'2026-07-01',reason:'Traslado entre galpones',operationKey:'scope-history-move'})});
    expect(transfer.status,await transfer.clone().text()).toBe(201);
    const repeat=await api(`/api/reproduction/cycles/${cycleId}/services`,{method:'POST',body:JSON.stringify({serviceDate:'2026-08-01',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'ORIGEN-VISIBLE-A',operationKey:'scope-history-repeat'})});
    expect(repeat.status,await repeat.clone().text()).toBe(201);
    const detail=await api('/api/animals/SOW-SCOPE-HISTORY',{},operarioToken);
    expect(detail.status).toBe(200);
    const body=await detail.text();expect(body).not.toContain('ORIGEN-PRIVADO-B');expect(body).toContain('ORIGEN-VISIBLE-A');
    expect((JSON.parse(body) as {animal:{reproductiveSummary:{serviceCount:number}}}).animal.reproductiveSummary.serviceCount).toBe(1);
  });

  it('registra parto en una sola operación, suma solo vivos e individualiza cabezas de la camada', async () => {
    const sowRes = await create({ code: 'T13-MADRE', animalType: 'cerda', sex: 'hembra', birthDate: '2024-01-01',
      entryDate: '2026-01-01', entryStageCode: 'gestacion', originType: 'compra', operationKey: 'ani-t13-sow' });
    expect(sowRes.status).toBe(201);
    const sow = (await sowRes.json() as { animal: { id: number } }).animal;
    const cycleRes = await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify({ femaleCode: 'T13-MADRE',
      serviceDate: '2026-05-25', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Genética T13', operationKey: 'rep-t13-cycle' }) });
    expect(cycleRes.status).toBe(201);
    const cycleId = (await cycleRes.json() as { createdCycleId: string }).createdCycleId;
    const before = (await inventoryTotals('2026-09-16')).summary.total.available;
    const farrowingBody = { farrowingDate: '2026-09-16', maleAlive: 5, femaleAlive: 3, unsexedAlive: 0,
      maleStillborn: 1, femaleStillborn: 0, unsexedStillborn: 0, averageWeightKg: 1.4, reason: 'Parto supervisado', operationKey: 'rep-t13-farrow' };
    const farrowRes = await api(`/api/reproduction/cycles/${cycleId}/farrowing`, { method: 'POST', body: JSON.stringify(farrowingBody) });
    expect(farrowRes.status, await farrowRes.clone().text()).toBe(201);
    const farrow = await farrowRes.json() as { litterId: string; liveCount: number; stillbornCount: number; totalBorn: number; mortalityPercent: number; expectedWeaningDate: string };
    expect(farrow).toMatchObject({ liveCount: 8, stillbornCount: 1, totalBorn: 9, mortalityPercent: expect.closeTo(11.111, 2), expectedWeaningDate: '2026-10-07' });
    const motherDetail=await api('/api/animals/T13-MADRE');
    expect((await motherDetail.json() as {animal:{reproductiveSummary:unknown}}).animal.reproductiveSummary).toMatchObject({serviceCount:1,farrowingCount:1,firstFarrowingDate:'2026-09-16',lastFarrowingDate:'2026-09-16',totalBorn:9,maleBorn:6,femaleBorn:3,unsexedBorn:0,averageBirthWeightKg:1.4,weighedBirths:8});
    const retry = await api(`/api/reproduction/cycles/${cycleId}/farrowing`, { method: 'POST', body: JSON.stringify(farrowingBody) });
    expect(retry.status, await retry.clone().text()).toBe(200);
    expect((await inventoryTotals('2026-09-16')).summary.total.available).toBe(before + 8);
    expect(await db.prepare('SELECT cycle_status FROM reproduction_cycles WHERE id=?').bind(cycleId).first()).toMatchObject({ cycle_status: 'farrowed' });
    for (const [code, sex] of [['T13-LECHON-H', 'hembra'], ['T13-LECHON-M', 'macho']] as const) {
      const response = await create({ code, animalType: 'lechon', sex, birthDate: '2026-09-16', entryDate: '2026-09-16',
        entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'interna', motherId: sow.id, litterId: farrow.litterId, operationKey: `${code}-alta` });
      expect(response.status, await response.clone().text()).toBe(201);
    }
    const litter = await db.prepare('SELECT COUNT(*) AS identified FROM animals WHERE litter_id=?').bind(farrow.litterId).first<{ identified: number }>();
    expect(litter?.identified).toBe(2);
    const balance = await inventoryTotals('2026-09-16');
    expect(balance.summary.total.available).toBe(before + 8);
    expect(balance.balances.reduce((sum, row) => sum + row.unidentified, 0)).toBeGreaterThanOrEqual(6);
    const extraFemale = await create({ code: 'T13-LECHON-H-EXTRA', animalType: 'lechon', sex: 'hembra', birthDate: '2026-09-16', entryDate: '2026-09-16',
      entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'interna', motherId: sow.id, litterId: farrow.litterId, operationKey: 'T13-LECHON-H-EXTRA-alta' });
    expect(extraFemale.status).toBe(201);
    const extraFemaleTwo = await create({ code: 'T13-LECHON-H-EXTRA-2', animalType: 'lechon', sex: 'hembra', birthDate: '2026-09-16', entryDate: '2026-09-16',
      entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'interna', motherId: sow.id, litterId: farrow.litterId, operationKey: 'T13-LECHON-H-EXTRA-2-alta' });
    expect(extraFemaleTwo.status).toBe(201);
    for (let index = 0; index < 4; index += 1) {
      const response = await create({ code: `T13-LECHON-M-EXTRA-${index}`, animalType: 'lechon', sex: 'macho', birthDate: '2026-09-16', entryDate: '2026-09-16',
        entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'interna', motherId: sow.id, litterId: farrow.litterId, operationKey: `T13-LECHON-M-EXTRA-${index}-alta` });
      expect(response.status).toBe(201);
    }
    const correction = await api(`/api/reproduction/litters/${farrow.litterId}/correction`, { method: 'POST', body: JSON.stringify({
      maleAlive: 4, femaleAlive: 3, unsexedAlive: 0, maleStillborn: 1, femaleStillborn: 0, unsexedStillborn: 0,
      reason: 'Conteo corregido luego de distribuir', operationKey: 'rep-t13-correction-down',
    }) });
    expect(correction.status, await correction.clone().text()).toBe(409);
    const overFemale = await create({ code: 'T13-LECHON-H-OVER', animalType: 'lechon', sex: 'hembra', birthDate: '2026-09-16', entryDate: '2026-09-16',
      entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'interna', motherId: sow.id, litterId: farrow.litterId, operationKey: 'T13-LECHON-H-OVER-alta' });
    expect(overFemale.status).toBe(409);

    const historicalSow = await create({ code: 'T13-ANT-HIST', animalType: 'cerda', sex: 'hembra', birthDate: '2024-01-01',
      entryDate: '2026-01-01', entryStageCode: 'gestacion', originType: 'compra', operationKey: 'ani-t13-hist-sow' });
    expect(historicalSow.status).toBe(201);
    const antecedentRes = await api('/api/reproduction/antecedents', { method: 'POST', body: JSON.stringify({ femaleCode: 'T13-ANT-HIST',
      serviceDate: '2026-10-01', dueDate: '2026-11-20', operationKey: 'rep-t13-hist-antecedent' }) });
    expect(antecedentRes.status).toBe(201);
    const antecedentCycle = (await antecedentRes.json() as { createdCycleId: string }).createdCycleId;
    const historicalBefore = (await inventoryTotals('2026-11-07')).summary.total.available;
    const historicalFarrow = await api(`/api/reproduction/cycles/${antecedentCycle}/farrowing`, { method: 'POST', body: JSON.stringify({
      farrowingDate: '2025-01-01', maleAlive: 2, femaleAlive: 1, maleStillborn: 1, reason: 'Antecedente histórico recibido', operationKey: 'rep-t13-hist-farrow',
    }) });
    expect(historicalFarrow.status, await historicalFarrow.clone().text()).toBe(201);
    expect((await historicalFarrow.json() as { historicalOnly: boolean })).toMatchObject({ historicalOnly: true });
    expect((await inventoryTotals('2026-11-07')).summary.total.available).toBe(historicalBefore);

    const correctionSow = await create({ code: 'T13-CORR-SOW', animalType: 'cerda', sex: 'hembra', birthDate: '2024-01-01',
      entryDate: '2026-01-01', entryStageCode: 'gestacion', originType: 'compra', operationKey: 'ani-t13-corr-sow' });
    expect(correctionSow.status).toBe(201);
    const correctionCycleRes = await api('/api/reproduction/cycles', { method: 'POST', body: JSON.stringify({ femaleCode: 'T13-CORR-SOW',
      serviceDate: '2026-09-01', serviceType: 'inseminacion_artificial', materialSource: 'external', externalSource: 'Prueba', operationKey: 'rep-t13-corr-cycle' }) });
    const correctionCycle = (await correctionCycleRes.json() as { createdCycleId: string }).createdCycleId;
    const correctionFarrowRes = await api(`/api/reproduction/cycles/${correctionCycle}/farrowing`, { method: 'POST', body: JSON.stringify({
      farrowingDate: '2026-10-10', maleAlive: 2, reason: 'Registro inicial para corregir', operationKey: 'rep-t13-corr-farrow',
    }) });
    const correctionLitter = (await correctionFarrowRes.json() as { litterId: string }).litterId;
    const correctionBefore = (await inventoryTotals('2026-11-08')).summary.total.available;
    const allowedCorrection = await api(`/api/reproduction/litters/${correctionLitter}/correction`, { method: 'POST', body: JSON.stringify({
      maleAlive: 1, reason: 'Conteo confirmado por supervisor', operationKey: 'rep-t13-corr-adjust',
    }) });
    expect(allowedCorrection.status, await allowedCorrection.clone().text()).toBe(201);
    expect((await inventoryTotals('2026-11-08')).summary.total.available).toBe(correctionBefore - 1);
    const correctionWithExpected={maleAlive:1,femaleAlive:0,unsexedAlive:0,maleStillborn:1,femaleStillborn:0,unsexedStillborn:0,expectedCounts:[1,0,0,0,0,0],reason:'Conteo de nacidos muertos',operationKey:'rep-t13-corr-expected'};
    expect((await api(`/api/reproduction/litters/${correctionLitter}/correction`,{method:'POST',body:JSON.stringify(correctionWithExpected)})).status).toBe(201);
    expect((await api(`/api/reproduction/litters/${correctionLitter}/correction`,{method:'POST',body:JSON.stringify(correctionWithExpected)})).status).toBe(200);
    expect((await api(`/api/reproduction/litters/${correctionLitter}/correction`,{method:'POST',body:JSON.stringify({...correctionWithExpected,maleStillborn:2,operationKey:'rep-t13-corr-stale'})})).status).toBe(409);
    await db.prepare(`INSERT INTO operation_log(id,operation_key,operation_type,author_user_id,entity_type,barn_id,content_hash,payload,result_payload,effective_date,recorded_at) SELECT 'rep-t13-legacy','rep-t13-legacy','reproduction.litter.correction',author_user_id,'litter',barn_id,'legacy','{}','{}','2026-11-01',recorded_at FROM operation_log WHERE operation_key='rep-t13-corr-adjust'`).run();
    await db.prepare(`INSERT INTO inventory_movements(operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,created_by_user_id,created_at,litter_id) SELECT 'rep-t13-legacy','adjustment','2026-11-01',barn_id,location_code,lot_code,'preinicio','macho',-1,'Corrección anterior',created_by_user_id,created_at,? FROM inventory_movements WHERE litter_id=? AND movement_type='birth' LIMIT 1`).bind(correctionLitter,correctionLitter).run();
    await db.prepare('UPDATE litters SET male_alive=0,live_count=0,total_born=stillborn_count WHERE id=?').bind(correctionLitter).run();
    const legacyCorrection=await api(`/api/reproduction/litters/${correctionLitter}/correction`,{method:'POST',body:JSON.stringify({maleAlive:1,reason:'Conciliar corrección anterior',operationKey:'rep-t13-legacy-reconcile'})});
    expect(legacyCorrection.status,await legacyCorrection.clone().text()).toBe(201);
    expect(await db.prepare("SELECT SUM(quantity) AS heads FROM inventory_movements WHERE litter_id=? AND sex='macho'").bind(correctionLitter).first()).toMatchObject({heads:1});
    const secondCycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T13-MADRE',serviceDate:'2026-09-20',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Segunda prueba',operationKey:'rep-t13-second-cycle'})});
    expect(secondCycle.status,await secondCycle.clone().text()).toBe(201);
    const secondId=(await secondCycle.json() as {createdCycleId:string}).createdCycleId;
    const secondFarrow=await api(`/api/reproduction/cycles/${secondId}/farrowing`,{method:'POST',body:JSON.stringify({farrowingDate:'2026-10-20',maleAlive:1,maleStillborn:9,averageWeightKg:2,reason:'Segundo parto de prueba',operationKey:'rep-t13-second-farrow'})});
    expect(secondFarrow.status,await secondFarrow.clone().text()).toBe(201);
    const summaryResponse=await api('/api/animals/T13-MADRE');
    expect((await summaryResponse.json() as {animal:{reproductiveSummary:unknown}}).animal.reproductiveSummary).toMatchObject({serviceCount:2,farrowingCount:2,totalBorn:19,maleBorn:16,femaleBorn:3,weighedBirths:9,averageBirthWeightKg:1.47,firstFarrowingDate:'2026-09-16',lastFarrowingDate:'2026-10-20'});
  }, 25000);

  it('registra descarte físico sin venta ni muerte y conserva la causa', async () => {
    expect((await create({code:'DESCARTE-01',entryDate:'2026-11-01',entryStageCode:'preinicio',originType:'nacimiento',operationKey:'discard-create'})).status).toBe(201);
    const before=(await inventoryTotals('2026-11-08')).summary.total;
    const payload={exitType:'discard',causeCode:'edad',effectiveDate:'2026-11-07',reason:'Salida por edad',operationKey:'discard-exit'};
    const discarded=await api('/api/animals/DESCARTE-01/exit',{method:'POST',body:JSON.stringify(payload)});
    expect(discarded.status,await discarded.clone().text()).toBe(201);
    expect((await discarded.json() as {animal:unknown}).animal).toMatchObject({status:'descartado',exitType:'discard',exitCauseCode:'edad'});
    expect((await api('/api/animals/DESCARTE-01/exit',{method:'POST',body:JSON.stringify(payload)})).status).toBe(200);
    const after=(await inventoryTotals('2026-11-08')).summary.total;expect(after.available).toBe(before.available-1);expect(after.mortalityPct).toBe(before.mortalityPct);expect(after.exits).toBe(before.exits+1);
    const discardedList=await api('/api/animals?status=descartado');expect((await discardedList.json() as {animals:{code:string}[]}).animals.some(animal=>animal.code==='DESCARTE-01')).toBe(true);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM financial_entries WHERE operation_log_id=(SELECT id FROM operation_log WHERE operation_key='discard-exit')").first()).toMatchObject({n:0});
    expect(await db.prepare("SELECT COUNT(*) AS n FROM health_events WHERE operation_log_id=(SELECT id FROM operation_log WHERE operation_key='discard-exit')").first()).toMatchObject({n:0});
  },25000);

  it('descuenta de la camada el descarte de un lechón identificado', async () => {
    expect((await create({code:'MADRE-DESCARTE',animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:'2026-01-01',entryStageCode:'gestacion',originType:'compra',operationKey:'discard-sow'})).status).toBe(201);
    const cycleResponse=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'MADRE-DESCARTE',serviceDate:'2026-06-01',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba',operationKey:'discard-cycle'})});
    const cycleId=(await cycleResponse.json() as {createdCycleId:string}).createdCycleId;
    const farrow=await api(`/api/reproduction/cycles/${cycleId}/farrowing`,{method:'POST',body:JSON.stringify({farrowingDate:'2026-10-20',maleAlive:2,reason:'Parto de prueba',operationKey:'discard-birth'})});
    const litterId=(await farrow.json() as {litterId:string}).litterId;
    const child=await create({code:'LECHON-DESCARTE',animalType:'lechon',sex:'macho',birthDate:'2026-10-20',entryDate:'2026-10-20',entryStageCode:'preinicio',originType:'interna',litterId,locationCode:'galpon_a',operationKey:'discard-child'});expect(child.status,await child.clone().text()).toBe(201);
    const soldChild=await create({code:'LECHON-DEVUELTO',animalType:'lechon',sex:'macho',birthDate:'2026-10-20',entryDate:'2026-10-20',entryStageCode:'preinicio',originType:'interna',litterId,locationCode:'galpon_a',operationKey:'discard-return-child'});expect(soldChild.status,await soldChild.clone().text()).toBe(201);
    const moved=await api('/api/animals/LECHON-DESCARTE/transfer',{method:'POST',body:JSON.stringify({destinationBarnId:2,effectiveDate:'2026-10-21',reason:'Cambio de galpón',operationKey:'discard-child-move'})});expect(moved.status,await moved.clone().text()).toBe(201);
    expect((await api('/api/animals/LECHON-DESCARTE/exit',{method:'POST',body:JSON.stringify({exitType:'discard',causeCode:'edad',effectiveDate:'2026-10-20',reason:'Descarte retroactivo incompatible',operationKey:'discard-child-stale'})})).status).toBe(409);
    const discarded=await api('/api/animals/LECHON-DESCARTE/exit',{method:'POST',body:JSON.stringify({exitType:'discard',causeCode:'edad',effectiveDate:'2026-10-22',reason:'Descarte de lechón identificado',operationKey:'discard-child-exit'})});expect(discarded.status,await discarded.clone().text()).toBe(201);
    expect(await db.prepare("SELECT event_type,quantity FROM litter_events WHERE litter_id=? AND operation_log_id=(SELECT id FROM operation_log WHERE operation_key='discard-child-exit')").bind(litterId).first()).toMatchObject({event_type:'discard',quantity:1});
    const list=await api('/api/reproduction/cycles?from=2026-06-01&to=2026-06-01&status=all');
    expect((await list.json() as {cycles:{id:string;litter:{maleAlive:number;identifiedAnimals:{code:string}[]}}[]}).cycles.find(item=>item.id===cycleId)?.litter).toMatchObject({maleAlive:1,identifiedAnimals:[{code:'LECHON-DEVUELTO'}]});
    const sale=await api('/api/animals/LECHON-DEVUELTO/exit',{method:'POST',body:JSON.stringify({exitType:'sale',causeCode:'edad',effectiveDate:'2026-10-22',saleAmount:'100',reason:'Venta de prueba',operationKey:'discard-child-sale'})});expect(sale.status,await sale.clone().text()).toBe(201);
    const returned=await api('/api/animals/LECHON-DEVUELTO/sale-return',{method:'POST',body:JSON.stringify({effectiveDate:'2026-10-23',reason:'Devolución de prueba',operationKey:'discard-child-return'})});expect(returned.status,await returned.clone().text()).toBe(201);
    expect((await (await api('/api/reproduction/cycles?from=2026-06-01&to=2026-06-01&status=all')).json() as {cycles:{id:string;litter:{maleAlive:number}}[]}).cycles.find(item=>item.id===cycleId)?.litter.maleAlive).toBe(1);
    const alerts=await api('/api/alerts?type=weaning');expect((await alerts.json() as {alerts:{animalCode:string;details:{remaining:number}}[]}).alerts).toEqual(expect.arrayContaining([expect.objectContaining({animalCode:'MADRE-DESCARTE',details:expect.objectContaining({remaining:1})})]));
  },25000);

  it('registra bajas y destete parcial por sexo y conserva los intervalos de celo del ciclo', async () => {
    const sow = await create({ code:'T14-MADRE',animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:'2026-01-01',entryStageCode:'gestacion',originType:'compra',operationKey:'ani-t14-sow' });
    expect(sow.status).toBe(201);
    const before = (await inventoryTotals('2026-11-08')).summary.total.available;
    const service = await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T14-MADRE',serviceDate:'2026-06-01',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba T14',operationKey:'rep-t14-cycle'})});
    expect(service.status).toBe(201);
    const cycleId=(await service.json() as {createdCycleId:string}).createdCycleId;
    const cycleList=await api('/api/reproduction/cycles?from=2026-06-01&to=2026-06-01&status=all');
    const cycle=(await cycleList.json() as {cycles:{id:string;litter:{id:string}|null}[]}).cycles.find((item)=>item.id===cycleId);
    expect(cycle?.litter).toBeNull();
    const planRes=await api(`/api/reproduction/cycles/${cycleId}/postweaning`,{method:'PUT',body:JSON.stringify({referenceWeaningDate:'2026-05-20',heatIntervalDays:5,firstRepeatIntervalDays:10,secondRepeatIntervalDays:20,reason:'Plan de repetición confirmado',operationKey:'rep-t14-plan'})});
    expect(planRes.status,await planRes.clone().text()).toBe(200);
    const planList=await api('/api/reproduction/cycles?from=2026-06-01&to=2026-06-01&status=all');
    const savedCycle=(await planList.json() as {cycles:{id:string;weaningPlan:{referenceWeaningDate:string;heatIntervalDays:number;firstRepeatIntervalDays:number;secondRepeatIntervalDays:number;expectedHeatDate:string;expectedFirstRepeatDate:string;expectedSecondRepeatDate:string}|null}[]}).cycles.find((item)=>item.id===cycleId);
    expect(savedCycle?.weaningPlan).toMatchObject({referenceWeaningDate:'2026-05-20',heatIntervalDays:5,firstRepeatIntervalDays:10,secondRepeatIntervalDays:20,expectedHeatDate:'2026-05-25',expectedFirstRepeatDate:'2026-06-04',expectedSecondRepeatDate:'2026-06-24'});
    const replayPlan=await api(`/api/reproduction/cycles/${cycleId}/postweaning`,{method:'PUT',body:JSON.stringify({referenceWeaningDate:'2026-05-20',heatIntervalDays:5,firstRepeatIntervalDays:10,secondRepeatIntervalDays:20,reason:'Plan de repetición confirmado',operationKey:'rep-t14-plan'})});
    expect(replayPlan.status).toBe(200);

    const farrow=await api(`/api/reproduction/cycles/${cycleId}/farrowing`,{method:'POST',body:JSON.stringify({farrowingDate:'2026-10-23',maleAlive:5,femaleAlive:3,reason:'Parto T14',operationKey:'rep-t14-farrow'})});
    expect(farrow.status,await farrow.clone().text()).toBe(201);
    const litterId=(await farrow.json() as {litterId:string}).litterId;
    const death=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'death',effectiveDate:'2026-10-23',sex:'macho',quantity:1,cause:'Debilidad neonatal',reason:'Baja observada en lactancia',operationKey:'rep-t14-death'})});
    expect(death.status,await death.clone().text()).toBe(201);
    const deathReplay=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'death',effectiveDate:'2026-10-23',sex:'macho',quantity:1,cause:'Debilidad neonatal',reason:'Baja observada en lactancia',operationKey:'rep-t14-death'})});
    expect(deathReplay.status).toBe(200);
    for(const [quantity,key] of [[6,'first'],[5,'second']] as const){const corrected=await api(`/api/reproduction/litters/${litterId}/correction`,{method:'POST',body:JSON.stringify({maleAlive:quantity,reason:'Corrección tras baja del mismo día',operationKey:`rep-t14-same-day-${key}`})});expect(corrected.status,await corrected.clone().text()).toBe(201);}
    const birthsReport=await api('/api/reports/births?motherCode=T14-MADRE');
    expect((await birthsReport.json() as {totals:unknown}).totals).toMatchObject({totalBorn:8,deaths:0,lactationDeaths:1,globalMortalityPct:0});
    const birthsAtFarrowing=await api('/api/reports/births?motherCode=T14-MADRE&to=2026-10-23');
    expect((await birthsAtFarrowing.json() as {totals:unknown}).totals).toMatchObject({totalBorn:8,deaths:0,lactationDeaths:1,globalMortalityPct:0});
    const savedReport=await api('/api/reports/preview',{method:'POST',body:JSON.stringify({source:'litters',name:'Camadas',purpose:'Consultar muertes al corte',from:'2026-10-23',to:'2026-10-23',columns:['motherCode','deaths','mortalityPct'],filters:{motherCode:'T14-MADRE'}})});
    expect(savedReport.status,await savedReport.clone().text()).toBe(200);
    expect((await savedReport.json() as {rows:unknown[]}).rows).toContainEqual({motherCode:'T14-MADRE',deaths:1,mortalityPct:12.5});
    const identified=await create({code:'T14-LECHONA',animalType:'lechon',sex:'hembra',birthDate:'2026-10-23',entryDate:'2026-10-23',entryStageCode:'preinicio',originType:'interna',litterId,locationCode:'galpon_a',operationKey:'rep-t14-identificada'});
    expect(identified.status,await identified.clone().text()).toBe(201);
    const listed=await api('/api/reproduction/cycles?from=2026-06-01&to=2026-06-01&status=all');
    const listedCycle=(await listed.json() as {cycles:{id:string;litter:{identifiedAnimals:{code:string;sex:string}[]}|null}[]}).cycles.find(item=>item.id===cycleId);
    expect(listedCycle?.litter?.identifiedAnimals).toContainEqual({code:'T14-LECHONA',sex:'hembra'});
    const missingSelection=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:'2026-10-30',sex:'hembra',quantity:3,weightKg:6.2,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete sin identificar',operationKey:'rep-t14-missing-selection'})});
    expect(missingSelection.status).toBe(409);
    const invalidStage=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:'2026-10-30',sex:'hembra',quantity:1,animalCodes:['T14-LECHONA'],weightKg:6.2,destinationStageCode:'preinicio',destinationBarnId:1,reason:'Destete etapa inválida',operationKey:'rep-t14-invalid-stage'})});
    expect(invalidStage.status).toBe(400);
    const invalidDeath=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'death',effectiveDate:'2026-10-30',sex:'hembra',quantity:3,cause:'Prueba',reason:'Baja sin seleccionar ficha',operationKey:'rep-t14-invalid-death'})});
    expect(invalidDeath.status).toBe(409);
    const beforeWeaning=(await inventoryTotals('2026-11-08')).summary.total;
    const femalePayload={eventType:'weaning',effectiveDate:'2026-10-30',sex:'hembra',quantity:2,animalCodes:['T14-LECHONA'],weightKg:6.2,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete parcial hembras',operationKey:'rep-t14-wean-f'};
    const femaleWean=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify(femalePayload)});
    expect(femaleWean.status,await femaleWean.clone().text()).toBe(201);
    expect(await db.prepare("SELECT current_stage_code,barn_id,location_code FROM animals WHERE code='T14-LECHONA'").first()).toMatchObject({current_stage_code:'inicio',barn_id:1,location_code:null});
    expect(await db.prepare("SELECT stage_code FROM animal_location_history WHERE animal_id=(SELECT id FROM animals WHERE code='T14-LECHONA') AND valid_until IS NULL").first()).toMatchObject({stage_code:'inicio'});
    expect(await db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE animal_id=(SELECT id FROM animals WHERE code='T14-LECHONA') AND operation_log_id=(SELECT id FROM operation_log WHERE operation_key='rep-t14-wean-f')").first()).toMatchObject({n:2});
    expect((await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify(femalePayload)})).status).toBe(200);
    const returned=await api('/api/animals/T14-LECHONA/transfer',{method:'POST',body:JSON.stringify({destinationBarnId:1,locationCode:'galpon_a',lotCode:null,destinationStageCode:'preinicio',effectiveDate:'2026-10-31',reason:'Traslado posterior',operationKey:'rep-t14-return-preinicio'})});
    expect(returned.status,await returned.clone().text()).toBe(201);
    const repeated=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({...femalePayload,effectiveDate:'2026-11-01',quantity:1,operationKey:'rep-t14-wean-again'})});
    expect(repeated.status).toBe(409);
    const maleWean=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:'2026-10-30',sex:'macho',quantity:4,weightKg:6.4,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete parcial machos',operationKey:'rep-t14-wean-m'})});
    expect(maleWean.status,await maleWean.clone().text()).toBe(201);
    const remaining=await api(`/api/reproduction/cycles?from=2026-06-01&to=2026-06-01&status=all`);
    const litter=(await remaining.json() as {cycles:{id:string;litter:{femaleAlive:number;maleAlive:number;unsexedAlive:number}|null}[]}).cycles.find((item)=>item.id===cycleId)?.litter;
    expect(litter).toMatchObject({femaleAlive:1,maleAlive:0,unsexedAlive:0});
    const finalInventory=await inventoryTotals('2026-11-08');
    expect(finalInventory.summary.total).toMatchObject({entries:beforeWeaning.entries,exits:beforeWeaning.exits,mortalityPct:beforeWeaning.mortalityPct});
    expect(finalInventory.summary.total.available).toBe(before+7);
    expect(finalInventory.balances.filter((row)=>row.stageCode==='inicio').reduce((sum,row)=>sum+row.heads,0)).toBeGreaterThanOrEqual(5);
    const unrelated=await api('/api/inventory/movements',{method:'POST',body:JSON.stringify({movementType:'initial',effectiveDate:'2026-10-23',barnId:1,locationCode:'galpon_a',lotCode:null,stageCode:'preinicio',sex:'macho',quantity:10,reason:'Otro grupo del galpón',operationKey:'rep-t14-unrelated'})});expect(unrelated.status,await unrelated.clone().text()).toBe(201);
    const unrelatedId=(await unrelated.json() as {movement:{id:number}}).movement.id;
    const preview=await api(`/api/inventory/corrections/preview?movementId=${unrelatedId}&correctedQuantity=9`);expect((await preview.json() as {preview:{allowed:boolean}}).preview.allowed).toBe(true);
    const litterBirth=await db.prepare("SELECT id FROM inventory_movements WHERE litter_id=? AND movement_type='birth' LIMIT 1").bind(litterId).first<{id:number}>();
    expect((await api(`/api/inventory/corrections/preview?movementId=${litterBirth!.id}&correctedQuantity=4`)).status).toBe(400);
    expect((await api('/api/inventory/corrections',{method:'POST',body:JSON.stringify({movementId:litterBirth!.id,correctedQuantity:4,reason:'Corregir desde inventario',operationKey:'rep-t14-invalid-inventory-correction'})})).status).toBe(400);
    const invalidCorrection=await api(`/api/reproduction/litters/${litterId}/correction`,{method:'POST',body:JSON.stringify({maleAlive:0,reason:'Corrección incompatible con destetes',operationKey:'rep-t14-invalid-correction'})});
    expect(invalidCorrection.status,await invalidCorrection.clone().text()).toBe(409);
    expect(await db.prepare('SELECT male_alive FROM litters WHERE id=?').bind(litterId).first()).toMatchObject({male_alive:5});
    const adoptSow=await create({code:'T14-ADOPT-MADRE',animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:'2026-01-01',entryStageCode:'gestacion',originType:'compra',operationKey:'ani-t14-adopt-sow'});
    expect(adoptSow.status).toBe(201);
    const adoptCycleRes=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T14-ADOPT-MADRE',serviceDate:'2026-06-02',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba adopción',operationKey:'rep-t14-adopt-cycle'})});
    const adoptCycle=(await adoptCycleRes.json() as {createdCycleId:string}).createdCycleId;
    const adoptFarrow=await api(`/api/reproduction/cycles/${adoptCycle}/farrowing`,{method:'POST',body:JSON.stringify({farrowingDate:'2026-10-24',femaleAlive:1,reason:'Camada destino',operationKey:'rep-t14-adopt-farrow'})});
    const adoptTargetLitter=(await adoptFarrow.json() as {litterId:string}).litterId;
    const inventoryBeforeAdoption=(await inventoryTotals('2026-11-08')).summary.total.available;
    const adopted=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'adoption',effectiveDate:'2026-11-01',sex:'hembra',quantity:1,destinationLitterId:adoptTargetLitter,reason:'Adopción por camada numerosa',operationKey:'rep-t14-adoption'})});
    expect(adopted.status,await adopted.clone().text()).toBe(201);
    expect((await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify(femalePayload)})).status).toBe(200);
    expect((await inventoryTotals('2026-11-08')).summary.total.available).toBe(inventoryBeforeAdoption);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM litter_events WHERE operation_log_id=(SELECT id FROM operation_log WHERE operation_key='rep-t14-adoption') AND event_type IN ('adoption_in','adoption_out')").first()).toMatchObject({n:2});
    const finalWeaning=await api(`/api/reproduction/litters/${adoptTargetLitter}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:'2026-11-04',sex:'hembra',quantity:2,weightKg:6.3,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete completo camada receptora',operationKey:'rep-t14-wean-final'})});
    expect(finalWeaning.status,await finalWeaning.clone().text()).toBe(201);
    const destinationCycleList=await api('/api/reproduction/cycles?from=2026-06-02&to=2026-06-02&status=all');
    const destinationCycle=(await destinationCycleList.json() as {cycles:{id:string;litter:{id:string;actualWeaningDate:string|null}|null}[]}).cycles.find((item)=>item.litter?.id===adoptTargetLitter);
    expect(destinationCycle?.litter?.actualWeaningDate).toBe('2026-11-04');
    const reopen=await api(`/api/reproduction/litters/${adoptTargetLitter}/correction`,{method:'POST',body:JSON.stringify({femaleAlive:2,reason:'Se verificó un nacimiento adicional',operationKey:'rep-t14-reopen'})});
    expect(reopen.status,await reopen.clone().text()).toBe(201);
    expect(await db.prepare('SELECT actual_weaning_date FROM litters WHERE id=?').bind(adoptTargetLitter).first()).toMatchObject({actual_weaning_date:null});
    const birthLedger=await db.prepare(`SELECT SUM(quantity) AS heads,MIN(effective_date) AS earliest,MAX(effective_date) AS latest FROM inventory_movements WHERE litter_id=? AND sex='hembra' AND operation_log_id=(SELECT id FROM operation_log WHERE operation_key='rep-t14-reopen')`).bind(adoptTargetLitter).first();
    expect(birthLedger).toMatchObject({heads:1,earliest:'2026-10-24',latest:'2026-10-24'});
    const rewean=await api(`/api/reproduction/litters/${adoptTargetLitter}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:'2026-11-05',sex:'hembra',quantity:1,weightKg:6.3,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete pendiente',operationKey:'rep-t14-rewean'})});
    expect(rewean.status,await rewean.clone().text()).toBe(201);
    expect(await db.prepare('SELECT actual_weaning_date FROM litters WHERE id=?').bind(adoptTargetLitter).first()).toMatchObject({actual_weaning_date:'2026-11-05'});
  },25000);

  it('registra pesajes fuera de orden cronológico, calcula ganancias, conserva ubicación y corrige sin borrar el original', async () => {
    const created = await create({ code: 'T11-PESO', entryDate: '2026-06-01', operationKey: 'ani-t11-alta-peso' });
    expect(created.status).toBe(201);
    const middle = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify({
      weighedOn: '2026-06-10', weighedTime: '09:00', weightKg: 40, operationKey: 'ani-t11-peso-40',
    }) });
    expect(middle.status).toBe(201);
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
    expect(detail.weights.map((weight) => [weight.weighedOn, weight.weightKg])).toEqual([
      ['2026-06-05', 38], ['2026-06-10', 40], ['2026-06-20', 44],
    ]);
    expect(detail.weights.find((weight) => weight.weighedOn === '2026-06-20')).toMatchObject({ gainKg: 4, gainDays: 10, lotCode: null });

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
    expect(await db.prepare('SELECT COUNT(*) AS n FROM animal_weights WHERE animal_id = ?').bind(detail.id).first<{ n: number }>()).toMatchObject({ n: 6 });

    const zero = await api('/api/animals/T11-PESO/weights', { method: 'POST', body: JSON.stringify({
      weighedOn: '2026-06-22', weighedTime: '12:00', weightKg: 0, operationKey: 'ani-t11-peso-cero',
    }) });
    expect(zero.status).toBe(400);
  });

  it('genera una vacuna por nacimiento, permite otra vacuna en el mismo día y conserva la aplicación al regenerar', async () => {
    const created=await create({code:'T18-002',animalType:'reemplazo',sex:'hembra',birthDate:'2026-06-06',entryDate:'2026-06-06',entryStageCode:'preinicio',originType:'compra',operationKey:'ani-t18-002'});
    expect(created.status,JSON.stringify(await created.clone().json())).toBe(201);
    const rule=await api('/api/vaccines/rules',{method:'POST',body:JSON.stringify({vaccineName:'Glasser',targetCategory:'reemplazo',baseEvent:'birth',offsetDays:60,effectiveFrom:'2026-06-06',reason:'Caso de aceptación T18',operationKey:'vax-t18-rule'})});
    expect(rule.status).toBe(201);
    const ruleBody=await rule.json() as {ruleKey:string};
    let agenda=await api('/api/vaccines/schedules?status=pending&from=2026-08-05&to=2026-08-05');
    let items=(await agenda.json() as {schedules:{id:number;animalCode:string;scheduledDate:string;status:string}[]}).schedules.filter(item=>item.animalCode==='T18-002');
    expect(items).toHaveLength(1);expect(items[0].scheduledDate).toBe('2026-08-05');
    const generated=await api('/api/vaccines/generate',{method:'POST',body:JSON.stringify({ruleKey:ruleBody.ruleKey})},veterinarioToken);expect(generated.status).toBe(200);
    const other=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'T18-002',vaccineName:'Otra vacuna',scheduledDate:'2026-08-05',reason:'Vacuna distinta',operationKey:'vax-t18-other'})},veterinarioToken);expect(other.status).toBe(201);
    const same=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'T18-002',vaccineName:'Otra vacuna',scheduledDate:'2026-08-05',reason:'Duplicado',operationKey:'vax-t18-other-duplicate'})},veterinarioToken);expect(same.status).toBe(409);
    const applied=await api(`/api/vaccines/schedules/${items[0].id}/apply`,{method:'POST',body:JSON.stringify({appliedDate:'2026-08-05',dosage:1,dosageUnit:'ml',reason:'Aplicación veterinaria',operationKey:'vax-t18-apply'})},veterinarioToken);expect(applied.status).toBe(201);
    const again=await api('/api/vaccines/generate',{method:'POST',body:JSON.stringify({ruleKey:ruleBody.ruleKey})},veterinarioToken);expect(again.status).toBe(200);
    agenda=await api('/api/vaccines/schedules?from=2026-08-05&to=2026-08-05');items=(await agenda.json() as {schedules:{id:number;animalCode:string;vaccineName:string;scheduledDate:string;status:string;appliedDate:string|null}[]}).schedules.filter(item=>item.animalCode==='T18-002'&&item.vaccineName==='Glasser');
    expect(items).toHaveLength(1);expect(items[0]).toMatchObject({scheduledDate:'2026-08-05',status:'applied',appliedDate:'2026-08-05'});

    const sowRule=await api('/api/vaccines/rules',{method:'POST',body:JSON.stringify({vaccineName:'Vacuna ciclo',targetCategory:'cerda_primeriza',baseEvent:'birth',offsetDays:60,effectiveFrom:'2026-06-06',reason:'Prueba de edición de ciclo',operationKey:'vax-t18-cycle-rule'})});expect(sowRule.status).toBe(201);
    const sow=await create({code:'T18-CERDA',animalType:'cerda',sex:'hembra',birthDate:'2026-06-06',entryDate:'2026-06-06',entryStageCode:'preinicio',originType:'compra',operationKey:'ani-t18-cycle-sow'});expect(sow.status).toBe(201);
    const cycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T18-CERDA',serviceDate:'2026-06-10',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Registro de prueba',operationKey:'rep-t18-cycle'})});expect(cycle.status).toBe(201);
    const cycleId=(await cycle.json() as {createdCycleId:string}).createdCycleId;
    const cycleEdit=await api(`/api/reproduction/cycles/${cycleId}`,{method:'PUT',body:JSON.stringify({observations:'Observación corregida 1',operationKey:'rep-t18-cycle-edit-1'})});expect(cycleEdit.status).toBe(200);
    const cycleEditAgain=await api(`/api/reproduction/cycles/${cycleId}`,{method:'PUT',body:JSON.stringify({observations:'Observación corregida 2',operationKey:'rep-t18-cycle-edit-2'})});expect(cycleEditAgain.status).toBe(200);
    const sowSchedule=await api('/api/vaccines/schedules?status=pending&from=2026-08-05&to=2026-08-05');const sowRows=(await sowSchedule.json() as {schedules:{animalCode:string}[]}).schedules.filter(row=>row.animalCode==='T18-CERDA');expect(sowRows).toHaveLength(1);
  },15000);

  it('permite retiro futuro y unidad elegida al aplicar una vacuna', async () => {
    const today=currentFarmDate();const tomorrow=new Date(`${today}T00:00:00.000Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+7);const future=tomorrow.toISOString().slice(0,10);
    const yesterday=new Date(`${today}T00:00:00.000Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);const past=yesterday.toISOString().slice(0,10);
    const created=await create({code:'VACUNA-RETIRO',animalType:'reemplazo',sex:'hembra',entryDate:past,originType:'nacimiento',operationKey:'vacuna-retiro-alta'});expect(created.status).toBe(201);
    const manual=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'VACUNA-RETIRO',vaccineName:'Vacuna retiro',scheduledDate:today,reason:'Programación de prueba',operationKey:'vacuna-retiro-manual'})},veterinarioToken);expect(manual.status).toBe(201);
    const id=(await manual.json() as {schedule:{id:number}}).schedule.id;
    const payload={appliedDate:today,dosage:1,dosageUnit:'dosis',withdrawalUntil:future,reason:'Aplicación con retiro',operationKey:'vacuna-retiro-aplicar'};
    const invalid=await api(`/api/vaccines/schedules/${id}/apply`,{method:'POST',body:JSON.stringify({...payload,withdrawalUntil:past,operationKey:'vacuna-retiro-invalido'})},veterinarioToken);expect(invalid.status).toBe(400);
    const applied=await api(`/api/vaccines/schedules/${id}/apply`,{method:'POST',body:JSON.stringify(payload)},veterinarioToken);expect(applied.status,await applied.clone().text()).toBe(201);
    expect((await api(`/api/vaccines/schedules/${id}/apply`,{method:'POST',body:JSON.stringify(payload)},veterinarioToken)).status).toBe(200);
    const history=await api('/api/health/events?animalCode=VACUNA-RETIRO');expect((await history.json() as {events:unknown[]}).events).toContainEqual(expect.objectContaining({dosageUnit:'dosis',withdrawalUntil:future}));
    const alerts=await api(`/api/health/withdrawals?asOf=${today}`);expect((await alerts.json() as {alerts:unknown[]}).alerts).toContainEqual(expect.objectContaining({animalCode:'VACUNA-RETIRO',withdrawalUntil:future}));
  });

  it('registra una sola aplicación cuando dos usuarios atienden la misma vacuna', async () => {
    const today=currentFarmDate();const created=await create({code:'VACUNA-CONCURRENTE',animalType:'reemplazo',sex:'hembra',entryDate:today,originType:'nacimiento',operationKey:'vacuna-concurrente-alta'});expect(created.status).toBe(201);
    const manual=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'VACUNA-CONCURRENTE',vaccineName:'Vacuna concurrente',scheduledDate:today,reason:'Programación de prueba',operationKey:'vacuna-concurrente-manual'})},veterinarioToken);expect(manual.status).toBe(201);
    const id=(await manual.json() as {schedule:{id:number}}).schedule.id;
    const responses=await Promise.all(['a','b'].map(key=>api(`/api/vaccines/schedules/${id}/apply`,{method:'POST',body:JSON.stringify({appliedDate:today,dosage:1,dosageUnit:'ml',reason:'Aplicación concurrente',operationKey:`vacuna-concurrente-${key}`})},veterinarioToken)));
    expect(responses.map(response=>response.status).sort(),JSON.stringify(await Promise.all(responses.map(response=>response.clone().text())))).toEqual([201,409]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM health_event_animals WHERE animal_code_snapshot='VACUNA-CONCURRENTE'").first()).toMatchObject({n:1});
  });

  it('rechaza una aplicación retrasada si otra ya confirmó la misma vacuna', async () => {
    const today=currentFarmDate();const created=await create({code:'VACUNA-CARRERA',animalType:'reemplazo',sex:'hembra',entryDate:today,originType:'nacimiento',operationKey:'vacuna-carrera-alta'});expect(created.status).toBe(201);
    const manual=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'VACUNA-CARRERA',vaccineName:'Vacuna carrera',scheduledDate:today,reason:'Programación de prueba',operationKey:'vacuna-carrera-manual'})},veterinarioToken);expect(manual.status).toBe(201);
    const id=(await manual.json() as {schedule:{id:number}}).schedule.id;
    const vet=await db.prepare("SELECT id FROM users WHERE username='veterinario.animales@granja.pe'").first<{id:number}>();
    let release!:()=>void;let observed!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const waiting=new Promise<void>(resolve=>{observed=resolve;});
    const delayed=new Proxy(db,{get(target,key){if(key==='batch')return async (...args:Parameters<D1Database['batch']>)=>{observed();await gate;return target.batch(...args);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as D1Database;
    const payload={appliedDate:today,dosage:1,dosageUnit:'ml',reason:'Aplicación en carrera'};
    const first=applyVaccineOccurrence(delayed,vet!.id,id,{...payload,operationKey:'vacuna-carrera-a'});
    await waiting;
    const second=await api(`/api/vaccines/schedules/${id}/apply`,{method:'POST',body:JSON.stringify({...payload,operationKey:'vacuna-carrera-b'})},veterinarioToken);
    expect(second.status,await second.clone().text()).toBe(201);
    release();await expect(first).rejects.toMatchObject({status:409});
    expect(await db.prepare("SELECT COUNT(*) AS n FROM health_event_animals WHERE animal_code_snapshot='VACUNA-CARRERA'").first()).toMatchObject({n:1});
  });

  it('devuelve el mismo evento al confirmar simultáneamente el mismo intento de vacuna', async () => {
    const today=currentFarmDate();const created=await create({code:'VACUNA-REPLAY-CARRERA',animalType:'reemplazo',sex:'hembra',entryDate:today,originType:'nacimiento',operationKey:'vacuna-replay-alta'});expect(created.status).toBe(201);
    const manual=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'VACUNA-REPLAY-CARRERA',vaccineName:'Vacuna replay',scheduledDate:today,reason:'Programación de prueba',operationKey:'vacuna-replay-manual'})},veterinarioToken);expect(manual.status).toBe(201);
    const id=(await manual.json() as {schedule:{id:number}}).schedule.id;const vet=await db.prepare("SELECT id FROM users WHERE username='veterinario.animales@granja.pe'").first<{id:number}>();
    let release!:()=>void;let observed!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const waiting=new Promise<void>(resolve=>{observed=resolve;});
    const delayed=new Proxy(db,{get(target,key){if(key==='batch')return async (...args:Parameters<D1Database['batch']>)=>{observed();await gate;return target.batch(...args);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as D1Database;
    const payload={appliedDate:today,dosage:1,dosageUnit:'ml',reason:'Aplicación repetida',operationKey:'vacuna-replay-misma'};
    const first=applyVaccineOccurrence(delayed,vet!.id,id,payload);await waiting;
    const second=await api(`/api/vaccines/schedules/${id}/apply`,{method:'POST',body:JSON.stringify(payload)},veterinarioToken);expect(second.status).toBe(201);
    const saved=await second.json() as {healthEventId:number};release();const replay=await first;
    expect(replay).toMatchObject({replayed:true,healthEventId:saved.healthEventId});
    expect(await db.prepare("SELECT COUNT(*) AS n FROM health_event_animals WHERE animal_code_snapshot='VACUNA-REPLAY-CARRERA'").first()).toMatchObject({n:1});
  });

  it('confirma dos vacunas diferentes aunque sus aplicaciones se crucen', async () => {
    const today=currentFarmDate();const created=await create({code:'VACUNAS-DISTINTAS',animalType:'reemplazo',sex:'hembra',entryDate:today,originType:'nacimiento',operationKey:'vacunas-distintas-alta'});expect(created.status).toBe(201);
    const ids:number[]=[];for(const label of ['A','B']){const res=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'VACUNAS-DISTINTAS',vaccineName:`Vacuna ${label}`,scheduledDate:today,reason:'Programación de prueba',operationKey:`vacunas-distintas-manual-${label}`})},veterinarioToken);expect(res.status).toBe(201);ids.push((await res.json() as {schedule:{id:number}}).schedule.id);}
    const vet=await db.prepare("SELECT id FROM users WHERE username='veterinario.animales@granja.pe'").first<{id:number}>();
    let release!:()=>void;let observed!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const waiting=new Promise<void>(resolve=>{observed=resolve;});
    const delayed=new Proxy(db,{get(target,key){if(key==='batch')return async (...args:Parameters<D1Database['batch']>)=>{observed();await gate;return target.batch(...args);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as D1Database;
    const payload={appliedDate:today,dosage:1,dosageUnit:'ml',reason:'Aplicaciones diferentes'};
    const first=applyVaccineOccurrence(delayed,vet!.id,ids[0],{...payload,operationKey:'vacunas-distintas-aplicar-a'});await waiting;
    const second=await api(`/api/vaccines/schedules/${ids[1]}/apply`,{method:'POST',body:JSON.stringify({...payload,operationKey:'vacunas-distintas-aplicar-b'})},veterinarioToken);expect(second.status,await second.clone().text()).toBe(201);
    const saved=await second.json() as {healthEventId:number};release();const other=await first;
    expect(other).toMatchObject({replayed:false});expect(other.healthEventId).not.toBe(saved.healthEventId);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM health_event_animals WHERE animal_code_snapshot='VACUNAS-DISTINTAS'").first()).toMatchObject({n:2});
  });

  it('registra finanzas con distribución exacta, monedas separadas y alcance por galpón', async () => {
    const payload={direction:'expense',category:'Alimento',concept:'Compra de prueba',operationDate:'2026-11-07',amount:'100.00',currencyCode:'PEN',counterparty:'Proveedor ficticio',reference:'FC-TEST-1',reason:'Prueba de distribución financiera',operationKey:'fin-t19-split',allocations:[{barnId:1,amount:'60.00',supplyCode:'ALIMENTO-1',quantity:20},{barnId:2,amount:'40.00',supplyCode:'ALIMENTO-1',quantity:10}]};
    const created=await api('/api/finance/entries',{method:'POST',body:JSON.stringify(payload)});expect(created.status,await created.clone().text()).toBe(201);
    const replay=await api('/api/finance/entries',{method:'POST',body:JSON.stringify(payload)});expect(replay.status).toBe(200);
    const invalid=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({...payload,operationKey:'fin-t19-invalid',allocations:[{barnId:1,amount:'60.00'},{barnId:2,amount:'39.99'}]})});expect(invalid.status).toBe(400);
    const general=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({...payload,amount:'5.00',currencyCode:'USD',concept:'Gasto general',operationKey:'fin-t19-general',allocations:[{barnId:null,amount:'5.00'}]})});expect(general.status).toBe(201);
    const forbidden=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({...payload,operationKey:'fin-t19-forbidden'})},operarioToken);expect(forbidden.status).toBe(403);
    const scoped=await api('/api/finance/entries?from=2026-11-01&to=2026-11-07',{},responsableToken);expect(scoped.status).toBe(200);const scopedData=await scoped.json() as {entries:{amountMinor:number;entryTotalMinor:number|null;barnName:string}[];totals:{currencyCode:string;amountMinor:number}[]};expect(scopedData.entries).toHaveLength(1);expect(scopedData.entries[0]).toMatchObject({amountMinor:6000,entryTotalMinor:null,barnName:'Galpón A'});expect(scopedData.totals).toEqual([{direction:'expense',currencyCode:'PEN',amountMinor:6000}]);
    const admin=await api('/api/finance/entries?from=2026-11-01&to=2026-11-07');expect(admin.status).toBe(200);const adminData=await admin.json() as {entries:{amountMinor:number;entryTotalMinor:number|null;barnName:string}[];totals:{currencyCode:string;amountMinor:number}[]};expect(adminData.entries).toHaveLength(4);expect(adminData.entries.filter(row=>row.entryTotalMinor===10000)).toHaveLength(2);expect(adminData.entries.some(row=>row.barnName==='General')).toBe(true);expect(adminData.totals.map(row=>row.currencyCode).sort()).toEqual(['PEN','PEN','USD']);
    const entryId=Number((await db.prepare("SELECT id FROM financial_entries WHERE operation_log_id=(SELECT id FROM operation_log WHERE operation_key='fin-t19-split')").first<{id:number}>())?.id);
    const reversalBody={effectiveDate:'2026-11-08',reason:'Corrección de prueba',operationKey:'fin-t20-reversal'};
    const reversal=await api(`/api/finance/entries/${entryId}/reverse`,{method:'POST',body:JSON.stringify(reversalBody)});expect(reversal.status,await reversal.clone().text()).toBe(201);
    const reversalRetry=await api(`/api/finance/entries/${entryId}/reverse`,{method:'POST',body:JSON.stringify(reversalBody)});expect(reversalRetry.status).toBe(200);
    expect(await db.prepare('SELECT reversed_at FROM financial_entries WHERE id=?').bind(entryId).first()).toMatchObject({reversed_at:expect.any(String)});
    expect(await db.prepare('SELECT COUNT(*) AS n FROM financial_entries WHERE reversal_of_id=?').bind(entryId).first()).toMatchObject({n:1});
  });

  it('separa una venta de sus cobros parciales y calcula caja por fecha de pago (CA31)', async () => {
    const openingBody={effectiveDate:'2025-12-31',currencyCode:'PEN',amount:'1500.00',reason:'Saldo inicial ficticio CA31',operationKey:'fin-ca31-opening'};const opening=await api('/api/finance/cash/opening',{method:'POST',body:JSON.stringify(openingBody)});expect(opening.status,await opening.clone().text()).toBe(201);expect((await api('/api/finance/cash/opening',{method:'POST',body:JSON.stringify(openingBody)})).status).toBe(200);const forbiddenOpening=await api('/api/finance/cash/opening',{method:'POST',body:JSON.stringify({...openingBody,operationKey:'fin-ca31-opening-forbidden'})},responsableToken);expect(forbiddenOpening.status).toBe(403);
    const sale=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({direction:'income',category:'Venta de animales',concept:'Venta a crédito CA31',operationDate:'2026-01-15',amount:'1000.00',currencyCode:'PEN',counterparty:'Cliente de prueba',reason:'Venta ficticia para comprobar abonos',operationKey:'fin-ca31-sale',allocations:[{barnId:1,amount:'1000.00'}]})});expect(sale.status,await sale.clone().text()).toBe(201);
    const entryId=Number((await sale.json() as {entry:{id:number}}).entry.id);const allocation=await db.prepare('SELECT id FROM financial_allocations WHERE entry_id=?').bind(entryId).first<{id:number}>();expect(allocation).toBeTruthy();
    const janBody={settlementDate:'2026-01-20',amount:'400.00',paymentMethod:'transferencia',reference:'COB-ENE',reason:'Primer abono recibido',operationKey:'fin-ca31-jan',allocations:[{allocationId:allocation!.id,amount:'400.00'}]};const jan=await api(`/api/finance/entries/${entryId}/settlements`,{method:'POST',body:JSON.stringify(janBody)});expect(jan.status,await jan.clone().text()).toBe(201);expect((await api(`/api/finance/entries/${entryId}/settlements`,{method:'POST',body:JSON.stringify(janBody)})).status).toBe(200);
    const feb=await api(`/api/finance/entries/${entryId}/settlements`,{method:'POST',body:JSON.stringify({settlementDate:'2026-02-04',amount:'600.00',paymentMethod:'efectivo',reason:'Saldo final recibido',operationKey:'fin-ca31-feb',allocations:[{allocationId:allocation!.id,amount:'600.00'}]})});expect(feb.status,await feb.clone().text()).toBe(201);
    const entries=await api('/api/finance/entries?from=2026-01-01&to=2026-01-31');const january=(await entries.json() as {entries:{id:number;amountMinor:number;settledMinor:number;outstandingMinor:number}[]}).entries.find(row=>row.id===entryId);expect(january).toMatchObject({amountMinor:100000,settledMinor:40000,outstandingMinor:60000});
    const janCash=await api('/api/finance/cashflow?from=2026-01-01&to=2026-01-31&currencyCode=PEN');const janCashData=await janCash.json() as {totals:{direction:string;currencyCode:string;amountMinor:number}[];cashBalances:{openingMinor:number;closingMinor:number;openingBalanceIsCalculated:boolean}[]};expect(janCashData.totals).toEqual([{direction:'income',currencyCode:'PEN',amountMinor:40000}]);expect(janCashData.cashBalances).toEqual([{currencyCode:'PEN',openingMinor:150000,receiptsMinor:40000,paymentsMinor:0,openingBalanceIsCalculated:false,closingMinor:190000}]);const januaryExport=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:{source:'cashflow',name:'Caja enero CA31',purpose:'Abonos de enero',from:'2026-01-01',to:'2026-01-31',barnId:1,columns:['settlementDate','direction','category','currency','amount'],filters:{currency:'PEN'}}})},responsableToken);expect(januaryExport.status,await januaryExport.clone().text()).toBe(200);const januaryExportData=await januaryExport.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number;expense:number;balance:number}>};expect(januaryExportData.rows).toHaveLength(1);expect(januaryExportData.rows[0]).toMatchObject({settlementDate:'2026-01-20',amount:400});expect(januaryExportData.moneyTotals.PEN).toMatchObject({income:400,expense:0,balance:400});
    const febCash=await api('/api/finance/cashflow?from=2026-02-01&to=2026-02-28&currencyCode=PEN');expect((await febCash.json() as {totals:{direction:string;currencyCode:string;amountMinor:number}[]}).totals).toEqual([{direction:'income',currencyCode:'PEN',amountMinor:60000}]);const februaryExport=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:{source:'cashflow',name:'Caja febrero CA31',purpose:'Abonos de febrero',from:'2026-02-01',to:'2026-02-28',barnId:1,columns:['settlementDate','direction','category','currency','amount'],filters:{currency:'PEN'}}})},responsableToken);expect(februaryExport.status,await februaryExport.clone().text()).toBe(200);const februaryExportData=await februaryExport.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number;expense:number;balance:number}>};expect(februaryExportData.rows).toHaveLength(1);expect(februaryExportData.rows[0]).toMatchObject({settlementDate:'2026-02-04',amount:600});expect(februaryExportData.moneyTotals.PEN).toMatchObject({income:600,expense:0,balance:600});
    const all=await api('/api/finance/entries?from=2026-01-01&to=2026-02-28');expect((await all.json() as {entries:{id:number}[]}).entries.filter(row=>row.id===entryId)).toHaveLength(1);
    const overpay=await api(`/api/finance/entries/${entryId}/settlements`,{method:'POST',body:JSON.stringify({settlementDate:'2026-02-05',amount:'1.00',paymentMethod:'efectivo',reason:'Intento de sobrepago',operationKey:'fin-ca31-overpay',allocations:[{allocationId:allocation!.id,amount:'1.00'}]})});expect(overpay.status).toBe(409);
    const denied=await api(`/api/finance/entries/${entryId}/settlements`,{method:'POST',body:JSON.stringify({settlementDate:'2026-02-05',amount:'1.00',paymentMethod:'efectivo',reason:'Permiso de operario',operationKey:'fin-ca31-denied',allocations:[{allocationId:allocation!.id,amount:'1.00'}]})},operarioToken);expect(denied.status).toBe(403);
    const concurrentEntry=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({direction:'income',category:'Venta de productos',concept:'Prueba concurrente de caja',operationDate:'2026-03-01',amount:'100.00',currencyCode:'PEN',reason:'Preparar prueba concurrente de abonos',operationKey:'fin-ca31-concurrent-entry',allocations:[{barnId:1,amount:'100.00'}]})});expect(concurrentEntry.status).toBe(201);const concurrentId=Number((await concurrentEntry.json() as {entry:{id:number}}).entry.id);const concurrentAllocation=await db.prepare('SELECT id FROM financial_allocations WHERE entry_id=?').bind(concurrentId).first<{id:number}>();const pay=(key:string)=>api(`/api/finance/entries/${concurrentId}/settlements`,{method:'POST',body:JSON.stringify({settlementDate:'2026-03-02',amount:'70.00',paymentMethod:'transferencia',reason:'Intento concurrente controlado',operationKey:key,allocations:[{allocationId:concurrentAllocation!.id,amount:'70.00'}]})});const concurrent=await Promise.all([pay('fin-ca31-concurrent-a'),pay('fin-ca31-concurrent-b')]);expect(concurrent.map(response=>response.status).sort()).toEqual([201,409]);expect(await db.prepare('SELECT SUM(amount_minor) AS amount FROM financial_settlement_allocations WHERE financial_allocation_id=?').bind(concurrentAllocation!.id).first()).toMatchObject({amount:7000});
  });

  it('genera una sola ocurrencia de vacuna y tratamiento, actualiza el contador y resuelve al aplicar (T22)', async () => {
    const today=currentFarmDate();const due=new Date(`${today}T00:00:00.000Z`);due.setUTCDate(due.getUTCDate()+7);const dueInSevenDays=due.toISOString().slice(0,10);const dueInEightDays=new Date(`${dueInSevenDays}T00:00:00.000Z`);dueInEightDays.setUTCDate(dueInEightDays.getUTCDate()+1);const futureDate=dueInEightDays.toISOString().slice(0,10);const dueInThreeDays=new Date(`${today}T00:00:00.000Z`);dueInThreeDays.setUTCDate(dueInThreeDays.getUTCDate()+3);const treatmentDate=dueInThreeDays.toISOString().slice(0,10);
    const animal=await create({code:'T22-AGENDA',animalType:'reemplazo',sex:'hembra',entryDate:today,originType:'nacimiento',operationKey:'ani-t22-agenda'});expect(animal.status,await animal.clone().text()).toBe(201);
    const vaccine=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'T22-AGENDA',vaccineName:'Vacuna T22',scheduledDate:dueInSevenDays,reason:'Prueba agenda T22',operationKey:'vax-t22-agenda'})},veterinarioToken);expect(vaccine.status,await vaccine.clone().text()).toBe(201);const vaccineId=Number((await vaccine.json() as {schedule:{id:number}}).schedule.id);
    const treatment=await api('/api/health/events',{method:'POST',body:JSON.stringify({eventType:'treatment',effectiveDate:today,animalCodes:['T22-AGENDA'],product:'Tratamiento T22',dosage:1,dosageUnit:'ml',nextDueDate:dueInSevenDays,reason:'Prueba tratamiento pendiente',operationKey:'health-t22-agenda'})},veterinarioToken);expect(treatment.status,await treatment.clone().text()).toBe(201);
    const first=await api('/api/alerts?type=vaccine&bucket=upcoming');expect(first.status).toBe(200);const vaccineAlerts=(await first.json() as {alerts:{key:string;dueDate:string;status:string}[];counts:Record<string,number>}).alerts;expect(vaccineAlerts).toHaveLength(1);expect(vaccineAlerts[0]).toMatchObject({key:`vaccine:${vaccineId}`,dueDate:dueInSevenDays,status:'pending'});
    const repeated=await api('/api/alerts?type=vaccine&bucket=upcoming');expect((await repeated.json() as {alerts:{key:string}[]}).alerts).toHaveLength(1);
    const rescheduled=await api(`/api/vaccines/schedules/${vaccineId}`,{method:'PATCH',body:JSON.stringify({scheduledDate:futureDate,reason:'Reprogramación T22',operationKey:'vax-t22-reschedule'})});expect(rescheduled.status,await rescheduled.clone().text()).toBe(200);
    const moved=await api(`/api/alerts?type=vaccine&bucket=future`);expect((await moved.json() as {alerts:{key:string}[]}).alerts).toContainEqual(expect.objectContaining({key:`vaccine:${vaccineId}`}));expect((await api('/api/alerts?type=vaccine&bucket=upcoming')).status).toBe(200);
    const todayReschedule=await api(`/api/vaccines/schedules/${vaccineId}`,{method:'PATCH',body:JSON.stringify({scheduledDate:today,reason:'Vacuna para hoy T22',operationKey:'vax-t22-reschedule-today'})});expect(todayReschedule.status).toBe(200);expect((await (await api('/api/alerts?type=vaccine&bucket=today')).json() as {alerts:{key:string}[]}).alerts).toContainEqual(expect.objectContaining({key:`vaccine:${vaccineId}`}));
    const tomorrow=new Date(`${today}T00:00:00.000Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const tomorrowDate=tomorrow.toISOString().slice(0,10);const tomorrowReschedule=await api(`/api/vaccines/schedules/${vaccineId}`,{method:'PATCH',body:JSON.stringify({scheduledDate:tomorrowDate,reason:'Vacuna para mañana T22',operationKey:'vax-t22-reschedule-tomorrow'})});expect(tomorrowReschedule.status).toBe(200);expect((await (await api('/api/alerts?type=vaccine&bucket=upcoming')).json() as {alerts:{key:string}[]}).alerts).toContainEqual(expect.objectContaining({key:`vaccine:${vaccineId}`}));
    const backToWeek=await api(`/api/vaccines/schedules/${vaccineId}`,{method:'PATCH',body:JSON.stringify({scheduledDate:dueInSevenDays,reason:'Fecha confirmada T22',operationKey:'vax-t22-reschedule-back'})});expect(backToWeek.status).toBe(200);expect((await api('/api/alerts?type=vaccine&bucket=upcoming')).status).toBe(200);
    const cancelCandidate=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'T22-AGENDA',vaccineName:'Vacuna cancelable T22',scheduledDate:dueInSevenDays,reason:'Prueba cancelar',operationKey:'vax-t22-cancel-create'})});expect(cancelCandidate.status).toBe(201);const cancelId=Number((await cancelCandidate.json() as {schedule:{id:number}}).schedule.id);
    const cancelled=await api(`/api/vaccines/schedules/${cancelId}`,{method:'PATCH',body:JSON.stringify({cancel:true,reason:'Dosis no indicada',operationKey:'vax-t22-cancel'})});expect(cancelled.status).toBe(200);const cancelledAlert=await api('/api/alerts?type=vaccine&status=resolved');expect((await cancelledAlert.json() as {alerts:{key:string;resolutionReason:string|null}[]}).alerts).toContainEqual(expect.objectContaining({key:`vaccine:${cancelId}`,resolutionReason:'Dosis no indicada'}));
    const yesterday=new Date(`${today}T00:00:00.000Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);const yesterdayDate=yesterday.toISOString().slice(0,10);const oldAnimal=await create({code:'T22-AGENDA-AYER',animalType:'reemplazo',sex:'hembra',birthDate:'2025-01-01',entryDate:yesterdayDate,entryStageCode:'preinicio',originType:'compra',operationKey:'ani-t22-yesterday'});expect(oldAnimal.status).toBe(201);
    const overdueVaccine=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'T22-AGENDA-AYER',vaccineName:'Vacuna vencida T22',scheduledDate:yesterdayDate,reason:'Prueba de fecha vencida',operationKey:'vax-t22-overdue'})});expect(overdueVaccine.status,await overdueVaccine.clone().text()).toBe(201);const overdueVaccineId=Number((await overdueVaccine.json() as {schedule:{id:number}}).schedule.id);expect((await (await api('/api/alerts?type=vaccine&bucket=overdue')).json() as {alerts:{key:string}[]}).alerts).toContainEqual(expect.objectContaining({key:`vaccine:${overdueVaccineId}`}));
    const treatmentAlerts=await api('/api/alerts?type=treatment&bucket=upcoming');expect((await treatmentAlerts.json() as {alerts:{title:string}[]}).alerts).toHaveLength(1);
    const nextTreatment=await api('/api/health/events',{method:'POST',body:JSON.stringify({eventType:'treatment',effectiveDate:today,animalCodes:['T22-AGENDA'],product:'Tratamiento T22',dosage:1,dosageUnit:'ml',nextDueDate:treatmentDate,reason:'Siguiente dosis T22',operationKey:'health-t22-next-dose'})},veterinarioToken);expect(nextTreatment.status).toBe(201);
    const nextTreatmentAlert=await api('/api/alerts?type=treatment&bucket=upcoming');const currentTreatment=(await nextTreatmentAlert.json() as {alerts:{sourceId:string;dueDate:string}[]}).alerts;expect(currentTreatment).toHaveLength(1);expect(currentTreatment[0]?.dueDate).toBe(treatmentDate);
    const schedules=await api('/api/vaccines/schedules?status=pending&from='+dueInSevenDays+'&to='+dueInSevenDays);const schedule=(await schedules.json() as {schedules:{id:number}[]}).schedules.find(item=>item.id===vaccineId);expect(schedule).toBeTruthy();
    const applied=await api(`/api/vaccines/schedules/${vaccineId}/apply`,{method:'POST',body:JSON.stringify({appliedDate:today,dosage:1,dosageUnit:'ml',reason:'Atendida para probar resolución',operationKey:'vax-t22-applied'})},veterinarioToken);expect(applied.status).toBe(201);
    const resolved=await api('/api/alerts?type=vaccine&status=resolved');expect((await resolved.json() as {alerts:{key:string;status:string;resolutionReason:string|null;linkedEventType:string|null;linkedEventId:string|null}[]}).alerts).toContainEqual(expect.objectContaining({key:`vaccine:${vaccineId}`,status:'resolved',resolutionReason:'Atendida para probar resolución',linkedEventType:'health_event',linkedEventId:expect.any(String)}));
    const manual=await api('/api/alerts/manual',{method:'POST',body:JSON.stringify({title:'Revisar bebedero',dueDate:today,barnId:1,reason:'Aviso manual de inspección',operationKey:'alert-t22-manual'})});expect(manual.status).toBe(201);const manualId=Number((await manual.json() as {alert:{id:number}}).alert.id);const attended=await api(`/api/alerts/${manualId}/attend`,{method:'POST',body:JSON.stringify({reason:'Inspección completada',linkedEventType:'maintenance',linkedEventId:'BE-1',operationKey:'alert-t22-attend'})});expect(attended.status).toBe(200);expect((await api('/api/alerts?type=manual')).status).toBe(200);
    const denied=await api('/api/alerts/manual',{method:'POST',body:JSON.stringify({title:'Alerta de otro galpón',dueDate:today,barnId:2,reason:'Prueba de separación',operationKey:'alert-t22-denied'})},responsableToken);expect(denied.status).toBe(403);
    const sow=await create({code:'T22-MADRE',animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:today,entryStageCode:'gestacion',originType:'compra',operationKey:'ani-t22-sow'});expect(sow.status).toBe(201);
    const farrowingCases:{offset:number;bucket:string;cycleId:string}[]=[];for(const offset of [-1,0,1,7,8]){const caseDate=new Date(`${today}T00:00:00.000Z`);caseDate.setUTCDate(caseDate.getUTCDate()+offset);const dueDate=caseDate.toISOString().slice(0,10);const code=`T22-FECHA-${offset<0?'M'+Math.abs(offset):'P'+offset}`;const caseSow=await create({code,animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:yesterdayDate,entryStageCode:'gestacion',originType:'compra',operationKey:`ani-${code}`});expect(caseSow.status).toBe(201);const caseCycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:code,serviceDate:yesterdayDate,serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba límites calendario',dueDate,dueDateReason:'Caso automatizado CA-21',operationKey:`rep-${code}`})});expect(caseCycle.status,await caseCycle.clone().text()).toBe(201);farrowingCases.push({offset,bucket:offset<0?'overdue':offset===0?'today':offset<=7?'upcoming':'future',cycleId:(await caseCycle.json() as {createdCycleId:string}).createdCycleId});}
    for(const group of ['overdue','today','upcoming','future']){const result=await api(`/api/alerts?type=farrowing&bucket=${group}`);const items=(await result.json() as {alerts:{sourceId:string}[]}).alerts;for(const item of farrowingCases.filter(test=>test.bucket===group))expect(items.filter(alert=>alert.sourceId===item.cycleId)).toHaveLength(1);}
    const farrowingCycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T22-MADRE',serviceDate:today,serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba agenda',dueDate:dueInSevenDays,dueDateReason:'Fecha de prueba de agenda',operationKey:'rep-t22-cycle'})});expect(farrowingCycle.status,await farrowingCycle.clone().text()).toBe(201);const cycleId=(await farrowingCycle.json() as {createdCycleId:string}).createdCycleId;
    const farrowingAlert=await api('/api/alerts?type=farrowing&bucket=upcoming');expect((await farrowingAlert.json() as {alerts:{sourceId:string;dueDate:string}[]}).alerts).toContainEqual(expect.objectContaining({sourceId:cycleId,dueDate:dueInSevenDays}));
    const farrowing=await api(`/api/reproduction/cycles/${cycleId}/farrowing`,{method:'POST',body:JSON.stringify({farrowingDate:today,maleAlive:5,femaleAlive:3,reason:'Parto realizado durante la prueba T22',operationKey:'rep-t22-farrow'})});expect(farrowing.status,await farrowing.clone().text()).toBe(201);const litterId=(await farrowing.json() as {litterId:string}).litterId;
    const resolvedFarrowing=await api('/api/alerts?type=farrowing&status=resolved');expect((await resolvedFarrowing.json() as {alerts:{sourceId:string;linkedEventType:string|null;linkedEventId:string|null}[]}).alerts).toContainEqual(expect.objectContaining({sourceId:cycleId,linkedEventType:'litter',linkedEventId:litterId}));
    await db.prepare('UPDATE litters SET expected_weaning_date=? WHERE id=?').bind(today,litterId).run();
    const weaningAlert=await api('/api/alerts?type=weaning&bucket=today');const weaningList=(await weaningAlert.json() as {alerts:{sourceId:string;details:{remaining:number}}[]}).alerts;expect(weaningList).toContainEqual(expect.objectContaining({sourceId:litterId,details:expect.objectContaining({remaining:8})}));
    const firstWeaning=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:today,sex:'macho',quantity:5,weightKg:6.2,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete parcial T22',operationKey:'rep-t22-wean-partial'})});expect(firstWeaning.status,await firstWeaning.clone().text()).toBe(201);
    const afterPartial=await api('/api/alerts?type=weaning&bucket=today');expect((await afterPartial.json() as {alerts:{details:{remaining:number}}[]}).alerts[0]?.details.remaining).toBe(3);
    const finalWeaning=await api(`/api/reproduction/litters/${litterId}/events`,{method:'POST',body:JSON.stringify({eventType:'weaning',effectiveDate:today,sex:'hembra',quantity:3,weightKg:6.3,destinationStageCode:'inicio',destinationBarnId:1,reason:'Destete completo T22',operationKey:'rep-t22-wean-final'})});expect(finalWeaning.status,await finalWeaning.clone().text()).toBe(201);
    expect((await api('/api/alerts?type=weaning&status=resolved')).status).toBe(200);
  },60000);

  it('reconcilia bajo peso, sugerencia de venta, retiro sanitario y notificación crítica (T23)',async()=>{
    const today=currentFarmDate();const withdrawalDate=new Date(`${today}T00:00:00.000Z`);withdrawalDate.setUTCDate(withdrawalDate.getUTCDate()+7);const withdrawalUntil=withdrawalDate.toISOString().slice(0,10);await db.prepare("UPDATE stage_versions SET initial_weight_kg=40 WHERE code='engorde' AND status='active'").run();
    const low=await create({code:'T23-BAJO',animalType:'lechon',sex:'macho',birthDate:'2025-01-01',entryDate:today,entryStageCode:'engorde',aptitude:'engorde',originType:'nacimiento',operationKey:'ani-t23-low'});expect(low.status).toBe(201);
    const weigh=async(code:string,weightKg:number,time:string,key:string)=>api(`/api/animals/${code}/weights`,{method:'POST',body:JSON.stringify({weighedOn:today,weighedTime:time,weightKg,reason:'Pesaje automatizado T23',operationKey:key})});
    expect((await weigh('T23-BAJO',39,'08:00','weight-t23-39')).status).toBe(201);const lowAlerts=await api('/api/alerts?type=low_weight');const lowRow=(await lowAlerts.json() as {alerts:{key:string;details:Record<string,unknown>}[]}).alerts.find(item=>item.details.animalCode==='T23-BAJO');expect(lowRow?.details).toMatchObject({measuredKg:39,minimumKg:40,differenceKg:1});
    const sale=await create({code:'T23-VENTA',animalType:'lechon',sex:'macho',birthDate:'2025-01-01',entryDate:today,entryStageCode:'engorde',aptitude:'engorde',originType:'nacimiento',operationKey:'ani-t23-sale'});expect(sale.status).toBe(201);expect((await weigh('T23-VENTA',100,'09:00','weight-t23-100')).status).toBe(201);
    const stockBefore=(await inventoryTotals(today)).summary.total.available;const saleAlerts=await api('/api/alerts?type=sale_suggestion');const candidate=(await saleAlerts.json() as {alerts:{animalCode:string;details:Record<string,unknown>}[]}).alerts.find(item=>item.animalCode==='T23-VENTA');expect(candidate?.details).toMatchObject({weightKg:100,targetKg:100,decisionRequired:true});expect((await inventoryTotals(today)).summary.total.available).toBe(stockBefore);
    const withdrawal=await api('/api/health/events',{method:'POST',body:JSON.stringify({eventType:'treatment',effectiveDate:today,animalCodes:['T23-VENTA'],product:'Retiro T23',dosage:1,dosageUnit:'ml',withdrawalUntil,reason:'Retiro preventivo T23',operationKey:'health-t23-withdrawal'})},veterinarioToken);expect(withdrawal.status).toBe(201);expect((await (await api('/api/alerts?type=sale_suggestion')).json() as {alerts:{animalCode:string}[]}).alerts.some(item=>item.animalCode==='T23-VENTA')).toBe(false);
    expect((await weigh('T23-BAJO',40,'10:00','weight-t23-40')).status).toBe(201);const cleared=await api('/api/alerts?type=low_weight&status=resolved');expect((await cleared.json() as {alerts:{animalCode:string;status:string}[]}).alerts.some(item=>item.animalCode==='T23-BAJO'&&item.status==='resolved')).toBe(true);
    const responsible=await db.prepare("SELECT id FROM users WHERE username='responsable.animales@granja.pe'").first<{id:number}>();await db.prepare('UPDATE barns SET responsable_id=? WHERE id=1').bind(responsible!.id).run();const rule=await api('/api/alerts/rules',{method:'PUT',body:JSON.stringify({alertType:'farrowing',overdueDays:0,isActive:true,roles:['responsable'],reason:'Escalar parto vencido T23'})});expect(rule.status,await rule.clone().text()).toBe(200);
    const old=new Date(`${today}T00:00:00.000Z`);old.setUTCDate(old.getUTCDate()-1);const dueYesterday=old.toISOString().slice(0,10);const sow=await create({code:'T23-PARTO-CRITICO',animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:dueYesterday,entryStageCode:'gestacion',originType:'nacimiento',operationKey:'ani-t23-critical-sow'});expect(sow.status).toBe(201);const cycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T23-PARTO-CRITICO',serviceDate:dueYesterday,serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Escenario CA26',dueDate:dueYesterday,dueDateReason:'Atraso intencional CA26',operationKey:'rep-t23-critical'})});expect(cycle.status).toBe(201);const cycleId=(await cycle.json() as {createdCycleId:string}).createdCycleId;
    const criticalList=await api('/api/alerts?type=farrowing&bucket=overdue');const criticalAlert=(await criticalList.json() as {alerts:{id:number;sourceId:string;priority:string;details:Record<string,unknown>;eventLink:string}[]}).alerts.find(item=>item.sourceId===cycleId);expect(criticalAlert?.priority).toBe('critical');expect(criticalAlert?.details).toMatchObject({criticalRuleId:expect.any(Number),criticalThresholdDays:0,criticalAgeDays:1,responsibleName:'Responsable de Galpón A'});expect(criticalAlert?.eventLink).toContain('/reproduccion?cycleId=');const history=(await api(`/api/alerts/${criticalAlert!.id}/notifications`,{},responsableToken)).json() as Promise<{notifications:{userName:string;role:string;transition:string;notifiedAt:string}[]}>;expect((await history).notifications).toContainEqual(expect.objectContaining({userName:'Responsable de Galpón A',role:'responsable',transition:'critical',notifiedAt:expect.any(String)}));expect((await api(`/api/alerts/${criticalAlert!.id}/notifications`,{},operarioGalponBToken)).status).toBe(403);await db.batch([db.prepare('DELETE FROM alert_notifications WHERE alert_occurrence_id=?').bind(criticalAlert!.id),db.prepare('DELETE FROM alert_escalations WHERE alert_occurrence_id=?').bind(criticalAlert!.id),db.prepare('UPDATE alert_occurrences SET notification_created_at=NULL,notification_bucket=NULL,critical_notified_at=NULL WHERE id=?').bind(criticalAlert!.id)]);await worker.scheduled({} as ScheduledController,{DB:db} as never);
    const notifications=await api('/api/notifications?unread=1',{},responsableToken);const items=(await notifications.json() as {notifications:{id:number;alertId:number;transition:string;priority:string;actionUrl:string}[]}).notifications;const criticalNotification=items.find(item=>item.alertId===criticalAlert!.id&&item.transition==='critical');expect(criticalNotification?.priority).toBe('critical');expect(criticalNotification?.actionUrl).toBe(`/alertas?alertId=${criticalAlert!.id}`);const sameNotifications=await api('/api/notifications?unread=1',{},responsableToken);expect((await sameNotifications.json() as {notifications:{id:number}[]}).notifications.filter(item=>item.id===criticalNotification!.id)).toHaveLength(1);const otherBarnNotifications=await api('/api/notifications?unread=1',{},operarioGalponBToken);expect((await otherBarnNotifications.json() as {notifications:{alertId:number}[]}).notifications.some(item=>item.alertId===criticalAlert!.id)).toBe(false);
    expect((await api(`/api/notifications/${criticalNotification!.id}/read`,{method:'POST'},operarioToken)).status).toBe(404);expect((await api(`/api/notifications/${criticalNotification!.id}/read`,{method:'POST'},responsableToken)).status).toBe(200);const stillPending=await api(`/api/alerts?type=farrowing&status=pending`);expect((await stillPending.json() as {alerts:{id:number;status:string;priority:string}[]}).alerts).toContainEqual(expect.objectContaining({id:criticalAlert!.id,status:'pending',priority:'critical'}));
  },40000);

  it('define fuentes autorizadas y calcula reportes de pesajes y nacimientos (T24)',async()=>{
    const today=currentFarmDate();await db.prepare("INSERT INTO lot_versions(code,name,stage_code,effective_from,created_at) VALUES('T24-LOTE','Lote T24',NULL,'2026-01-01',?)").bind(new Date().toISOString()).run();const weigh=async(code:string,weightKg:number,key:string)=>api(`/api/animals/${code}/weights`,{method:'POST',body:JSON.stringify({weighedOn:today,weighedTime:'09:00',weightKg,reason:'Pesaje de reporte T24',operationKey:key})});
    for(const [code,weight,key,lot] of [['T24-PESO-1',10,'weight-t24-a','T24-LOTE'],['T24-PESO-2',20,'weight-t24-b','T24-LOTE']] as const){const created=await create({code,animalType:'lechon',sex:'macho',entryDate:today,entryStageCode:'engorde',locationCode:'corral_maternidad',lotCode:lot,originType:'nacimiento',operationKey:`ani-${code}`});expect(created.status,await created.clone().text()).toBe(201);expect((await weigh(code,weight,key)).status).toBe(201);}
    const weightReport=await api(`/api/reports/weights?from=${today}&to=${today}&locationCode=corral_maternidad&lotCode=T24-LOTE`,{},responsableToken);expect(weightReport.status,await weightReport.clone().text()).toBe(200);const weightData=await weightReport.json() as {total:{observations:number;averageKg:number|null};rows:{date:string;observations:number;averageKg:number}[];chart:{date:string}[]};expect(weightData.total).toMatchObject({observations:2,averageKg:15});expect(weightData.rows).toHaveLength(1);expect(weightData.rows[0]).toMatchObject({date:today,observations:2,averageKg:15});expect(weightData.chart).toEqual(weightData.rows);
    expect((await api('/api/reports/weights?fields=counterparty',{},operarioToken)).status).toBe(400);expect((await api('/api/reports/weights?barnId=2',{},responsableToken)).status).toBe(403);const emptyWeights=await api('/api/reports/weights?from=2020-01-01&to=2020-01-02');const emptyWeightData=await emptyWeights.json() as {total:{observations:number;averageKg:number|null};rows:unknown[]};expect(emptyWeightData.total).toMatchObject({observations:0,averageKg:null});expect(emptyWeightData.rows).toHaveLength(0);
    const offsetDate=(days:number)=>{const date=new Date(`${today}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};const serviceDate=offsetDate(-40);const farrowingDates=[offsetDate(-6),offsetDate(-5)];
    for(const [index,totalBorn] of [10,20].entries()){const motherCode=`T24-MADRE-${index+1}`;const sow=await create({code:motherCode,animalType:'cerda',sex:'hembra',birthDate:'2024-01-01',entryDate:serviceDate,entryStageCode:'gestacion',locationCode:'corral_maternidad',lotCode:'T24-LOTE',originType:'nacimiento',operationKey:`ani-${motherCode}`});expect(sow.status).toBe(201);const service=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:motherCode,serviceDate,serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Caso T24',operationKey:`rep-${motherCode}`})});expect(service.status,await service.clone().text()).toBe(201);const cycleId=(await service.json() as {createdCycleId:string}).createdCycleId;const farrow=await api(`/api/reproduction/cycles/${cycleId}/farrowing`,{method:'POST',body:JSON.stringify({farrowingDate:farrowingDates[index],femaleAlive:totalBorn-1,femaleStillborn:1,reason:'Camada de aceptación T24',operationKey:`farrow-${motherCode}`})});expect(farrow.status,await farrow.clone().text()).toBe(201);}
    const births=await api(`/api/reports/births?from=${farrowingDates[0]}&to=${today}&locationCode=corral_maternidad&lotCode=T24-LOTE`,{},responsableToken);expect(births.status,await births.clone().text()).toBe(200);const birthData=await births.json() as {totals:{litters:number;liveBirths:number;totalBorn:number;deaths:number;averageMortalityPct:number|null;globalMortalityPct:number|null};rows:{motherCode:string;mortalityPct:number}[];chart:{farrowingDate:string}[]};expect(birthData.totals).toMatchObject({litters:2,liveBirths:28,totalBorn:30,deaths:2,averageMortalityPct:7.5,globalMortalityPct:100*2/30});expect(birthData.rows.map(row=>row.mortalityPct)).toEqual([10,5]);expect(birthData.chart).toHaveLength(2);const oneMother=await api(`/api/reports/births?motherCode=T24-MADRE-1&from=${farrowingDates[0]}&to=${today}`,{},responsableToken);expect((await oneMother.json() as {totals:{litters:number;deaths:number;totalBorn:number}}).totals).toMatchObject({litters:1,deaths:1,totalBorn:10});expect((await api('/api/reports/births?barnId=2',{},responsableToken)).status).toBe(403);
    const adminCatalog=await api('/api/reports/catalog');const adminSources=(await adminCatalog.json() as {sources:{id:string;fields:{key:string}[]}[]}).sources;expect(adminSources.map(source=>source.id)).toContain('staff');expect(adminSources.map(source=>source.id)).toContain('finance');const operatorCatalog=await api('/api/reports/catalog',{},operarioToken);const operatorSources=(await operatorCatalog.json() as {sources:{id:string;fields:{key:string}[]}[]}).sources;expect(operatorSources.map(source=>source.id)).not.toContain('staff');expect(operatorSources.find(source=>source.id==='finance')?.fields.map(item=>item.key)).not.toContain('amount');
  },30000);

  it('enlaza compra de animal con su única entrada y movimiento de inventario', async () => {
    const purchase={code:'T20-COMPRA',animalType:'lechon',sex:'macho',birthDate:'2026-10-01',entryDate:'2026-11-06',entryStageCode:'preinicio',originType:'compra',purchaseAmount:'500.00',purchaseCurrencyCode:'PEN',purchaseCounterparty:'Proveedor porcino',purchaseDocumentReference:'FC-COMPRA-20',reason:'Compra para prueba integrada',operationKey:'ani-t20-purchase'};
    const first=await create(purchase);expect(first.status).toBe(201);const retry=await create(purchase);expect(retry.status).toBe(200);
    const linked=await db.prepare("SELECT f.id,f.amount_minor,f.currency_code,f.source_type,f.source_id,m.id AS movement_id,m.movement_type FROM financial_entries f JOIN operation_log o ON o.id=f.operation_log_id JOIN inventory_movements m ON m.operation_log_id=o.id WHERE f.source_type='animal_purchase' AND f.source_id=(SELECT id FROM animals WHERE code='T20-COMPRA')").first<{id:number;amount_minor:number;currency_code:string;source_type:string;source_id:string;movement_id:number;movement_type:string}>();expect(linked).toMatchObject({amount_minor:50000,currency_code:'PEN',source_type:'animal_purchase',movement_type:'purchase'});expect(linked?.movement_id).toBeTruthy();expect(await db.prepare("SELECT COUNT(*) AS count FROM financial_entries WHERE source_type='animal_purchase' AND source_id=(SELECT id FROM animals WHERE code='T20-COMPRA')").first<{count:number}>()).toMatchObject({count:1});
    const sourceOnlyReverse=await api(`/api/finance/entries/${linked!.id}/reverse`,{method:'POST',body:JSON.stringify({effectiveDate:'2026-11-08',reason:'Prueba rechazo',operationKey:'fin-t20-linked-reverse'})});expect(sourceOnlyReverse.status).toBe(409);
    const beforeReturn=(await inventoryTotals('2026-11-08')).summary.total.available;
    const returnBody={exitType:'sale',purchaseReturn:true,causeCode:'otro',effectiveDate:'2026-11-08',reason:'Devolución de la compra al proveedor',operationKey:'ani-t20-purchase-return'};
    const returned=await api('/api/animals/T20-COMPRA/exit',{method:'POST',body:JSON.stringify(returnBody)});expect(returned.status,await returned.clone().text()).toBe(201);
    expect((await returned.json() as {animal:{status:string;exitType:string}}).animal).toMatchObject({status:'vendido',exitType:'sale'});
    expect((await api('/api/animals/T20-COMPRA/exit',{method:'POST',body:JSON.stringify(returnBody)})).status).toBe(200);
    expect((await inventoryTotals('2026-11-08')).summary.total.available).toBe(beforeReturn-1);
    expect(await db.prepare('SELECT reversed_at FROM financial_entries WHERE id=?').bind(linked!.id).first()).toMatchObject({reversed_at:expect.any(String)});
    expect(await db.prepare('SELECT direction,amount_minor,reversal_of_id FROM financial_entries WHERE reversal_of_id=?').bind(linked!.id).first()).toMatchObject({direction:'income',amount_minor:50000,reversal_of_id:linked!.id});
  });

  it('genera, guarda y revalida reportes por perfil y galpón (T25)',async()=>{
    const today=currentFarmDate();
    await db.prepare("INSERT OR IGNORE INTO lot_versions(code,name,stage_code,effective_from,created_at) VALUES('T25-LOTE-A','Lote T25',NULL,'2026-01-01',?)").bind(new Date().toISOString()).run();
    const catalog=await api('/api/reports/catalog',{},responsableToken);expect(catalog.status).toBe(200);const catalogData=await catalog.json() as {sources:{id:string;availableForBuilder:boolean}[]};expect(catalogData.sources.find(s=>s.id==='vaccines')?.availableForBuilder).toBe(true);const adminCatalog=await api('/api/reports/catalog');const adminSources=(await adminCatalog.json() as {sources:{id:string;availableForBuilder:boolean}[]}).sources;expect(adminSources.filter(s=>s.availableForBuilder).map(s=>s.id).sort()).toEqual(['alerts','animals','barns','cashflow','economics','feeding','finance','health','inventory','litters','movements','overview','reproduction','staff','supplies','trade','vaccines','weights']);const sampleColumns:Record<string,string>={animals:'animalCode',barns:'barn',inventory:'heads',movements:'heads',weights:'weightKg',reproduction:'eventDate',litters:'totalBorn',feeding:'quantityKg',health:'effectiveDate',vaccines:'scheduledDate',alerts:'dueDate',trade:'operationDate',supplies:'quantity',finance:'amount',cashflow:'amount',economics:'sales',overview:'vaccineCount',staff:'username'};for(const source of adminSources.filter(s=>s.availableForBuilder)){const response=await api('/api/reports/preview',{method:'POST',body:JSON.stringify({source:source.id,name:'Smoke de fuente',purpose:'Verificar fuente',from:today,to:today,columns:[sampleColumns[source.id]]})});expect(response.status,`${source.id}: ${await response.clone().text()}`).toBe(200);}
    const animal=await create({code:'T25-ANIMAL-A',animalType:'lechon',sex:'macho',birthDate:'2026-01-01',entryDate:today,entryStageCode:'inicio',lotCode:'T25-LOTE-A',originType:'compra',operationKey:'ani-t25-a'});expect(animal.status,await animal.clone().text()).toBe(201);const weigh=await api('/api/animals/T25-ANIMAL-A/weights',{method:'POST',body:JSON.stringify({weighedOn:today,weighedTime:'09:00',weightKg:22.5,reason:'Peso para informe T25',operationKey:'weight-t25-a'})});expect(weigh.status,await weigh.clone().text()).toBe(201);
    const definition={source:'animals',name:'Animales por lote',purpose:'Listar animales y su galpón',from:today,to:today,columns:['animalCode','lot','barn','currentWeightKg'],groupBy:'lot',orderBy:'animalCode',orderDirection:'asc',filters:{lot:'T25-LOTE-A'}};
    const preview=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(definition)},responsableToken);expect(preview.status,await preview.clone().text()).toBe(200);const result=await preview.json() as {rowCount:number;rows:Record<string,unknown>[];groups:Record<string,{count:number}>};expect(result.rowCount).toBe(1);expect(result.rows[0]).toMatchObject({animalCode:'T25-ANIMAL-A',lot:'T25-LOTE-A',barn:expect.any(String),currentWeightKg:22.5});expect(result.groups['T25-LOTE-A']?.count).toBe(1);
    const secondAnimal=await create({code:'T25-ANIMAL-B',animalType:'lechon',sex:'hembra',entryDate:today,entryStageCode:'inicio',lotCode:'T25-LOTE-A',originType:'nacimiento',operationKey:'ani-t25-b'});expect(secondAnimal.status).toBe(201);const refreshed=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(definition)},responsableToken);expect((await refreshed.json() as {rowCount:number}).rowCount).toBe(2);
    const userId=Number((await db.prepare("SELECT id FROM users WHERE role='responsable' LIMIT 1").first<{id:number}>())?.id);await db.prepare("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<501) INSERT INTO animals(code,animal_type,sex,status,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,lot_code,is_active,created_by_user_id,created_at,updated_at) SELECT 'T26-EXPORT-'||printf('%03d',n),'lechon','pendiente','activo','inicial',?,'inicio','inicio',1,'T25-LOTE-A',1,?,?,? FROM seq").bind(today,userId,new Date().toISOString(),new Date().toISOString()).run();
    const limited=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(definition)},responsableToken);const limitedData=await limited.json() as {rowCount:number;truncated:boolean};expect(limitedData).toMatchObject({rowCount:500,truncated:true});const full=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition})},responsableToken);expect(full.status,await full.clone().text()).toBe(200);const fullData=await full.json() as {rowCount:number;truncated:boolean;rows:Record<string,unknown>[]};expect(fullData).toMatchObject({rowCount:503,truncated:false});expect(fullData.rows.some(row=>row.animalCode==='T26-EXPORT-501')).toBe(true);expect((await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition})},'')).status).toBe(401);
    const overviewMother=await create({code:'T26-OVERVIEW-MADRE',animalType:'cerda',sex:'hembra',birthDate:'2025-01-01',entryDate:today,entryStageCode:'gestacion',originType:'compra',operationKey:'overview-mother'});expect(overviewMother.status,await overviewMother.clone().text()).toBe(201);const overviewCycle=await api('/api/reproduction/cycles',{method:'POST',body:JSON.stringify({femaleCode:'T26-OVERVIEW-MADRE',serviceDate:today,serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Banco sintético',operationKey:'overview-cycle'})});expect(overviewCycle.status,await overviewCycle.clone().text()).toBe(201);const overviewCycleId=(await overviewCycle.json() as {createdCycleId:string}).createdCycleId;const overviewEvent=await api(`/api/reproduction/cycles/${overviewCycleId}/events`,{method:'POST',body:JSON.stringify({eventType:'palpation',eventDate:today,physiologicalStatus:'gestation',reason:'Evento sintético del resumen',operationKey:'overview-event'})});expect(overviewEvent.status,await overviewEvent.clone().text()).toBe(201);
    await db.prepare('INSERT OR IGNORE INTO user_barns(user_id,barn_id,assigned_at) VALUES(?,2,?)').bind(userId,new Date().toISOString()).run();await db.prepare("INSERT INTO animals(code,animal_type,sex,status,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,is_active,created_by_user_id,created_at,updated_at) VALUES('T26-GALPON-B','lechon','pendiente','activo','inicial',?,'inicio','inicio',2,1,?,?,?)").bind(today,userId,new Date().toISOString(),new Date().toISOString()).run();const crossBarnDefinition={source:'animals',name:'Animales por galpón',purpose:'Verificar alcance dinámico',from:today,to:today,columns:['animalCode','barn']};const crossSavedResponse=await api('/api/reports/definitions',{method:'POST',body:JSON.stringify(crossBarnDefinition)},responsableToken);expect(crossSavedResponse.status,await crossSavedResponse.clone().text()).toBe(201);const crossSaved=(await crossSavedResponse.json() as {id:string}).id;const crossBarnBefore=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definitionId:crossSaved})},responsableToken);const crossBeforeData=await crossBarnBefore.json() as {rows:Record<string,unknown>[]};expect(crossBeforeData.rows.some(row=>row.animalCode==='T26-GALPON-B'&&row.barn==='Galpón B')).toBe(true);
    const vaccine=await api('/api/vaccines/schedules/manual',{method:'POST',body:JSON.stringify({animalCode:'T25-ANIMAL-A',vaccineName:'Vacuna T25',scheduledDate:today,reason:'Prueba reporte veterinario',operationKey:'vax-t25-pending'})},veterinarioToken);expect(vaccine.status,await vaccine.clone().text()).toBe(201);const vaccineReport=await api('/api/reports/preview',{method:'POST',body:JSON.stringify({source:'vaccines',name:'Vacunas por animal',purpose:'Consulta sanitaria',from:today,to:today,columns:['scheduledDate','animalCode','vaccine','status','barn'],groupBy:'scheduledDate'})},veterinarioToken);expect(vaccineReport.status,await vaccineReport.clone().text()).toBe(200);expect((await vaccineReport.json() as {rows:Record<string,unknown>[]}).rows).toContainEqual(expect.objectContaining({animalCode:'T25-ANIMAL-A',vaccine:'Vacuna T25',status:'pending'}));
    for(const [direction,amount,key] of [['income','100.00','fin-t25-income'],['expense','30.00','fin-t25-expense']]){const entry=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({direction,category:'T25',concept:'Dato para reporte',operationDate:today,amount,currencyCode:'PEN',reason:'Prueba de reporte mensual T25',operationKey:key,allocations:[{barnId:1,amount}]})},responsableToken);expect(entry.status,await entry.clone().text()).toBe(201);}const financeReport=await api('/api/reports/preview',{method:'POST',body:JSON.stringify({source:'finance',name:'Balance mensual',purpose:'Conciliar ingresos y egresos',from:today,to:today,columns:['operationDate','direction','category','barn','currency','amount'],groupBy:'barn,month',filters:{category:'T25'}})},responsableToken);expect(financeReport.status,await financeReport.clone().text()).toBe(200);const financeData=await financeReport.json() as {groups:Record<string,{income:number;expense:number;balance:number}>};const financeGroup=Object.values(financeData.groups)[0];expect(financeGroup).toMatchObject({income:100,expense:30,balance:70});const t25Entries=await db.prepare("SELECT f.id,a.id allocation_id,f.direction,CASE WHEN f.direction='income' THEN '100.00' ELSE '30.00' END amount FROM financial_entries f JOIN financial_allocations a ON a.entry_id=f.id WHERE f.category='T25'").all<{id:number;allocation_id:number;direction:string;amount:string}>();for(const entry of t25Entries.results??[]){const settlement=await api(`/api/finance/entries/${entry.id}/settlements`,{method:'POST',body:JSON.stringify({settlementDate:today,amount:entry.amount,paymentMethod:'transferencia',reason:'Cobro/pago de prueba T25',operationKey:`settlement-t25-${entry.direction}`,allocations:[{allocationId:entry.allocation_id,amount:entry.amount}]})},responsableToken);expect(settlement.status,await settlement.clone().text()).toBe(201);}const cashflowDefinition={source:'cashflow',name:'Caja mensual',purpose:'Comparar cobros y pagos',from:today,to:today,columns:['settlementDate','direction','category','barn','currency','amount'],groupBy:'barn,month',filters:{category:'T25'}};const cashflow=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(cashflowDefinition)},responsableToken);expect(cashflow.status,await cashflow.clone().text()).toBe(200);const cashflowData=await cashflow.json() as {groups:Record<string,{income:number;expense:number;balance:number}>};expect(Object.values(cashflowData.groups)[0]).toMatchObject({income:100,expense:30,balance:70});const cashflowExport=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:cashflowDefinition})},responsableToken);expect(cashflowExport.status,await cashflowExport.clone().text()).toBe(200);const cashExportData=await cashflowExport.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number;expense:number;balance:number}>};expect(cashExportData.rows).toHaveLength(2);expect(cashExportData.moneyTotals.PEN).toMatchObject({income:100,expense:30,balance:70});
    const economicsDefinition={source:'economics',name:'Ventas y alimento por galpón',purpose:'Calcular venta menos costo de alimento',from:today,to:today,barnId:1,columns:['month','barn','currency','sales','feedCost'],groupBy:'barn,month',filters:{currency:'PEN'}};const baselineResponse=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(economicsDefinition)},responsableToken);expect(baselineResponse.status,await baselineResponse.clone().text()).toBe(200);const baseline=(await baselineResponse.json() as {rows:Record<string,unknown>[]}).rows[0]??{sales:0,feedCost:0};for(const [amount,key] of [['100.00','ca29-sale-a'],['200.00','ca29-sale-b']]){const sale=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({direction:'income',category:'Venta porcina CA29',concept:'Venta para reporte combinado',operationDate:today,amount,currencyCode:'PEN',reason:'Caso CA29 con datos sintéticos',operationKey:key,allocations:[{barnId:1,amount}]})},responsableToken);expect(sale.status,await sale.clone().text()).toBe(201);const saleId=Number((await sale.json() as {entry:{id:number}}).entry.id);await db.prepare("UPDATE financial_entries SET source_type='animal_sale',source_id=? WHERE id=?").bind(key,saleId).run();}const feedBase={effectiveDate:today,warehouseId:1,feedCode:'preinicio',lotCode:'CA29-ALIMENTO',costPerKg:1,reason:'Costo de alimento sintético CA29'};const feedPurchase=await api('/api/feed/movements',{method:'POST',body:JSON.stringify({...feedBase,movementType:'purchase',quantityKg:30,supplier:'Proveedor CA29',operationKey:'ca29-feed-purchase'})});expect(feedPurchase.status,await feedPurchase.clone().text()).toBe(201);for(let index=1;index<=3;index++){const feedDelivery=await api('/api/feed/movements',{method:'POST',body:JSON.stringify({...feedBase,movementType:'delivery',quantityKg:10,destinationBarnId:1,operationKey:'ca29-feed-delivery-'+index})});expect(feedDelivery.status,await feedDelivery.clone().text()).toBe(201);}const economicsResponse=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(economicsDefinition)},responsableToken);expect(economicsResponse.status,await economicsResponse.clone().text()).toBe(200);const economics=(await economicsResponse.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number;expense:number;balance:number}>});expect(economics.rows).toHaveLength(1);expect(Number(economics.rows[0].sales)-Number(baseline.sales)).toBe(300);expect(Number(economics.rows[0].feedCost)-Number(baseline.feedCost)).toBe(30);expect(economics.moneyTotals.PEN.income-Number(baseline.sales)).toBe(300);expect(economics.moneyTotals.PEN.expense-Number(baseline.feedCost)).toBe(30);const economicsExport=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:economicsDefinition})},responsableToken);expect(economicsExport.status,await economicsExport.clone().text()).toBe(200);const economicsExportData=await economicsExport.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number;expense:number;balance:number}>};expect(economicsExportData.rows).toEqual(economics.rows);expect(economicsExportData.moneyTotals.PEN).toMatchObject({income:Number(economics.rows[0].sales),expense:Number(economics.rows[0].feedCost)});
    for(const token of [operarioToken,veterinarioToken]){
      const tradeDefinition={source:'trade',name:'Operaciones sin importes',purpose:'Comprobar confidencialidad',from:today,to:today,barnId:1,columns:['animalCode','operationDate','barn'],groupBy:'barn'};
      for(const endpoint of ['preview','export']){
        const restricted=await api(`/api/reports/${endpoint}`,{method:'POST',body:JSON.stringify(endpoint==='export'?{definition:tradeDefinition}:tradeDefinition)},token);expect(restricted.status,await restricted.clone().text()).toBe(200);
        const restrictedData=await restricted.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,unknown>;totals:Record<string,unknown>;groups:Record<string,{sum:number;income:number;expense:number;balance:number}>};expect(restrictedData.rows.length).toBeGreaterThan(0);expect(restrictedData.rows.every(row=>!('amount' in row))).toBe(true);expect(restrictedData.moneyTotals).toEqual({});expect(restrictedData.totals).toMatchObject({amount:null,income:null,expense:null,balance:null});for(const group of Object.values(restrictedData.groups))expect(group).toMatchObject({sum:0,income:0,expense:0,balance:0});
      }
    }
    const usdSale=await api('/api/finance/entries',{method:'POST',body:JSON.stringify({direction:'income',category:'Venta USD CA29',concept:'Separar monedas en informe',operationDate:today,amount:'50.00',currencyCode:'USD',reason:'Prueba de monedas independientes',operationKey:'ca29-sale-usd',allocations:[{barnId:1,amount:'50.00'}]})},responsableToken);expect(usdSale.status,await usdSale.clone().text()).toBe(201);const usdId=Number((await usdSale.json() as {entry:{id:number}}).entry.id);await db.prepare("UPDATE financial_entries SET source_type='animal_sale',source_id='ca29-sale-usd' WHERE id=?").bind(usdId).run();
    const multiCurrencyResponse=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:{...economicsDefinition,filters:{}}})},responsableToken);expect(multiCurrencyResponse.status,await multiCurrencyResponse.clone().text()).toBe(200);const multiCurrency=await multiCurrencyResponse.json() as {groups:Record<string,{income:number}>;moneyTotals:Record<string,{income:number}>;totals:Record<string,unknown>};expect(multiCurrency.moneyTotals.USD.income).toBe(50);expect(multiCurrency.moneyTotals.PEN.income).toBe(Number(economics.rows[0].sales));expect(Object.keys(multiCurrency.groups).some(key=>key.startsWith('PEN · '))).toBe(true);expect(Object.keys(multiCurrency.groups).some(key=>key.startsWith('USD · '))).toBe(true);expect(multiCurrency.totals).toMatchObject({sum:null,income:null,expense:null,balance:null});
    const overviewDefinition={...economicsDefinition,source:'overview',name:'Resumen integral del periodo',filters:{},columns:['rowType','month','barn','currency','sales','feedCost','vaccineCount','reproductionCount']};const overview=await api('/api/reports/preview',{method:'POST',body:JSON.stringify(overviewDefinition)},responsableToken);expect(overview.status,await overview.clone().text()).toBe(200);const overviewData=await overview.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,unknown>;totals:{vaccineCount:number;reproductionCount:number}};expect(overviewData.rows.filter(row=>row.rowType==='Importes')).toHaveLength(2);const activityRows=overviewData.rows.filter(row=>row.rowType==='Actividad');expect(activityRows).toHaveLength(1);expect(activityRows[0]).toMatchObject({currency:'No aplica',sales:null,feedCost:null});expect(overviewData.totals.vaccineCount).toBeGreaterThan(0);expect(overviewData.totals.reproductionCount).toBeGreaterThan(0);expect(Number(activityRows[0].vaccineCount)).toBe(overviewData.totals.vaccineCount);expect(Number(activityRows[0].reproductionCount)).toBe(overviewData.totals.reproductionCount);expect(overviewData.moneyTotals).toEqual(multiCurrency.moneyTotals);const overviewExport=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:overviewDefinition})},responsableToken);expect(overviewExport.status,await overviewExport.clone().text()).toBe(200);const overviewExportData=await overviewExport.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,unknown>};expect(overviewExportData.rows).toEqual(overviewData.rows);expect(overviewExportData.moneyTotals).toEqual(overviewData.moneyTotals);expect((await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition:overviewDefinition})},operarioToken)).status).toBe(403);
    const savedResponse=await api('/api/reports/definitions',{method:'POST',body:JSON.stringify(definition)},responsableToken);expect(savedResponse.status,await savedResponse.clone().text()).toBe(201);const saved=(await savedResponse.json() as {id:string}).id;expect((await api('/api/reports/definitions',{},responsableToken)).status).toBe(200);expect((await api(`/api/reports/definitions/${saved}/duplicate`,{method:'POST'},operarioToken)).status).toBe(404);expect((await api(`/api/reports/definitions/${saved}/duplicate`,{method:'POST'},responsableToken)).status).toBe(201);
    const dashboard=await api(`/api/reports/dashboard?from=${today}&to=${today}`,{},responsableToken);expect(dashboard.status,await dashboard.clone().text()).toBe(200);const panel=await dashboard.json() as {asOf:string;totalAnimals:number;barnsIncluded:number|string};expect(panel.asOf).toBe(today);expect(panel.totalAnimals).toBeGreaterThan(0);expect(panel.barnsIncluded).toBe(2);
    const isolated=await api('/api/reports/preview',{method:'POST',body:JSON.stringify({...definition,barnId:999})},responsableToken);expect(isolated.status).toBe(403);await db.prepare('DELETE FROM user_barns WHERE user_id=? AND barn_id=2').bind(userId).run();const crossBarnAfter=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definitionId:crossSaved})},responsableToken);expect(crossBarnAfter.status,await crossBarnAfter.clone().text()).toBe(200);const crossAfterData=await crossBarnAfter.json() as {rows:Record<string,unknown>[]};expect(crossAfterData.rows.some(row=>row.animalCode==='T26-GALPON-B')).toBe(false);expect(crossAfterData.rows.length).toBe(crossBeforeData.rows.length-1);await db.prepare("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<10001) INSERT INTO animals(code,animal_type,sex,status,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,lot_code,is_active,created_by_user_id,created_at,updated_at) SELECT 'T26-LIMIT-'||printf('%05d',n),'lechon','pendiente','activo','inicial',?,'inicio','inicio',1,'T25-LOTE-A',1,?,?,? FROM seq").bind(today,userId,new Date().toISOString(),new Date().toISOString()).run();const oversized=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definition})},responsableToken);expect(oversized.status,await oversized.clone().text()).toBe(413);
    const responsibleId=Number((await db.prepare("SELECT id FROM users WHERE role='responsable' LIMIT 1").first<{id:number}>())?.id);await db.prepare('DELETE FROM user_barns WHERE user_id=? AND barn_id=1').bind(responsibleId).run();
    const rerun=await api(`/api/reports/definitions/${saved}/execute`,{method:'POST',body:JSON.stringify({})},responsableToken);expect(rerun.status,await rerun.clone().text()).toBe(200);expect((await rerun.json() as {rowCount:number}).rowCount).toBe(0);const exportAfterAccessChange=await api('/api/reports/export',{method:'POST',body:JSON.stringify({definitionId:saved})},responsableToken);expect(exportAfterAccessChange.status,await exportAfterAccessChange.clone().text()).toBe(200);expect((await exportAfterAccessChange.json() as {rowCount:number}).rowCount).toBe(0);
    expect((await api('/api/reports/preview',{method:'POST',body:JSON.stringify({...definition,source:'finance',columns:['direction'],filters:{}})},operarioToken)).status).toBe(403);
  }, 120000);

});

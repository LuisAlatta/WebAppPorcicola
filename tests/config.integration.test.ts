import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-config-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'config-database' } },
    },
  }],
});

interface Snapshot {
  asOf: string;
  settings: { key: string; value: string; effectiveFrom: string }[];
  catalogs: { key: string; label: string; items: { code: string; name: string; status: string; effectiveTo: string | null }[] }[];
  stages: {
    code: string; name: string; initialWeightKg: number | null; finalWeightKg: number | null;
    durationDays: number | null; dailyFeedKg: number | null; monthlyFeedKg: number | null;
    totalFeedKg: number | null; effectiveFrom: string; effectiveTo: string | null; status: string;
  }[];
  locations: { code: string; name: string; locationType: string; parentCode: string | null; status: string }[];
  lots: { code: string; name: string; stageCode: string | null; status: string }[];
}

describe('Configuración versionada de la granja · T07 (CFG-01..CFG-05)', () => {
  let db: D1Database;
  let adminToken: string;
  let operarioToken: string;

  const api = async (path: string, init: RequestInit = {}, token = adminToken) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), { DB: db });
  };

  const snapshot = async (asOf: string): Promise<Snapshot> => {
    const res = await api(`/api/config?asOf=${asOf}`, {}, adminToken);
    expect(res.status).toBe(200);
    return res.json() as Promise<Snapshot>;
  };

  const stagePayload = (overrides: Record<string, unknown> = {}) => ({
    code: 'preinicio',
    name: 'Preinicio',
    sortOrder: 1,
    initialWeightKg: 6,
    finalWeightKg: 12,
    initialAgeDays: 0,
    finalAgeDays: 21,
    durationDays: 21,
    rationName: 'Alimento preinicio',
    dailyFeedKg: 0.65,
    effectiveFrom: '2026-06-01',
    reason: 'Actualización de dieta de preinicio',
    operationKey: 'cfg-stage-preinicio-1',
    ...overrides,
  });

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');

    const migrationFiles = [
      '0001_initial_schema.sql',
      '0002_administration_schema.sql',
      '0003_events_audit_schema.sql',
      '0004_farm_config_schema.sql',
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
          username: 'admin.config@granja.pe',
          password: 'PasswordConfig2026!',
          name: 'Administrador de Configuración',
        }),
      }),
      { DB: db },
    );
    const initData = await initRes.json() as { token: string };
    adminToken = initData.token;

    const userRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'operario.config@granja.pe',
        name: 'Operario Configuración',
        role: 'operario',
        password: 'ClaveOperarioConfig1!',
        barnIds: [],
      }),
    });
    expect(userRes.status).toBe(201);

    const loginRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'operario.config@granja.pe', password: 'ClaveOperarioConfig1!' }),
      }),
      { DB: db },
    );
    const loginData = await loginRes.json() as { token: string };
    operarioToken = loginData.token;
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('CFG-01/CFG-04: entrega catálogos, parámetros de granja, ubicaciones y lotes iniciales', async () => {
    const data = await snapshot('2026-05-31');

    expect(data.settings.map((setting) => setting.key).sort()).toEqual(
      ['currency', 'farm_name', 'timezone', 'weight_unit'],
    );
    expect(data.settings.find((setting) => setting.key === 'farm_name')?.value).toBe('Granja San Luis');
    expect(data.settings.find((setting) => setting.key === 'timezone')?.value).toBe('America/Lima');

    const catalogKeys = data.catalogs.map((catalog) => catalog.key);
    expect(catalogKeys).toEqual(expect.arrayContaining([
      'sexo', 'estado_animal', 'etapa', 'aptitud', 'ubicacion', 'lote',
      'causa_descarte', 'causa_muerte', 'tipo_servicio', 'estado_fisiologico', 'alimento',
    ]));

    const estado = data.catalogs.find((catalog) => catalog.key === 'estado_animal');
    expect(estado?.items.map((item) => item.code)).toEqual(['activo', 'vendido', 'descartado', 'muerto']);
    const aptitud = data.catalogs.find((catalog) => catalog.key === 'aptitud');
    expect(aptitud?.items.map((item) => item.code)).toEqual(['pie_de_cria', 'engorde']);

    expect(data.stages).toHaveLength(8);
    expect(data.stages.map((stage) => stage.code)).toEqual(expect.arrayContaining([
      'preinicio', 'inicio', 'levante', 'engorde', 'gestacion', 'lactancia', 'vacia', 'reproductor',
    ]));

    expect(data.locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'galpon_a', locationType: 'galpon' }),
      expect.objectContaining({ code: 'corral_maternidad', locationType: 'corral', parentCode: 'galpon_a' }),
    ]));
    expect(data.lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'lote_levante_a', stageCode: 'levante' }),
    ]));
  });

  it('CFG-03: calcula consumo diario, mensual y total por etapa y distingue vacío de cero', async () => {
    const data = await snapshot('2026-05-31');
    const preinicio = data.stages.find((stage) => stage.code === 'preinicio');
    expect(preinicio?.dailyFeedKg).toBe(0.65);
    expect(preinicio?.durationDays).toBe(21);
    expect(preinicio?.monthlyFeedKg).toBe(19.5);
    expect(preinicio?.totalFeedKg).toBe(13.65);

    const vacia = data.stages.find((stage) => stage.code === 'vacia');
    expect(vacia?.finalWeightKg).toBeNull();
    expect(vacia?.durationDays).toBeNull();
    expect(vacia?.totalFeedKg).toBeNull();
  });

  it('CFG-02/CFG-05: registra dos parámetros en fechas distintas y conserva cada valor histórico', async () => {
    const saveRes = await api('/api/config/stages', {
      method: 'POST',
      body: JSON.stringify(stagePayload({
        initialWeightKg: 7,
        finalWeightKg: 14,
        dailyFeedKg: 0.8,
        name: 'Preinicio ajustado',
      })),
    });
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json() as { item: { effectiveFrom: string; effectiveTo: string | null } };
    expect(saved.item.effectiveFrom).toBe('2026-06-01');
    expect(saved.item.effectiveTo).toBeNull();

    const before = await snapshot('2026-05-31');
    const after = await snapshot('2026-06-01');

    const oldVersion = before.stages.find((stage) => stage.code === 'preinicio');
    expect(oldVersion?.name).toBe('Preinicio');
    expect(oldVersion?.dailyFeedKg).toBe(0.65);
    expect(oldVersion?.effectiveTo).toBe('2026-06-01');

    const newVersion = after.stages.find((stage) => stage.code === 'preinicio');
    expect(newVersion?.name).toBe('Preinicio ajustado');
    expect(newVersion?.initialWeightKg).toBe(7);
    expect(newVersion?.finalWeightKg).toBe(14);
    expect(newVersion?.dailyFeedKg).toBe(0.8);
    expect(newVersion?.monthlyFeedKg).toBe(24);
    expect(newVersion?.totalFeedKg).toBe(16.8);

    const historyRes = await api('/api/config/history?entity=stage&code=preinicio');
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json() as {
      history: { name: string; effectiveFrom: string; effectiveTo: string | null }[];
    };
    expect(historyData.history).toHaveLength(2);
    expect(historyData.history.map((row) => row.name)).toEqual(expect.arrayContaining(['Preinicio', 'Preinicio ajustado']));
    const previous = historyData.history.find((row) => row.name === 'Preinicio');
    expect(previous?.effectiveTo).toBe('2026-06-01');

    const auditRes = await api('/api/admin/audit?entityType=stage&limit=50');
    const auditData = await auditRes.json() as { audit: { action: string; reason: string; effective_date: string }[] };
    expect(auditData.audit.some((record) =>
      record.action === 'update'
      && record.reason === 'Actualización de dieta de preinicio'
      && record.effective_date === '2026-06-01',
    )).toBe(true);
  });

  it('CFG-05: retira una categoría de las opciones nuevas sin borrar el histórico', async () => {
    const retireRes = await api('/api/config/catalogs/retire', {
      method: 'POST',
      body: JSON.stringify({
        catalogKey: 'etapa',
        code: 'vacia',
        effectiveFrom: '2026-07-01',
        reason: 'La etapa se reemplaza por estado fisiológico vacía',
        operationKey: 'cfg-retire-etapa-vacia',
      }),
    });
    expect(retireRes.status).toBe(200);

    const before = await snapshot('2026-06-30');
    const after = await snapshot('2026-07-01');

    const etapasBefore = before.catalogs.find((catalog) => catalog.key === 'etapa');
    const etapasAfter = after.catalogs.find((catalog) => catalog.key === 'etapa');
    expect(etapasBefore?.items.map((item) => item.code)).toContain('vacia');
    expect(etapasAfter?.items.map((item) => item.code)).not.toContain('vacia');

    const historyRes = await api('/api/config/history?entity=catalog&catalogKey=etapa&code=vacia');
    const historyData = await historyRes.json() as {
      history: { code: string; status: string; effectiveTo: string | null }[];
    };
    expect(historyData.history).toHaveLength(1);
    expect(historyData.history[0].status).toBe('retired');
    expect(historyData.history[0].effectiveTo).toBe('2026-07-01');
  });

  it('registra parámetros, ubicaciones y lotes con vigencia y permite consultarlos', async () => {
    const settingRes = await api('/api/config/settings', {
      method: 'POST',
      body: JSON.stringify({
        key: 'farm_name',
        value: 'Granja San Luis del Norte',
        effectiveFrom: '2026-08-01',
        reason: 'Nombre comercial actualizado',
        operationKey: 'cfg-setting-farm-name-1',
      }),
    });
    expect(settingRes.status).toBe(200);

    const locationRes = await api('/api/config/locations', {
      method: 'POST',
      body: JSON.stringify({
        code: 'galpon_c',
        name: 'Galpón C',
        locationType: 'galpon',
        parentCode: null,
        effectiveFrom: '2026-08-01',
        reason: 'Nuevo galpón construido',
        operationKey: 'cfg-location-galpon-c',
      }),
    });
    expect(locationRes.status).toBe(200);

    const lotRes = await api('/api/config/lots', {
      method: 'POST',
      body: JSON.stringify({
        code: 'lote_levante_b',
        name: 'Lote Levante B',
        stageCode: 'levante',
        effectiveFrom: '2026-08-01',
        reason: 'Nuevo lote de manejo',
        operationKey: 'cfg-lot-levante-b',
      }),
    });
    expect(lotRes.status).toBe(200);

    const data = await snapshot('2026-08-01');
    expect(data.settings.find((setting) => setting.key === 'farm_name')?.value).toBe('Granja San Luis del Norte');
    expect(data.locations.some((location) => location.code === 'galpon_c')).toBe(true);
    expect(data.lots.some((lot) => lot.code === 'lote_levante_b' && lot.stageCode === 'levante')).toBe(true);
  });

  it('ACC-04: reintenta una configuración sin duplicar y rechaza contenido distinto', async () => {
    const payload = stagePayload({
      code: 'inicio',
      name: 'Inicio',
      sortOrder: 2,
      initialWeightKg: 14,
      finalWeightKg: 28,
      initialAgeDays: 21,
      finalAgeDays: 49,
      durationDays: 28,
      rationName: 'Alimento inicio',
      dailyFeedKg: 1.1,
      effectiveFrom: '2026-09-01',
      reason: 'Ajuste de ración de inicio',
      operationKey: 'cfg-stage-inicio-replay',
    });

    const first = await api('/api/config/stages', { method: 'POST', body: JSON.stringify(payload) });
    expect(first.status).toBe(200);
    const firstData = await first.json() as { replayed: boolean };
    expect(firstData.replayed).toBe(false);

    const replay = await api('/api/config/stages', { method: 'POST', body: JSON.stringify(payload) });
    expect(replay.status).toBe(200);
    const replayData = await replay.json() as { replayed: boolean; item: { name: string } };
    expect(replayData.replayed).toBe(true);
    expect(replayData.item.name).toBe('Inicio');

    const conflict = await api('/api/config/stages', {
      method: 'POST',
      body: JSON.stringify({ ...payload, dailyFeedKg: 1.3 }),
    });
    expect(conflict.status).toBe(409);

    const historyRes = await api('/api/config/history?entity=stage&code=inicio');
    const historyData = await historyRes.json() as { history: unknown[] };
    expect(historyData.history).toHaveLength(2);
  });

  it('valida permisos y datos: solo el administrador escribe y las fechas inválidas se rechazan', async () => {
    const forbidden = await api('/api/config/settings', {
      method: 'POST',
      body: JSON.stringify({
        key: 'farm_name',
        value: 'Intento ajeno',
        effectiveFrom: '2026-10-01',
        operationKey: 'cfg-forbidden-setting',
      }),
    }, operarioToken);
    expect(forbidden.status).toBe(403);

    const invalidDate = await api('/api/config/stages', {
      method: 'POST',
      body: JSON.stringify(stagePayload({ effectiveFrom: '2026-02-30', operationKey: 'cfg-invalid-date' })),
    });
    expect(invalidDate.status).toBe(400);

    const invalidRange = await api('/api/config/stages', {
      method: 'POST',
      body: JSON.stringify(stagePayload({
        effectiveFrom: '2026-10-01',
        initialWeightKg: 20,
        finalWeightKg: 10,
        operationKey: 'cfg-invalid-range',
      })),
    });
    expect(invalidRange.status).toBe(400);

    const unauthorized = await worker.fetch(new Request('http://localhost/api/config?asOf=2026-05-31'), { DB: db });
    expect(unauthorized.status).toBe(401);
  });
});

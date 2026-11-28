import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'reproduction-sires-all-barns-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'reproduction-sires-all-barns-db' } },
    },
  }],
});

describe('Verracos de todos los galpones y servicios históricos en reproducción', () => {
  let db: D1Database;
  let token = '';
  const today = currentFarmDate();

  const req = (path: string, body?: Record<string, unknown>, barns?: string) => worker.fetch(new Request(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(barns ? { 'X-Barn-Ids': barns } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: db });

  const createAnimal = (overrides: Record<string, unknown>) => req('/api/animals', {
    originType: 'inicial',
    reason: 'Alta de prueba reproducción',
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
      body: JSON.stringify({ username: 'rep-sires@granja.test', password: 'PasswordFicticio2026!', name: 'Admin Reproducción' }),
    }), { DB: db });
    expect(boot.status, await boot.clone().text()).toBe(201);
    token = (await boot.json() as { token: string }).token;
  }, 90000);

  afterAll(async () => runtime.dispose());

  it('lista verracos activos de todos los galpones y permite inseminación y repetición con verraco de otro galpón y fecha histórica', async () => {
    // Galpón 1: verraco 001 (Landrace, registrado hoy) y verraco inactivo que no debe aparecer.
    const boarA = await (await createAnimal({
      code: '001', alias: '001', animalType: 'verraco', sex: 'macho', breed: 'Landrace',
      birthDate: '2023-11-27', entryDate: today, entryStageCode: 'reproductor', barnId: 1,
    })).json() as { animal: { id: number } };
    expect((await createAnimal({
      code: 'BOAR-INACTIVO', animalType: 'verraco', sex: 'macho', breed: 'Pietrain',
      birthDate: '2023-01-01', entryDate: today, entryStageCode: 'reproductor', barnId: 1,
    })).status).toBe(201);
    expect((await req('/api/animals/BOAR-INACTIVO/deactivate', { reason: 'Error' }, '1')).status).toBe(200);
    // Un lechón macho no debe listarse como verraco.
    expect((await createAnimal({
      code: 'LECH-M1', animalType: 'lechon', sex: 'macho', breed: 'Duroc',
      birthDate: '2026-10-01', entryDate: today, entryStageCode: 'preinicio', barnId: 1,
    })).status).toBe(201);

    // Galpón 2: verraco 001 (Yorkshire) y marrana 002 (registradas después del servicio histórico).
    const boarB = await (await createAnimal({
      code: '001', alias: '001', animalType: 'verraco', sex: 'macho', breed: 'Yorkshire',
      birthDate: '2024-11-17', entryDate: '2026-11-17', entryStageCode: 'reproductor', barnId: 2,
    })).json() as { animal: { id: number } };
    const sowB = await (await createAnimal({
      code: '002', alias: '002', animalType: 'cerda', sex: 'hembra', breed: 'Landrace',
      birthDate: '2024-11-17', entryDate: '2026-11-17', entryStageCode: 'gestacion', barnId: 2,
    })).json() as { animal: { id: number } };

    // Con solo Galpón 2 seleccionado, /api/reproduction/sires igual devuelve ambos verracos activos (Galpón A y Galpón B).
    const siresRes = await req('/api/reproduction/sires', undefined, '2');
    expect(siresRes.status).toBe(200);
    const siresBody = await siresRes.json() as { sires: { id: number; code: string; breed: string | null; barnId: number; barnName: string }[] };
    expect(siresBody.sires).toEqual([
      { id: boarA.animal.id, code: '001', alias: '001', breed: 'Landrace', barnId: 1, barnName: 'Galpón A' },
      { id: boarB.animal.id, code: '001', alias: '001', breed: 'Yorkshire', barnId: 2, barnName: 'Galpón B' },
    ]);

    // Registrar inseminación histórica (07/11/2026, anterior al entry_date de ambos animales)
    // para la marrana 002 del Galpón 2 usando el verraco 001 del Galpón 1 (por ID).
    const cycleRes = await req('/api/reproduction/cycles', {
      femaleCode: `id:${sowB.animal.id}`,
      serviceDate: '2026-11-07',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      heatRepeatDays: 21,
      gestationDays: 114,
      operationKey: crypto.randomUUID(),
    }, '2');
    expect(cycleRes.status, await cycleRes.clone().text()).toBe(201);
    const cycleBody = await cycleRes.json() as {
      createdCycleId: string;
      cycles: {
        id: string;
        probableHeatRepeatDate: string;
        probableFarrowingDate: string;
        services: { sireAnimalId: number; sireCode: string; sireBreed: string; sireBarnName: string }[];
      }[];
    };
    const created = cycleBody.cycles.find(c => c.id === cycleBody.createdCycleId);
    expect(created).toMatchObject({
      probableHeatRepeatDate: '2026-11-28',
      probableFarrowingDate: '2027-03-01',
      services: [{
        sireAnimalId: boarA.animal.id,
        sireCode: '001',
        sireBreed: 'Landrace',
        sireBarnName: 'Galpón A',
      }],
    });

    // Verifica que se genere la alerta automática de repetición de celo para el 28/11/2026.
    const alertsRes = await req('/api/alerts?asOf=2026-11-28', undefined, '2');
    expect(alertsRes.status, await alertsRes.clone().text()).toBe(200);
    const alertsBody = await alertsRes.json() as {
      alerts: { key: string; type: string; dueDate: string; bucket: string; title: string; status: string }[];
    };
    expect(alertsBody.alerts.find(a => a.key === `heat_repeat:${cycleBody.createdCycleId}`)).toMatchObject({
      type: 'heat_repeat',
      dueDate: '2026-11-28',
      bucket: 'today',
      title: 'Repetición de celo · 002',
      status: 'pending',
    });

    // Repetición de servicio también acepta el verraco de otro galpón por ID y actualiza la fecha de la alerta de celo.
    const repeatRes = await req(`/api/reproduction/cycles/${cycleBody.createdCycleId}/services`, {
      serviceDate: '2026-11-20',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      operationKey: crypto.randomUUID(),
    }, '2');
    expect(repeatRes.status, await repeatRes.clone().text()).toBe(201);

    const alertsAfterRepeat = await (await req('/api/alerts?asOf=2026-12-11', undefined, '2')).json() as {
      alerts: { key: string; dueDate: string; bucket: string; status: string }[];
    };
    expect(alertsAfterRepeat.alerts.find(a => a.key === `heat_repeat:${cycleBody.createdCycleId}`)).toMatchObject({
      dueDate: '2026-12-11',
      bucket: 'today',
      status: 'pending',
    });

    // Al confirmar preñez, la alerta de repetición de celo se resuelve automáticamente y la de parto sigue pendiente.
    const confirmRes = await req(`/api/reproduction/cycles/${cycleBody.createdCycleId}/events`, {
      eventType: 'pregnancy_confirmed',
      eventDate: '2026-11-27',
      operationKey: crypto.randomUUID(),
    }, '2');
    expect(confirmRes.status, await confirmRes.clone().text()).toBe(201);

    const pendingAfterConfirm = await (await req('/api/alerts?status=pending&asOf=2026-12-11', undefined, '2')).json() as {
      alerts: { key: string; type: string; status: string }[];
    };
    expect(pendingAfterConfirm.alerts.find(a => a.key === `heat_repeat:${cycleBody.createdCycleId}`)).toBeUndefined();
    expect(pendingAfterConfirm.alerts.find(a => a.key === `farrowing:${cycleBody.createdCycleId}`)).toMatchObject({
      type: 'farrowing',
      status: 'pending',
    });

    // Sigue rechazando fecha anterior al nacimiento del animal (400) y verraco inactivo (400).
    const beforeBirth = await req('/api/reproduction/cycles', {
      femaleCode: `id:${sowB.animal.id}`,
      serviceDate: '2023-01-01',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      operationKey: crypto.randomUUID(),
    }, '2');
    expect(beforeBirth.status).toBe(400);

    const inactiveSire = await req(`/api/reproduction/cycles/${cycleBody.createdCycleId}/services`, {
      serviceDate: '2026-11-21',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: 'BOAR-INACTIVO',
      operationKey: crypto.randomUUID(),
    }, '2');
    expect(inactiveSire.status).toBe(400);

    // Sigue respetando el alcance de galpón para la hembra (403 si se intenta abrir ciclo desde Galpón 1).
    const wrongBarnFemale = await req('/api/reproduction/cycles', {
      femaleCode: `id:${sowB.animal.id}`,
      serviceDate: '2026-11-20',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(wrongBarnFemale.status).toBe(403);
  }, 90000);
});

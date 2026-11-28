import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { currentFarmDate } from '../worker/events';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'cross-module-resilience-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'cross-module-resilience-db' } },
    },
  }],
});

describe('Resiliencia transversal entre módulos (códigos repetidos, fechas históricas e inactivos)', () => {
  let db: D1Database;
  let token = '';
  const today = currentFarmDate();

  const req = (path: string, body?: Record<string, unknown>, barns?: string, method?: string) => worker.fetch(new Request(`http://localhost${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(barns ? { 'X-Barn-Ids': barns } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: db });

  const createAnimal = (overrides: Record<string, unknown>) => req('/api/animals', {
    originType: 'inicial',
    reason: 'Alta de prueba transversal',
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
      body: JSON.stringify({ username: 'resilience@granja.test', password: 'PasswordFicticio2026!', name: 'Admin Resiliencia' }),
    }), { DB: db });
    expect(boot.status, await boot.clone().text()).toBe(201);
    token = (await boot.json() as { token: string }).token;
  }, 90000);

  afterAll(async () => runtime.dispose());

  it('evita 409 con códigos duplicados en reproducción y oculta fichas eliminadas en ciclos y sanidad', async () => {
    const sowA = await (await createAnimal({
      code: '002', animalType: 'cerda', sex: 'hembra', breed: 'Yorkshire',
      birthDate: '2024-01-01', entryDate: today, entryStageCode: 'gestacion', barnId: 1,
    })).json() as { animal: { id: number } };
    const sowB = await (await createAnimal({
      code: '002', animalType: 'cerda', sex: 'hembra', breed: 'Landrace',
      birthDate: '2024-01-01', entryDate: today, entryStageCode: 'gestacion', barnId: 2,
    })).json() as { animal: { id: number } };
    const boarA = await (await createAnimal({
      code: '001', animalType: 'verraco', sex: 'macho', breed: 'Landrace',
      birthDate: '2023-01-01', entryDate: today, entryStageCode: 'reproductor', barnId: 1,
    })).json() as { animal: { id: number } };

    // Con ambos galpones seleccionados (1,2), ambos tienen código '002'.
    // Crear ciclo, repetir servicio, editar fecha y confirmar preñez no deben fallar con 409 al regenerar vacunas.
    const cycleRes = await req('/api/reproduction/cycles', {
      femaleCode: `id:${sowB.animal.id}`,
      serviceDate: '2026-11-01',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      operationKey: crypto.randomUUID(),
    }, '1,2');
    expect(cycleRes.status, await cycleRes.clone().text()).toBe(201);
    const { createdCycleId } = await cycleRes.json() as { createdCycleId: string };

    const repeatRes = await req(`/api/reproduction/cycles/${createdCycleId}/services`, {
      serviceDate: '2026-11-10',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      operationKey: crypto.randomUUID(),
    }, '1,2');
    expect(repeatRes.status, await repeatRes.clone().text()).toBe(201);

    const updateDueRes = await req(`/api/reproduction/cycles/${createdCycleId}`, {
      dueDate: '2027-03-05',
      dueDateReason: 'Ajuste clínico',
      operationKey: crypto.randomUUID(),
    }, '1,2', 'PUT');
    expect(updateDueRes.status, await updateDueRes.clone().text()).toBe(200);

    const confirmRes = await req(`/api/reproduction/cycles/${createdCycleId}/events`, {
      eventType: 'pregnancy_confirmed',
      eventDate: '2026-11-20',
      operationKey: crypto.randomUUID(),
    }, '1,2');
    expect(confirmRes.status, await confirmRes.clone().text()).toBe(201);

    // Una ficha eliminada por error (is_active = 0) con ciclo abierto y tratamiento activo no debe contaminar listas activas.
    const errCycleRes = await req('/api/reproduction/cycles', {
      femaleCode: `id:${sowA.animal.id}`,
      serviceDate: '2026-11-05',
      serviceType: 'inseminacion_artificial',
      materialSource: 'internal',
      sireCode: `id:${boarA.animal.id}`,
      operationKey: crypto.randomUUID(),
    }, '1,2');
    expect(errCycleRes.status, await errCycleRes.clone().text()).toBe(201);
    const errHealthRes = await req('/api/health/events', {
      eventType: 'treatment',
      effectiveDate: '2026-11-06',
      animalCodes: [`id:${sowA.animal.id}`],
      product: 'Antibiótico prueba',
      dosage: 2,
      dosageUnit: 'ml',
      nextDueDate: '2026-12-20',
      withdrawalUntil: '2026-12-20',
      reason: 'Tratamiento previo a eliminar ficha',
      operationKey: crypto.randomUUID(),
    }, '1,2');
    expect(errHealthRes.status, await errHealthRes.clone().text()).toBe(201);

    expect((await req(`/api/animals/id:${sowA.animal.id}/deactivate`, { reason: 'Error' }, '1,2')).status).toBe(200);

    const cyclesAfter = await (await req('/api/reproduction/cycles', undefined, '1,2')).json() as { cycles: { femaleAnimalId: number }[] };
    expect(cyclesAfter.cycles.some(c => c.femaleAnimalId === sowA.animal.id)).toBe(false);
    expect(cyclesAfter.cycles.some(c => c.femaleAnimalId === sowB.animal.id)).toBe(true);

    const withdrawalsAfter = await (await req(`/api/health/withdrawals?asOf=${today}`, undefined, '1,2')).json() as { alerts: { barnName: string }[] };
    expect(withdrawalsAfter.alerts).toHaveLength(0);
    const upcomingAfter = await (await req(`/api/health/upcoming?asOf=${today}`, undefined, '1,2')).json() as { events: { barnName: string }[] };
    expect(upcomingAfter.events).toHaveLength(0);
  }, 90000);

  it('permite fechas históricas anteriores a entry_date en sanidad, vacunas, pesajes, alimentación y finanzas', async () => {
    const sow = await (await createAnimal({
      code: 'HIST-X', animalType: 'cerda', sex: 'hembra', breed: 'Yorkshire',
      birthDate: '2024-01-01', entryDate: today, entryStageCode: 'gestacion', barnId: 1,
    })).json() as { animal: { id: number } };
    const pastDate = '2026-11-07';

    // 1. Sanidad histórica
    const healthRes = await req('/api/health/events', {
      eventType: 'deworming',
      effectiveDate: pastDate,
      animalCodes: [`id:${sow.animal.id}`],
      product: 'Ivermectina',
      dosage: 1.5,
      dosageUnit: 'ml',
      reason: 'Desparasitación anterior al registro en la app',
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(healthRes.status, await healthRes.clone().text()).toBe(201);

    // 2. Vacuna manual y aplicación con fecha anterior a entry_date
    const schedRes = await req('/api/vaccines/schedules/manual', {
      animalCode: `id:${sow.animal.id}`,
      vaccineName: 'Parvovirus',
      scheduledDate: pastDate,
      reason: 'Vacuna aplicada antes del alta en app',
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(schedRes.status, await schedRes.clone().text()).toBe(201);
    const { schedule } = await schedRes.json() as { schedule: { id: number } };

    const listedSched = await (await req('/api/vaccines/schedules', undefined, '1')).json() as { schedules: { id: number }[] };
    expect(listedSched.schedules.some(s => s.id === schedule.id)).toBe(true);

    const applyRes = await req(`/api/vaccines/schedules/${schedule.id}/apply`, {
      appliedDate: pastDate,
      dosage: 2,
      dosageUnit: 'ml',
      reason: 'Registro retroactivo',
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(applyRes.status, await applyRes.clone().text()).toBe(201);

    // 3. Pesaje histórico sin cambio de etapa (y rechazo si intenta cambiar etapa antes de entry_date)
    const weightRes = await req(`/api/animals/id:${sow.animal.id}/weights`, {
      weighedOn: pastDate,
      weighedTime: '09:00',
      weightKg: 145.5,
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(weightRes.status, await weightRes.clone().text()).toBe(201);

    const stageWeightRes = await req(`/api/animals/id:${sow.animal.id}/weights`, {
      weighedOn: pastDate,
      weighedTime: '10:00',
      weightKg: 146,
      stageCode: 'lactancia',
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(stageWeightRes.status).toBe(400);

    // 4. Alimentación individual histórica
    const whRes = await req('/api/feed/warehouses', {
      code: 'ALM-H', name: 'Almacén Histórico', barnId: 1, reason: 'Prueba', operationKey: crypto.randomUUID(),
    }, '1');
    expect(whRes.status, await whRes.clone().text()).toBe(201);
    const { warehouse } = await whRes.json() as { warehouse: { id: number } };
    expect((await req('/api/feed/movements', {
      movementType: 'purchase',
      effectiveDate: '2026-11-01',
      warehouseId: warehouse.id,
      feedCode: 'gestacion',
      lotCode: 'LOTE-H1',
      supplier: 'Proveedor prueba',
      quantityKg: 50,
      costPerKg: 2.5,
      currencyCode: 'PEN',
      reason: 'Compra inicial',
      operationKey: crypto.randomUUID(),
    }, '1')).status).toBe(201);

    const feedDeliveryRes = await req('/api/feed/movements', {
      movementType: 'delivery',
      effectiveDate: pastDate,
      warehouseId: warehouse.id,
      feedCode: 'gestacion',
      lotCode: 'LOTE-H1',
      quantityKg: 3,
      destinationBarnId: 1,
      animalCode: `id:${sow.animal.id}`,
      reason: 'Consumo anterior al alta en app',
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(feedDeliveryRes.status, await feedDeliveryRes.clone().text()).toBe(201);

    // 5. Finanzas históricas vinculadas al animal
    const financeRes = await req('/api/finance/entries', {
      direction: 'expense',
      category: 'Sanidad',
      concept: 'Gasto veterinario histórico',
      operationDate: pastDate,
      amount: '45.00',
      currencyCode: 'PEN',
      reason: 'Gasto previo al registro',
      allocations: [{ barnId: 1, amount: '45.00', animalCode: `id:${sow.animal.id}` }],
      operationKey: crypto.randomUUID(),
    }, '1');
    expect(financeRes.status, await financeRes.clone().text()).toBe(201);
  }, 90000);
});

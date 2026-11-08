import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { reconcileAlerts } from '../worker/alerts';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'cierre7-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'cierre7-db' } },
    },
  }],
});
afterAll(async () => runtime.dispose());

async function migrate(db: D1Database) {
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(part => part.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) {
        trigger += `${part}; `;
        if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
      } else await db.prepare(part).run();
    }
    if (trigger) throw new Error(`Trigger incompleto: ${file}`);
  }
}

describe('Cierre 7 · bandeja y contadores por galpón y cron diario', () => {
  it('separa galpones antes y después de medianoche local y preserva idempotencia ante ejecuciones repetidas del cron', async () => {
    const db = await runtime.getD1Database('DB');
    await migrate(db);

    const api = (path: string, body?: Record<string, unknown>, token?: string, method = body ? 'POST' : 'GET') =>
      worker.fetch(new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }), { DB: db });

    // 1. Crear administrador
    const bootstrap = await api('/api/auth/bootstrap', {
      username: 'admin-c7@granja.test',
      password: 'Cierre7Password2026!',
      name: 'Administrador Cierre 7',
    });
    expect(bootstrap.status).toBe(201);
    const adminToken = (await bootstrap.json() as { token: string }).token;

    // 2. Crear dos usuarios responsables asignados a Galpón A y Galpón B
    const createRespA = await api('/api/admin/users', {
      username: 'resp-a@granja.test',
      password: 'PasswordGalponA2026!',
      name: 'Responsable Galpón A',
      role: 'responsable',
      barnIds: [1],
    }, adminToken);
    expect(createRespA.status).toBe(201);

    const createRespB = await api('/api/admin/users', {
      username: 'resp-b@granja.test',
      password: 'PasswordGalponB2026!',
      name: 'Responsable Galpón B',
      role: 'responsable',
      barnIds: [2],
    }, adminToken);
    expect(createRespB.status).toBe(201);

    // Obtener tokens de sesión para Responsable A y B
    const loginA = await api('/api/auth/login', { username: 'resp-a@granja.test', password: 'PasswordGalponA2026!' });
    expect(loginA.status).toBe(200);
    const tokenA = (await loginA.json() as { token: string }).token;

    const loginB = await api('/api/auth/login', { username: 'resp-b@granja.test', password: 'PasswordGalponB2026!' });
    expect(loginB.status).toBe(200);
    const tokenB = (await loginB.json() as { token: string }).token;

    // 3. Crear animales en Galpón A (barnId 1) y Galpón B (barnId 2)
    const animalA = await api('/api/animals', {
      code: 'C7-MADRE-A',
      animalType: 'cerda',
      sex: 'hembra',
      birthDate: '2024-01-01',
      entryDate: '2026-01-01',
      entryStageCode: 'gestacion',
      barnId: 1,
      locationCode: 'galpon_a',
      originType: 'inicial',
      reason: 'Alta de cerda para cierre 7 en Galpón A',
      operationKey: 'c7-sow-a',
    }, adminToken);
    expect(animalA.status).toBe(201);

    const animalB = await api('/api/animals', {
      code: 'C7-ENGORDE-B',
      animalType: 'lechon',
      sex: 'macho',
      birthDate: '2026-05-01',
      entryDate: '2026-06-01',
      entryStageCode: 'inicio',
      barnId: 2,
      locationCode: 'galpon_b',
      originType: 'inicial',
      reason: 'Alta de animal para cierre 7 en Galpón B',
      operationKey: 'c7-pig-b',
    }, adminToken);
    expect(animalB.status).toBe(201);

    // 4. Sembrar eventos en Galpón A:
    // a) Vacuna programada para 2026-11-08 (today al día 1)
    const manualVacA = await api('/api/vaccines/schedules/manual', {
      animalCode: 'C7-MADRE-A',
      vaccineName: 'Parvovirus A',
      scheduledDate: '2026-11-08',
      reason: 'Vacuna programada para hoy en Galpón A',
      operationKey: 'c7-vac-a',
    }, adminToken);
    expect(manualVacA.status).toBe(201);

    // b) Ciclo reproductivo con parto probable el 2026-11-09 (+1 día: upcoming)
    const cycleA = await api('/api/reproduction/cycles', {
      femaleCode: 'C7-MADRE-A',
      serviceDate: '2026-07-18',
      serviceType: 'inseminacion_artificial',
      materialSource: 'external',
      externalSource: 'Genética Cierre 7',
      manualProbableDate: '2026-11-09',
      dueDateReason: 'Ajuste manual para cierre 7',
      operationKey: 'c7-cycle-a',
    }, adminToken);
    expect(cycleA.status).toBe(201);

    // 5. Sembrar eventos en Galpón B:
    // a) Vacuna programada para 2026-11-08 (today al día 1)
    const manualVacB = await api('/api/vaccines/schedules/manual', {
      animalCode: 'C7-ENGORDE-B',
      vaccineName: 'Micoplasma B',
      scheduledDate: '2026-11-08',
      reason: 'Vacuna programada para hoy en Galpón B',
      operationKey: 'c7-vac-b',
    }, adminToken);
    expect(manualVacB.status).toBe(201);

    // b) Tratamiento con próxima fecha 2026-11-07 (overdue al día 1)
    const treatmentB = await api('/api/health/events', {
      eventType: 'treatment',
      effectiveDate: '2026-11-01',
      animalCodes: ['C7-ENGORDE-B'],
      product: 'Antibiótico B',
      dosage: 2,
      dosageUnit: 'ml',
      nextDueDate: '2026-11-07',
      reason: 'Tratamiento con dosis vencida en Galpón B',
      operationKey: 'c7-treatment-b',
    }, adminToken);
    expect(treatmentB.status).toBe(201);

    // 6. Conciliar alertas al 2026-11-08
    const sync1 = await reconcileAlerts(db, { today: '2026-11-08' });
    expect(sync1.today).toBe('2026-11-08');

    // Comprobar bandeja y contadores de Responsable A al 2026-11-08
    const resA1 = await api('/api/alerts?asOf=2026-11-08', undefined, tokenA);
    expect(resA1.status).toBe(200);
    const dataA1 = await resA1.json() as {
      alerts: { title: string; barnId: number; barnName: string; bucket: string; type: string }[];
      counts: Record<string, number>;
    };
    // Responsable A solo ve Galpón A
    expect(dataA1.alerts.every(a => a.barnId === 1)).toBe(true);
    expect(dataA1.alerts.some(a => a.type === 'vaccine' && a.bucket === 'today')).toBe(true);
    expect(dataA1.alerts.some(a => a.type === 'farrowing' && a.bucket === 'upcoming')).toBe(true);
    expect(dataA1.counts['vaccine:today']).toBe(1);
    expect(dataA1.counts['farrowing:upcoming']).toBe(1);
    expect(dataA1.counts['treatment:overdue'] ?? 0).toBe(0);

    // Comprobar bandeja y contadores de Responsable B al 2026-11-08
    const resB1 = await api('/api/alerts?asOf=2026-11-08', undefined, tokenB);
    expect(resB1.status).toBe(200);
    const dataB1 = await resB1.json() as {
      alerts: { title: string; barnId: number; barnName: string; bucket: string; type: string }[];
      counts: Record<string, number>;
    };
    // Responsable B solo ve Galpón B
    expect(dataB1.alerts.every(a => a.barnId === 2)).toBe(true);
    expect(dataB1.alerts.some(a => a.type === 'vaccine' && a.bucket === 'today')).toBe(true);
    expect(dataB1.alerts.some(a => a.type === 'treatment' && a.bucket === 'overdue')).toBe(true);
    expect(dataB1.counts['vaccine:today']).toBe(1);
    expect(dataB1.counts['treatment:overdue']).toBe(1);
    expect(dataB1.counts['farrowing:upcoming'] ?? 0).toBe(0);

    // 7. Repetir la ejecución del cron 3 veces en 2026-11-08 para verificar idempotencia
    for (let i = 0; i < 3; i++) {
      await reconcileAlerts(db, { today: '2026-11-08' });
    }
    const resA1Repeat = await (await api('/api/alerts?asOf=2026-11-08', undefined, tokenA)).json() as typeof dataA1;
    expect(resA1Repeat.alerts.length).toBe(dataA1.alerts.length);
    expect(resA1Repeat.counts).toEqual(dataA1.counts);

    const resB1Repeat = await (await api('/api/alerts?asOf=2026-11-08', undefined, tokenB)).json() as typeof dataB1;
    expect(resB1Repeat.alerts.length).toBe(dataB1.alerts.length);
    expect(resB1Repeat.counts).toEqual(dataB1.counts);

    // 8. Pasa la medianoche local: el día pasa a 2026-11-09
    // Se ejecuta el cron programado para el nuevo día
    const cronMidnight = await reconcileAlerts(db, { today: '2026-11-09' });
    expect(cronMidnight.today).toBe('2026-11-09');

    // Comprobar bandeja y contadores de Responsable A tras medianoche
    const resA2 = await api('/api/alerts?asOf=2026-11-09', undefined, tokenA);
    expect(resA2.status).toBe(200);
    const dataA2 = await resA2.json() as typeof dataA1;
    expect(dataA2.alerts.every(a => a.barnId === 1)).toBe(true);
    // En Galpón A: la vacuna del 08 pasa a overdue, y el parto del 09 pasa a today
    expect(dataA2.alerts.find(a => a.type === 'vaccine')?.bucket).toBe('overdue');
    expect(dataA2.alerts.find(a => a.type === 'farrowing')?.bucket).toBe('today');
    expect(dataA2.counts['vaccine:overdue']).toBe(1);
    expect(dataA2.counts['farrowing:today']).toBe(1);
    expect(dataA2.counts['vaccine:today'] ?? 0).toBe(0);

    // Comprobar bandeja y contadores de Responsable B tras medianoche
    const resB2 = await api('/api/alerts?asOf=2026-11-09', undefined, tokenB);
    expect(resB2.status).toBe(200);
    const dataB2 = await resB2.json() as typeof dataB1;
    expect(dataB2.alerts.every(a => a.barnId === 2)).toBe(true);
    // En Galpón B: la vacuna del 08 pasa a overdue, y el tratamiento del 07 sigue overdue
    expect(dataB2.alerts.filter(a => a.bucket === 'overdue').length).toBe(2);
    expect(dataB2.counts['vaccine:overdue']).toBe(1);
    expect(dataB2.counts['treatment:overdue']).toBe(1);
    expect(dataB2.counts['vaccine:today'] ?? 0).toBe(0);

    // 9. Ejecutar nuevamente el cron repetido tras medianoche
    for (let i = 0; i < 2; i++) {
      await reconcileAlerts(db, { today: '2026-11-09' });
    }
    const resA2Repeat = await (await api('/api/alerts?asOf=2026-11-09', undefined, tokenA)).json() as typeof dataA1;
    expect(resA2Repeat.alerts.length).toBe(dataA2.alerts.length);
    expect(resA2Repeat.counts).toEqual(dataA2.counts);

    const resB2Repeat = await (await api('/api/alerts?asOf=2026-11-09', undefined, tokenB)).json() as typeof dataB1;
    expect(resB2Repeat.alerts.length).toBe(dataB2.alerts.length);
    expect(resB2Repeat.counts).toEqual(dataB2.counts);
  }, 60000);
});

import { expect, test } from './module-fixture';

test('programa un turno sin entrega y permite cancelarlo con motivo', async ({ page }) => {
  let supplyWrites = 0;
  let rationChanged = false;
  let futureStockRequests = 0;
  const plans: Record<string, unknown>[] = [];
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST' && /\/api\/feed\/(movements|turns)$/.test(new URL(route.request().url()).pathname)) supplyWrites++;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, json: { ok: true, user: { role: 'operario', username: 'operario@prueba.pe' } } }));
  await page.route('**/api/finance/barns', route => route.fulfill({ json: { barns: [{ id: 1, name: 'Galpón A' }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { catalogs: [{ key: 'alimento', items: [{ code: 'preinicio', name: 'Alimento preinicio' }] }] } }));
  await page.route('**/api/feed/warehouses', route => route.fulfill({ json: { warehouses: [{ id: 1, code: 'A', name: 'Almacén A', location: null, barnId: null, barnName: null }] } }));
  await page.route('**/api/feed/inventory**', route => {
    if (new URL(route.request().url()).searchParams.get('asOf') === '2026-11-10') futureStockRequests++;
    return route.fulfill({ json: { asOf: '2026-11-08', inventory: [], totals: { availableKg: 100, receivedKg: 100, withdrawnKg: 0, allocatedCostMinor: 0 } } });
  });
  await page.route('**/api/feed/movements**', route => route.fulfill({ json: { movements: [] } }));
  await page.route('**/api/feed/projection**', route => route.fulfill({ json: { stages: [{ stageCode: 'preinicio', stageName: 'Preinicio', heads: 10, feedCode: rationChanged ? 'gestacion' : 'preinicio', feedName: rationChanged ? 'Alimento gestación' : 'Alimento preinicio', dailyKg: 6.5, stageDays: 21, stageNeedKg: 136.5, monthlyNeedKg: 195, availableKg: 100, coveredDays: 15, dailyShortageKg: 0, stageShortageKg: 36.5, monthlyShortageKg: 95, requirements: [] }], feeds: [], turns: [], conversion: [] } }));
  await page.route('**/api/feed/plans**', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      const plan = { ...input, id: 1, barnName: 'Galpón A', servedKg: 0, consumedKg: null, pendingKg: Number(input.plannedKg), version: plans.length + 1 };
      plans.splice(0, plans.length, plan);
      await route.fulfill({ status: 201, json: { replayed: false, plan } });
    } else await route.fulfill({ json: { plans } });
  });
  await page.goto('/alimentacion');
  await page.getByRole('tab', { name: /turnos/i }).click();
  await page.getByLabel('Fecha del turno programado').fill('2026-11-10');
  await page.getByLabel('Galpón del turno programado').selectOption('1');
  await page.getByLabel('Etapa del turno programado').selectOption('preinicio');
  await page.getByLabel('Cantidad prevista del turno (kg)').fill('20');
  await page.getByLabel('Motivo de la programación').fill('Alimentación prevista de la mañana');
  await page.getByRole('button', { name: 'Guardar programación' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Galpón A · Preinicio' });
  await expect(row).toContainText('Pendiente: 20 kg');
  await expect(row).toContainText('Servido: 0 kg');
  expect(supplyWrites).toBe(0);
  expect(futureStockRequests).toBe(0);
  rationChanged = true;
  await page.getByRole('button', { name: 'Actualizar existencias y raciones', exact: true }).click();
  await page.getByRole('button', { name: /Editar programación/ }).click();
  await expect(page.getByLabel('Alimento previsto')).toHaveValue('Alimento preinicio');
  await page.getByLabel('Cantidad prevista del turno (kg)').fill('0');
  await page.getByLabel('Motivo de la programación').fill('Se canceló la alimentación prevista');
  await page.getByRole('button', { name: 'Guardar programación' }).click();
  await expect(row).toContainText('Cancelado');
  expect(supplyWrites).toBe(0);
  expect(plans[0].feedCode).toBe('preinicio');
  await page.screenshot({ path: 'test-results/feed-plans-mobile.png', fullPage: true });
});

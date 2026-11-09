import { expect, test } from '@playwright/test';

test('guardar informe conserva la clave si se pierde la respuesta tras guardar', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  const committed = new Map<string, string>();
  let loseResponse = true;
  const source = {
    id: 'animals', label: 'Animales', grain: 'Una ficha por animal', availableForBuilder: true,
    fields: [
      { key: 'animalCode', label: 'Código', dataType: 'text', filterable: true },
      { key: 'animalType', label: 'Tipo', dataType: 'text', filterable: true },
      { key: 'sex', label: 'Sexo', dataType: 'text', filterable: true },
      { key: 'status', label: 'Estado', dataType: 'text', filterable: true },
      { key: 'barn', label: 'Galpón', dataType: 'text', filterable: true },
    ],
  };
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, json: { ok: true, user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/reports/catalog', route => route.fulfill({ status: 200, json: { ok: true, sources: [source] } }));
  await page.route('**/api/reports/definitions', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, json: { ok: true, definitions: [] } });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const key = String(body.operationKey);
    requests.push(body);
    if (!committed.has(key)) committed.set(key, 'definition-1');
    if (loseResponse) {
      loseResponse = false;
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: 201, json: { ok: true, id: committed.get(key), name: body.name, purpose: body.purpose } });
  });
  await page.route('**/api/reports/dashboard**', route => route.fulfill({ status: 200, json: {
    ok: true, asOf: '2026-11-08', period: { from: null, to: '2026-11-08' }, barnsIncluded: 'Todos los galpones activos',
    totalAnimals: 0, animalsByType: [], barnCount: 0, pendingVaccines: 0, upcomingFarrowings: 0, sales: [], feedCosts: [],
  } }));
  await page.route('**/api/finance/barns', route => route.fulfill({ status: 200, json: { ok: true, barns: [] } }));

  await page.goto('/reportes');
  await page.getByRole('tab', { name: /Pestaña Diseñar Reporte/ }).click();
  await page.getByLabel('Nombre del reporte').fill('Animales para seguimiento');
  await page.getByLabel('Finalidad u objetivo').fill('Revisar los animales activos cada semana');
  await page.getByRole('button', { name: 'Guardar reporte' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
  await expect(page.getByLabel('Nombre del reporte')).toHaveValue('Animales para seguimiento');
  await page.getByRole('button', { name: 'Guardar reporte' }).click();
  await expect(page.getByRole('status')).toContainText('Informe guardado para tu usuario.');

  expect(requests).toHaveLength(2);
  expect(requests[0]?.operationKey).toBeTruthy();
  expect(requests[1]?.operationKey).toBe(requests[0]?.operationKey);
  expect(committed.size).toBe(1);
});

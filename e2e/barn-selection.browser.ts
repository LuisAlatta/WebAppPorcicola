import { expect, test } from '@playwright/test';

test('selecciona varios galpones antes de mostrar módulos y cambia el alcance', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/barns', route => route.fulfill({ json: { barns: [1, 2, 3].map(id => ({ id, name: `Galpón ${id}` })) } }));
  await page.goto('/inicio');
  await expect(page.getByRole('button', { name: 'Animales', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Galpones', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Administrar galpones', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Galpón 1', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Galpón 3', exact: true }).check();
  await expect(page.getByText('2 galpones seleccionados', { exact: true })).toBeVisible();
  const firstCard = await page.locator('.barn-selection-option').nth(0).boundingBox();
  const secondCard = await page.locator('.barn-selection-option').nth(1).boundingBox();
  expect(firstCard?.width).toBe(secondCard?.width);
  expect(firstCard?.height).toBe(secondCard?.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Galpones: Galpón 1, Galpón 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Animales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar galpones', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Galpón 1', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Galpón 3', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Galpones: Galpón 1', { exact: true })).toBeVisible();
});

for (const role of ['responsable', 'operario', 'veterinario']) {
  test(`abre los galpones asignados sin gestión para ${role}`, async ({ page }) => {
    await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { error: 'Sin sesión' } }));
    await page.route('**/api/auth/login', route => route.fulfill({ json: { user: { role, username: 'personal@prueba.pe' } } }));
    await page.route('**/api/barns', route => route.fulfill({ json: { barns: [{ id: 3, name: 'Galpón asignado' }] } }));
    await page.goto('/login');
    await page.getByLabel('Usuario', { exact: true }).fill('personal@prueba.pe');
    await page.getByLabel('Contraseña', { exact: true }).fill('ClaveDePrueba2026!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/galpones$/);
    await expect(page.getByRole('checkbox', { name: 'Galpón asignado' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Administrar galpones', exact: true })).toHaveCount(0);
  });
}

test('administrador gestiona galpones desde la selección y actualiza la lista al volver', async ({ page }) => {
  let barn = { id: 1, code: 'G-1', name: 'Galpón 1', zone: 'Norte', capacity: 80, status: 'preparacion', responsable: null, operario: null, veterinario: null, pensCount: 0 };
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/barns', route => route.fulfill({ json: { barns: [barn] } }));
  await page.route('**/api/admin/users', route => route.fulfill({ json: { users: [] } }));
  await page.route('**/api/admin/history', route => route.fulfill({ json: { history: [] } }));
  await page.route('**/api/admin/audit?**', route => route.fulfill({ json: { audit: [] } }));
  await page.route('**/api/admin/barns', route => route.fulfill({ json: { barns: [barn] } }));
  await page.route('**/api/admin/barns/1', async route => {
    expect(route.request().method()).toBe('PUT');
    barn = { ...barn, ...route.request().postDataJSON() };
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/inicio');
  await page.getByRole('button', { name: 'Administrar galpones', exact: true }).click();
  await page.getByRole('button', { name: 'Editar galpón Galpón 1', exact: true }).click();
  await expect(page.getByLabel('Código Único:')).toBeDisabled();
  await page.getByLabel('Nombre del Galpón:').fill('Galpón renovado');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar galpón Galpón renovado', exact: true })).toBeVisible();
  await expect(page.locator('.barn-admin-card')).toHaveCount(1);
  await expect(page.locator('.barn-admin-card .barn-team-missing')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Asignar personal a Galpón renovado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Asignación y Activación del Equipo Operativo' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a seleccionar galpones', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Galpón renovado', exact: true })).toBeVisible();
});

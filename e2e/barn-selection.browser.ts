import { expect, test } from '@playwright/test';

test('selecciona varios galpones antes de mostrar módulos y cambia el alcance', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/barns', route => route.fulfill({ json: { barns: [1, 2, 3].map(id => ({ id, name: `Galpón ${id}` })) } }));
  await page.goto('/inicio');
  await expect(page.getByRole('button', { name: 'Animales', exact: true })).toHaveCount(0);
  await page.getByRole('main').getByRole('button', { name: 'Galpones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Galpón 1', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Galpón 3', exact: true }).check();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Galpones: Galpón 1, Galpón 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Animales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar galpones', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Galpón 1', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Galpón 3', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Galpones: Galpón 1', { exact: true })).toBeVisible();
});

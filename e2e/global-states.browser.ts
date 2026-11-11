import { expect, test } from '@playwright/test';

test('reintento de sesión vuelve al acceso y permite mostrar la contraseña', async ({ page }) => {
  let failing = true;
  await page.route('**/api/auth/me', route => failing ? route.abort('failed') : route.fulfill({ status: 401, json: { error: 'Sin sesión' } }));
  await page.goto('/animales');
  await expect(page.getByRole('heading', { name: 'No se pudo comprobar la sesión' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  const password = page.getByLabel('Contraseña', { exact: true });
  await password.fill('ClaveDePrueba2026!');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('acceso restringido ofrece volver sin mostrar administración', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'operario', username: 'operario@prueba.pe' } } }));
  await page.route('**/api/barns', route => route.fulfill({ json: { barns: [{ id: 1, name: 'Galpón A' }] } }));
  await page.goto('/administracion');
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  await page.locator('.session-check').getByRole('button', { name: 'Volver al Inicio' }).click();
  await expect(page.getByRole('heading', { name: 'Galpones', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva Cuenta' })).toHaveCount(0);
});

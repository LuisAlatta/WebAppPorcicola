import { expect, test } from './module-fixture';

test('busca animales para sanidad y conserva selecciones entre búsquedas', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, json: { user: { role: 'veterinario', username: 'vet@prueba.pe' } } }));
  for (const path of ['events', 'upcoming', 'withdrawals']) await page.route(`**/api/health/${path}?**`, route => route.fulfill({ status: 200, json: { events: [], alerts: [] } }));
  await page.route('**/api/animals?**', route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    const code = q === 'ULTIMO' ? 'ULTIMO-999' : 'PRIMERO-001';
    return route.fulfill({ status: 200, json: { animals: [{ id: code === 'ULTIMO-999' ? 999 : 1, code, barnName: 'Galpón A' }], total: 1 } });
  });
  await page.goto('/sanidad');
  await page.getByRole('tab', { name: /Registrar tratamiento/ }).click();
  const picker = page.getByLabel('Animales aplicables', { exact: true });
  await picker.selectOption('PRIMERO-001');
  await page.getByLabel('Buscar animales para tratamiento', { exact: true }).fill('ULTIMO');
  await expect(picker.locator('option')).toHaveCount(2);
  await picker.selectOption(['PRIMERO-001', 'ULTIMO-999']);
  await expect(picker).toHaveValues(['PRIMERO-001', 'ULTIMO-999']);
});

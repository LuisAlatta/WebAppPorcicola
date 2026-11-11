import { expect, test } from './module-fixture';

test('ubicaciones y lotes abren modales independientes y conservan datos ante conflicto', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/admin/barns', route => route.fulfill({ json: { barns: [{ id: 1, name: 'Galpón A', status: 'operativo' }] } }));
  await page.route('**/api/config?**', route => route.fulfill({ json: {
    asOf: '2026-11-11', settings: [], catalogs: [], stages: [], lots: [],
    locations: [{ id: 1, code: 'corral-a', name: 'Corral A', locationType: 'corral', parentCode: 'galpon-a', barnId: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'active' }],
  } }));
  await page.route('**/api/config/locations', route => route.fulfill({ status: 409, json: { error: 'La ubicación cambió; revise la versión.' } }));
  await page.goto('/configuracion');
  await page.getByRole('tab', { name: 'Ubicaciones y Lotes' }).click();
  const locations = page.getByRole('list', { name: 'Ubicaciones físicas' });
  await expect(locations).toContainText('Corral A');
  await locations.getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Código', { exact: true })).toHaveValue('corral-a');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar ubicación' }).click();
  await expect(dialog.getByLabel('Código', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Código', { exact: true }).fill('galpon-nuevo');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Galpón nuevo');
  await dialog.getByLabel('Galpón vinculado', { exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Guardar Ubicación' }).click();
  await expect(dialog.getByRole('alert')).toContainText('La ubicación cambió');
  await expect(dialog.getByLabel('Código', { exact: true })).toHaveValue('galpon-nuevo');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  await expect(dialog.getByRole('heading', { name: 'Lote de manejo' })).toBeVisible();
  await expect(dialog.getByLabel('Código', { exact: true })).toHaveValue('');
});

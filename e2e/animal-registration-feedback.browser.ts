import { expect, test, type Page } from './module-fixture';

async function openRegistration(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ok: true, user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/animals*', route => route.fulfill({ json: {
    animals: [], total: 0, options: {
      barns: [{ id: 1, code: 'A', name: 'Galpón A' }],
      stages: [{ code: 'inicio', name: 'Inicio' }],
      types: [{ code: 'lechon', name: 'Lechón' }],
      sexes: [{ code: 'pendiente', name: 'Pendiente' }],
      origins: [{ code: 'nacimiento', name: 'Nacimiento' }, { code: 'interna', name: 'Interna' }],
      locations: [], lots: [], aptitudes: [], statuses: [], deathCauses: [], saleCauses: [],
    },
  } }));
  await page.goto('/animales');
  await page.getByRole('button', { name: 'Registrar animal en el padrón', exact: true }).click();
}

test('explica el error de la imagen, enfoca procedencia y conserva el código', async ({ page }) => {
  await openRegistration(page);
  await page.getByLabel('Código permanente', { exact: true }).fill('00080');
  await page.getByLabel('Procedencia', { exact: true }).selectOption('interna');
  await page.route('**/api/animals', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 409, json: { error: 'No hay cabezas sin identificar en ese grupo para vincular la ficha' } })
    : route.fallback());
  await page.getByRole('button', { name: 'Registrar animal en el padrón', exact: true }).click();
  await expect(page.getByLabel('Procedencia', { exact: true })).toBeFocused();
  await expect(page.locator('[data-form-error]')).toContainText('No se ha guardado la ficha');
  await expect(page.getByLabel('Código permanente', { exact: true })).toHaveValue('00080');
  await expect(page.getByLabel('Procedencia', { exact: true })).toHaveValue('interna');
  await expect(page.getByRole('dialog', { name: 'Guardado con éxito' })).toHaveCount(0);
});

test('marca campos obligatorios sin enviar una ficha incompleta', async ({ page }) => {
  await openRegistration(page);
  let submissions = 0;
  await page.route('**/api/animals', route => {
    if (route.request().method() === 'POST') submissions++;
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Registrar animal en el padrón', exact: true }).click();
  await expect(page.getByLabel('Código permanente', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Código permanente', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(submissions).toBe(0);
});

test('bloquea el formulario durante el envío y confirma en el centro del móvil', async ({ page }) => {
  await openRegistration(page);
  await page.getByLabel('Código permanente', { exact: true }).fill('00080');
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/animals', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await responseReady;
    return route.fulfill({ status: 201, json: { animal: {
      ...route.request().postDataJSON(), id: 80, code: '00080', currentTag: '00080',
      isActive: true, status: 'activo', statusLabel: 'Activo', animalTypeLabel: 'Lechón',
      sexLabel: 'Pendiente', barnName: 'Galpón A', stageName: 'Inicio',
      currentWeightKg: null, birthWeightKg: null, weaningWeightKg: null,
      tags: [], typeHistory: [], weights: [], chronology: [], mother: null, father: null,
      reproductiveSummary: null,
    } } });
  });
  await page.getByRole('button', { name: 'Registrar animal en el padrón', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardando ficha…', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Código permanente', { exact: true })).toBeDisabled();
  release();
  const notice = page.getByRole('dialog', { name: 'Guardado con éxito', exact: true });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('00080');
  const rect = await notice.boundingBox();
  expect(rect).not.toBeNull();
  expect(Math.abs(rect!.y + rect!.height / 2 - page.viewportSize()!.height / 2)).toBeLessThan(2);
  await notice.getByRole('button', { name: 'Continuar a la ficha', exact: true }).click();
  await expect(notice).toHaveCount(0);
});

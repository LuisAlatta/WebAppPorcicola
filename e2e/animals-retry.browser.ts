import { expect, test, type Page } from '@playwright/test';

const initialAnimal = () => ({
  id: 1,
  code: 'RETRY-001',
  currentTag: 'ARETE-001',
  alias: null,
  animalType: 'lechon',
  animalTypeLabel: 'Lechón',
  sex: 'macho',
  sexLabel: 'Macho',
  breed: null,
  status: 'activo',
  statusLabel: 'Activo',
  isActive: true,
  birthDate: null,
  ageDays: null,
  ageLabel: null,
  currentWeightKg: null,
  currentWeightDate: null,
  birthWeightKg: null,
  weaningDate: null,
  weaningWeightKg: null,
  aptitude: null,
  barnId: 1,
  barnCode: 'A',
  barnName: 'Galpón A',
  stageCode: 'crecimiento',
  stageName: 'Crecimiento',
  locationCode: null,
  locationName: null,
  lotCode: null,
  lotName: null,
  entryDate: '2026-01-01',
  exitDate: null,
  exitType: null,
  observations: null,
  originType: 'inicial',
  originLabel: 'Inicial',
  originDetail: null,
  entryStageCode: 'crecimiento',
  mother: null,
  father: null,
  tags: [{ id: 1, tag: 'ARETE-001', validFrom: '2026-01-01', validTo: null, isCurrent: true }],
  typeHistory: [],
  weights: [],
  chronology: [],
  ageReference: '2026-11-08',
});

const listOptions = {
  barns: [{ id: 1, code: 'A', name: 'Galpón A' }],
  stages: [{ code: 'crecimiento', name: 'Crecimiento' }],
  locations: [], lots: [], aptitudes: [], types: [], sexes: [], statuses: [], origins: [], deathCauses: [], saleCauses: [],
};

async function mockAnimalApi(page: Page, initial: ReturnType<typeof initialAnimal>) {
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, json: { ok: true, user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/animals*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname.endsWith('/tags')) return route.fulfill({ status: 400, json: { error: 'No llegó a la ruta de prueba específica' } });
    if (route.request().method() === 'GET' && url.pathname === '/api/animals') {
      const listAnimal = { ...initial, originType: undefined, originLabel: undefined, originDetail: undefined, entryStageCode: undefined, mother: undefined, father: undefined, tags: undefined, typeHistory: undefined, weights: undefined, chronology: undefined, ageReference: undefined };
      return route.fulfill({ status: 200, json: { ok: true, animals: [listAnimal], total: 1, options: listOptions } });
    }
    if (route.request().method() === 'GET' && url.pathname === '/api/animals/RETRY-001') {
      return route.fulfill({ status: 200, json: { ok: true, animal: initial } });
    }
    return route.fulfill({ status: 200, json: { ok: true, animal: initial } });
  });
  await page.route('**/api/animals/RETRY-001', route => route.fulfill({ status: 200, json: { ok: true, animal: initial } }));
}

test('ficha muestra el resumen reproductivo y la causa de salida', async ({ page }) => {
  const animal = { ...initialAnimal(), sex: 'hembra', sexLabel: 'Hembra', exitDate: '2026-11-07', exitType: 'death', status: 'muerto', statusLabel: 'Muerto', exitCauseCode: 'enfermedad', exitCauseLabel: 'Enfermedad', reproductiveSummary: {serviceCount: 3, farrowingCount: 2, firstFarrowingDate: '2026-01-10', lastFarrowingDate: '2026-09-10', totalBorn: 19, maleBorn: 10, femaleBorn: 9, unsexedBorn: 0, averageBirthWeightKg: 1.45, weighedBirths: 17} };
  await mockAnimalApi(page, animal);
  await page.goto('/animal/RETRY-001');
  await expect(page.getByRole('cell', {name:'Muerte · Enfermedad'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Servicios'})).toContainText('3');
  await expect(page.getByRole('row').filter({hasText:'Primer parto'})).toContainText('2026-01-10');
  await expect(page.getByRole('row').filter({hasText:'Peso promedio de crías vivas'})).toContainText('17 crías vivas');
});

test('cambiar arete reintenta la misma operación después de perderse la respuesta', async ({ page }) => {
  let animal = initialAnimal();
  const operationKeys: string[] = [];
  const committed = new Set<string>();
  await mockAnimalApi(page, animal);
  await page.route('**/api/animals/RETRY-001/tags', async route => {
    const body = route.request().postDataJSON() as { operationKey: string; tag: string };
    operationKeys.push(body.operationKey);
    if (!committed.has(body.operationKey)) {
      committed.add(body.operationKey);
      animal = { ...animal, currentTag: body.tag, tags: [...animal.tags, { id: 2, tag: body.tag, validFrom: '2026-11-08', validTo: null, isCurrent: true }] };
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: 200, json: { ok: true, replayed: true, animal } });
  });

  await page.goto('/animales');
  await page.getByRole('button', { name: 'Ver ficha' }).click();
  await page.getByLabel('Nuevo arete').fill('ARETE-002');
  await page.locator('#ani-tag-reason').fill('Reposición del arete dañado');
  await page.getByRole('button', { name: 'Cambiar arete' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
  await page.getByRole('button', { name: 'Cambiar arete' }).click();
  await expect(page.getByText('Arete actualizado a ARETE-002. El anterior se conserva con su fecha.')).toBeVisible();

  expect(operationKeys).toHaveLength(2);
  expect(operationKeys[0]).toBeTruthy();
  expect(operationKeys[1]).toBe(operationKeys[0]);
  expect(committed.size).toBe(1);
});

test('desactivar una ficha reintenta con la clave del primer envío incierto', async ({ page }) => {
  let animal = initialAnimal();
  const operationKeys: string[] = [];
  const committed = new Set<string>();
  await mockAnimalApi(page, animal);
  await page.route('**/api/animals/RETRY-001/deactivate', async route => {
    const body = route.request().postDataJSON() as { operationKey: string };
    operationKeys.push(body.operationKey);
    if (!committed.has(body.operationKey)) {
      committed.add(body.operationKey);
      animal = { ...animal, isActive: false };
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: 200, json: { ok: true, replayed: true, animal } });
  });

  await page.goto('/animales');
  await page.getByRole('button', { name: 'Ver ficha' }).click();
  await page.locator('#ani-toggle-reason').fill('Ficha reservada para evaluación');
  await page.getByRole('button', { name: 'Desactivar ficha' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
  await page.getByRole('button', { name: 'Desactivar ficha' }).click();
  await expect(page.getByText('La ficha RETRY-001 quedó inactiva sin registrar venta ni muerte.')).toBeVisible();

  expect(operationKeys).toHaveLength(2);
  expect(operationKeys[0]).toBeTruthy();
  expect(operationKeys[1]).toBe(operationKeys[0]);
  expect(committed.size).toBe(1);
});

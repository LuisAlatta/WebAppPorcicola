import { expect, test, type Page } from './module-fixture';

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
  stages: [{ code: 'crecimiento', name: 'Crecimiento' }, {code:'inicio',name:'Inicio'}],
  locations: [{code:'galpon_a',name:'Galpón A'},{code:'corral_maternidad',name:'Corral Maternidad'}],
  lots: [{code:'lote_levante_a',name:'Lote Levante A'},{code:'lote_engorde_a',name:'Lote Engorde A'}],
  aptitudes: [], types: [], sexes: [], statuses: [], origins: [], deathCauses: [], saleCauses: [{code:'edad',name:'Edad'}],
};

test('padrón compacto con filtros desplegables y acciones simétricas', async ({ page }) => {
  await mockAnimalApi(page, initialAnimal());
  await page.goto('/animales');
  await expect(page.getByRole('button', { name: 'Ver ficha de RETRY-001', exact: true })).toBeVisible();
  await expect(page.getByText('Padrón general', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Identificación oficial permanente, genealogía, pesajes periódicos y trazabilidad de cada animal.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.animal-context-bar .animal-barn-card')).toHaveCount(2);
  await expect(page.locator('.animal-search-bar button')).toHaveCount(3);
  const searchRow = await page.locator('.animal-search-bar').evaluate(form => {
    const elements = [...form.querySelectorAll('input,button')];
    return elements.map(element => { const rect = element.getBoundingClientRect(); return { center: rect.y + rect.height / 2, text: element.tagName === 'BUTTON' ? element.textContent?.trim() : '' }; });
  });
  expect(Math.max(...searchRow.map(item => item.center)) - Math.min(...searchRow.map(item => item.center))).toBeLessThan(2);
  expect(searchRow.every(item => !item.text)).toBe(true);
  await expect(page.getByText('Animales en el padrón', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Fichas inactivas', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Con peso actual', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Estado productivo', { exact: true })).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Filtros', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Estado productivo', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const actions = page.locator('.animal-card-actions .animal-action');
  const styles = await actions.evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height, color: getComputedStyle(button).backgroundColor };
  }));
  expect(styles).toHaveLength(3);
  expect(new Set(styles.map(style => `${style.width},${style.height}`)).size).toBe(1);
  expect(new Set(styles.map(style => style.color)).size).toBe(3);
  await expect(page.locator('.animal-card')).toHaveCount(1);
  await expect(page.locator('.animal-card-meta')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const pager = page.getByRole('navigation', { name: 'Páginas del padrón', exact: true });
  expect(await pager.evaluate(element => element.closest('.table-responsive, .animal-card-list') === null)).toBe(true);
  const before = await pager.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const after = await pager.boundingBox();
  expect(after?.x).toBe(before?.x);
});

test('en escritorio conserva la tabla y la paginación fuera de su desplazamiento', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockAnimalApi(page, initialAnimal());
  await page.goto('/animales');
  await expect(page.locator('.animal-card-list')).toHaveCount(0);
  await expect(page.locator('.table-responsive table[aria-label="Padrón de animales"]')).toBeVisible();
  const pager = page.getByRole('navigation', { name: 'Páginas del padrón', exact: true });
  expect(await pager.evaluate(element => element.closest('.table-responsive') === null)).toBe(true);
  const before = await pager.boundingBox();
  await page.locator('.table-responsive').evaluate(element => { element.scrollLeft = element.scrollWidth; });
  const after = await pager.boundingBox();
  expect(after?.x).toBe(before?.x);
});

test('pagina el padrón y vuelve al inicio al cambiar la búsqueda', async ({page}) => {
  await mockAnimalApi(page, initialAnimal());
  const queries: string[] = [];
  await page.route('**/api/animals?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query.toString());
    const offset = Number(query.get('offset') ?? 0);
    return route.fulfill({status:200,json:{animals:[{...initialAnimal(),code:offset ? 'PAGINA-2' : 'PAGINA-1'}],total:query.get('q') ? 1 : 501,options:listOptions}});
  });
  await page.goto('/animales');
  await page.getByRole('button',{name:'Página siguiente del padrón',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ver ficha de PAGINA-2',exact:true})).toBeVisible();
  await page.getByLabel('Buscar',{exact:true}).fill('PAGINA-1');
  await expect(page.getByRole('button',{name:'Ver ficha de PAGINA-2',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ver ficha de PAGINA-1',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Página anterior del padrón',exact:true})).toBeDisabled();
  expect(queries.some(value=>new URLSearchParams(value).get('offset')==='50')).toBe(true);
  await expect.poll(()=>{const query=new URLSearchParams(queries.at(-1));return {q:query.get('q'),offset:query.get('offset')};}).toEqual({q:'PAGINA-1',offset:'0'});
});

test('busca una madre fuera de las primeras quinientas fichas', async ({page}) => {
  await mockAnimalApi(page, initialAnimal());
  await page.route('**/api/animals?**', route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({status:200,json:{animals:q==='MADRE-999' ? [{...initialAnimal(),id:999,code:'MADRE-999',sex:'hembra'}] : [],total:q ? 1 : 999,options:listOptions}});
  });
  await page.goto('/animales');
  await page.getByRole('button',{name:'Registrar animal en el padrón',exact:true}).click();
  await page.getByLabel('Buscar madre interna',{exact:true}).fill('MADRE-999');
  await page.getByLabel('Madre interna',{exact:true}).selectOption('999');
  await expect(page.getByLabel('Madre interna',{exact:true})).toHaveValue('999');
});

test('recupera la página anterior cuando desaparece la última ficha de la página final', async ({page}) => {
  await mockAnimalApi(page, initialAnimal());
  let removed = false;
  await page.route('**/api/animals?**', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0);
    return route.fulfill({status:200,json:{animals:removed && offset ? [] : [{...initialAnimal(),code:offset ? 'ULTIMA-051' : 'PRIMERA-001'}],total:removed ? 50 : 51,options:listOptions}});
  });
  await page.goto('/animales');
  await page.getByRole('button',{name:'Página siguiente del padrón',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ver ficha de ULTIMA-051',exact:true})).toBeVisible();
  removed = true;
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ver ficha de PRIMERA-001',exact:true})).toBeVisible();
});

test('el padrón envía los filtros adicionales combinados', async ({ page }) => {
  await mockAnimalApi(page, initialAnimal());
  const requests: string[] = [];
  await page.route('**/api/animals?**', async route => {
    requests.push(route.request().url());
    await route.fulfill({ status:200,json:{ok:true,animals:[],total:0,options:{...listOptions,aptitudes:[{code:'engorde',name:'Engorde'}]}} });
  });
  await page.goto('/animales');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('Madre', {exact:true}).fill('MADRE-01');
  await page.getByLabel('Padre', {exact:true}).fill('PADRE-02');
  await page.getByLabel('Raza', {exact:true}).fill('Duroc');
  await page.getByLabel('Aptitud', {exact:true}).selectOption('engorde');
  await page.getByLabel('Procedencia', {exact:true}).selectOption('inicial');
  await page.getByLabel('Etapa de ingreso', {exact:true}).selectOption('crecimiento');
  expect(requests.some(value => new URL(value).searchParams.has('mother'))).toBe(false);
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect.poll(()=>requests.some(value=>{const q=new URL(value).searchParams;return q.get('mother')==='MADRE-01'&&q.get('father')==='PADRE-02'&&q.get('breed')==='Duroc'&&q.get('aptitude')==='engorde'&&q.get('originType')==='inicial'&&q.get('entryStage')==='crecimiento';})).toBe(true);
});

test('aplica estado de salida sin cruzarlo con solo activas y permite reaplicarlo', async ({ page }) => {
  await mockAnimalApi(page, initialAnimal());
  const queries: string[] = [];
  await page.route('**/api/animals?**', route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query.toString());
    const matches = query.get('status') === 'vendido' && query.get('active') !== '1';
    return route.fulfill({ json: { animals: matches ? [{ ...initialAnimal(), code: 'VENDIDO-001', status: 'vendido', isActive: false }] : [initialAnimal()], total: 1, options: { ...listOptions, statuses: [{ code: 'vendido', name: 'Vendido' }] } } });
  });
  await page.goto('/animales');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('Estado productivo', { exact: true }).selectOption('vendido');
  await expect(page.getByLabel('Disponibilidad', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver ficha de VENDIDO-001', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toHaveAttribute('aria-expanded', 'false');
  const previous = queries.length;
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect.poll(() => queries.length).toBeGreaterThan(previous);
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
});

test('descarte desde la ficha no solicita importe y envía su causa',async({page})=>{
  const animal=initialAnimal();let sent:Record<string,unknown>|undefined;
  await mockAnimalApi(page,animal);
  await page.route('**/api/animals?**',route=>route.fulfill({status:200,json:{animals:[animal],total:1,options:{...listOptions,saleCauses:[{code:'edad',name:'Edad'}]}}}));
  await page.route('**/api/animals/RETRY-001/exit',route=>{sent=route.request().postDataJSON() as Record<string,unknown>;return route.fulfill({status:201,json:{animal:{...animal,status:'descartado',statusLabel:'Descartado',exitType:'discard',exitDate:'2026-11-07',exitCauseLabel:'Edad',isActive:false}}});});
  await page.goto('/animales');await page.getByRole('button',{name:'Ver ficha'}).click();
  await page.getByRole('tab', { name: /Gestión y Traslados/ }).click();
  await page.getByLabel('Tipo de salida').selectOption('discard');await expect(page.getByLabel('Importe de venta')).toHaveCount(0);
  await page.getByLabel('Causa',{exact:true}).selectOption('edad');await page.locator('#ani-exit-date').fill('2026-11-07');await page.locator('#ani-exit-reason').fill('Retiro por edad');const submitExit=page.getByRole('button',{name:'Registrar baja de animal'});await submitExit.focus();await submitExit.press('Enter');
  await page.getByRole('tab', { name: /Datos técnicos/ }).click();
  await expect(page.getByText('Descarte · Edad',{exact:true})).toBeVisible();expect(sent).toMatchObject({exitType:'discard',causeCode:'edad',effectiveDate:'2026-11-07'});
});

test('el pesaje permite elegir la etapa que actualizará la ficha',async({page})=>{
  const animal=initialAnimal();let sent:Record<string,unknown>|undefined;
  await mockAnimalApi(page,animal);
  await page.route('**/api/animals/RETRY-001/weights',route=>{sent=route.request().postDataJSON() as Record<string,unknown>;return route.fulfill({status:201,json:{animal:{...animal,stageCode:'inicio',stageName:'Inicio'}}});});
  await page.goto('/animales');await page.getByRole('button',{name:'Ver ficha'}).click();
  await page.getByRole('tab', { name: /Pesajes y GMD/ }).click();
  await page.locator('#ani-weight-kg').fill('18');await page.locator('#ani-weight-stage').selectOption('inicio');
  await expect(page.getByText('Si elige otra etapa, se actualizarán la ficha y el inventario',{exact:false})).toBeVisible();
  const saveWeight=page.getByRole('button',{name:'Pesar animal y registrar en ficha'});await saveWeight.focus();await saveWeight.press('Enter');await expect.poll(()=>sent?.stageCode).toBe('inicio');
});

test('traslada la ficha a otro corral y lote dentro del mismo galpón',async({page})=>{
  const animal={...initialAnimal(),locationCode:'galpon_a',locationName:'Galpón A',lotCode:'lote_levante_a',lotName:'Lote Levante A'};
  let sent:Record<string,unknown>|undefined;
  await mockAnimalApi(page,animal);
  await page.route('**/api/animals/RETRY-001/transfer',route=>{sent=route.request().postDataJSON() as Record<string,unknown>;return route.fulfill({status:201,json:{animal:{...animal,locationCode:'corral_maternidad',locationName:'Corral Maternidad',lotCode:'lote_engorde_a',lotName:'Lote Engorde A'}}});});
  await page.goto('/animales');
  await page.getByRole('button',{name:'Ver ficha'}).click();
  await page.getByRole('tab',{name:/Gestión y Traslados/}).click();
  await page.getByLabel('Galpón destino').selectOption('1');
  await page.getByLabel('Ubicación').selectOption('corral_maternidad');
  await page.getByLabel('Lote').selectOption('lote_engorde_a');
  await page.locator('#ani-transfer-reason').fill('Cambio interno de corral y lote');
  await page.getByRole('button',{name:'Trasladar animal a galpón'}).click();
  await expect.poll(()=>sent).toMatchObject({destinationBarnId:1,locationCode:'corral_maternidad',lotCode:'lote_engorde_a',destinationStageCode:'crecimiento',reason:'Cambio interno de corral y lote'});
  await expect(page.getByText('Animal RETRY-001 trasladado y su historial de galpón actualizado.')).toBeVisible();
});

test('filtra los corrales por galpón y limpia el destino anterior al cambiarlo', async ({page}) => {
  await mockAnimalApi(page, initialAnimal());
  await page.route('**/api/animals?**', route => route.fulfill({status:200,json:{
    animals:[initialAnimal()],total:1,options:{...listOptions,
      barns:[...listOptions.barns,{id:2,code:'B',name:'Galpón B'}],
      locations:[{code:'corral_a',name:'Corral A',barnId:1},{code:'corral_b',name:'Corral B',barnId:2}],
    },
  }}));
  await page.goto('/animales');
  await page.getByRole('button',{name:'Registrar animal en el padrón',exact:true}).click();
  await page.locator('#ani-barn').selectOption('1');
  await expect(page.locator('#ani-location option[value="corral_b"]')).toHaveCount(0);
  await page.locator('#ani-location').selectOption('corral_a');
  await page.locator('#ani-barn').selectOption('2');
  await expect(page.locator('#ani-location')).toHaveValue('');
  await expect(page.locator('#ani-location option[value="corral_a"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Ir a sección padrón de animales',exact:true}).click();
  await page.getByRole('button',{name:'Ver ficha'}).click();
  await page.getByRole('tab',{name:/Gestión y Traslados/}).click();
  await page.getByLabel('Galpón destino').selectOption('1');
  await page.getByLabel('Ubicación').selectOption('corral_a');
  await page.getByLabel('Galpón destino').selectOption('2');
  await expect(page.getByLabel('Ubicación')).toHaveValue('');
  await expect(page.locator('#ani-transfer-location option[value="corral_a"]')).toHaveCount(0);
});

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

test('edita y elimina desde las acciones del padrón con confirmación', async ({ page }) => {
  await mockAnimalApi(page, initialAnimal());
  let deletions = 0;
  await page.route('**/api/animals/RETRY-001/deactivate', async route => {
    deletions++;
    expect(route.request().headers()['x-barn-ids']).toBe('1,2');
    expect(route.request().postDataJSON()).toMatchObject({ reason: 'Ficha duplicada' });
    await route.fulfill({ json: { animal: { ...initialAnimal(), isActive: false } } });
  });
  await page.goto('/animales');
  await page.getByRole('button', { name: 'Ver ficha de RETRY-001', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ficha del animal RETRY-001', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/animales$/);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.getByRole('button', { name: 'Cerrar ficha del animal', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.getByRole('button', { name: 'Editar animal RETRY-001', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Editar animal RETRY-001', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar cambios de la ficha', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/animales$/);
  await page.getByRole('button', { name: 'Cerrar ficha del animal', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar animal RETRY-001', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(deletions).toBe(0);
  await page.getByRole('button', { name: 'Eliminar animal RETRY-001', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar eliminación', exact: true })).toBeDisabled();
  await page.getByLabel('Motivo de eliminación', { exact: true }).fill('Ficha duplicada');
  await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(deletions).toBe(1);
});

for (const action of ['Ver ficha de', 'Editar animal']) {
  test(`${action} muestra carga inmediata y no repite volver al padrón`, async ({ page }) => {
    await mockAnimalApi(page, initialAnimal());
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/animals/RETRY-001', async route => {
      await gate;
      await route.fulfill({ json: { animal: initialAnimal() } });
    });
    await page.goto('/animales');
    await page.getByRole('button', { name: `${action} RETRY-001`, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Cargando ficha del animal');
    await expect(page.locator('.animal-loading-skeleton')).toBeVisible();
    release();
    const dialog = page.getByRole('dialog');
    if (action === 'Editar animal') await expect(dialog.getByRole('button', { name: 'Guardar cambios de la ficha', exact: true })).toBeVisible();
    else await expect(dialog.getByRole('tab', { name: 'Datos técnicos', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Volver al padrón/ })).toHaveCount(0);
    await expect(page.locator('.animal-loading-skeleton')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cerrar ficha del animal', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test('confirmar eliminación muestra progreso hasta recibir la respuesta', async ({ page }) => {
  await mockAnimalApi(page, initialAnimal());
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/animals/RETRY-001/deactivate', async route => {
    await gate;
    await route.fulfill({ json: { animal: { ...initialAnimal(), isActive: false } } });
  });
  await page.goto('/animales');
  await page.getByRole('button', { name: 'Eliminar animal RETRY-001', exact: true }).click();
  await page.getByLabel('Motivo de eliminación', { exact: true }).fill('Ficha de prueba');
  await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Eliminando animal');
  await expect(page.getByRole('dialog').locator('button[type="submit"]')).toBeDisabled();
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ficha muestra el resumen reproductivo y la causa de salida', async ({ page }) => {
  const animal = { ...initialAnimal(), sex: 'hembra', sexLabel: 'Hembra', exitDate: '2026-11-07', exitType: 'death', status: 'muerto', statusLabel: 'Muerto', exitCauseCode: 'enfermedad', exitCauseLabel: 'Enfermedad', reproductiveSummary: {serviceCount: 3, farrowingCount: 2, firstFarrowingDate: '2026-01-10', lastFarrowingDate: '2026-09-10', totalBorn: 19, maleBorn: 10, femaleBorn: 9, unsexedBorn: 0, averageBirthWeightKg: 1.45, weighedBirths: 17} };
  await mockAnimalApi(page, animal);
  await page.goto('/animal/RETRY-001');
  await expect(page.getByText('Muerte · Enfermedad', { exact: true })).toBeVisible();
  await expect(page.locator('.detail-item').filter({ hasText: 'Servicios de monta o IA' })).toContainText('3');
  await expect(page.locator('.detail-item').filter({ hasText: 'Primer parto' })).toContainText('2026-01-10');
  await expect(page.locator('.detail-item').filter({ hasText: 'Peso promedio de crías vivas' })).toContainText('17 crías vivas');
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
  await page.getByRole('tab', { name: /Gestión y Traslados/ }).click();
  await page.getByLabel('Nuevo arete oficial').fill('ARETE-002');
  await page.locator('#ani-tag-reason').fill('Reposición del arete dañado');
  const changeTag = page.getByRole('button', { name: 'Confirmar cambio de arete oficial' });
  await changeTag.focus();
  await changeTag.press('Enter');
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
  await changeTag.focus();
  await changeTag.press('Enter');
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
  await page.getByRole('tab', { name: /Gestión y Traslados/ }).click();
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

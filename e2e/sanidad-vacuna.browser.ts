import {expect,test} from './module-fixture';

test('sanidad dirige a los flujos válidos y permite unidad y retiro en vacunación',async({page})=>{
  let applied:Record<string,unknown>|undefined;
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'veterinario',username:'vet@prueba.pe'}}}));
  await page.route('**/api/animals?**',route=>route.fulfill({status:200,json:{animals:[{code:'CERDO-01',alias:null,barnName:'Galpón A',lotCode:null,stageCode:'inicio'}]}}));
  await page.route('**/api/vaccines/rules',route=>route.fulfill({status:200,json:{rules:[]}}));
  await page.route('**/api/vaccines/schedules?**',route=>route.fulfill({status:200,json:{schedules:[{id:1,animalCode:'CERDO-01',animalType:'lechon',targetCategory:'lechon',vaccineName:'Vacuna',scheduledDate:'2026-11-08',status:'pending',isManual:true,appliedDate:null,barnName:'Galpón A',observations:null}]}}));
  await page.route('**/api/health/events?**',route=>route.fulfill({status:200,json:{events:[]}}));
  await page.route('**/api/health/withdrawals?**',route=>route.fulfill({status:200,json:{alerts:[]}}));
  await page.route('**/api/health/upcoming?**',route=>route.fulfill({status:200,json:{events:[]}}));
  await page.route('**/api/vaccines/schedules/1/apply',route=>{applied=route.request().postDataJSON() as Record<string,unknown>;return route.fulfill({status:201,json:{ok:true}});});
  await page.goto('/sanidad');
  await page.getByRole('tab', { name: /Historial clínico/ }).click();
  for (const label of ['Animal', 'Producto', 'Lote animal', 'Desde', 'Hasta']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: /Registrar tratamiento/ }).click();
  const healthForm=page.locator('#corregir-sanidad');
  await expect(healthForm.locator('select').first().locator('option')).toHaveText(['Tratamiento','Desparasitación','Otro evento']);
  await expect(page.getByText('Para registrar una muerte, solicite al responsable o administrador que registre la salida desde la ficha del animal.',{exact:false})).toBeVisible();
  await page.getByRole('tab', { name: /Plan de Vacunación/ }).click();
  await page.getByRole('row').filter({hasText:'CERDO-01'}).getByRole('button',{name:'Aplicar'}).click();
  await page.getByRole('dialog').getByLabel('Unidad de dosis').fill('dosis');await page.getByLabel('Retiro hasta (opcional):').fill('2099-01-01');
  await page.getByRole('button',{name:'Confirmar Aplicación'}).click();
  await expect(page.getByRole('status')).toContainText('Vacuna aplicada');
  expect(applied).toMatchObject({dosageUnit:'dosis',withdrawalUntil:'2099-01-01'});
});

test('corrige una actuación grupal y conserva los datos ante un conflicto',async({page})=>{
  const requests:Record<string,unknown>[]=[];
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'veterinario',username:'vet@prueba.pe'}}}));
  await page.route('**/api/animals?**',route=>route.fulfill({status:200,json:{animals:[]}}));
  await page.route('**/api/vaccines/rules',route=>route.fulfill({status:200,json:{rules:[]}}));
  await page.route('**/api/vaccines/schedules?**',route=>route.fulfill({status:200,json:{schedules:[]}}));
  await page.route('**/api/health/events?**',route=>route.fulfill({status:200,json:{events:[{id:123,eventType:'treatment',effectiveDate:'2026-11-01',product:'Producto anterior',productLot:null,dosage:1,dosageUnit:'ml',nextDueDate:null,withdrawalUntil:null,causeCode:null,observations:null,responsibleName:'Veterinario',animalCode:'CERDO-01',barnName:'Galpón A',locationCode:null,lotCode:null,stageCode:'inicio'}]}}));
  await page.route('**/api/health/withdrawals?**',route=>route.fulfill({status:200,json:{alerts:[]}}));
  await page.route('**/api/health/upcoming?**',route=>route.fulfill({status:200,json:{events:[]}}));
  await page.route('**/api/health/events/123/correction',route=>{requests.push(route.request().postDataJSON() as Record<string,unknown>);return route.fulfill(requests.length===1?{status:409,json:{error:'Conflicto de prueba'}}:{status:201,json:{ok:true}});});
  await page.goto('/sanidad');
  await page.getByRole('tab', { name: /Historial clínico/ }).click();
  const eventRow=page.getByRole('row').filter({hasText:'Producto anterior'});
  await eventRow.getByRole('button',{name:'Corregir'}).click();
  const section=page.locator('#corregir-sanidad');await expect(section).toContainText('todos los animales');
  await section.getByLabel('Producto / medicamento').fill('Producto corregido');await section.getByLabel('Motivo',{exact:true}).fill('Corrección de prueba');
  await section.getByRole('button',{name:'Guardar corrección'}).click();await expect(page.getByRole('alert')).toContainText('Conflicto de prueba');
  await expect(section.getByLabel('Producto / medicamento')).toHaveValue('Producto corregido');await section.getByRole('button',{name:'Guardar corrección'}).click();
  await expect(page.getByRole('status')).toContainText('Actuación corregida');expect(requests).toHaveLength(2);expect(requests[0].operationKey).toBe(requests[1].operationKey);
});

test('permite configurar una vacuna antes del parto probable',async({page})=>{
  let body:Record<string,unknown>|undefined;
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'administrador',username:'admin@prueba.pe'}}}));
  await page.route('**/api/animals?**',route=>route.fulfill({status:200,json:{animals:[]}}));
  await page.route('**/api/vaccines/rules',route=>{if(route.request().method()==='POST'){body=route.request().postDataJSON() as Record<string,unknown>;return route.fulfill({status:201,json:{ok:true,eligible:1,created:1}});}return route.fulfill({status:200,json:{rules:[]}});});
  await page.route('**/api/vaccines/schedules?**',route=>route.fulfill({status:200,json:{schedules:[]}}));
  await page.route('**/api/health/events?**',route=>route.fulfill({status:200,json:{events:[]}}));await page.route('**/api/health/withdrawals?**',route=>route.fulfill({status:200,json:{alerts:[]}}));await page.route('**/api/health/upcoming?**',route=>route.fulfill({status:200,json:{events:[]}}));
  await page.goto('/sanidad');await page.getByRole('tab', { name: /Plan de Vacunación/ }).click();const form=page.locator('form').filter({hasText:'Nueva regla de vacunación'});
  await form.locator('input').nth(0).fill('Vacuna preparto');await form.locator('select').nth(0).selectOption('cerda_primeriza');await form.locator('select').nth(1).selectOption('farrowing');await form.locator('input[type="number"]').nth(0).fill('-14');
  await form.getByRole('button',{name:'Crear regla y generar agenda'}).click();await expect.poll(()=>body?.offsetDays).toBe(-14);expect(body).toMatchObject({baseEvent:'farrowing',targetCategory:'cerda_primeriza'});
});

import {expect,test} from '@playwright/test';

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
  await expect(page.getByLabel('Tipo de evento').locator('option')).toHaveText(['Tratamiento','Desparasitación','Otro evento']);
  await expect(page.getByText('Para registrar una muerte, solicite al responsable o administrador que registre la salida desde la ficha del animal.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Registrar aplicación'}).click();
  await page.getByRole('dialog').getByLabel('Unidad de dosis').fill('dosis');await page.getByLabel('Retiro hasta (opcional):').fill('2099-01-01');
  await page.getByRole('button',{name:'Confirmar Aplicación'}).click();
  await expect(page.getByRole('status')).toContainText('Vacuna aplicada');
  expect(applied).toMatchObject({dosageUnit:'dosis',withdrawalUntil:'2099-01-01'});
});

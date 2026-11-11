import {expect,test} from './module-fixture';

test.use({serviceWorkers:'block'});

test('corrige y anula aplicaciones con motivo, conserva los datos tras un conflicto y reutiliza la clave de reintento',async({page})=>{
  const corrections:Record<string,unknown>[]=[];let annulment:Record<string,unknown>|undefined;
  let row={id:31,animalCode:'VAC-UI',animalType:'verraco',targetCategory:'verraco',vaccineName:'Vacuna aplicada',scheduledDate:'2026-11-01',status:'applied',isManual:true,appliedDate:'2026-11-01',barnName:'Galpón A',observations:null,dosage:1,dosageUnit:'ml',productLot:'LOTE-ORIGINAL',withdrawalUntil:'2026-12-01',applicationObservations:'Aplicación original'};
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'veterinario',username:'vet@prueba.pe'}}}));
  await page.route('**/api/animals?**',route=>route.fulfill({status:200,json:{animals:[{code:'VAC-UI'}]}}));
  await page.route('**/api/vaccines/rules',route=>route.fulfill({status:200,json:{rules:[]}}));
  await page.route('**/api/vaccines/schedules?**',route=>route.fulfill({status:200,json:{schedules:[row]}}));
  await page.route('**/api/vaccines/schedules/31/correction',route=>{
    const body=route.request().postDataJSON() as Record<string,unknown>;corrections.push(body);
    if(corrections.length===1)return route.fulfill({status:409,json:{error:'La aplicación cambió; revise los datos'}});
    row={...row,dosage:Number(body.dosage),productLot:String(body.productLot)};
    return route.fulfill({status:200,json:{ok:true}});
  });
  await page.route('**/api/vaccines/schedules/31/annul',route=>{annulment=route.request().postDataJSON() as Record<string,unknown>;row={...row,status:'pending'};return route.fulfill({status:200,json:{ok:true}});});
  await page.goto('/sanidad');await page.getByRole('tab',{name:/Plan de Vacunación/}).click();
  await page.getByRole('button',{name:'Corregir aplicación de Vacuna aplicada al animal VAC-UI'}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Dosis aplicada:')).toHaveValue('1');await expect(dialog.getByLabel('Lote producto (opcional):')).toHaveValue('LOTE-ORIGINAL');await expect(dialog.getByLabel('Retiro hasta (opcional):')).toHaveValue('2026-12-01');
  await dialog.getByLabel('Dosis aplicada:').fill('3');await dialog.getByLabel('Motivo de corrección:').fill('Error al transcribir dosis');
  await dialog.getByRole('button',{name:'Guardar corrección de aplicación'}).click();
  await expect(page.getByText('La aplicación cambió; revise los datos',{exact:true})).toBeVisible();await expect(dialog.getByLabel('Dosis aplicada:')).toHaveValue('3');
  await dialog.getByRole('button',{name:'Guardar corrección de aplicación'}).click();await expect(dialog).toBeHidden();
  expect(corrections).toHaveLength(2);expect(corrections[0]).toMatchObject({dosage:3,reason:'Error al transcribir dosis',withdrawalUntil:'2026-12-01'});expect(corrections[1].operationKey).toBe(corrections[0].operationKey);
  await page.getByRole('button',{name:'Anular aplicación de Vacuna aplicada al animal VAC-UI'}).click();
  await page.getByRole('dialog').getByLabel('Motivo de anulación:').fill('La dosis no se aplicó');await page.getByRole('dialog').getByRole('button',{name:'Confirmar anulación de aplicación'}).click();
  await expect(page.getByRole('status')).toContainText('Aplicación anulada');expect(annulment).toMatchObject({reason:'La dosis no se aplicó'});await expect(page.getByRole('row').filter({hasText:'VAC-UI'}).getByRole('button',{name:/Aplicar vacuna/})).toBeVisible();
});

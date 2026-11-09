import {expect,test} from '@playwright/test';

test('muestra coberturas separadas y demanda compartida para el operario',async({page})=>{
  let adminRequested=false;
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'operario',username:'operario@prueba.pe'}}}));
  await page.route('**/api/admin/barns',route=>{adminRequested=true;return route.fulfill({status:403,json:{error:'No autorizado'}});});
  await page.route('**/api/finance/barns',route=>route.fulfill({status:200,json:{barns:[{id:1,name:'Galpón A'}]}}));
  await page.route('**/api/config',route=>route.fulfill({status:200,json:{catalogs:[{key:'alimento',items:[{code:'preinicio',name:'Alimento preinicio'}]}]}}));
  await page.route('**/api/feed/warehouses',route=>route.fulfill({status:200,json:{warehouses:[{id:1,code:'A',name:'Almacén A',location:null,barnId:null,barnName:null}]}}));
  await page.route('**/api/feed/inventory**',route=>route.fulfill({status:200,json:{asOf:'2026-11-08',inventory:[],totals:{availableKg:479,receivedKg:602,withdrawnKg:123,allocatedCostMinor:0}}}));
  await page.route('**/api/feed/movements**',route=>route.fulfill({status:200,json:{movements:[]}}));
  await page.route('**/api/feed/projection**',route=>route.fulfill({status:200,json:{stages:[{stageCode:'preinicio',stageName:'Preinicio',heads:35,feedCode:'preinicio',feedName:'Alimento preinicio',dailyKg:22.75,stageDays:21,stageNeedKg:477.75,monthlyNeedKg:682.5,availableKg:479,coveredDays:21,dailyShortageKg:0,stageShortageKg:0,monthlyShortageKg:203.5,requirements:[]}],feeds:[{feedCode:'gestacion',feedName:'Alimento gestación',heads:3,dailyKg:7,monthlyNeedKg:210,availableKg:50,coveredDays:7,monthlyShortageKg:160}],turns:[],conversion:[]}}));
  await page.goto('/alimentacion');
  const stage=page.getByRole('row').filter({hasText:'Preinicio'});
  await expect(stage).toContainText('Día: suficiente');await expect(stage).toContainText('Etapa: suficiente');await expect(stage).toContainText('Mes: faltan 203.5 kg');
  const shared=page.getByRole('row').filter({hasText:'Alimento gestación'});
  await expect(shared).toContainText('210 kg');await expect(shared).toContainText('160 kg');
  await page.getByRole('tab',{name:'Registrar nuevo movimiento de insumo o alimento'}).click();
  await page.getByLabel('Tipo de movimiento').selectOption('delivery');await expect(page.getByLabel('Galpón destino')).toContainText('Galpón A');
  expect(adminRequested).toBe(false);
});

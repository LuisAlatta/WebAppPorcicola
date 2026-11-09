import {expect,test} from '@playwright/test';

test('informes productivos aplican filtros y muestran tabla, indicadores y gráfico',async({page})=>{
  const urls:string[]=[];
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'administrador',username:'admin@prueba.pe'}}}));
  await page.route('**/api/reports/catalog',route=>route.fulfill({status:200,json:{sources:[]}}));
  await page.route('**/api/reports/definitions',route=>route.fulfill({status:200,json:{definitions:[]}}));
  await page.route('**/api/finance/barns',route=>route.fulfill({status:200,json:{barns:[{id:1,name:'Galpón A'}]}}));
  await page.route('**/api/reports/dashboard**',route=>route.fulfill({status:200,json:{asOf:'2026-11-08',barnsIncluded:'Todos',totalAnimals:12,identifiedAnimals:3,unidentifiedAnimals:9,barnCount:1,pendingVaccines:0,upcomingFarrowings:0,animalsByType:[],sales:[],feedCosts:[]}}));
  await page.route('**/api/animals?limit=1',route=>route.fulfill({status:200,json:{animals:[],options:{locations:[{code:'corral-a',name:'Corral A'}],lots:[{code:'lote-a',name:'Lote A'}],stages:[{code:'engorde',name:'Engorde'}]}}}));
  await page.route('**/api/reports/weights**',route=>{urls.push(route.request().url());return route.fulfill({status:200,json:{total:{observations:2,averageKg:82.5,minimumKg:80,maximumKg:85},rows:[{date:'2026-10-01',stageCode:'engorde',observations:2,averageKg:82.5}],chart:[{date:'2026-10-01',stageCode:'engorde',observations:2,averageKg:82.5}]}});});
  await page.route('**/api/reports/births**',route=>{urls.push(route.request().url());return route.fulfill({status:200,json:{totals:{litters:1,liveBirths:9,totalBorn:10,deaths:1,lactationDeaths:2,averageMortalityPct:10,globalMortalityPct:10},rows:[{id:'1',farrowingDate:'2026-10-01',motherCode:'MADRE-01',barnName:'Galpón A',locationCode:'corral-a',lotCode:'lote-a',liveBirths:9,totalBorn:10,deaths:1,lactationDeaths:2,mortalityPct:10}],chart:[{farrowingDate:'2026-10-01',motherCode:'MADRE-01',liveBirths:9,deaths:1,lactationDeaths:2}]}});});
  await page.goto('/reportes');
  for (const [label,value] of [['Cabezas en inventario','12'],['Animales identificados','3'],['Pendientes de identificar','9']]) {
    await expect(page.locator('.metric-card').filter({has:page.getByText(label,{exact:true})})).toContainText(value);
  }
  await page.getByRole('tab',{name:/Pestaña Informes Productivos/}).click();
  await page.getByLabel('Galpón productivo').selectOption('1');await page.getByLabel('Ubicación / Corral').selectOption('corral-a');await page.getByLabel('Lote porcino').selectOption('lote-a');
  await page.getByLabel('Etapa productiva').selectOption('engorde');await page.getByLabel('Arete / Código de animal').fill('CERDO-01');
  await page.getByRole('button',{name:'Consultar informe productivo'}).click();
  await expect(page.getByText('82.50 kg',{exact:true}).first()).toBeVisible();await expect(page.getByRole('progressbar').first()).toBeVisible();
  expect(urls[0]).toContain('animalCode=CERDO-01');expect(urls[0]).toContain('locationCode=corral-a');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar Excel'}).click()]);
  expect(download.suggestedFilename()).toBe('pesos.xlsx');expect(urls[1]).toBe(urls[0]);
  await page.getByLabel('Tipo de informe productivo').selectOption('births');await page.getByLabel('Arete de la madre (Marrana)').fill('MADRE-01');
  await page.getByRole('button',{name:'Consultar informe productivo'}).click();
  await expect(page.getByText('Nacidos muertos',{exact:true}).first()).toBeVisible();await expect(page.getByText('Bajas en lactancia',{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Ubicación / Corral'})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Lote porcino'})).toBeVisible();
  await expect(page.getByText('10.00 %',{exact:true}).first()).toBeVisible();expect(urls[2]).toContain('motherCode=MADRE-01');
});

import {test,expect,type Page} from './module-fixture';

async function setup(page:Page,role='veterinario'){
  let currentDate='2026-06-20';
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true,animals:[]}}));
  await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role,username:`${role}@prueba.pe`}}}));
  await page.route('**/api/reproduction/cycles**',route=>route.fulfill({status:200,json:{ok:true,cycles:[{
    id:'cycle-date-1',femaleCode:'CERDA-CA20',femaleAlias:null,cycleNumber:1,cycleStatus:'farrowed',reproductiveStatus:'gestation',
    serviceAnchorDate:'2026-02-26',gestationDays:114,probableFarrowingDate:'2026-06-20',dueDateSource:'calculated',dueDateReason:null,
    daysRemaining:0,dueLabel:'Parto registrado',barnId:1,barnName:'Galpón A',locationCode:'galpon_a',lotCode:null,femaleBreed:null,aptitude:null,
    lastFarrowingDate:currentDate,observations:null,antecedent:false,services:[],events:[],weaningPlan:null,
    litter:{id:'litter-date-1',farrowingDate:currentDate,liveCount:8,maleAlive:4,femaleAlive:4,unsexedAlive:0,stillbornCount:0,averageWeightKg:1.5,expectedWeaningDate:'2026-07-18',actualWeaningDate:null,identifiedAnimals:[{code:'LECHONA-01',sex:'hembra'}],historicalOnly:false,birthCounts:{maleAlive:4,femaleAlive:4,unsexedAlive:0,maleStillborn:0,femaleStillborn:0,unsexedStillborn:0}},
  }]}}));
  return{setDate:(date:string)=>{currentDate=date;}};
}

test('muestra el plan postdestete aunque el ciclo aún no tenga camada',async({page})=>{
  await setup(page);
  await page.route('**/api/reproduction/cycles**',route=>route.fulfill({status:200,json:{cycles:[{id:'cycle-post',femaleCode:'CERDA-POST',femaleAlias:null,cycleNumber:2,cycleStatus:'open',reproductiveStatus:'gestation',serviceAnchorDate:'2026-10-25',gestationDays:114,probableFarrowingDate:'2027-02-16',dueDateSource:'calculated',dueDateReason:null,daysRemaining:90,dueLabel:'Previsto',barnId:1,barnName:'Galpón A',locationCode:null,lotCode:null,femaleBreed:null,aptitude:null,lastFarrowingDate:'2026-10-01',previousWeaningDate:'2026-10-20',previousWeaningPending:false,observations:null,antecedent:false,services:[],events:[],litter:null,weaningPlan:{referenceWeaningDate:'2026-10-19',heatIntervalDays:5,firstRepeatIntervalDays:10,secondRepeatIntervalDays:20,expectedHeatDate:'2026-10-24',expectedFirstRepeatDate:'2026-11-03',expectedSecondRepeatDate:'2026-11-23',actualHeatDate:null,actualFirstRepeatDate:null,actualSecondRepeatDate:null}}]}}));
  await page.goto('/reproduccion');await expect(page.getByText('Destete anterior: 2026-10-19',{exact:false})).toBeVisible();await expect(page.getByText('El destete real cambió a 2026-10-20',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Editar plan postdestete'}).click();await expect(page.locator('input[name="referenceWeaningDate"]')).toHaveValue('2026-10-20');
});

test('conflicto de fecha preserva formulario y reintento usa la misma operación',async({page})=>{
  const fixture=await setup(page);const bodies:Record<string,unknown>[]=[];
  await page.route('**/api/reproduction/litters/litter-date-1/date-correction',async route=>{
    const body=route.request().postDataJSON() as Record<string,unknown>;bodies.push(body);
    if(bodies.length===1){await route.fulfill({status:409,json:{error:'La fecha fue modificada. Actualice el registro.'}});return;}
    fixture.setDate(String(body.farrowingDate));await route.fulfill({status:201,json:{ok:true,litterId:'litter-date-1',farrowingDate:body.farrowingDate,replayed:false}});
  });
  await page.goto('/reproduccion');await page.getByRole('button',{name:/Corregir fecha real del parto/}).first().click();
  await page.getByLabel('Nueva fecha real del parto',{exact:true}).fill('2026-06-19');await page.getByLabel('Motivo de la corrección de fecha',{exact:true}).fill('Fecha comprobada en el cuaderno');
  const saveDate=page.getByRole('button',{name:'Guardar corrección de fecha de parto'});
  await saveDate.focus();await saveDate.press('Enter');
  await expect(page.getByRole('alert')).toContainText('La fecha fue modificada');
  await expect(page.getByLabel('Nueva fecha real del parto',{exact:true})).toHaveValue('2026-06-19');
  await expect(page.getByLabel('Motivo de la corrección de fecha',{exact:true})).toHaveValue('Fecha comprobada en el cuaderno');
  await saveDate.focus();await saveDate.press('Enter');
  await expect(page.getByRole('form',{name:'Corrección de fecha real del parto'})).toHaveCount(0);
  await expect(page.getByText('Parto real: 2026-06-19',{exact:false})).toBeVisible();
  expect(bodies).toHaveLength(2);expect(bodies[0]).toMatchObject({farrowingDate:'2026-06-19',expectedCurrentDate:'2026-06-20',reason:'Fecha comprobada en el cuaderno'});expect(bodies[1].operationKey).toBe(bodies[0].operationKey);
});

test('destete envía las fichas identificadas seleccionadas',async({page})=>{
  await setup(page,'responsable');let body:Record<string,unknown>|undefined;
  await page.route('**/api/reproduction/litters/litter-date-1/events',async route=>{body=route.request().postDataJSON() as Record<string,unknown>;await route.fulfill({status:201,json:{ok:true}});});
  await page.goto('/reproduccion');await page.getByRole('button',{name:'Baja, adopción o destete'}).click();
  await page.locator('input[name="effectiveDate"]').fill('2026-06-21');
  await page.locator('input[name="quantity"]').fill('2');await page.locator('input[name="weightKg"]').fill('6.2');
  await page.locator('input[name="destinationLocationCode"]').fill('corral-destete');await page.locator('input[name="destinationLotCode"]').fill('lote-destete');
  await page.getByRole('checkbox',{name:/LECHONA-01/}).check();await page.locator('input[name="reason"]').fill('Destete parcial registrado');
  await page.getByRole('button',{name:'Guardar evento de camada'}).click();
  await expect(page.getByRole('status')).toContainText('Destete parcial registrado');
  expect(body).toMatchObject({eventType:'weaning',sex:'hembra',quantity:'2',animalCodes:['LECHONA-01'],destinationLocationCode:'corral-destete',destinationLotCode:'lote-destete'});
});

test('baja de camada envía las fichas identificadas seleccionadas',async({page})=>{
  await setup(page,'responsable');let body:Record<string,unknown>|undefined;
  await page.route('**/api/reproduction/litters/litter-date-1/events',async route=>{body=route.request().postDataJSON() as Record<string,unknown>;await route.fulfill({status:201,json:{ok:true}});});
  await page.goto('/reproduccion');await page.getByRole('button',{name:'Baja, adopción o destete'}).click();
  await page.locator('select[name="eventType"]').selectOption('death');await page.locator('input[name="effectiveDate"]').fill('2026-06-21');await page.locator('input[name="quantity"]').fill('1');
  await page.locator('input[name="cause"]').fill('enfermedad');await page.getByRole('checkbox',{name:/LECHONA-01/}).check();await page.locator('input[name="reason"]').fill('Baja de ficha identificada');await page.getByRole('button',{name:'Guardar evento de camada'}).click();
  await expect(page.getByRole('status')).toContainText('Baja durante lactancia registrada');expect(body).toMatchObject({eventType:'death',quantity:'1',cause:'enfermedad',animalCodes:['LECHONA-01']});
});

test('adopción envía las fichas identificadas y la camada destino',async({page})=>{
  await setup(page,'responsable');let body:Record<string,unknown>|undefined;
  const cycle=(id:string,code:string,litterId:string,identifiedAnimals:{code:string;sex:string}[])=>({id,femaleCode:code,femaleAlias:null,cycleNumber:1,cycleStatus:'farrowed',reproductiveStatus:'gestation',serviceAnchorDate:'2026-02-26',gestationDays:114,probableFarrowingDate:'2026-06-20',dueDateSource:'calculated',dueDateReason:null,daysRemaining:0,dueLabel:'Parto registrado',barnId:1,barnName:'Galpón A',locationCode:null,lotCode:null,femaleBreed:null,aptitude:null,lastFarrowingDate:'2026-06-20',observations:null,antecedent:false,services:[],events:[],weaningPlan:null,litter:{id:litterId,farrowingDate:'2026-06-20',liveCount:2,maleAlive:0,femaleAlive:2,unsexedAlive:0,stillbornCount:0,averageWeightKg:1.5,expectedWeaningDate:'2026-07-18',actualWeaningDate:null,identifiedAnimals,historicalOnly:false}});
  await page.route('**/api/reproduction/cycles**',route=>route.fulfill({status:200,json:{cycles:[cycle('source','CERDA-ORIGEN','litter-source',[{code:'LECHONA-01',sex:'hembra'}]),cycle('target','CERDA-DESTINO','litter-target',[])]}}));
  await page.route('**/api/reproduction/litters/targets',route=>route.fulfill({status:200,json:{ok:true,targets:[{litterId:'litter-source',motherCode:'CERDA-ORIGEN',barnName:'Galpón A',farrowingDate:'2026-06-20',historicalOnly:false},{litterId:'litter-target',motherCode:'CERDA-DESTINO',barnName:'Galpón A',farrowingDate:'2026-06-20',historicalOnly:false},{litterId:'litter-future',motherCode:'CERDA-FUTURA',barnName:'Galpón A',farrowingDate:'2026-06-22',historicalOnly:false},{litterId:'litter-historical',motherCode:'CERDA-HISTORICA',barnName:'Galpón A',farrowingDate:'2026-05-20',historicalOnly:true}]}}));
  await page.route('**/api/reproduction/litters/litter-source/events',route=>{body=route.request().postDataJSON() as Record<string,unknown>;return route.fulfill({status:201,json:{ok:true}});});
  await page.goto('/reproduccion');const source=page.locator('article').filter({hasText:'CERDA-ORIGEN'});const openEvent=source.getByRole('button',{name:'Baja, adopción o destete'});await openEvent.focus();await expect(openEvent).toBeFocused();await openEvent.press('Enter');
  await source.locator('select[name="eventType"]').selectOption('adoption');
  const effectiveDate = source.locator('input[name="effectiveDate"]');
  await expect(effectiveDate).toHaveAttribute('min', '2026-06-20');
  await effectiveDate.fill('2026-06-21');
  await source.locator('input[name="quantity"]').fill('1');
  const identifiedPiglet=source.getByRole('checkbox',{name:/LECHONA-01/});
  await identifiedPiglet.focus();await identifiedPiglet.press('Space');
  const targets = source.locator('select[name="destinationLitterId"]');
  await expect(targets.locator('option[value="litter-historical"]')).toHaveCount(0);
  await expect(targets.locator('option[value="litter-future"]')).toHaveCount(0);
  await expect(targets.locator('option[value="litter-target"]')).toContainText('parto 2026-06-20');
  await targets.selectOption('litter-target');await source.locator('input[name="reason"]').fill('Adopción registrada');
  const saveButton=source.getByRole('button',{name:'Guardar evento de camada'});
  await expect(saveButton).toBeEnabled();
  await saveButton.focus();await saveButton.press('Enter');
  await expect.poll(()=>body?.eventType).toBe('adoption');expect(body).toMatchObject({animalCodes:['LECHONA-01'],destinationLitterId:'litter-target'});
});

test('corrección de cantidades conserva el formulario ante conflicto y envía valores originales',async({page})=>{
  await setup(page,'responsable');const requests:Record<string,unknown>[]=[];
  await page.route('**/api/reproduction/litters/litter-date-1/correction',async route=>{requests.push(route.request().postDataJSON() as Record<string,unknown>);if(requests.length===1)return route.fulfill({status:409,json:{error:'La camada cambió; actualice los datos.'}});return route.fulfill({status:201,json:{ok:true,replayed:false}});});
  await page.goto('/reproduccion');await page.getByRole('button',{name:'Corregir cantidades'}).click();
  const correctionForm=page.locator('form[aria-label="Corrección de cantidades de nacimiento"]');
  await page.getByLabel('Machos vivos al nacer').fill('3');await page.getByLabel('Motivo de corrección de cantidades').fill('Conteo verificado');
  const saveCounts=correctionForm.getByRole('button',{name:'Guardar cantidades corregidas de nacimiento'});
  await saveCounts.focus();await saveCounts.press('Enter');await expect(page.getByRole('alert')).toContainText('La camada cambió');
  await expect(page.getByLabel('Machos vivos al nacer')).toHaveValue('3');
  await saveCounts.focus();await saveCounts.press('Enter');
  await expect(page.getByRole('status')).toContainText('cantidades de nacimiento corregidas');
  expect(requests[0]).toMatchObject({maleAlive:3,femaleAlive:4,expectedCounts:[4,4,0,0,0,0]});expect(requests[1].operationKey).toBe(requests[0].operationKey);
});

test('respuesta perdida conserva datos y clave hasta recuperar corrección confirmada',async({page})=>{
  const fixture=await setup(page,'responsable');const bodies:Record<string,unknown>[]=[];
  await page.route('**/api/reproduction/litters/litter-date-1/date-correction',async route=>{
    const body=route.request().postDataJSON() as Record<string,unknown>;bodies.push(body);
    if(bodies.length===1){fixture.setDate(String(body.farrowingDate));await route.abort('failed');return;}
    await route.fulfill({status:200,json:{ok:true,litterId:'litter-date-1',farrowingDate:body.farrowingDate,replayed:true}});
  });
  await page.goto('/reproduccion');await page.getByRole('button',{name:/Corregir fecha real del parto/}).first().click();
  await page.getByLabel('Nueva fecha real del parto',{exact:true}).fill('2026-06-19');await page.getByLabel('Motivo de la corrección de fecha',{exact:true}).fill('Contraste con registro original');
  const saveDate=page.getByRole('button',{name:'Guardar corrección de fecha de parto'});
  await saveDate.focus();await saveDate.press('Enter');await expect(page.getByRole('alert')).toContainText('No se pudo confirmar');
  await expect(page.getByLabel('Nueva fecha real del parto',{exact:true})).toHaveValue('2026-06-19');await saveDate.focus();await saveDate.press('Enter');
  await expect(page.getByRole('status')).toContainText('ya estaba registrada');expect(bodies[1].operationKey).toBe(bodies[0].operationKey);
});

for(const role of ['administrador','responsable','veterinario','operario'])test(`corrección de fecha respeta perfil ${role}`,async({page})=>{
  await setup(page,role);await page.goto('/reproduccion');await expect(page.getByText('Camada · litter-d',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:/Corregir fecha real del parto/})).toHaveCount(role==='operario'?0:1);
});

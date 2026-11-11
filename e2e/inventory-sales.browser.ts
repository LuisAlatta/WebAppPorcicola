import {expect, test} from './module-fixture';

test('registra el importe de una venta grupal y permite anularla con reintento seguro', async ({page}) => {
  let sale: Record<string, unknown> | undefined;
  const corrections: Record<string, unknown>[] = [];
  const counts = {macho:10,hembra:0,pendiente:0,total:10};
  const summary = {stageCode:'crecimiento',stageName:'Crecimiento',initial:10,entriesExternal:0,entries:0,exits:0,deaths:0,available:10,entriesBySex:counts,exitsBySex:counts,deathsBySex:counts,mortalityPct:0,mortalityDenominator:10};
  await page.route('**/api/**', route => route.fulfill({json:{ok:true}}));
  await page.route('**/api/auth/me', route => route.fulfill({json:{user:{role:'administrador',username:'prueba@granja.pe'}}}));
  await page.route('**/api/inventory?**', route => route.fulfill({json:{
    asOf:'2026-11-09',from:'2026-11-01',balances:[],movements:[],capacityWarnings:[],summary:{byStage:[summary],total:summary},
    options:{barns:[{id:1,code:'A',name:'Galpón A'}],stages:[{code:'crecimiento',name:'Crecimiento'}],locations:[],lots:[],sexes:[],deathCauses:[],saleCauses:[{code:'peso',name:'Peso de venta'}]},
  }}));
  await page.route('**/api/inventory/movements', route => {
    sale = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({status:201,json:{movement:{movementLabel:'Venta / salida'},replayed:false}});
  });
  await page.route('**/api/inventory/corrections/preview?**', route => {
    expect(new URL(route.request().url()).searchParams.get('correctedQuantity')).toBe('0');
    return route.fulfill({json:{preview:{allowed:true,originalQuantity:2,correctedQuantity:0,incompatibleMovements:[]}}});
  });
  await page.route('**/api/inventory/corrections', route => {
    corrections.push(route.request().postDataJSON() as Record<string,unknown>);
    if (corrections.length === 1) return route.abort();
    return route.fulfill({json:{replayed:true}});
  });
  await page.goto('/inventario');
  await page.getByRole('tab',{name:'Registrar nuevo movimiento de inventario'}).click();
  await page.getByLabel('Tipo de movimiento',{exact:true}).selectOption('sale');
  await page.locator('#inv-quantity').fill('2');
  await page.locator('#inv-cause').selectOption('peso');
  await page.getByLabel('Importe total de la venta',{exact:true}).fill('500');
  await page.getByLabel('Comprador',{exact:true}).fill('Cliente de prueba');
  await page.getByLabel('Referencia o comprobante',{exact:true}).fill('PRUEBA-VENTA');
  await page.getByLabel('Motivo del registro',{exact:true}).fill('Venta de dos animales');
  await page.getByRole('button',{name:'Registrar movimiento de inventario',exact:true}).click();
  await expect.poll(()=>sale).toMatchObject({movementType:'sale',quantity:2,saleAmount:'500',currencyCode:'PEN',counterparty:'Cliente de prueba',documentReference:'PRUEBA-VENTA'});
  await page.getByRole('tab',{name:'Gestionar traslado entre galpones y conciliación física'}).click();
  await page.getByLabel('ID del movimiento',{exact:true}).fill('42');
  await page.getByLabel('Cantidad correcta',{exact:true}).fill('0');
  await page.locator('#t10-correction-reason').fill('Anular importe registrado por error');
  await page.getByRole('button',{name:'Previsualizar impacto de la corrección de movimiento'}).click();
  await page.getByRole('button',{name:'Confirmar corrección de movimiento'}).click();
  const correctionForm = page.locator('form').filter({has:page.locator('#t10-correction-id')});
  await expect(correctionForm.getByRole('alert')).toContainText('Reintente con la misma clave');
  await page.getByRole('button',{name:'Confirmar corrección de movimiento'}).click();
  await expect.poll(()=>corrections.length).toBe(2);
  expect(corrections[1]).toEqual(corrections[0]);
  expect(corrections[1]).toMatchObject({movementId:42,correctedQuantity:0,reason:'Anular importe registrado por error'});
  await expect(page.getByLabel('ID del movimiento',{exact:true})).toHaveValue('');
});

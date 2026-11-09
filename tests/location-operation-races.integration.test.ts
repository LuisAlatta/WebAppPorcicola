import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ApiError} from '../worker/events';
import {correctInventoryMovement, reconcileInventory, registerMovement, transferInventory} from '../worker/inventory';
import {healthFixture} from './health-test-helpers';

describe('Ubicaciones · cambios simultáneos con el inventario',()=>{
  let fixture: Awaited<ReturnType<typeof healthFixture>>;
  beforeAll(async()=>{fixture=await healthFixture('location-operation-races');},60000);
  afterAll(async()=>{await fixture?.runtime.dispose();});

  it.each(['alta','traslado','conteo'] as const)('rechaza %s si cambia el galpón de destino después de validarlo',async(kind)=>{
    const locationCode=`race_${kind}`;
    const location={code:locationCode,name:`Área ${kind}`,locationType:'galpon',barnId:1,parentCode:null,effectiveFrom:'2026-11-01',reason:'Área vacante de prueba'};
    const created=await fixture.api('/api/config/locations',{...location,operationKey:`create-${kind}`});
    expect(created.status,await created.clone().text()).toBe(200);
    if(kind==='traslado')await registerMovement(fixture.db,1,{
      movementType:'initial',barnId:2,stageCode:'engorde',sex:'macho',quantity:2,effectiveDate:'2026-11-01',reason:'Stock de origen',operationKey:'race-transfer-source',
    });
    let resume!:()=>void;
    let reached!:()=>void;
    const paused=new Promise<void>(resolve=>{reached=resolve;});
    const release=new Promise<void>(resolve=>{resume=resolve;});
    const delayedDb=new Proxy(fixture.db,{get(target,property){
      if(property==='batch')return async(statements:D1PreparedStatement[])=>{reached();await release;return target.batch(statements);};
      const value=Reflect.get(target,property,target);
      return typeof value==='function'?value.bind(target):value;
    }});
    const base={effectiveDate:'2026-11-03',barnId:1,locationCode,stageCode:'engorde',sex:'macho',reason:'Operación simultánea de prueba',operationKey:`operation-${kind}`};
    const pending=(kind==='alta'
      ?registerMovement(delayedDb,1,{...base,movementType:'initial',quantity:1})
      :kind==='traslado'
        ?transferInventory(delayedDb,1,{...base,locationCode:null,sourceBarnId:2,destinationBarnId:1,destinationLocationCode:locationCode,quantity:1})
        :reconcileInventory(delayedDb,1,{...base,countedHeads:1})).then(()=>null,(error:unknown)=>error);
    await Promise.race([paused,pending.then(error=>{throw error??new Error('La operación se confirmó antes de la barrera');})]);
    try{
      const changed=await fixture.api('/api/config/locations',{...location,barnId:2,effectiveFrom:'2026-11-02',operationKey:`change-${kind}`});
      expect(changed.status,await changed.clone().text()).toBe(200);
    }finally{resume();}
    const error=await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM operation_log WHERE operation_key=?').bind(base.operationKey).first()).toMatchObject({n:0});
    expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE location_code=?').bind(locationCode).first()).toMatchObject({n:0});
    expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM inventory_reconciliations WHERE location_code=?').bind(locationCode).first()).toMatchObject({n:0});
  },30000);

  it.each(['alta','traslado','conteo'] as const)('rechaza %s retroactivo si deja cabezas después de un retiro ya registrado',async(kind)=>{
    const locationCode=`retirado_${kind}`;
    const created=await fixture.api('/api/config/locations',{code:locationCode,name:`Área retirada ${kind}`,locationType:'galpon',barnId:1,effectiveFrom:'2026-03-01',reason:'Área vacante de prueba',operationKey:`retired-create-${kind}`});
    expect(created.status,await created.clone().text()).toBe(200);
    const retired=await fixture.api('/api/config/locations/retire',{code:locationCode,effectiveFrom:'2026-04-01',reason:'Retiro de área vacante',operationKey:`retired-close-${kind}`});
    expect(retired.status,await retired.clone().text()).toBe(200);
    if(kind==='traslado')await registerMovement(fixture.db,1,{movementType:'initial',barnId:2,stageCode:'engorde',sex:'macho',quantity:2,effectiveDate:'2026-03-01',reason:'Stock histórico de origen',operationKey:'retired-transfer-source'});
    const base={effectiveDate:'2026-03-15',barnId:1,locationCode,stageCode:'engorde',sex:'macho',reason:'Carga histórica de prueba',operationKey:`retired-operation-${kind}`};
    const operation=kind==='alta'
      ?registerMovement(fixture.db,1,{...base,movementType:'initial',quantity:1})
      :kind==='traslado'
        ?transferInventory(fixture.db,1,{...base,locationCode:null,sourceBarnId:2,destinationBarnId:1,destinationLocationCode:locationCode,quantity:1})
        :reconcileInventory(fixture.db,1,{...base,countedHeads:1});
    await expect(operation).rejects.toMatchObject({status:409});
    expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM operation_log WHERE operation_key=?').bind(base.operationKey).first()).toMatchObject({n:0});
    expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE location_code=?').bind(locationCode).first()).toMatchObject({n:0});
  },30000);

  it.each(['sale','death'] as const)('conserva historia cerrada y rechaza corregir %s si repone cabezas en un corral retirado',async(type)=>{
    const locationCode=`cerrado_${type}`;
    expect((await fixture.api('/api/config/locations',{code:locationCode,name:`Historia ${type}`,locationType:'galpon',barnId:1,effectiveFrom:'2026-03-01',reason:'Área histórica de prueba',operationKey:`closed-create-${type}`})).status).toBe(200);
    const base={barnId:1,locationCode,stageCode:'engorde',sex:'macho',reason:'Historia cerrada de prueba'};
    await registerMovement(fixture.db,1,{...base,movementType:'initial',quantity:2,effectiveDate:'2026-03-01',operationKey:`closed-initial-${type}`});
    const {movement}=await registerMovement(fixture.db,1,{...base,movementType:type,quantity:2,effectiveDate:'2026-03-20',causeCode:type==='sale'?'edad':'enfermedad',...(type==='sale'?{saleAmount:'200'}:{}),operationKey:`closed-exit-${type}`});
    const retired=await fixture.api('/api/config/locations/retire',{code:locationCode,effectiveFrom:'2026-04-01',reason:'Área vacía después de la salida',operationKey:`closed-retire-${type}`});
    expect(retired.status,await retired.clone().text()).toBe(200);
    await expect(reconcileInventory(fixture.db,1,{...base,effectiveDate:'2026-03-15',countedHeads:2,operationKey:`closed-history-${type}`})).resolves.toMatchObject({variance:0});
    await expect(correctInventoryMovement(fixture.db,1,{movementId:movement.id,correctedQuantity:type==='sale'?0:1,reason:'Corrección que restituiría cabezas',operationKey:`closed-correct-${type}`})).rejects.toMatchObject({status:409});
    expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE reverses_movement_id=?').bind(movement.id).first()).toMatchObject({n:0});
    if(type==='sale')expect(await fixture.db.prepare("SELECT reversed_at FROM financial_entries WHERE source_type='inventory_sale' AND source_id=?").bind(String(movement.id)).first()).toMatchObject({reversed_at:null});
  },30000);
});

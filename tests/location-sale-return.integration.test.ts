import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthFixture } from './health-test-helpers';
import { currentFarmDate } from '../worker/events';
import { registerAnimalSaleReturn } from '../worker/animals';

describe('Devolución de venta · ubicación vigente al reactivar el animal',()=>{
  let fixture:Awaited<ReturnType<typeof healthFixture>>;
  beforeAll(async()=>{fixture=await healthFixture('location-sale-return-test');},60000);
  afterAll(async()=>fixture?.runtime.dispose());
  const soldAnimal=async(suffix:string)=>{
    const code=`RETORNO-${suffix}`;const locationCode=`retorno_${suffix.toLowerCase()}`;
    const location=await fixture.api('/api/config/locations',{code:locationCode,name:`Corral de retorno ${suffix}`,locationType:'galpon',parentCode:null,barnId:1,effectiveFrom:'2026-01-01',reason:'Ubicación para devolución de prueba',operationKey:`return-location-${suffix}`});expect(location.status,await location.clone().text()).toBe(200);
    const animal=await fixture.api('/api/animals',{code,animalType:'lechon',sex:'macho',birthDate:'2026-01-01',entryDate:'2026-01-01',entryStageCode:'engorde',barnId:1,locationCode,originType:'inicial',reason:'Alta de animal para devolución de venta',operationKey:`return-animal-${suffix}`});expect(animal.status,await animal.clone().text()).toBe(201);
    const sale=await fixture.api(`/api/animals/${code}/exit`,{exitType:'sale',effectiveDate:'2026-02-01',causeCode:'edad',saleAmount:'50.00',currencyCode:'PEN',reason:'Venta anterior al cambio de ubicación',operationKey:`return-sale-${suffix}`});expect(sale.status,await sale.clone().text()).toBe(201);
    return{code,locationCode};
  };
  const state=async(code:string)=>({
    animal:await fixture.db.prepare('SELECT * FROM animals WHERE code=?').bind(code).first(),
    history:(await fixture.db.prepare('SELECT h.* FROM animal_location_history h JOIN animals a ON a.id=h.animal_id WHERE a.code=? ORDER BY h.id').bind(code).all()).results,
    finance:(await fixture.db.prepare('SELECT * FROM financial_entries ORDER BY id').all()).results,
    allocations:(await fixture.db.prepare('SELECT * FROM financial_allocations ORDER BY id').all()).results,
    movements:(await fixture.db.prepare('SELECT * FROM inventory_movements ORDER BY id').all()).results,
    operations:(await fixture.db.prepare('SELECT id FROM operation_log ORDER BY id').all()).results,
  });

  it.each(['retirada','reasignada'])('rechaza devolver hoy a una ubicación %s después de vender sin modificar la operación',async(change)=>{
    const{code,locationCode}=await soldAnimal(change.toUpperCase());
    const changed=change==='retirada'
      ?await fixture.api('/api/config/locations/retire',{code:locationCode,effectiveFrom:'2026-03-01',reason:'El corral quedó vacío después de la venta',operationKey:`return-change-${change}`})
      :await fixture.api('/api/config/locations',{code:locationCode,name:'Corral reasignado',locationType:'galpon',parentCode:null,barnId:2,effectiveFrom:'2026-03-01',reason:'El corral vacío pertenece al otro galpón',operationKey:`return-change-${change}`});
    expect(changed.status,await changed.clone().text()).toBe(200);
    const before=await state(code);const response=await fixture.api(`/api/animals/${code}/sale-return`,{effectiveDate:currentFarmDate(),reason:'Devolución física a la ubicación original',operationKey:`return-invalid-${change}`});
    expect(response.status,await response.clone().text()).toBe(400);expect(await state(code)).toEqual(before);
  });

  it('aborta la devolución si se retira la ubicación después de validarla y antes del batch',async()=>{
    const{code,locationCode}=await soldAnimal('CARRERA');const actor=(await fixture.db.prepare("SELECT id FROM users WHERE role='administrador'").first<{id:number}>())!.id;
    let paused!:()=>void;let release!:()=>void;const ready=new Promise<void>(resolve=>{paused=resolve;});const resume=new Promise<void>(resolve=>{release=resolve;});
    const delayedDb=new Proxy(fixture.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{paused();await resume;return target.batch(statements);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    const pending=registerAnimalSaleReturn(delayedDb,actor,code,{effectiveDate:currentFarmDate(),reason:'Devolución en carrera con el retiro del corral',operationKey:'return-race-cancelled'}).then(value=>({value}),error=>({error}));
    await ready;let before:Awaited<ReturnType<typeof state>>;
    try{const retired=await fixture.api('/api/config/locations/retire',{code:locationCode,effectiveFrom:'2026-03-01',reason:'Corral vacío vendido antes de marzo',operationKey:'return-race-retire'});expect(retired.status,await retired.clone().text()).toBe(200);before=await state(code);}finally{release();}
    expect(await pending).toMatchObject({error:{status:409,message:expect.stringContaining('ubicaciones')}});expect(await state(code)).toEqual(before!);
  });

  it('devuelve a una ubicación vigente y confirma reintentos sin duplicar stock ni contraasiento',async()=>{
    const{code,locationCode}=await soldAnimal('VIGENTE');const payload={effectiveDate:currentFarmDate(),reason:'Devolución física a un corral vigente',operationKey:'return-valid-location'};
    const response=await fixture.api(`/api/animals/${code}/sale-return`,payload);expect(response.status,await response.clone().text()).toBe(201);expect(await fixture.db.prepare('SELECT status,barn_id,location_code FROM animals WHERE code=?').bind(code).first()).toEqual({status:'activo',barn_id:1,location_code:locationCode});
    const committed=await state(code);expect((await fixture.api(`/api/animals/${code}/sale-return`,payload)).status).toBe(200);expect(await state(code)).toEqual(committed);
    await fixture.db.prepare("UPDATE location_versions SET effective_to='2026-03-01',status='retired' WHERE code=?").bind(locationCode).run();
    try{const replay=await fixture.api(`/api/animals/${code}/sale-return`,payload);expect(replay.status,await replay.clone().text()).toBe(200);expect(await state(code)).toEqual(committed);}finally{await fixture.db.prepare("UPDATE location_versions SET effective_to=NULL,status='active' WHERE code=?").bind(locationCode).run();}
  });
});

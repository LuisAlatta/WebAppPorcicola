import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthFixture } from './health-test-helpers';

describe('Camadas · galpón y ubicación de destino coherentes',()=>{
  let fixture:Awaited<ReturnType<typeof healthFixture>>;
  let source='';let target='';
  beforeAll(async()=>{
    fixture=await healthFixture('litter-locations-test');
    const makeLitter=async(code:string,maleAlive:number)=>{
      const sow=await fixture.api('/api/animals',{code,animalType:'cerda',sex:'hembra',entryDate:'2026-01-01',entryStageCode:'gestacion',barnId:1,locationCode:'galpon_a',originType:'inicial',reason:'Alta para destinos de camada',operationKey:`litter-location-sow-${code}`});expect(sow.status,await sow.clone().text()).toBe(201);
      const cycle=await fixture.api('/api/reproduction/cycles',{femaleCode:code,serviceDate:'2026-05-01',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba',operationKey:`litter-location-cycle-${code}`});expect(cycle.status,await cycle.clone().text()).toBe(201);
      const cycleId=(await cycle.json() as {createdCycleId:string}).createdCycleId;
      const birth=await fixture.api(`/api/reproduction/cycles/${cycleId}/farrowing`,{farrowingDate:'2026-10-01',maleAlive,reason:'Parto para destinos de camada',operationKey:`litter-location-birth-${code}`});expect(birth.status,await birth.clone().text()).toBe(201);
      return(await birth.json() as {litterId:string}).litterId;
    };
    source=await makeLitter('UBI-ORIGEN',4);target=await makeLitter('UBI-DESTINO',0);
  },60000);
  afterAll(async()=>fixture?.runtime.dispose());
  const state=async()=>({
    litters:(await fixture.db.prepare('SELECT * FROM litters ORDER BY id').all()).results,
    events:(await fixture.db.prepare('SELECT * FROM litter_events ORDER BY id').all()).results,
    movements:(await fixture.db.prepare('SELECT * FROM inventory_movements ORDER BY id').all()).results,
    operations:(await fixture.db.prepare('SELECT id FROM operation_log ORDER BY id').all()).results,
  });

  it('rechaza un destete a la ubicación de otro galpón sin alterar camada ni stock y admite ubicación nula',async()=>{
    const payload={eventType:'weaning',effectiveDate:'2026-10-02',sex:'macho',quantity:1,weightKg:6,destinationStageCode:'inicio',destinationBarnId:1,destinationLocationCode:'galpon_b',reason:'Destete con destino verificado',operationKey:'litter-location-wean-invalid'};
    const before=await state();const response=await fixture.api(`/api/reproduction/litters/${source}/events`,payload);
    expect(response.status,await response.clone().text()).toBe(400);expect(await state()).toEqual(before);
    const valid={...payload,destinationLocationCode:null,operationKey:'litter-location-wean-null'};
    const accepted=await fixture.api(`/api/reproduction/litters/${source}/events`,valid);expect(accepted.status,await accepted.clone().text()).toBe(201);
    const after=await state();expect((await fixture.api(`/api/reproduction/litters/${source}/events`,valid)).status).toBe(200);expect(await state()).toEqual(after);
  });

  it('rechaza una camada destino legada incoherente y conserva el reintento anterior a esa incoherencia',async()=>{
    await fixture.db.prepare("UPDATE litters SET location_code='galpon_b' WHERE id=?").bind(target).run();
    const payload={eventType:'adoption',effectiveDate:'2026-10-03',sex:'macho',quantity:1,destinationLitterId:target,reason:'Adopción con destino verificado',operationKey:'litter-location-adoption-invalid'};
    const before=await state();const response=await fixture.api(`/api/reproduction/litters/${source}/events`,payload);
    expect(response.status,await response.clone().text()).toBe(400);expect(await state()).toEqual(before);
    await fixture.db.prepare('UPDATE litters SET location_code=NULL WHERE id=?').bind(target).run();
    const valid={...payload,operationKey:'litter-location-adoption-null'};
    const accepted=await fixture.api(`/api/reproduction/litters/${source}/events`,valid);expect(accepted.status,await accepted.clone().text()).toBe(201);
    await fixture.db.prepare("UPDATE litters SET location_code='galpon_b' WHERE id=?").bind(target).run();
    const committed=await state();expect((await fixture.api(`/api/reproduction/litters/${source}/events`,valid)).status).toBe(200);expect(await state()).toEqual(committed);
  });

  it('devuelve un destete ya confirmado antes de volver a validar la vinculación de su destino',async()=>{
    const payload={eventType:'weaning',effectiveDate:'2026-10-04',sex:'macho',quantity:1,weightKg:6,destinationStageCode:'inicio',destinationBarnId:1,destinationLocationCode:'galpon_a',reason:'Destete confirmado antes del vínculo legado',operationKey:'litter-location-wean-replay'};
    const accepted=await fixture.api(`/api/reproduction/litters/${source}/events`,payload);expect(accepted.status,await accepted.clone().text()).toBe(201);
    await fixture.db.prepare("UPDATE location_versions SET barn_id=2 WHERE code='galpon_a'").run();
    try{
      const before=await state();const replay=await fixture.api(`/api/reproduction/litters/${source}/events`,payload);expect(replay.status,await replay.clone().text()).toBe(200);expect(await state()).toEqual(before);
    }finally{await fixture.db.prepare("UPDATE location_versions SET barn_id=1 WHERE code='galpon_a'").run();}
  });
});

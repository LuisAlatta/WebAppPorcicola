import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {healthFixture} from './health-test-helpers';

describe('Camadas · correcciones después del retiro de un corral',()=>{
  let fixture: Awaited<ReturnType<typeof healthFixture>>;
  let litterId='';
  beforeAll(async()=>{
    fixture=await healthFixture('litter-location-continuity');
    const post=async(path:string,body:Record<string,unknown>)=>{
      const response=await fixture.api(path,body);
      expect(response.status,await response.clone().text()).toBeLessThan(300);
      return response.json() as Promise<Record<string,unknown>>;
    };
    await post('/api/config/locations',{code:'camada_cerrada',name:'Corral de camada cerrada',locationType:'galpon',barnId:1,effectiveFrom:'2026-01-01',reason:'Área de prueba',operationKey:'litter-continuity-location'});
    await post('/api/animals',{code:'MADRE-CERRADA',animalType:'cerda',sex:'hembra',entryDate:'2026-01-01',entryStageCode:'gestacion',barnId:1,locationCode:'camada_cerrada',originType:'inicial',reason:'Alta de prueba',operationKey:'litter-continuity-sow'});
    const cycle=await post('/api/reproduction/cycles',{femaleCode:'MADRE-CERRADA',serviceDate:'2026-05-01',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Prueba',operationKey:'litter-continuity-cycle'});
    const birth=await post(`/api/reproduction/cycles/${cycle.createdCycleId}/farrowing`,{farrowingDate:'2026-09-01',maleAlive:1,reason:'Parto de prueba',operationKey:'litter-continuity-birth'});
    litterId=String(birth.litterId);
    await post(`/api/reproduction/litters/${litterId}/events`,{eventType:'weaning',effectiveDate:'2026-09-10',sex:'macho',quantity:1,weightKg:6,destinationStageCode:'inicio',destinationBarnId:1,destinationLocationCode:null,reason:'Destete completo',operationKey:'litter-continuity-wean'});
    await post('/api/animals/MADRE-CERRADA/transfer',{effectiveDate:'2026-09-11',destinationBarnId:1,locationCode:null,reason:'Desocupar el corral',operationKey:'litter-continuity-transfer'});
    await post('/api/config/locations/retire',{code:'camada_cerrada',effectiveFrom:'2026-10-01',reason:'Retiro de corral vacío',operationKey:'litter-continuity-retire'});
  },60000);
  afterAll(async()=>fixture?.runtime.dispose());

  it('rechaza aumentar nacidos si dejaría crías pendientes en el corral retirado',async()=>{
    const response=await fixture.api(`/api/reproduction/litters/${litterId}/correction`,{maleAlive:2,reason:'Corrección histórica de prueba',operationKey:'litter-continuity-increase'});
    expect(response.status,await response.clone().text()).toBe(409);
    expect(await fixture.db.prepare('SELECT male_alive FROM litters WHERE id=?').bind(litterId).first()).toMatchObject({male_alive:1});
    expect(await fixture.db.prepare("SELECT COUNT(*) AS n FROM operation_log WHERE operation_key='litter-continuity-increase'").first()).toMatchObject({n:0});
  });

  it('permite corregir una fecha histórica que mantiene el saldo cero antes del retiro',async()=>{
    const response=await fixture.api(`/api/reproduction/litters/${litterId}/date-correction`,{farrowingDate:'2026-09-02',expectedCurrentDate:'2026-09-01',reason:'Fecha histórica comprobada',operationKey:'litter-continuity-date'});
    expect(response.status,await response.clone().text()).toBe(201);
  });
});

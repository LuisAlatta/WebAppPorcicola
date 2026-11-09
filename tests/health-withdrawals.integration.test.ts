import {afterAll,expect,it} from 'vitest';
import {listWithdrawalAlerts} from '../worker/health';
import {healthFixture} from './health-test-helpers';

let fixture:Awaited<ReturnType<typeof healthFixture>>;
afterAll(async()=>fixture?.runtime.dispose());

it('conserva retiros antiguos vigentes y devuelve más de 500 retiros sin truncarlos',async()=>{
  fixture=await healthFixture('health-withdrawals');const{db,api,addAnimal}=fixture;
  const animalId=await addAnimal('RETIRO-A');await addAnimal('RETIRO-B');
  const treatment=await api('/api/health/events',{eventType:'treatment',effectiveDate:'2026-10-01',animalCodes:['RETIRO-A','RETIRO-B'],product:'Retiro vigente antiguo',dosage:1,dosageUnit:'ml',withdrawalUntil:'2026-12-01',reason:'Tratamiento de prueba',operationKey:'retiro-antiguo'});
  expect(treatment.status,await treatment.clone().text()).toBe(201);
  await db.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<501) INSERT INTO operation_log(id,operation_key,operation_type,author_user_id,entity_type,content_hash,payload,result_payload,effective_date,recorded_at) SELECT 'noise-'||i,'noise-'||i,'health.event.create',1,'health_event','test','{}','{}','2026-11-01','2026-11-01T00:00:00Z' FROM n`).run();
  await db.prepare(`INSERT INTO health_events(operation_log_id,event_type,effective_date,product,dosage,dosage_unit,created_by_user_id,created_at) SELECT id,'treatment','2026-11-01','Nuevo sin retiro',1,'ml',1,recorded_at FROM operation_log WHERE id LIKE 'noise-%'`).run();
  await db.prepare(`INSERT INTO health_event_animals(health_event_id,animal_id,animal_code_snapshot,barn_id,barn_name_snapshot,stage_code_snapshot) SELECT h.id,a.id,a.code,a.barn_id,b.name,a.current_stage_code FROM health_events h JOIN animals a ON a.id=? JOIN barns b ON b.id=a.barn_id WHERE h.operation_log_id LIKE 'noise-%'`).bind(animalId).run();
  const active=await listWithdrawalAlerts(db,'2026-11-09');
  expect(active.map(row=>row.animalCode).sort()).toEqual(['RETIRO-A','RETIRO-B']);
  expect(await listWithdrawalAlerts(db,'2026-11-09',{allowedBarnNames:[]})).toEqual([]);
  expect(await listWithdrawalAlerts(db,'2026-11-09',{allowedBarnNames:[active[0].barnName]})).toHaveLength(2);
  await db.prepare(`UPDATE health_event_animals SET withdrawal_until='2026-11-10' WHERE health_event_id IN (SELECT id FROM health_events WHERE operation_log_id LIKE 'noise-%')`).run();
  expect(await listWithdrawalAlerts(db,'2026-11-09')).toHaveLength(503);
  await db.prepare(`UPDATE operation_log SET status='annulled' WHERE id LIKE 'noise-%'`).run();
  expect(await listWithdrawalAlerts(db,'2026-11-09')).toHaveLength(2);
});

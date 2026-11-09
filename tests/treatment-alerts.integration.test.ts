import {afterAll,beforeAll,expect,it} from 'vitest';
import {attendAlert,listAlerts} from '../worker/alerts';
import {createHealthEvent} from '../worker/health';
import {healthFixture} from './health-test-helpers';

let fixture:Awaited<ReturnType<typeof healthFixture>>;
beforeAll(async()=>{fixture=await healthFixture('treatment-alerts');});
afterAll(async()=>fixture?.runtime.dispose());
const treatment=async(codes:string[],key:string)=>{
  for(const code of codes)await fixture.addAnimal(code);
  return createHealthEvent(fixture.db,1,{eventType:'treatment',effectiveDate:'2026-11-01',animalCodes:codes,product:'Tratamiento grupal',dosage:1,dosageUnit:'ml',nextDueDate:'2026-11-09',reason:'Tratamiento de prueba',operationKey:key});
};

it('genera una alerta por animal y conserva la atención idempotente de cada integrante',async()=>{
  const created=await treatment(['GRUPO-A','GRUPO-B'],'grupo-nuevo');const id=(created.event as {id:number}).id;
  const alerts=(await listAlerts(fixture.db,{type:'treatment',asOf:'2026-11-09'})).alerts.filter(row=>row.sourceId===String(id));
  expect(alerts.map(row=>row.animalCode).sort()).toEqual(['GRUPO-A','GRUPO-B']);
  const input={reason:'Revisión sanitaria realizada',operationKey:'atencion-grupo-a'};
  expect(await attendAlert(fixture.db,1,alerts[0].id,input)).toMatchObject({replayed:false,status:'attended'});
  expect(await attendAlert(fixture.db,1,alerts[0].id,input)).toMatchObject({replayed:true,status:'attended'});
  const refreshed=(await listAlerts(fixture.db,{type:'treatment',asOf:'2026-11-09'})).alerts.filter(row=>row.sourceId===String(id));
  expect(refreshed).toHaveLength(2);expect(refreshed.map(row=>row.id).sort()).toEqual(alerts.map(row=>row.id).sort());
  expect(refreshed.find(row=>row.id===alerts[0].id)?.status).toBe('attended');
  expect(refreshed.find(row=>row.id!==alerts[0].id)?.status).toBe('pending');
});

it('mantiene la alerta histórica atendida y agrega solo el animal que faltaba',async()=>{
  const created=await treatment(['LEGACY-A','LEGACY-B'],'grupo-historico');const id=(created.event as {id:number}).id;
  const now='2026-11-09T12:00:00Z';
  await fixture.db.prepare(`INSERT INTO alert_occurrences(alert_key,alert_type,source_type,source_id,due_date,due_bucket,title,detail_json,animal_code,barn_id,barn_name_snapshot,status,acknowledged_by_user_id,acknowledged_at,resolution_reason,created_at,updated_at) VALUES(?,'treatment','health_event',?,'2026-11-09','today','Tratamiento histórico','{}','LEGACY-B',1,'Galpón A','attended',1,?,'Atención anterior',?,?)`).bind(`treatment:${id}`,String(id),now,now,now).run();
  const original=(await fixture.db.prepare('SELECT id FROM alert_occurrences WHERE alert_key=?').bind(`treatment:${id}`).first<{id:number}>())!.id;
  for(let attempt=0;attempt<2;attempt++){
    const alerts=(await listAlerts(fixture.db,{type:'treatment',asOf:'2026-11-09'})).alerts.filter(row=>row.sourceId===String(id));
    expect(alerts).toHaveLength(2);
    expect(alerts.find(row=>row.animalCode==='LEGACY-B')).toMatchObject({id:original,status:'attended',acknowledgedBy:1,resolutionReason:'Atención anterior'});
    expect(alerts.find(row=>row.animalCode==='LEGACY-A')).toMatchObject({status:'pending'});
  }
});

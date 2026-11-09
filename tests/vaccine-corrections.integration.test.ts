import {afterAll,beforeAll,expect,it} from 'vitest';
import {listWithdrawalAlerts} from '../worker/health';
import {listAlerts} from '../worker/alerts';
import {generateVaccineSchedules} from '../worker/vaccines';
import {healthFixture} from './health-test-helpers';

let fixture:Awaited<ReturnType<typeof healthFixture>>;
beforeAll(async()=>{fixture=await healthFixture('vaccine-corrections');});
afterAll(async()=>fixture?.runtime.dispose());
const correction={appliedDate:'2026-11-02',dosage:3,dosageUnit:'dosis',productLot:'LOTE-CORREGIDO',withdrawalUntil:'2026-11-10',observations:'Dato corregido',reason:'Error de transcripción'};
async function applied(code:string,withdrawalUntil?:string){
  const animalId=await fixture.addAnimal(code);
  const schedule=await fixture.api('/api/vaccines/schedules/manual',{animalCode:code,vaccineName:'Vacuna prueba',scheduledDate:'2026-11-01',reason:'Programación de prueba',operationKey:`manual-${code}`});
  expect(schedule.status,await schedule.clone().text()).toBe(201);const id=(await schedule.json() as {schedule:{id:number}}).schedule.id;
  const application=await fixture.api(`/api/vaccines/schedules/${id}/apply`,{appliedDate:'2026-11-01',dosage:1,dosageUnit:'ml',withdrawalUntil,reason:'Aplicación de prueba',operationKey:`apply-${code}`});
  expect(application.status,await application.clone().text()).toBe(201);
  return{id,animalId,healthEventId:(await application.json() as {healthEventId:number}).healthEventId};
}

it('corrige una vacuna aplicada con auditoría, sustituye su retiro y conserva el original e idempotencia',async()=>{
  const original=await applied('VAC-CORREGIR','2026-12-01');const body={...correction,operationKey:'vacuna-correccion'};
  const response=await fixture.api(`/api/vaccines/schedules/${original.id}/correction`,body);
  expect(response.status,await response.clone().text()).toBe(200);
  const result=await response.json() as {healthEventId:number};expect(result.healthEventId).not.toBe(original.healthEventId);
  const schedules=await fixture.api('/api/vaccines/schedules?status=applied');expect((await schedules.json() as {schedules:unknown[]}).schedules).toContainEqual(expect.objectContaining({id:original.id,dosage:3,dosageUnit:'dosis',productLot:'LOTE-CORREGIDO',withdrawalUntil:'2026-11-10',applicationObservations:'Dato corregido'}));
  expect(await fixture.db.prepare('SELECT h.effective_date,h.dosage,h.withdrawal_until,o.status FROM health_events h JOIN operation_log o ON o.id=h.operation_log_id WHERE h.id=?').bind(original.healthEventId).first()).toMatchObject({effective_date:'2026-11-01',dosage:1,withdrawal_until:'2026-12-01',status:'annulled'});
  expect(await fixture.db.prepare('SELECT status,applied_date,application_health_event_id FROM vaccine_occurrences WHERE id=?').bind(original.id).first()).toMatchObject({status:'applied',applied_date:'2026-11-02',application_health_event_id:result.healthEventId});
  const withdrawals=(await listWithdrawalAlerts(fixture.db,'2026-11-09')).filter(row=>row.animalCode==='VAC-CORREGIR');expect(withdrawals).toHaveLength(1);expect(withdrawals[0].withdrawalUntil).toBe('2026-11-10');
  const audit=await fixture.db.prepare("SELECT action,reason,previous_data FROM audit_log WHERE entity_type='vaccine_occurrence' AND entity_id=? AND action='correct'").bind(original.id).first<{action:string;reason:string;previous_data:string}>();expect(audit).toMatchObject({action:'correct',reason:'Error de transcripción'});expect(JSON.parse(audit!.previous_data)).toMatchObject({healthEvent:{id:original.healthEventId,dosage:1}});
  const replay=await fixture.api(`/api/vaccines/schedules/${original.id}/correction`,body);expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({replayed:true,healthEventId:result.healthEventId});
  expect(await fixture.db.prepare('SELECT COUNT(*) AS n FROM health_events h JOIN health_event_animals ha ON ha.health_event_id=h.id WHERE ha.animal_id=?').bind(original.animalId).first()).toMatchObject({n:2});
});

it('anula una aplicación, retira sus efectos clínicos y devuelve la dosis pendiente a la agenda',async()=>{
  const original=await applied('VAC-ANULAR','2026-12-01');const body={reason:'La aplicación no ocurrió',operationKey:'vacuna-anulacion'};
  const response=await fixture.api(`/api/vaccines/schedules/${original.id}/annul`,body);expect(response.status,await response.clone().text()).toBe(200);
  expect(await fixture.db.prepare('SELECT status,applied_date,application_health_event_id FROM vaccine_occurrences WHERE id=?').bind(original.id).first()).toMatchObject({status:'pending',applied_date:null,application_health_event_id:null});
  expect((await listWithdrawalAlerts(fixture.db,'2026-11-09')).filter(row=>row.animalCode==='VAC-ANULAR')).toEqual([]);
  const alerts=(await listAlerts(fixture.db,{type:'vaccine',asOf:'2026-11-09'})).alerts;expect(alerts).toContainEqual(expect.objectContaining({sourceId:String(original.id),status:'pending'}));
  expect(await fixture.db.prepare("SELECT action,reason FROM audit_log WHERE entity_type='vaccine_occurrence' AND entity_id=? AND action='annul'").bind(original.id).first()).toMatchObject({action:'annul',reason:'La aplicación no ocurrió'});
  const replay=await fixture.api(`/api/vaccines/schedules/${original.id}/annul`,body);expect(await replay.json()).toMatchObject({replayed:true});
  const reapply=await fixture.api(`/api/vaccines/schedules/${original.id}/apply`,{appliedDate:'2026-11-02',dosage:1,dosageUnit:'ml',reason:'Aplicación real',operationKey:'vacuna-reaplicacion'});expect(reapply.status,await reapply.clone().text()).toBe(201);
});

it('rechaza correcciones que coincidan con una venta, otra aplicación, retiro inválido o fecha futura',async()=>{
  const original=await applied('VAC-VALIDAR');
  await fixture.db.prepare(`INSERT INTO inventory_movements(movement_type,effective_date,barn_id,stage_code,sex,quantity,created_by_user_id,created_at,animal_id) VALUES('sale','2026-11-05',1,'engorde','macho',1,1,'2026-11-05T00:00:00Z',?)`).bind(original.animalId).run();
  for(const[change,key,status]of [[{withdrawalUntil:'2026-11-10'},'venta',409],[{withdrawalUntil:'2026-10-30'},'retiro',400],[{appliedDate:'2099-01-01'},'futura',400],[{reason:''},'motivo',400]] as const){
    const response=await fixture.api(`/api/vaccines/schedules/${original.id}/correction`,{...correction,...change,operationKey:`validacion-${key}`});expect(response.status,await response.clone().text()).toBe(status);
  }
  await fixture.db.prepare('DELETE FROM inventory_movements WHERE animal_id=? AND movement_type=\'sale\'').bind(original.animalId).run();
  const other=await fixture.api('/api/vaccines/schedules/manual',{animalCode:'VAC-VALIDAR',vaccineName:'Vacuna prueba',scheduledDate:'2026-11-03',reason:'Otra dosis',operationKey:'vacuna-otra-programada'});const otherId=(await other.json() as {schedule:{id:number}}).schedule.id;
  const otherApply=await fixture.api(`/api/vaccines/schedules/${otherId}/apply`,{appliedDate:'2026-11-02',dosage:1,dosageUnit:'ml',reason:'Otra aplicación',operationKey:'vacuna-otra-aplicada'});expect(otherApply.status,await otherApply.clone().text()).toBe(201);
  const duplicate=await fixture.api(`/api/vaccines/schedules/${original.id}/correction`,{...correction,operationKey:'vacuna-duplicada'});expect(duplicate.status,await duplicate.clone().text()).toBe(409);
  const third=await fixture.api('/api/vaccines/schedules/manual',{animalCode:'VAC-VALIDAR',vaccineName:'Vacuna prueba',scheduledDate:'2026-11-04',reason:'Tercera dosis',operationKey:'vacuna-tercera-programada'});const thirdId=(await third.json() as {schedule:{id:number}}).schedule.id;
  const duplicateApply=await fixture.api(`/api/vaccines/schedules/${thirdId}/apply`,{appliedDate:'2026-11-02',dosage:1,dosageUnit:'ml',reason:'Error duplicado',operationKey:'vacuna-tercera-aplicada'});expect(duplicateApply.status,await duplicateApply.clone().text()).toBe(409);
  expect(await fixture.db.prepare('SELECT application_health_event_id FROM vaccine_occurrences WHERE id=?').bind(original.id).first()).toMatchObject({application_health_event_id:original.healthEventId});
});

it('retira la siguiente dosis recurrente al anular y la regenera una sola vez al reaplicar',async()=>{
  await fixture.addAnimal('VAC-RECURRENTE');
  const rule=await fixture.api('/api/vaccines/rules',{vaccineName:'Recurrente prueba',targetCategory:'verraco',baseEvent:'semiannual',referenceDate:'2026-11-01',recurrenceDays:180,effectiveFrom:'2026-01-01',reason:'Regla recurrente de prueba',operationKey:'vacuna-regla-recurrente'});expect(rule.status,await rule.clone().text()).toBe(201);const ruleKey=(await rule.json() as {ruleKey:string}).ruleKey;
  const dose=(await fixture.db.prepare("SELECT id FROM vaccine_occurrences WHERE animal_code_snapshot='VAC-RECURRENTE' AND rule_key=?").bind(ruleKey).first<{id:number}>())!.id;
  const apply=await fixture.api(`/api/vaccines/schedules/${dose}/apply`,{appliedDate:'2026-11-01',dosage:1,dosageUnit:'ml',reason:'Aplicación recurrente',operationKey:'vacuna-rec-apply'});expect(apply.status,await apply.clone().text()).toBe(201);
  const next=(await fixture.db.prepare("SELECT id FROM vaccine_occurrences WHERE animal_code_snapshot='VAC-RECURRENTE' AND rule_key=? AND occurrence_number=2").bind(ruleKey).first<{id:number}>())!.id;
  const annul=await fixture.api(`/api/vaccines/schedules/${dose}/annul`,{reason:'Dosis no aplicada',operationKey:'vacuna-rec-annul'});expect(annul.status,await annul.clone().text()).toBe(200);
  expect(await fixture.db.prepare('SELECT id FROM vaccine_occurrences WHERE id=?').bind(next).first()).toBeNull();
  const previous=await fixture.db.prepare("SELECT previous_data FROM audit_log WHERE entity_type='vaccine_occurrence' AND entity_id=? AND action='annul'").bind(dose).first<{previous_data:string}>();expect(JSON.parse(previous!.previous_data).derivedOccurrences).toContainEqual(expect.objectContaining({id:next,status:'pending'}));
  await generateVaccineSchedules(fixture.db,1,{},ruleKey);
  expect(await fixture.db.prepare("SELECT COUNT(*) AS n FROM vaccine_occurrences WHERE animal_code_snapshot='VAC-RECURRENTE' AND rule_key=?").bind(ruleKey).first()).toMatchObject({n:1});
  const reapply=await fixture.api(`/api/vaccines/schedules/${dose}/apply`,{appliedDate:'2026-11-02',dosage:1,dosageUnit:'ml',reason:'Dosis real',operationKey:'vacuna-rec-reapply'});expect(reapply.status,await reapply.clone().text()).toBe(201);
  await generateVaccineSchedules(fixture.db,1,{},ruleKey);
  expect(await fixture.db.prepare("SELECT occurrence_number,status,scheduled_date FROM vaccine_occurrences WHERE animal_code_snapshot='VAC-RECURRENTE' AND rule_key=? ORDER BY occurrence_number").bind(ruleKey).all()).toMatchObject({results:[{occurrence_number:1,status:'applied',scheduled_date:'2026-11-01'},{occurrence_number:2,status:'pending',scheduled_date:'2027-04-30'}]});
});

it('bloquea una corrección o anulación con dosis recurrentes posteriores ya aplicadas',async()=>{
  await fixture.addAnimal('VAC-POSTERIOR');
  const rule=await fixture.api('/api/vaccines/rules',{vaccineName:'Cadena corta',targetCategory:'verraco',baseEvent:'semiannual',referenceDate:'2026-11-01',recurrenceDays:2,effectiveFrom:'2026-01-01',reason:'Regla prueba',operationKey:'vacuna-regla-corta'});const key=(await rule.json() as {ruleKey:string}).ruleKey;
  await fixture.db.prepare("UPDATE vaccine_occurrences SET scheduled_date='2026-11-01' WHERE rule_key=? AND animal_code_snapshot='VAC-POSTERIOR'").bind(key).run();
  const first=(await fixture.db.prepare("SELECT id FROM vaccine_occurrences WHERE rule_key=? AND animal_code_snapshot='VAC-POSTERIOR'").bind(key).first<{id:number}>())!.id;
  for(const[id,appliedDate,op]of [[first,'2026-11-01','vacuna-chain-1']] as const){const response=await fixture.api(`/api/vaccines/schedules/${id}/apply`,{appliedDate,dosage:1,dosageUnit:'ml',reason:'Dosis de prueba',operationKey:op});expect(response.status,await response.clone().text()).toBe(201);}
  const next=(await fixture.db.prepare("SELECT id FROM vaccine_occurrences WHERE rule_key=? AND animal_code_snapshot='VAC-POSTERIOR' AND status='pending'").bind(key).first<{id:number}>())!.id;
  const response=await fixture.api(`/api/vaccines/schedules/${next}/apply`,{appliedDate:'2026-11-03',dosage:1,dosageUnit:'ml',reason:'Segunda dosis',operationKey:'vacuna-chain-2'});expect(response.status,await response.clone().text()).toBe(201);
  for(const action of ['correction','annul']){const rejected=await fixture.api(`/api/vaccines/schedules/${first}/${action}`,{...correction,operationKey:`vacuna-chain-${action}`});expect(rejected.status,await rejected.clone().text()).toBe(409);}
});

for(const baseline of ['pending','applied'] as const)it(`no recrea dosis derivadas si se anula su predecesora mientras el generador leyó ${baseline}`,async()=>{
  const code=`VAC-RACE-${baseline}`;const animalId=await fixture.addAnimal(code);
  const rule=await fixture.api('/api/vaccines/rules',{vaccineName:`Carrera ${baseline}`,targetCategory:'verraco',baseEvent:'semiannual',referenceDate:'2026-11-01',recurrenceDays:180,effectiveFrom:'2026-01-01',reason:'Regla para carrera',operationKey:`race-rule-${baseline}`});expect(rule.status,await rule.clone().text()).toBe(201);const ruleKey=(await rule.json() as {ruleKey:string}).ruleKey;
  const first=(await fixture.db.prepare('SELECT id FROM vaccine_occurrences WHERE rule_key=? AND animal_id=?').bind(ruleKey,animalId).first<{id:number}>())!.id;
  const application=await fixture.api(`/api/vaccines/schedules/${first}/apply`,{appliedDate:'2026-11-01',dosage:1,dosageUnit:'ml',reason:'Dosis inicial',operationKey:`race-apply-${baseline}`});expect(application.status,await application.clone().text()).toBe(201);
  if(baseline==='applied')await fixture.db.prepare('DELETE FROM vaccine_occurrences WHERE rule_key=? AND animal_id=? AND occurrence_number=2').bind(ruleKey,animalId).run();
  let entered!:()=>void;const paused=new Promise<void>(resolve=>{entered=resolve;});let resume!:()=>void;const released=new Promise<void>(resolve=>{resume=resolve;});let intercepted=false;
  const interceptedDb=new Proxy(fixture.db,{get(target,property){
    if(property==='prepare')return(sql:string)=>{
      const wrap=(statement:D1PreparedStatement,values:unknown[]=[]):D1PreparedStatement=>new Proxy(statement,{get(prepared,key){
        if(key==='bind')return(...args:unknown[])=>wrap(prepared.bind(...args),args);
        if(key==='run'&&sql.startsWith('INSERT INTO vaccine_occurrences(')&&values[0]===ruleKey&&Number(values[2])===animalId)return async()=>{intercepted=true;entered();await released;return prepared.run();};
        const value=Reflect.get(prepared,key,prepared);return typeof value==='function'?value.bind(prepared):value;
      }});return wrap(target.prepare(sql));
    };
    const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
  }});
  const generator=generateVaccineSchedules(interceptedDb,1,{},ruleKey);
  await paused;
  try{
    const annul=await fixture.api(`/api/vaccines/schedules/${first}/annul`,{reason:'Anular antes de confirmar generación',operationKey:`race-annul-${baseline}`});expect(annul.status,await annul.clone().text()).toBe(200);
  }finally{resume();}
  await generator;expect(intercepted).toBe(true);
  expect(await fixture.db.prepare('SELECT occurrence_number,status FROM vaccine_occurrences WHERE rule_key=? AND animal_id=? ORDER BY occurrence_number').bind(ruleKey,animalId).all()).toMatchObject({results:[{occurrence_number:1,status:'pending'}]});
});

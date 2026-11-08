import {readFile,readdir} from 'node:fs/promises';
import {afterAll,describe,expect,it} from 'vitest';
import {Miniflare} from 'miniflare';
import worker from '../worker/index';

const runtime=new Miniflare({workers:[{config:{name:'cycle-date-race-test',compatibilityDate:'2026-07-01',manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}},modulesRoot:'/'},env:{DB:{type:'d1',id:'cycle-date-race'}}}}]});
afterAll(()=>runtime.dispose());
async function migrate(db:D1Database){
  for(const file of(await readdir(new URL('../migrations/',import.meta.url))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\s+/g,' ');let trigger='';
    for(const part of sql.split(';').map(part=>part.trim()).filter(Boolean)){
      if(trigger||/^CREATE TRIGGER/i.test(part)){trigger+=`${part}; `;if(/\bEND$/i.test(part)){await db.prepare(trigger.trim()).run();trigger='';}}
      else await db.prepare(part).run();
    }
    if(trigger)throw new Error(`Trigger incompleto: ${file}`);
  }
}

describe('Secuencia entre corrección de parto y apertura concurrente',()=>{
  it('rechaza el servicio que se validó antes de una corrección y confirma después de ella',async()=>{
    const db=await runtime.getD1Database('DB');await migrate(db);let token='';
    const api=(path:string,body:Record<string,unknown>,target=db)=>worker.fetch(new Request(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}),{DB:target});
    const bootstrap=await api('/api/auth/bootstrap',{username:'race-admin@granja.test',password:'PasswordFicticio2026!',name:'Administrador de prueba'});expect(bootstrap.status).toBe(201);token=(await bootstrap.json() as {token:string}).token;
    const sow=await api('/api/animals',{code:'RACE-MADRE',animalType:'cerda',sex:'hembra',birthDate:'2026-01-01',entryDate:'2026-01-01',entryStageCode:'gestacion',barnId:1,locationCode:'galpon_a',originType:'inicial',reason:'Madre ficticia para carrera',operationKey:'race-sow-create'});expect(sow.status,await sow.clone().text()).toBe(201);
    const cycleBody={femaleCode:'RACE-MADRE',serviceDate:'2026-05-25',serviceType:'inseminacion_artificial',materialSource:'external',externalSource:'Material ficticio',operationKey:'race-first-cycle'};
    const cycle=await api('/api/reproduction/cycles',cycleBody);expect(cycle.status,await cycle.clone().text()).toBe(201);const cycleId=(await cycle.json() as {createdCycleId:string}).createdCycleId;
    const birth=await api(`/api/reproduction/cycles/${cycleId}/farrowing`,{farrowingDate:'2026-09-16',maleAlive:5,femaleAlive:3,reason:'Parto de prueba de carrera',operationKey:'race-farrowing'});expect(birth.status,await birth.clone().text()).toBe(201);const litterId=(await birth.json() as {litterId:string}).litterId;
    let intercepted=false;
    const interceptedDb=new Proxy(db,{get(target,property){
      if(property==='batch')return async(statements:D1PreparedStatement[])=>{
        if(!intercepted){intercepted=true;const corrected=await api(`/api/reproduction/litters/${litterId}/date-correction`,{farrowingDate:'2026-09-18',expectedCurrentDate:'2026-09-16',reason:'Corrección antes del commit rival',operationKey:'race-date-corrected'});expect(corrected.status,await corrected.clone().text()).toBe(201);}
        return target.batch(statements);
      };
      const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
    }});
    const rival=await api('/api/reproduction/cycles',{...cycleBody,serviceDate:'2026-09-17',operationKey:'race-stale-next-cycle'},interceptedDb);
    expect(intercepted).toBe(true);expect(rival.status,await rival.clone().text()).toBe(409);
    expect(await db.prepare('SELECT COUNT(*) n FROM reproduction_cycles').first()).toMatchObject({n:1});
    expect(await db.prepare("SELECT COUNT(*) n FROM operation_log WHERE operation_key='race-stale-next-cycle'").first()).toMatchObject({n:0});
    expect(await db.prepare('SELECT farrowing_date FROM litters WHERE id=?').bind(litterId).first()).toMatchObject({farrowing_date:'2026-09-18'});
    const valid=await api('/api/reproduction/cycles',{...cycleBody,serviceDate:'2026-09-18',operationKey:'race-valid-next-cycle'});expect(valid.status,await valid.clone().text()).toBe(201);
    const overlap=await api(`/api/reproduction/litters/${litterId}/date-correction`,{farrowingDate:'2026-09-20',expectedCurrentDate:'2026-09-18',reason:'No mover parto después del siguiente ciclo',operationKey:'race-overlap-next-cycle'});expect(overlap.status,await overlap.clone().text()).toBe(409);
    expect(await db.prepare('SELECT farrowing_date FROM litters WHERE id=?').bind(litterId).first()).toMatchObject({farrowing_date:'2026-09-18'});
    const earlier=await api(`/api/reproduction/litters/${litterId}/date-correction`,{farrowingDate:'2026-09-17',expectedCurrentDate:'2026-09-18',reason:'Ajustar referencia antes del mismo día',operationKey:'race-back-one-day'});expect(earlier.status,await earlier.clone().text()).toBe(201);
    const sameDay=await api(`/api/reproduction/litters/${litterId}/date-correction`,{farrowingDate:'2026-09-18',expectedCurrentDate:'2026-09-17',reason:'Misma fecha calendario que siguiente servicio',operationKey:'race-allow-same-day'});expect(sameDay.status,await sameDay.clone().text()).toBe(201);
    expect(await db.prepare('SELECT COUNT(*) n FROM inventory_write_guard').first()).toMatchObject({n:0});
  },60000);
});

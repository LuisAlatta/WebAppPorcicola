import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { getInventorySnapshot } from '../worker/inventory';

const runtime=new Miniflare({workers:[{config:{name:'inventory-capacity-test',compatibilityDate:'2026-07-01',manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:'export default { fetch() { return new Response("ok"); } };'}},modulesRoot:'/'},env:{DB:{type:'d1',id:'inventory-capacity-db'}}}}]});
afterAll(async()=>runtime.dispose());

describe('Capacidad · avisos por población física',()=>{
  let db:D1Database;let token='';
  const api=(path:string,payload?:Record<string,unknown>)=>worker.fetch(new Request(`http://localhost${path}`,{method:payload?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),{DB:db});
  beforeAll(async()=>{
    db=await runtime.getD1Database('DB');
    for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const sql=(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\s+/g,' ');let trigger='';
      for(const part of sql.split(';').map(part=>part.trim()).filter(Boolean)){if(trigger||/^CREATE TRIGGER/i.test(part)){trigger+=`${part}; `;if(/\bEND$/i.test(part)){await db.prepare(trigger.trim()).run();trigger='';}}else await db.prepare(part).run();}
      if(trigger)throw new Error(`Trigger incompleto en ${file}`);
    }
    const response=await api('/api/auth/bootstrap',{username:'capacity@granja.test',password:'EnsayoCapacidad2026!',name:'Administrador capacidad'});expect(response.status).toBe(201);token=(await response.json() as {token:string}).token;
    await db.prepare('UPDATE barns SET capacity=CASE id WHEN 1 THEN 4 ELSE 1 END').run();
    for(const [barnId,sex,quantity,key] of [[1,'macho',3,'a-m'],[1,'hembra',2,'a-h'],[2,'macho',2,'b-m']] as const){
      const created=await api('/api/inventory/movements',{movementType:'initial',effectiveDate:'2026-11-01',barnId,stageCode:'engorde',sex,quantity,reason:'Conteo real aun sobre capacidad',operationKey:`capacity-${key}`});expect(created.status,await created.clone().text()).toBe(201);
    }
  },60000);

  it('avisa sin bloquear y suma todos los grupos físicos de cada galpón',async()=>{
    const response=await api('/api/inventory?asOf=2026-11-01');expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({summary:{total:{available:7}},capacityWarnings:[{barnId:1,barnName:'Galpón A',capacity:4,heads:5,excessHeads:1},{barnId:2,barnName:'Galpón B',capacity:1,heads:2,excessHeads:1}]});
  });

  it('respeta el corte y el alcance del usuario, y no avisa al quedar dentro de capacidad',async()=>{
    expect(await getInventorySnapshot(db,{asOf:'2026-10-31'})).toMatchObject({capacityWarnings:[]});
    expect(await getInventorySnapshot(db,{asOf:'2026-11-01'},{allowedBarnNames:['Galpón A']})).toMatchObject({capacityWarnings:[{barnId:1,heads:5,capacity:4}]});
    await db.prepare('UPDATE barns SET capacity=5 WHERE id=1').run();
    expect(await getInventorySnapshot(db,{asOf:'2026-11-01'},{allowedBarnNames:['Galpón A']})).toMatchObject({capacityWarnings:[]});
  });
});

import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime=new Miniflare({workers:[{config:{name:'inventory-locations-test',compatibilityDate:'2026-07-01',manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:'export default { fetch() { return new Response("ok"); } };'}},modulesRoot:'/'},env:{DB:{type:'d1',id:'inventory-locations-db'}}}}]});
afterAll(async()=>runtime.dispose());

describe('Ubicaciones · grupos y galpones coherentes',()=>{
  let db:D1Database;let token='';
  const api=(path:string,payload?:Record<string,unknown>)=>worker.fetch(new Request(`http://localhost${path}`,{method:payload?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),{DB:db});
  const group={movementType:'initial',effectiveDate:'2026-11-01',barnId:1,locationCode:'galpon_a',stageCode:'engorde',sex:'macho',quantity:5,reason:'Grupo de prueba de ubicaciones'};
  beforeAll(async()=>{
    db=await runtime.getD1Database('DB');
    for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const sql=(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\s+/g,' ');let trigger='';
      for(const part of sql.split(';').map(part=>part.trim()).filter(Boolean)){if(trigger||/^CREATE TRIGGER/i.test(part)){trigger+=`${part}; `;if(/\bEND$/i.test(part)){await db.prepare(trigger.trim()).run();trigger='';}}else await db.prepare(part).run();}
      if(trigger)throw new Error(`Trigger incompleto en ${file}`);
    }
    const response=await api('/api/auth/bootstrap',{username:'group-location@granja.test',password:'EnsayoUbicacion2026!',name:'Administrador ubicación'});expect(response.status).toBe(201);token=(await response.json() as {token:string}).token;
    const created=await api('/api/inventory/movements',{...group,operationKey:'location-group-stock'});expect(created.status,await created.clone().text()).toBe(201);
  },60000);

  it('rechaza altas con la ubicación de otro galpón y acepta el corral que hereda su galpón',async()=>{
    const invalid=await api('/api/inventory/movements',{...group,locationCode:'galpon_b',operationKey:'location-group-mismatch'});expect(invalid.status,await invalid.clone().text()).toBe(400);
    const valid=await api('/api/inventory/movements',{...group,locationCode:'corral_maternidad',operationKey:'location-group-child'});expect(valid.status,await valid.clone().text()).toBe(201);
    const snapshot=await api('/api/inventory?asOf=2026-11-01');expect(await snapshot.json()).toMatchObject({options:{locations:expect.arrayContaining([expect.objectContaining({code:'corral_maternidad',barnId:1}),expect.objectContaining({code:'galpon_b',barnId:2})])}});
  });

  it('valida origen y destino del traslado grupal y conserva la pareja válida',async()=>{
    const transfer={effectiveDate:'2026-11-02',sourceBarnId:1,destinationBarnId:2,sourceLocationCode:'galpon_a',destinationLocationCode:'galpon_b',stageCode:'engorde',sex:'macho',quantity:2,reason:'Traslado coherente de grupo'};
    for(const [field,code,key] of [['sourceLocationCode','galpon_b','source'],['destinationLocationCode','galpon_a','destination']]){
      const invalid=await api('/api/inventory/transfers',{...transfer,[field]:code,operationKey:`location-group-${key}`});expect(invalid.status,await invalid.clone().text()).toBe(400);
    }
    const valid=await api('/api/inventory/transfers',{...transfer,operationKey:'location-group-transfer'});expect(valid.status,await valid.clone().text()).toBe(201);
    expect((await api('/api/inventory/transfers',{...transfer,operationKey:'location-group-transfer'})).status).toBe(200);
  });

  it('no permite crear un grupo contradictorio mediante el conteo físico',async()=>{
    const response=await api('/api/inventory/reconciliations',{...group,locationCode:'galpon_b',countedHeads:2,operationKey:'location-group-reconcile'});expect(response.status,await response.clone().text()).toBe(400);
  });
});

import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { getFeedProjection, listFeedMovements } from '../worker/feed';
import { reconcileAlerts } from '../worker/alerts';

const runtime=new Miniflare({workers:[{config:{name:'worker-feed-test',compatibilityDate:'2026-07-01',manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:'export default { fetch() { return new Response("ok"); } };'}},modulesRoot:'/'},env:{DB:{type:'d1',id:'feed-database'}}}}]});
describe('Almacenes y suministros · T15',()=>{
 let db:D1Database;let token='';
 const api=(path:string,init:RequestInit={})=>worker.fetch(new Request(`http://localhost${path}`,{...init,headers:{'Authorization':`Bearer ${token}`,...(init.body?{'Content-Type':'application/json'}:{})}}),{DB:db});
 const post=(payload:Record<string,unknown>)=>api('/api/feed/movements',{method:'POST',body:JSON.stringify(payload)});
 beforeAll(async()=>{
  db=await runtime.getD1Database('DB');await db.exec('PRAGMA foreign_keys=ON;');
  for(const file of ['0001_initial_schema.sql','0002_administration_schema.sql','0003_events_audit_schema.sql','0004_farm_config_schema.sql','0005_inventory_schema.sql','0006_animals_schema.sql','0007_transfer_and_stock_guard.sql','0008_animal_location_history.sql','0009_weight_measurement_order.sql','0010_reproduction_cycles.sql','0011_litters_and_farrowing.sql','0012_weaning_events_and_cycles.sql','0013_feed_warehouses_and_ledger.sql','0014_feed_projections_and_turns.sql','0015_health_events_and_withdrawals.sql','0016_vaccine_rules_and_schedules.sql','0017_financial_ledger.sql','0018_trade_links.sql','0019_feed_purchase_reversals.sql','0020_financial_settlements.sql','0021_alert_occurrences.sql']){
   const schemaSql=await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8');if(file==='0020_financial_settlements.sql'){const sql=schemaSql.replace(/^--.*$/gm,'').replace(/\s+/g,' ');const statements=sql.split(';').map(x=>x.trim()).filter(Boolean);let trigger='';for(const statement of statements){if(trigger||/^CREATE TRIGGER/i.test(statement)){trigger+=`${statement}; `;if(/\bEND$/i.test(statement)){await db.exec(trigger.trim());trigger='';}}else await db.exec(`${statement};`);}}else for(const statement of schemaSql.split('\n').map(x=>x.trim()).filter(x=>!x.startsWith('--')).join(' ').split(';').map(x=>x.trim()).filter(Boolean))await db.exec(`${statement};`);
  }
  const res=await worker.fetch(new Request('http://localhost/api/auth/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin.feed@granja.pe',password:'PasswordFeed2026!',name:'Admin Alimentación'})}),{DB:db});expect(res.status).toBe(201);token=((await res.json()) as {token:string}).token;
 });
 afterAll(async()=>runtime.dispose());
 it('concilia saldos, costos, reintentos y rechaza retiros que dejan saldo retroactivo negativo',async()=>{
  const base={effectiveDate:'2026-11-08',warehouseId:1,feedCode:'preinicio',lotCode:'LOTE-P-01',costPerKg:2.5,reason:'Compra para prueba',operationKey:'feed-purchase-1'};
  let res=await post({...base,movementType:'purchase',supplier:'Proveedor Uno',quantityKg:602});expect(res.status).toBe(201);
  const purchaseFinance=await db.prepare("SELECT amount_minor,currency_code,source_type,source_id FROM financial_entries WHERE source_type='feed_purchase'").first<{amount_minor:number;currency_code:string;source_type:string;source_id:string}>();expect(purchaseFinance).toMatchObject({amount_minor:150500,currency_code:'PEN',source_type:'feed_purchase'});
  expect((await post({...base,movementType:'purchase',supplier:'Proveedor Uno',quantityKg:602})).status).toBe(200);
  res=await post({...base,movementType:'delivery',quantityKg:123,destinationBarnId:1,reason:'Ración del galpón',operationKey:'feed-delivery-1'});expect(res.status).toBe(201);
  expect(await db.prepare("SELECT COUNT(*) AS count FROM financial_entries WHERE source_type='feed_purchase'").first<{count:number}>()).toMatchObject({count:1});
  const data=await (await api('/api/feed/inventory?asOf=2026-11-08')).json() as {inventory:{availableKg:number;withdrawnKg:number;allocatedCostMinor:number}[];totals:{availableKg:number}};
  expect(data.totals.availableKg).toBe(479);expect(data.inventory[0].withdrawnKg).toBe(123);expect(data.inventory[0].allocatedCostMinor).toBe(30750);
  const cannotReturnUsed=await post({...base,movementType:'return_supplier',quantityKg:602,reversesMovementId:Number(purchaseFinance!.source_id),reason:'Intento de devolución con consumo',operationKey:'feed-return-used'});expect(cannotReturnUsed.status).toBe(409);
  const separatePurchase=await post({...base,movementType:'purchase',lotCode:'LOTE-DEV',quantityKg:10,supplier:'Proveedor devolución',documentReference:'FC-DEV-1',operationKey:'feed-purchase-returnable'});expect(separatePurchase.status,await separatePurchase.clone().text()).toBe(201);
  const returnable=await db.prepare("SELECT source_id FROM financial_entries WHERE source_type='feed_purchase' AND reference='FC-DEV-1'").first<{source_id:string}>();
  const supplierReturn=await post({...base,lotCode:'LOTE-DEV',movementType:'return_supplier',quantityKg:10,supplier:'Proveedor devolución',documentReference:'NC-DEV-1',reversesMovementId:Number(returnable!.source_id),reason:'Devolución íntegra del lote',operationKey:'feed-return-full'});expect(supplierReturn.status,await supplierReturn.clone().text()).toBe(201);
  expect((await post({...base,lotCode:'LOTE-DEV',movementType:'return_supplier',quantityKg:10,supplier:'Proveedor devolución',reversesMovementId:Number(returnable!.source_id),reason:'Reintento con otra clave',operationKey:'feed-return-duplicate'})).status).toBe(409);
  expect(await db.prepare("SELECT reversed_at FROM financial_entries WHERE source_type='feed_purchase' AND source_id=?").bind(returnable!.source_id).first()).toMatchObject({reversed_at:expect.any(String)});
  expect(await db.prepare("SELECT direction,amount_minor,reversal_of_id FROM financial_entries WHERE source_type='reversal' AND reversal_of_id=(SELECT id FROM financial_entries WHERE source_type='feed_purchase' AND source_id=?)").bind(returnable!.source_id).first()).toMatchObject({direction:'income',amount_minor:2500,reversal_of_id:expect.any(Number)});
  const admin=await db.prepare("SELECT id FROM users WHERE username='admin.feed@granja.pe'").first<{id:number}>();
  await db.prepare("INSERT INTO inventory_movements(movement_type,effective_date,barn_id,stage_code,sex,quantity,created_by_user_id,created_at) VALUES('initial','2026-11-08',1,'preinicio','hembra',35,?,?)").bind(admin!.id,'2026-11-08T12:00:00.000Z').run();
  await db.prepare("INSERT INTO animals(id,code,animal_type,sex,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,created_by_user_id,created_at,updated_at) VALUES(1,'T16-PESO-01','lechon','hembra','inicial','2026-01-01','preinicio','preinicio',1,?,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')").bind(admin!.id).run();
  await db.prepare("INSERT INTO animal_weights(animal_id,weighed_on,weighed_time,weight_kg,stage_code,barn_id,recorded_by_user_id,created_at) VALUES(1,'2026-10-20','08:00',20,'preinicio',1,?,'2026-10-20T08:00:00.000Z'),(1,'2026-11-08','08:00',30,'preinicio',1,?,'2026-11-08T08:00:00.000Z')").bind(admin!.id,admin!.id).run();
  const projection=await getFeedProjection(db,'2026-11-08');const preinicio=projection.stages.find(row=>row.stageCode==='preinicio');expect(preinicio).toMatchObject({heads:35,dailyKg:22.75,stageNeedKg:477.75,monthlyNeedKg:682.5,availableKg:479,coveredDays:21,monthlyShortageKg:203.5});expect(projection.stages.find(row=>row.stageCode==='vacia')).toMatchObject({heads:0,dailyKg:0,stageNeedKg:0,monthlyNeedKg:0,requirements:[]});
  const stockAfterProjection=await (await api('/api/feed/inventory?asOf=2026-11-08')).json() as {totals:{availableKg:number}};expect(stockAfterProjection.totals.availableKg).toBe(479);
  const turnInput={...base,movementType:'delivery',warehouseId:1,quantityKg:2,costPerKg:2.5,destinationBarnId:1,reason:'Turno mañana',operationKey:'feed-turn-1',turn:{shiftCode:'manana',stageCode:'preinicio',plannedKg:2.2,servedKg:2,consumedKg:1.8}};
  const turn=await api('/api/feed/turns',{method:'POST',body:JSON.stringify(turnInput)});expect(turn.status).toBe(201);expect((await api('/api/feed/turns',{method:'POST',body:JSON.stringify(turnInput)})).status).toBe(200);
  const turnRow=await db.prepare('SELECT COUNT(*) AS count FROM feed_turns').first<{count:number}>();expect(turnRow?.count).toBe(1);
  const conversion=await getFeedProjection(db,'2026-11-08');expect(conversion.conversion.find(row=>row.barnId===1&&row.stageCode==='preinicio')).toMatchObject({measuredAnimals:1,weightGainKg:10,consumedKg:1.8,feedConversionRatio:0.18,unavailableReason:null});
  const afterTurn=await (await api('/api/feed/inventory?asOf=2026-11-08')).json() as {totals:{availableKg:number}};expect(afterTurn.totals.availableKg).toBe(477);
  res=await post({...base,movementType:'delivery',effectiveDate:'2026-11-07',quantityKg:1,destinationBarnId:1,reason:'Retiro anterior a compra',operationKey:'feed-retroactive-1'});const rejection=await res.json() as {error?:string};expect(res.status).toBe(409);expect(rejection.error).toContain('guard_id >= 0');
  const movements=await (await api('/api/feed/movements?limit=50')).json() as {movements:{id:number}[]};expect(movements.movements).toHaveLength(5);
  const concurrent=await Promise.all([post({...base,movementType:'delivery',quantityKg:300,destinationBarnId:1,reason:'Retiro simultáneo A',operationKey:'feed-concurrent-a'}),post({...base,movementType:'delivery',quantityKg:300,destinationBarnId:1,reason:'Retiro simultáneo B',operationKey:'feed-concurrent-b'})]);expect(concurrent.map(item=>item.status).sort()).toEqual([201,409]);
  const afterConcurrent=await (await api('/api/feed/inventory?asOf=2026-11-08')).json() as {totals:{availableKg:number}};expect(afterConcurrent.totals.availableKg).toBe(177);
  const plannedTurn={...base,movementType:'delivery',quantityKg:12,destinationBarnId:1,reason:'Entrega parcial T22',operationKey:'feed-t22-partial-a',turn:{shiftCode:'tarde',stageCode:'preinicio',plannedKg:20,servedKg:12}};
  expect((await post(plannedTurn)).status).toBe(201);
  await reconcileAlerts(db,{today:'2026-11-08',clock:1800});
  const pendingFeeding=await db.prepare("SELECT detail_json,status FROM alert_occurrences WHERE alert_type='feeding' AND source_id LIKE '%tarde%'").first<{detail_json:string;status:string}>();
  expect(pendingFeeding?.status).toBe('pending');expect(JSON.parse(pendingFeeding!.detail_json)).toMatchObject({plannedKg:20,servedKg:12,pendingKg:8});
  expect((await post({...plannedTurn,quantityKg:8,operationKey:'feed-t22-partial-b',turn:{shiftCode:'tarde',stageCode:'preinicio',plannedKg:20,servedKg:8}})).status).toBe(201);
  await reconcileAlerts(db,{today:'2026-11-08',clock:1800});
  expect(await db.prepare("SELECT status FROM alert_occurrences WHERE alert_type='feeding' AND source_id LIKE '%tarde%'").first()).toMatchObject({status:'resolved'});
  await db.prepare("INSERT INTO barns(id,code,name,created_at) VALUES(99,'SCOPE-OTHER','Galpón ajeno','2026-01-01T00:00:00.000Z')").run();
  const scoped=await listFeedMovements(db,{limit:50},{allowedBarnNames:['Galpón ajeno']});expect(scoped.filter(row=>row.movementType==='purchase')).toHaveLength(2);expect(scoped.filter(row=>row.movementType==='return_supplier')).toHaveLength(1);expect(scoped.every(row=>row.destinationBarn===null)).toBe(true);
  const cajaPurchase=await post({...base,movementType:'purchase',lotCode:'LOTE-CA30',quantityKg:200,supplier:'Proveedor CA30',documentReference:'FC-CA30',operationKey:'feed-ca30-purchase'});expect(cajaPurchase.status).toBe(201);
  const cajaSource=await db.prepare("SELECT id,amount_minor FROM financial_entries WHERE source_type='feed_purchase' AND reference='FC-CA30'").first<{id:number;amount_minor:number}>();expect(cajaSource?.amount_minor).toBe(50000);
  const consumption=await post({...base,movementType:'delivery',lotCode:'LOTE-CA30',quantityKg:48,destinationBarnId:1,reason:'Consumo valorizado CA30',operationKey:'feed-ca30-consumption'});expect(consumption.status).toBe(201);
  expect(await db.prepare("SELECT COUNT(*) AS count FROM financial_entries WHERE source_type='feed_purchase' AND source_id=(SELECT CAST(id AS TEXT) FROM feed_movements WHERE operation_log_id=(SELECT id FROM operation_log WHERE operation_key='feed-ca30-purchase'))").first()).toMatchObject({count:1});
  expect(await db.prepare("SELECT total_cost_minor FROM feed_movements WHERE operation_log_id=(SELECT id FROM operation_log WHERE operation_key='feed-ca30-consumption')").first()).toMatchObject({total_cost_minor:12000});
 },15000);
});

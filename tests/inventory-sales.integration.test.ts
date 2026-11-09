import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { commitOperation, createOperationClaim } from '../worker/events';
import { correctInventoryMovement, registerMovement } from '../worker/inventory';
import { createFinancialSettlement } from '../worker/finance';

const runtime = new Miniflare({ workers:[{ config:{ name:'inventory-sales-test', compatibilityDate:'2026-07-01', manifest:{ mainModule:'index.js', modules:{ 'index.js':{ type:'esm', contents:'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot:'/' }, env:{ DB:{ type:'d1', id:'inventory-sales-db' } } } }] });
afterAll(async () => runtime.dispose());

describe('Ventas grupales · inventario y finanzas atómicos', () => {
  let db:D1Database; let token=''; let actorId=0; let saleId=0;
  const api=(path:string,payload?:Record<string,unknown>)=>worker.fetch(new Request(`http://localhost${path}`,{ method:payload?'POST':'GET', headers:{ ...(token?{ Authorization:`Bearer ${token}` }:{}), ...(payload?{ 'Content-Type':'application/json' }:{}) }, ...(payload?{ body:JSON.stringify(payload) }:{}) }),{ DB:db });
  const group={ effectiveDate:'2026-11-01',barnId:1,locationCode:null,lotCode:null,stageCode:'engorde',sex:'macho',quantity:2,reason:'Venta grupal de prueba' };
  const sale=(operationKey:string,overrides:Record<string,unknown>={})=>({ ...group,movementType:'sale',saleAmount:'120.50',currencyCode:'PEN',counterparty:'Comprador de prueba',documentReference:'V-001',operationKey,...overrides });
  const stock=async(stageCode='engorde',sex='macho')=>Number((await db.prepare("SELECT COALESCE(SUM(CASE WHEN movement_type IN ('sale','death','transfer_out') THEN -quantity ELSE quantity END),0) AS heads FROM inventory_movements WHERE barn_id=1 AND location_code IS NULL AND lot_code IS NULL AND stage_code=? AND sex=?").bind(stageCode,sex).first<{heads:number}>())!.heads);
  const seed=async(operationKey:string,overrides:Record<string,unknown>={})=>{const response=await api('/api/inventory/movements',{ ...group,movementType:'initial',quantity:10,operationKey,...overrides });expect(response.status,await response.clone().text()).toBe(201);};
  beforeAll(async()=>{
    db=await runtime.getD1Database('DB');
    for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const sql=(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\s+/g,' ');let trigger='';
      for(const part of sql.split(';').map(part=>part.trim()).filter(Boolean)){if(trigger||/^CREATE TRIGGER/i.test(part)){trigger+=`${part}; `;if(/\bEND$/i.test(part)){await db.prepare(trigger.trim()).run();trigger='';}}else await db.prepare(part).run();}
      if(trigger)throw new Error(`Trigger incompleto en ${file}`);
    }
    const response=await api('/api/auth/bootstrap',{username:'admin-group-sale@granja.test',password:'EnsayoVentas2026!',name:'Administrador de ventas'});expect(response.status).toBe(201);const session=await response.json() as {token:string;user:{id:number}};token=session.token;actorId=session.user.id;
    await seed('group-sale-stock');
  },60000);

  it('registra la venta y un ingreso distribuido con la misma operación, sin cobrarlo ni duplicarlo',async()=>{
    const payload=sale('group-sale-first');
    const response=await api('/api/inventory/movements',payload);expect(response.status,await response.clone().text()).toBe(201);saleId=(await response.json() as {movement:{id:number}}).movement.id;
    const entry=await db.prepare("SELECT e.*,m.operation_log_id AS movement_operation FROM financial_entries e JOIN inventory_movements m ON e.source_id=CAST(m.id AS TEXT) WHERE e.source_type='inventory_sale' AND m.id=?").bind(saleId).first<Record<string,unknown>>();
    expect(entry).toMatchObject({direction:'income',category:'Venta grupal',operation_date:'2026-11-01',amount_minor:12050,currency_code:'PEN',counterparty:'Comprador de prueba',reference:'V-001',source_id:String(saleId)});
    expect(entry!.operation_log_id).toBe(entry!.movement_operation);
    expect(await db.prepare('SELECT barn_id,barn_name_snapshot,amount_minor,lot_code,quantity FROM financial_allocations WHERE entry_id=?').bind(entry!.id).first()).toEqual({barn_id:1,barn_name_snapshot:'Galpón A',amount_minor:12050,lot_code:null,quantity:2});
    expect((await db.prepare('SELECT COUNT(*) AS n FROM financial_settlements').first<{n:number}>())!.n).toBe(0);
    expect(await stock()).toBe(8);
    expect((await api('/api/inventory/movements',payload)).status).toBe(200);
    expect((await api('/api/inventory/movements',{...payload,saleAmount:'121.00'})).status).toBe(409);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM financial_entries WHERE source_type='inventory_sale' AND source_id=?").bind(String(saleId)).first<{n:number}>())!.n).toBe(1);
  });

  it('exige importe válido en ventas nuevas sin cambiar stock ni afectar otros movimientos',async()=>{
    const before=await stock();
    for(const amount of [undefined,'0','-1','1.234']){
      const response=await api('/api/inventory/movements',sale(`group-sale-invalid-${String(amount).replace(/[^a-z0-9]/gi,'x')}`,{saleAmount:amount}));expect(response.status,await response.clone().text()).toBe(400);
    }
    expect((await api('/api/inventory/movements',sale('group-sale-invalid-currency',{currencyCode:'SOLES'}))).status).toBe(400);
    expect(await stock()).toBe(before);
  });

  it('incluye la venta grupal una sola vez en el tablero',async()=>{
    const dashboard=await api('/api/reports/dashboard?from=2026-11-01&to=2026-11-01');expect(dashboard.status).toBe(200);
    expect((await dashboard.json() as {sales:unknown[]}).sales).toEqual([{currency:'PEN',month:'2026-11',amountMinor:12050}]);
  });

  it.each(['trade','economics','overview'])('incluye la venta grupal una sola vez en el informe %s',async(source)=>{
      const columns=source==='trade'?['operationDate','direction','animalCode','barn','currency','amount']:source==='economics'?['month','barn','currency','sales','feedCost']:['rowType','month','barn','currency','sales','feedCost'];
      const response=await api('/api/reports/preview',{source,name:'Ventas grupales',purpose:'Conciliar el importe de una venta de grupo sin duplicarlo',from:'2026-11-01',to:'2026-11-01',columns,filters:{}});expect(response.status,await response.clone().text()).toBe(200);
      const report=await response.json() as {rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number}>};
      expect(report.moneyTotals.PEN?.income).toBe(120.5);
      if(source==='trade')expect(report.rows).toEqual([{operationDate:'2026-11-01',direction:'income',animalCode:expect.stringMatching(/^Lote /),barn:'Galpón A',currency:'PEN',amount:120.5}]);
      else expect(report.rows.filter(row=>row.currency==='PEN')).toEqual([expect.objectContaining({barn:'Galpón A',sales:120.5,feedCost:0})]);
  });

  it('revierte stock, ingreso y auditoría si falla la distribución financiera y permite reintentar',async()=>{
    const before=await stock();const payload=sale('group-sale-atomic',{saleAmount:'123.45'});
    await db.prepare("CREATE TRIGGER fail_group_sale BEFORE INSERT ON financial_allocations WHEN NEW.amount_minor=12345 BEGIN SELECT RAISE(ABORT,'fallo financiero de prueba'); END").run();
    try{expect((await api('/api/inventory/movements',payload)).status).toBe(400);}finally{await db.prepare('DROP TRIGGER fail_group_sale').run();}
    expect(await stock()).toBe(before);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM operation_log WHERE operation_key='group-sale-atomic'").first()).toEqual({n:0});
    expect(await db.prepare("SELECT COUNT(*) AS n FROM financial_entries WHERE amount_minor=12345").first()).toEqual({n:0});
    expect((await api('/api/inventory/movements',payload)).status).toBe(201);
  });

  it('serializa ventas concurrentes y un reintento concurrente conserva un solo ingreso',async()=>{
    await seed('group-sale-concurrent-stock',{stageCode:'inicio',sex:'hembra',quantity:5});
    const payload=sale('group-sale-concurrent-a',{stageCode:'inicio',sex:'hembra',quantity:4,saleAmount:'400.00'});
    const responses=await Promise.all([api('/api/inventory/movements',payload),api('/api/inventory/movements',{...payload,operationKey:'group-sale-concurrent-b'})]);
    expect(responses.map(response=>response.status).sort()).toEqual([201,409]);expect(await stock('inicio','hembra')).toBe(1);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM financial_entries WHERE amount_minor=40000").first()).toEqual({n:1});
    const repeated=sale('group-sale-repeat-concurrent',{stageCode:'inicio',sex:'hembra',quantity:1,saleAmount:'100.00'});
    expect((await Promise.all([api('/api/inventory/movements',repeated),api('/api/inventory/movements',repeated)])).map(response=>response.status).sort()).toEqual([200,201]);
    expect(await stock('inicio','hembra')).toBe(0);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM financial_entries WHERE amount_minor=10000").first()).toEqual({n:1});
  });

  it('bloquea corregir solo la cantidad de una venta enlazada con finanzas',async()=>{
    expect((await api(`/api/inventory/corrections/preview?movementId=${saleId}&correctedQuantity=1`)).status).toBe(409);
    expect((await api('/api/inventory/corrections',{movementId:saleId,correctedQuantity:1,reason:'Corrección incompleta de venta',operationKey:'group-sale-correct'})).status).toBe(409);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE reverses_movement_id=?').bind(saleId).first()).toEqual({n:0});
  });

  it('confirma el reintento si la misma venta se confirma entre su consulta de clave y de stock',async()=>{
    await seed('group-sale-late-stock',{stageCode:'levante',sex:'pendiente',quantity:1});
    const payload=sale('group-sale-late-replay',{stageCode:'levante',sex:'pendiente',quantity:1,saleAmount:'70.00'});
    let paused!:()=>void;let release!:()=>void;
    const stockRead=new Promise<void>(resolve=>{paused=resolve;});const resume=new Promise<void>(resolve=>{release=resolve;});
    const pauseStatement=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,key){
      if(key==='bind')return(...values:unknown[])=>pauseStatement(target.bind(...values));
      if(key==='all')return async()=>{paused();await resume;return target.all();};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    const delayedDb=new Proxy(db,{get(target,key){
      if(key==='prepare')return(sql:string)=>{const statement=target.prepare(sql);return sql.includes('ORDER BY effective_date ASC, COALESCE(reverses_movement_id,id), id ASC')?pauseStatement(statement):statement;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    const retry=registerMovement(delayedDb,actorId,payload);
    await stockRead;
    try{expect((await registerMovement(db,actorId,payload)).replayed).toBe(false);}finally{release();}
    expect((await retry).replayed).toBe(true);
    expect(await stock('levante','pendiente')).toBe(0);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM financial_entries WHERE amount_minor=7000').first()).toEqual({n:1});
  });

  it('conserva el reintento histórico de una venta sin importe sin crear un ingreso retroactivo',async()=>{
    const payload={movementType:'sale',effectiveDate:'2026-11-02',barnId:1,locationCode:null,lotCode:null,stageCode:'engorde',sex:'macho',quantity:1,causeCode:null,notes:null};
    const claim=await createOperationClaim({operationKey:'group-sale-legacy',operationType:'inventory.sale',authorUserId:actorId,entityType:'inventory_movement',entityId:999,barnId:1,effectiveDate:payload.effectiveDate,payload,result:{id:999,movementType:'sale',quantity:1}});
    await commitOperation(db,claim,[db.prepare("INSERT INTO inventory_movements(id,operation_log_id,movement_type,effective_date,barn_id,stage_code,sex,quantity,created_by_user_id,created_at) VALUES(999,?,'sale',?,1,'engorde','macho',1,?,?)").bind(claim.id,payload.effectiveDate,actorId,claim.recordedAt)],[]);
    const response=await api('/api/inventory/movements',{...group,movementType:'sale',effectiveDate:payload.effectiveDate,quantity:1,operationKey:'group-sale-legacy'});expect(response.status,await response.clone().text()).toBe(200);expect(await response.json()).toMatchObject({replayed:true,movement:{id:999}});
    expect(await db.prepare('SELECT COUNT(*) AS n FROM financial_entries WHERE operation_log_id=?').bind(claim.id).first()).toEqual({n:0});
  });

  it('anula una venta no cobrada desde inventario y permite volver a registrar el importe correcto',async()=>{
    await seed('group-sale-cancel-stock',{quantity:20});
    const before=await stock();
    const preview=await api(`/api/inventory/corrections/preview?movementId=${saleId}&correctedQuantity=0`);expect(preview.status,await preview.clone().text()).toBe(200);expect(await preview.json()).toMatchObject({preview:{allowed:true,originalQuantity:2,correctedQuantity:0}});
    const payload={movementId:saleId,correctedQuantity:0,reason:'Se anuló la venta con importe equivocado',operationKey:'group-sale-cancel-first'};
    const cancelled=await api('/api/inventory/corrections',payload);expect(cancelled.status,await cancelled.clone().text()).toBe(201);expect(await stock()).toBe(before+2);
    expect((await api('/api/inventory/corrections',payload)).status).toBe(200);expect(await stock()).toBe(before+2);
    expect((await api('/api/inventory/corrections',{...payload,operationKey:'group-sale-cancel-again'})).status).toBe(409);
    const original=await db.prepare("SELECT id,reversed_at FROM financial_entries WHERE source_type='inventory_sale' AND source_id=?").bind(String(saleId)).first<{id:number;reversed_at:string|null}>();expect(original?.reversed_at).toEqual(expect.any(String));
    const reversal=await db.prepare("SELECT * FROM financial_entries WHERE reversal_of_id=?").bind(original!.id).first<Record<string,unknown>>();expect(reversal).toMatchObject({direction:'expense',source_type:'inventory_sale_cancellation',amount_minor:12050,currency_code:'PEN',reversal_of_id:original!.id});
    const allocation=await db.prepare('SELECT id,amount_minor,barn_id,quantity FROM financial_allocations WHERE entry_id=?').bind(reversal!.id).first<{id:number;amount_minor:number;barn_id:number;quantity:number}>();expect(allocation).toMatchObject({amount_minor:12050,barn_id:1,quantity:2});
    expect(await db.prepare('SELECT operation_log_id,quantity FROM inventory_movements WHERE reverses_movement_id=?').bind(saleId).first()).toEqual({operation_log_id:reversal!.operation_log_id,quantity:2});
    expect((await db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE operation_log_id=?').bind(reversal!.operation_log_id).first<{n:number}>())!.n).toBeGreaterThanOrEqual(2);
    const ledger=await api('/api/finance/entries?currencyCode=PEN');const entries=(await ledger.json() as {entries:{id:number;outstandingMinor:number}[]}).entries;expect(entries.find(row=>row.id===original!.id)?.outstandingMinor).toBe(0);expect(entries.find(row=>row.id===reversal!.id)?.outstandingMinor).toBe(0);
    expect((await api('/api/inventory/movements',sale('group-sale-corrected',{quantity:1,saleAmount:'85.00'}))).status).toBe(201);expect(await stock()).toBe(before+1);
    const dashboard=await api('/api/reports/dashboard?from=2026-11-01&to=2026-11-01');expect((await dashboard.json() as {sales:unknown[]}).sales).toEqual([{currency:'PEN',month:'2026-11',amountMinor:77845}]);
    for(const source of ['trade','economics','overview']){const report=await api('/api/reports/preview',{source,name:'Ventas corregidas',purpose:'Excluir la venta anulada y conservar la venta correcta',from:'2026-11-01',to:'2026-11-01',columns:source==='trade'?['currency','amount']:['currency','sales'],filters:{}});expect(report.status,await report.clone().text()).toBe(200);expect((await report.json() as {moneyTotals:{PEN:{income:number}}}).moneyTotals.PEN.income).toBe(778.45);}
    expect((await (await api('/api/finance/cashflow')).json() as {entries:unknown[]}).entries).toEqual([]);
  });

  it('impide pagar el contraasiento de una anulación sin cobros',async()=>{
    const reversal=await db.prepare("SELECT e.id,a.id AS allocation_id FROM financial_entries e JOIN financial_allocations a ON a.entry_id=e.id WHERE e.source_type='inventory_sale_cancellation'").first<{id:number;allocation_id:number}>();expect(reversal).not.toBeNull();
    const payment=await api(`/api/finance/entries/${reversal!.id}/settlements`,{settlementDate:'2026-11-01',amount:'1.00',paymentMethod:'efectivo',reason:'No debe pagarse un contraasiento sin cobro',operationKey:'group-sale-cancel-no-pay',allocations:[{allocationId:reversal!.allocation_id,amount:'1.00'}]});expect(payment.status,await payment.clone().text()).toBe(409);
  });

  it('impide anular una venta con cobro parcial sin alterar su stock ni el asiento',async()=>{
    const created=await api('/api/inventory/movements',sale('group-sale-paid',{quantity:1,saleAmount:'33.33'}));expect(created.status).toBe(201);const movementId=(await created.json() as {movement:{id:number}}).movement.id;
    const entry=await db.prepare("SELECT e.id,a.id AS allocation_id FROM financial_entries e JOIN financial_allocations a ON a.entry_id=e.id WHERE e.source_type='inventory_sale' AND e.source_id=?").bind(String(movementId)).first<{id:number;allocation_id:number}>();
    expect((await api(`/api/finance/entries/${entry!.id}/settlements`,{settlementDate:'2026-11-01',amount:'1.00',paymentMethod:'efectivo',reason:'Cobro parcial de venta de prueba',operationKey:'group-sale-paid-settle',allocations:[{allocationId:entry!.allocation_id,amount:'1.00'}]})).status).toBe(201);
    const before=await stock();expect((await api(`/api/inventory/corrections/preview?movementId=${movementId}&correctedQuantity=0`)).status).toBe(409);
    const cancelled=await api('/api/inventory/corrections',{movementId,correctedQuantity:0,reason:'Venta cobrada requiere conciliación',operationKey:'group-sale-paid-cancel'});expect(cancelled.status,await cancelled.clone().text()).toBe(409);expect(await stock()).toBe(before);
    expect(await db.prepare('SELECT reversed_at FROM financial_entries WHERE id=?').bind(entry!.id).first()).toEqual({reversed_at:null});expect(await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE reverses_movement_id=?').bind(movementId).first()).toEqual({n:0});
  });

  it.each(['cancel-first','collect-first'])('serializa cobro y anulación con lectura previa en la carrera %s',async(order)=>{
    const created=await api('/api/inventory/movements',sale(`group-sale-race-${order}`,{quantity:1,saleAmount:'22.00'}));expect(created.status,await created.clone().text()).toBe(201);const movementId=(await created.json() as {movement:{id:number}}).movement.id;
    const entry=await db.prepare("SELECT e.id,a.id AS allocation_id FROM financial_entries e JOIN financial_allocations a ON a.entry_id=e.id WHERE e.source_type='inventory_sale' AND e.source_id=?").bind(String(movementId)).first<{id:number;allocation_id:number}>();
    const payment={settlementDate:'2026-11-01',amount:'1.00',paymentMethod:'efectivo',reason:'Cobro en carrera con anulación',operationKey:`group-race-pay-${order}`,allocations:[{allocationId:entry!.allocation_id,amount:'1.00'}]};
    const cancellation={movementId,correctedQuantity:0,reason:'Anulación en carrera con cobro',operationKey:`group-race-cancel-${order}`};
    let paused!:()=>void;let release!:()=>void;const ready=new Promise<void>(resolve=>{paused=resolve;});const resume=new Promise<void>(resolve=>{release=resolve;});
    const delayedDb=new Proxy(db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{paused();await resume;return target.batch(statements);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    const before=await stock();
    const pending=(order==='cancel-first'?createFinancialSettlement(delayedDb,actorId,entry!.id,payment):correctInventoryMovement(delayedDb,actorId,cancellation)).then(value=>({value}),error=>({error}));
    await ready;
    try{if(order==='cancel-first')expect((await correctInventoryMovement(db,actorId,cancellation)).replayed).toBe(false);else expect((await createFinancialSettlement(db,actorId,entry!.id,payment)).replayed).toBe(false);}finally{release();}
    expect(await pending).toMatchObject({error:{status:409}});
    expect(await stock()).toBe(order==='cancel-first'?before+1:before);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM financial_settlements WHERE financial_entry_id=?').bind(entry!.id).first<{n:number}>())!.n).toBe(order==='cancel-first'?0:1);
  });

  it('anula una sola vez en solicitudes concurrentes y revierte el batch si falla el contraasiento',async()=>{
    const created=await api('/api/inventory/movements',sale('group-sale-cancel-concurrent',{quantity:1,saleAmount:'66.00'}));expect(created.status).toBe(201);const movementId=(await created.json() as {movement:{id:number}}).movement.id;
    const payload={movementId,correctedQuantity:0,reason:'Anulación concurrente de venta de prueba',operationKey:'group-sale-cancel-concurrent-a'};const before=await stock();
    await db.prepare("CREATE TRIGGER fail_group_sale_cancel BEFORE INSERT ON financial_allocations WHEN NEW.amount_minor=6600 BEGIN SELECT RAISE(ABORT,'fallo de contraasiento'); END").run();
    try{expect((await api('/api/inventory/corrections',payload)).status).toBe(400);}finally{await db.prepare('DROP TRIGGER fail_group_sale_cancel').run();}
    expect(await stock()).toBe(before);expect(await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE reverses_movement_id=?').bind(movementId).first()).toEqual({n:0});
    expect(await db.prepare("SELECT reversed_at FROM financial_entries WHERE source_type='inventory_sale' AND source_id=?").bind(String(movementId)).first()).toEqual({reversed_at:null});
    const outcomes=await Promise.all([api('/api/inventory/corrections',payload),api('/api/inventory/corrections',{...payload,operationKey:'group-sale-cancel-concurrent-b'})]);expect(outcomes.map(response=>response.status).sort()).toEqual([201,409]);expect(await stock()).toBe(before+1);
    const replayKey=(await outcomes[0].clone().json() as {replayed?:boolean;error?:string}).error?'group-sale-cancel-concurrent-b':payload.operationKey;
    expect((await api('/api/inventory/corrections',{...payload,operationKey:replayKey})).status).toBe(200);expect(await stock()).toBe(before+1);
  });
});

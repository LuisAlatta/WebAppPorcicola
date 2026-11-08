import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{ config: {
  name: 'finance-filters-test', compatibilityDate: '2026-07-01',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
  env: { DB: { type: 'd1', id: 'finance-filters-database' } },
} }] });
afterAll(async () => runtime.dispose());
async function migrate(db:D1Database) {
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    const sql=(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\s+/g,' ');let trigger='';
    for(const part of sql.split(';').map(part=>part.trim()).filter(Boolean)){
      if(trigger||/^CREATE TRIGGER/i.test(part)){trigger+=`${part}; `;if(/\bEND$/i.test(part)){await db.prepare(trigger.trim()).run();trigger='';}}
      else await db.prepare(part).run();
    }
    if(trigger)throw new Error(`Trigger incompleto en ${file}`);
  }
}
type CashData={entries:{settlementDate:string;direction:string;category:string;barnName:string;currencyCode:string;amountMinor:number}[];totals:{direction:string;currencyCode:string;amountMinor:number}[];cashBalances:{currencyCode:string;openingMinor:number;closingMinor:number;openingBalanceIsCalculated:boolean}[]};
type ExportData={rows:Record<string,unknown>[];moneyTotals:Record<string,{income:number;expense:number;balance:number}>;rowCount:number};
type LedgerData={entries:{operationDate:string;direction:string;category:string;barnName:string;currencyCode:string;amountMinor:number}[];totals:{direction:string;currencyCode:string;amountMinor:number}[]};

describe('FIN05 · filtros, caja histórica y consultas completas',()=>{
  let db:D1Database;let token='';
  const api=(path:string,payload?:Record<string,unknown>)=>worker.fetch(new Request(`http://localhost${path}`,{method:payload?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),{DB:db});
  const post=async(path:string,payload:Record<string,unknown>)=>{const response=await api(path,payload);expect(response.status,await response.clone().text()).toBe(201);return response;};
  const settle=async(entryId:number,amount:string,date:string,key:string)=>{
    const allocation=await db.prepare('SELECT id FROM financial_allocations WHERE entry_id=?').bind(entryId).first<{id:number}>();
    await post(`/api/finance/entries/${entryId}/settlements`,{settlementDate:date,amount,paymentMethod:'efectivo',reason:'Cobro o devolución ficticia FIN05',operationKey:key,allocations:[{allocationId:allocation!.id,amount}]});
  };
  const compare=async(filters:Record<string,string>={})=>{
    const query=new URLSearchParams({from:'2026-03-01',to:'2026-03-31',currencyCode:'PEN',...filters});
    const list=await api(`/api/finance/cashflow?${query}`);expect(list.status,await list.clone().text()).toBe(200);const cash=await list.json() as CashData;
    const exported=await api('/api/reports/export',{definition:{source:'cashflow',name:'Caja FIN05',purpose:'Comparar consulta y exportación de caja',from:query.get('from'),to:query.get('to'),columns:['settlementDate','direction','category','barn','currency','amount'],filters:{currency:'PEN',...(filters.direction?{direction:filters.direction}:{}),...(filters.category?{category:filters.category}:{})}}});expect(exported.status,await exported.clone().text()).toBe(200);const report=await exported.json() as ExportData;
    const sort=(items:Record<string,unknown>[])=>items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const projected=cash.entries.map(row=>({settlementDate:row.settlementDate,direction:row.direction,category:row.category,barn:row.barnName,currency:row.currencyCode,amount:row.amountMinor/100}));
    expect(sort(report.rows)).toEqual(sort(projected));return {cash,report};
  };
  const compareLedger=async(filters:Record<string,string>={})=>{
    const query=new URLSearchParams({from:'2026-03-01',to:'2026-03-31',currencyCode:'PEN',...filters});
    const list=await api(`/api/finance/entries?${query}`);expect(list.status,await list.clone().text()).toBe(200);const ledger=await list.json() as LedgerData;
    const exported=await api('/api/reports/export',{definition:{source:'finance',name:'Libro FIN05',purpose:'Conciliar libro histórico por fecha de operación',from:query.get('from'),to:query.get('to'),columns:['operationDate','direction','category','barn','currency','amount'],groupBy:'barn,month',filters:{...(query.get('currencyCode')?{currency:query.get('currencyCode')}:{}),...(filters.direction?{direction:filters.direction}:{}),...(filters.category?{category:filters.category}:{})}}});expect(exported.status,await exported.clone().text()).toBe(200);const report=await exported.json() as ExportData&{groups:Record<string,unknown>};
    const sort=(items:Record<string,unknown>[])=>items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const projected=ledger.entries.map(row=>({operationDate:row.operationDate,direction:row.direction,category:row.category,barn:row.barnName,currency:row.currencyCode,amount:row.amountMinor/100}));expect(sort(report.rows)).toEqual(sort(projected));return {ledger,report};
  };
  beforeAll(async()=>{
    db=await runtime.getD1Database('DB');await migrate(db);
    const bootstrap=await post('/api/auth/bootstrap',{username:'admin-fin05@granja.test',password:'EnsayoFinanzas2026!',name:'Administrador FIN05'});token=(await bootstrap.json() as {token:string}).token;
  });
  it('mantiene cobros originales y devoluciones pagadas tras anular y aplica los mismos filtros al exportar',async()=>{
    await post('/api/finance/cash/opening',{effectiveDate:'2026-02-28',currencyCode:'PEN',amount:'1500.00',reason:'Apertura ficticia FIN05',operationKey:'ff-opening-pen'});
    await post('/api/finance/cash/opening',{effectiveDate:'2026-02-28',currencyCode:'USD',amount:'20.00',reason:'Apertura ficticia USD',operationKey:'ff-opening-usd'});
    const createEntry=async(direction:string,category:string,amount:string,key:string)=>Number((await(await post('/api/finance/entries',{direction,category,concept:`Prueba ${key}`,operationDate:'2026-03-01',amount,currencyCode:'PEN',reason:'Entrada ficticia FIN05',operationKey:key,allocations:[{barnId:1,amount}]})).json() as {entry:{id:number}}).entry.id);
    const income=await createEntry('income','Venta manual','180.00','ff-income');await settle(income,'180.00','2026-03-01','ff-collect');
    const food=await createEntry('expense','Alimento','30.00','ff-food-entry');await settle(food,'30.00','2026-03-02','ff-pay-food');
    const reversed=await post(`/api/finance/entries/${income}/reverse`,{effectiveDate:'2026-03-03',reason:'Anulación manual ficticia',operationKey:'ff-reverse'});const refund=(await reversed.json() as {reversal:{id:number}}).reversal.id;await settle(refund,'180.00','2026-03-03','ff-refund');
    await post('/api/animals',{code:'FF-ANIMAL',animalType:'lechon',sex:'hembra',birthDate:'2026-03-01',entryDate:'2026-03-01',entryStageCode:'preinicio',barnId:1,locationCode:'galpon_a',originType:'nacimiento',reason:'Animal ficticio FIN05',operationKey:'ff-animal'});
    await post('/api/animals/FF-ANIMAL/exit',{exitType:'sale',causeCode:'edad',effectiveDate:'2026-03-04',saleAmount:'50.00',currencyCode:'PEN',reason:'Venta ficticia FIN05',operationKey:'ff-animal-sale'});
    const sale=(await db.prepare("SELECT id FROM financial_entries WHERE source_type='animal_sale'").first<{id:number}>())!.id;await settle(sale,'50.00','2026-03-04','ff-animal-collect');
    await post('/api/animals/FF-ANIMAL/sale-return',{effectiveDate:'2026-03-05',reason:'Devolución física ficticia',operationKey:'ff-animal-return'});
    const returnEntry=(await db.prepare('SELECT id FROM financial_entries WHERE reversal_of_id=?').bind(sale).first<{id:number}>())!.id;await settle(returnEntry,'50.00','2026-03-05','ff-animal-refund');
    await post('/api/finance/entries',{direction:'income',category:'Venta USD',concept:'Moneda independiente FIN05',operationDate:'2026-03-02',amount:'25.00',currencyCode:'USD',reason:'No sumar distintas monedas',operationKey:'ff-usd-ledger',allocations:[{barnId:1,amount:'25.00'}]});
    const all=await compare();expect(all.cash.entries).toHaveLength(5);expect(all.report.moneyTotals.PEN).toEqual({income:230,expense:260,balance:-30});expect(all.cash.cashBalances).toHaveLength(1);expect(all.cash.cashBalances[0]).toMatchObject({currencyCode:'PEN',openingMinor:150000,closingMinor:147000,openingBalanceIsCalculated:false});
    const beforeReversal=await compare({from:'2026-03-01',to:'2026-03-02'});expect(beforeReversal.cash.entries).toHaveLength(2);expect(beforeReversal.report.moneyTotals.PEN).toEqual({income:180,expense:30,balance:150});expect(beforeReversal.cash.cashBalances[0]).toMatchObject({openingMinor:150000,closingMinor:165000});
    const afterReversal=await compare({from:'2026-03-03',to:'2026-03-05'});expect(afterReversal.cash.entries).toHaveLength(3);expect(afterReversal.report.moneyTotals.PEN).toEqual({income:50,expense:230,balance:-180});expect(afterReversal.cash.cashBalances[0]).toMatchObject({openingMinor:165000,closingMinor:147000});
    const expense=await compare({direction:'expense'});expect(expense.cash.entries).toHaveLength(3);expect(expense.report.moneyTotals.PEN).toEqual({income:0,expense:260,balance:-260});expect(expense.cash.cashBalances[0]).toMatchObject({openingMinor:0,closingMinor:-26000,openingBalanceIsCalculated:true});
    const category=await compare({category:'Alimento'});expect(category.cash.entries).toHaveLength(1);expect(category.report.moneyTotals.PEN).toEqual({income:0,expense:30,balance:-30});
    const both=await compare({direction:'income',category:'Alimento'});expect(both.cash.entries).toHaveLength(0);expect(both.report.rows).toHaveLength(0);
    const ledgerAll=await compareLedger();expect(ledgerAll.ledger.entries).toHaveLength(5);expect(ledgerAll.report.moneyTotals.PEN).toEqual({income:230,expense:260,balance:-30});
    const ledgerBefore=await compareLedger({to:'2026-03-02'});expect(ledgerBefore.ledger.entries).toHaveLength(2);expect(ledgerBefore.report.moneyTotals.PEN).toEqual({income:180,expense:30,balance:150});
    const ledgerAfter=await compareLedger({from:'2026-03-03',to:'2026-03-05'});expect(ledgerAfter.ledger.entries).toHaveLength(3);expect(ledgerAfter.report.moneyTotals.PEN).toEqual({income:50,expense:230,balance:-180});
    const ledgerUsd=await compareLedger({currencyCode:''});expect(ledgerUsd.report.moneyTotals).toEqual({PEN:{income:230,expense:260,balance:-30},USD:{income:25,expense:0,balance:25}});expect(Object.keys(ledgerUsd.report.groups).some(key=>key.startsWith('PEN · '))).toBe(true);expect(Object.keys(ledgerUsd.report.groups).some(key=>key.startsWith('USD · '))).toBe(true);
    expect((await compareLedger({direction:'expense',category:'Alimento'})).ledger.entries).toHaveLength(1);
    expect((await api('/api/finance/cashflow?direction=incorrecta')).status).toBe(400);
  },60000);
  it('rechaza más de2000 filas en listas y conserva exportación completa bajo su límite propio',async()=>{
    const actor=(await db.prepare("SELECT id FROM users WHERE role='administrador'").first<{id:number}>())!.id;
    const sequence='WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<2001)';
    for(const kind of ['entry','cash'])await db.prepare(`${sequence} INSERT INTO operation_log(id,operation_key,operation_type,author_user_id,entity_type,entity_id,barn_id,content_hash,payload,result_payload,effective_date,recorded_at) SELECT 'ff-limit-${kind}-'||n,'ff-limit-${kind}-'||n,'finance.${kind}.create',?,'financial_${kind}',10000+n,1,'fixture','{}','{}','2026-03-10','2026-03-10T00:00:00Z' FROM seq`).bind(actor).run();
    await db.prepare(`${sequence} INSERT INTO financial_entries(id,operation_log_id,direction,category,concept,operation_date,amount_minor,currency_code,created_by_user_id,created_at) SELECT 10000+n,'ff-limit-entry-'||n,'income','LIMIT','Fixture de capacidad','2026-03-10',100,'PEN',?,'2026-03-10T00:00:00Z' FROM seq`).bind(actor).run();
    await db.prepare(`${sequence} INSERT INTO financial_allocations(id,entry_id,barn_id,barn_name_snapshot,amount_minor,created_at) SELECT 10000+n,10000+n,1,'Galpón A',100,'2026-03-10T00:00:00Z' FROM seq`).run();
    await db.prepare(`${sequence} INSERT INTO financial_settlements(id,operation_log_id,financial_entry_id,settlement_date,amount_minor,payment_method,created_by_user_id,created_at) SELECT 10000+n,'ff-limit-cash-'||n,10000+n,'2026-03-10',100,'efectivo',?,'2026-03-10T00:00:00Z' FROM seq`).bind(actor).run();
    await db.prepare(`${sequence} INSERT INTO financial_settlement_allocations(settlement_id,financial_allocation_id,amount_minor) SELECT 10000+n,10000+n,100 FROM seq`).run();
    for(const path of ['/api/finance/entries?category=LIMIT','/api/finance/cashflow?category=LIMIT']){const response=await api(path);expect(response.status,await response.clone().text()).toBe(413);expect(await response.json()).toMatchObject({error:expect.stringContaining('no se muestran totales parciales')});}
    const response=await api('/api/reports/export',{definition:{source:'cashflow',name:'Capacidad caja',purpose:'Comprobar no truncamiento',from:'2026-03-01',to:'2026-03-31',columns:['settlementDate','direction','category','currency','amount'],filters:{category:'LIMIT'}}});expect(response.status,await response.clone().text()).toBe(200);const report=await response.json() as ExportData;expect(report.rowCount).toBe(2001);expect(report.moneyTotals.PEN.income).toBe(2001);
  },60000);
});

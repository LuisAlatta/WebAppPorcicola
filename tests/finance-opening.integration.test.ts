import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';
import { listFinancialCashflow } from '../worker/finance';

const runtime = new Miniflare({ workers: [{ config: {
  name: 'finance-opening-test', compatibilityDate: '2026-07-01',
  manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
  env: { DB: { type: 'd1', id: 'finance-opening-database' } },
} }] });

afterAll(async () => runtime.dispose());

type CashBalance = { currencyCode:string; openingMinor:number; receiptsMinor:number; paymentsMinor:number; closingMinor:number; openingBalanceIsCalculated:boolean };
type CashData = { entries:{ settlementDate:string }[]; cashBalances:CashBalance[] };

describe('FIN06 · saldo inicial al comienzo del día', () => {
  let db:D1Database;
  let token = '';
  const api = (path:string, payload?:Record<string,unknown>) => worker.fetch(new Request(`http://localhost${path}`, {
    method:payload ? 'POST' : 'GET',
    headers:{ ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(payload ? { 'Content-Type':'application/json' } : {}) },
    ...(payload ? { body:JSON.stringify(payload) } : {}),
  }), { DB:db });
  const post = async (path:string, payload:Record<string,unknown>) => {
    const response = await api(path, payload);
    expect(response.status, await response.clone().text()).toBe(201);
    return response;
  };
  const cashflow = async (query:string) => {
    const response = await api(`/api/finance/cashflow?${query}`);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json() as Promise<CashData>;
  };
  const balance = (data:CashData, currencyCode = 'PEN') => data.cashBalances.find(item => item.currencyCode === currencyCode);

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
      let trigger = '';
      for (const part of sql.split(';').map(part => part.trim()).filter(Boolean)) {
        if (trigger || /^CREATE TRIGGER/i.test(part)) {
          trigger += `${part}; `;
          if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
        } else await db.prepare(part).run();
      }
      if (trigger) throw new Error(`Trigger incompleto en ${file}`);
    }
    const bootstrap = await post('/api/auth/bootstrap', { username:'admin-fin06@granja.test', password:'EnsayoFinanzas2026!', name:'Administrador FIN06' });
    token = (await bootstrap.json() as { token:string }).token;
    for (const [effectiveDate, currencyCode, amount, operationKey] of [
      ['2026-11-01', 'PEN', '100.00', 'fo-opening-pen'],
      ['2026-11-01', 'USD', '20.00', 'fo-opening-usd'],
      ['2026-11-01', 'EUR', '30.00', 'fo-opening-eur'],
      ['2026-11-03', 'PEN', '200.00', 'fo-opening-new'],
    ]) await post('/api/finance/cash/opening', { effectiveDate, currencyCode, amount, operationKey, reason:'Apertura ficticia FIN06' });
    for (const [direction, date, currencyCode, amount, key] of [
      ['income', '2026-10-31', 'PEN', '25.00', 'fo-before'],
      ['income', '2026-11-01', 'PEN', '50.00', 'fo-day'],
      ['income', '2026-11-01', 'USD', '5.00', 'fo-usd'],
      ['expense', '2026-11-02', 'PEN', '10.00', 'fo-pay'],
      ['income', '2026-11-03', 'PEN', '30.00', 'fo-new-day'],
      ['expense', '2026-11-04', 'PEN', '20.00', 'fo-new-pay'],
    ]) {
      const entry = await post('/api/finance/entries', { direction, category:direction === 'income' ? 'Venta' : 'Alimento', concept:`Movimiento ${key}`, operationDate:date, amount, currencyCode, operationKey:`${key}-entry`, reason:'Movimiento ficticio FIN06', allocations:[{ barnId:1, amount }] });
      const entryId = (await entry.json() as { entry:{ id:number } }).entry.id;
      const allocation = await db.prepare('SELECT id FROM financial_allocations WHERE entry_id=?').bind(entryId).first<{ id:number }>();
      await post(`/api/finance/entries/${entryId}/settlements`, { settlementDate:date, amount, paymentMethod:'efectivo', operationKey:`${key}-settlement`, reason:'Cobro o pago ficticio FIN06', allocations:[{ allocationId:allocation!.id, amount }] });
    }
  }, 60000);

  it('incluye los cobros del día de apertura en el saldo de un periodo posterior', async () => {
    expect(balance(await cashflow('from=2026-11-02&to=2026-11-02&currencyCode=PEN'))).toEqual({ currencyCode:'PEN', openingMinor:15000, receiptsMinor:0, paymentsMinor:1000, closingMinor:14000, openingBalanceIsCalculated:false });
  });

  it('usa la apertura aplicable sin fecha inicial y no vuelve a sumar los movimientos anteriores', async () => {
    const data = await cashflow('to=2026-11-02&currencyCode=PEN');
    expect(data.entries).toHaveLength(3);
    expect(balance(data)).toEqual({ currencyCode:'PEN', openingMinor:10000, receiptsMinor:5000, paymentsMinor:1000, closingMinor:14000, openingBalanceIsCalculated:false });
  });

  it('usa la última apertura de cada moneda y conserva el movimiento del mismo día', async () => {
    const data = await cashflow('to=2026-11-04');
    expect(balance(data)).toEqual({ currencyCode:'PEN', openingMinor:20000, receiptsMinor:3000, paymentsMinor:2000, closingMinor:21000, openingBalanceIsCalculated:false });
    expect(balance(data, 'USD')).toEqual({ currencyCode:'USD', openingMinor:2000, receiptsMinor:500, paymentsMinor:0, closingMinor:2500, openingBalanceIsCalculated:false });
    expect(balance(data, 'EUR')).toEqual({ currencyCode:'EUR', openingMinor:3000, receiptsMinor:0, paymentsMinor:0, closingMinor:3000, openingBalanceIsCalculated:false });
    expect(balance(await cashflow('from=2026-11-04&to=2026-11-04&currencyCode=PEN'))).toMatchObject({ openingMinor:23000, closingMinor:21000 });
    expect(balance(await cashflow('currencyCode=PEN'))).toMatchObject({ openingMinor:20000, receiptsMinor:3000, paymentsMinor:2000, closingMinor:21000 });
  });

  it('no aplica una apertura posterior al corte ni duplica el movimiento al consultar su mismo día', async () => {
    expect(balance(await cashflow('to=2026-10-31&currencyCode=PEN'))).toEqual({ currencyCode:'PEN', openingMinor:0, receiptsMinor:2500, paymentsMinor:0, closingMinor:2500, openingBalanceIsCalculated:true });
    expect(balance(await cashflow('from=2026-11-01&to=2026-11-01&currencyCode=PEN'))).toEqual({ currencyCode:'PEN', openingMinor:10000, receiptsMinor:5000, paymentsMinor:0, closingMinor:15000, openingBalanceIsCalculated:false });
  });

  it('reserva la apertura global para la vista de granja sin filtros de galpón, dirección o categoría', async () => {
    for (const filters of ['barnId=1', 'direction=income', 'category=Venta']) {
      const data = await cashflow(`to=2026-11-02&currencyCode=PEN&${filters}`);
      expect(balance(data)).toMatchObject({ openingMinor:0, receiptsMinor:7500, closingMinor:filters === 'barnId=1' ? 6500 : 7500, openingBalanceIsCalculated:true });
    }
    const scoped = await listFinancialCashflow(db, { to:'2026-11-02', currencyCode:'PEN' }, { allowedBarnNames:['Galpón A'] });
    expect(scoped.cashBalances).toEqual([{ currencyCode:'PEN', openingMinor:0, receiptsMinor:7500, paymentsMinor:1000, closingMinor:6500, openingBalanceIsCalculated:true }]);
  });
});

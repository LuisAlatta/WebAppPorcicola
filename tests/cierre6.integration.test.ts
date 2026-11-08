import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{ config: { name: 'cierre6-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { DB: { type: 'd1', id: 'cierre6-database' } } } }] });
afterAll(async () => runtime.dispose());

async function migrate(db: D1Database) {
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(part => part.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) {
        trigger += `${part}; `;
        if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
      } else await db.prepare(part).run();
    }
    if (trigger) throw new Error(`Trigger incompleto: ${file}`);
  }
}

describe('Cierre 6 · conciliación de venta, pagos y devolución', () => {
  it('reconstruye inventario, libro y caja en dos meses sin duplicar la venta ni sus correcciones', async () => {
    const db = await runtime.getD1Database('DB'); await migrate(db);
    let token = '';
    const api = (path: string, body?: Record<string, unknown>) => worker.fetch(new Request(`http://localhost${path}`, {
      method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), { DB: db });
    const post = async (path: string, body: Record<string, unknown>, expected = 201) => {
      const response = await api(path, body); expect(response.status, await response.clone().text()).toBe(expected); return response;
    };
    const bootstrap = await post('/api/auth/bootstrap', { username: 'admin-cierre6@granja.test', password: 'EnsayoCierre62026!', name: 'Administrador Cierre 6' });
    token = (await bootstrap.json() as { token: string }).token;
    await post('/api/finance/cash/opening', { effectiveDate: '2025-12-31', currencyCode: 'PEN', amount: '1500.00', reason: 'Apertura ficticia', operationKey: 'c6-opening' });
    await post('/api/animals', { code: 'C6-001', animalType: 'lechon', sex: 'macho', birthDate: '2025-12-01', entryDate: '2026-01-01', entryStageCode: 'preinicio', barnId: 1, locationCode: 'galpon_a', originType: 'nacimiento', reason: 'Animal ficticio', operationKey: 'c6-animal' });
    const saleBody = { exitType: 'sale', causeCode: 'edad', effectiveDate: '2026-01-10', saleAmount: '180.00', currencyCode: 'PEN', reason: 'Venta ficticia a crédito', operationKey: 'c6-sale-operation' };
    await post('/api/animals/C6-001/exit', saleBody); await post('/api/animals/C6-001/exit', saleBody, 200);
    const sale = await db.prepare("SELECT id FROM financial_entries WHERE source_type='animal_sale'").first<{ id:number }>(); expect(sale).toBeTruthy();
    const settle = async (id:number, date:string, amount:string, key:string) => {
      const allocation = await db.prepare('SELECT id FROM financial_allocations WHERE entry_id=?').bind(id).first<{ id:number }>(); expect(allocation).toBeTruthy();
      const body = { settlementDate: date, amount, paymentMethod: 'efectivo', reason: 'Abono ficticio de conciliación', operationKey: key, allocations: [{ allocationId: allocation!.id, amount }] };
      await post(`/api/finance/entries/${id}/settlements`, body); return body;
    };
    const firstPayment = await settle(sale!.id, '2026-01-15', '40.00', 'c6-payment-jan');
    await post(`/api/finance/entries/${sale!.id}/settlements`, firstPayment, 200);
    await settle(sale!.id, '2026-02-03', '140.00', 'c6-payment-feb');
    const erroneous = await post('/api/finance/entries', { direction: 'expense', category: 'Servicio', concept: 'Gasto ficticio a corregir', operationDate: '2026-02-04', amount: '30.00', currencyCode: 'PEN', reason: 'Registro equivocado ficticio', operationKey: 'c6-expense', allocations: [{ barnId: 1, amount: '30.00' }] });
    const expenseId = (await erroneous.json() as { entry: { id:number } }).entry.id;
    await settle(expenseId, '2026-02-04', '30.00', 'c6-expense-payment');
    const correctionBody = { effectiveDate: '2026-02-08', reason: 'Corregir gasto ficticio', operationKey: 'c6-correction' };
    const correction = await post(`/api/finance/entries/${expenseId}/reverse`, correctionBody);
    const correctionId = (await correction.json() as { reversal: { id:number } }).reversal.id;
    await post(`/api/finance/entries/${expenseId}/reverse`, correctionBody, 200);
    await settle(correctionId, '2026-02-08', '30.00', 'c6-correction-refund');
    const returnBody = { effectiveDate: '2026-02-10', reason: 'Devolución ficticia del cliente', operationKey: 'c6-sale-return' };
    await post('/api/animals/C6-001/sale-return', returnBody); await post('/api/animals/C6-001/sale-return', returnBody, 200);
    const reversal = await db.prepare('SELECT id FROM financial_entries WHERE reversal_of_id=?').bind(sale!.id).first<{ id:number }>(); expect(reversal).toBeTruthy();
    await settle(reversal!.id, '2026-02-10', '180.00', 'c6-sale-refund');

    const inventory = async (date:string) => (await (await api(`/api/inventory?asOf=${date}`)).json() as { summary:{ total:{ available:number } } }).summary.total.available;
    expect(await inventory('2026-01-31')).toBe(0); expect(await inventory('2026-02-28')).toBe(1);
    const cash = async (from:string,to:string) => (await (await api(`/api/finance/cashflow?from=${from}&to=${to}&currencyCode=PEN`)).json() as { cashBalances:{ currencyCode:string;openingMinor:number;receiptsMinor:number;paymentsMinor:number;closingMinor:number }[] }).cashBalances;
    expect(await cash('2026-01-01','2026-01-31')).toEqual([expect.objectContaining({ currencyCode:'PEN',openingMinor:150000,receiptsMinor:4000,paymentsMinor:0,closingMinor:154000 })]);
    expect(await cash('2026-02-01','2026-02-28')).toEqual([expect.objectContaining({ currencyCode:'PEN',openingMinor:154000,receiptsMinor:17000,paymentsMinor:21000,closingMinor:150000 })]);
    const entries = (await (await api('/api/finance/entries?from=2026-01-01&to=2026-02-28')).json() as { entries:{ id:number;direction:string;amountMinor:number;outstandingMinor:number }[] }).entries;
    expect(entries.filter(entry => entry.id === sale!.id)).toHaveLength(1);
    expect(entries.find(entry => entry.id === sale!.id)).toMatchObject({ direction:'income',amountMinor:18000,outstandingMinor:0 });
    expect(entries.find(entry => entry.id === reversal!.id)).toMatchObject({ direction:'expense',amountMinor:18000,outstandingMinor:0 });
    expect(entries.find(entry => entry.id === expenseId)).toMatchObject({ direction:'expense',amountMinor:3000,outstandingMinor:0 });
    expect(entries.find(entry => entry.id === correctionId)).toMatchObject({ direction:'income',amountMinor:3000,outstandingMinor:0 });
    expect(await db.prepare("SELECT COUNT(*) n FROM financial_entries WHERE source_type='animal_sale'").first()).toMatchObject({ n:1 });
    expect(await db.prepare('SELECT COUNT(*) n FROM financial_entries WHERE reversal_of_id=?').bind(sale!.id).first()).toMatchObject({ n:1 });
  }, 60000);
});

import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({ workers: [{
  config: { name: 'restore-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' }, env: { SOURCE: { type: 'd1', id: 'restore-source' }, COPY: { type: 'd1', id: 'restore-copy' } } },
}] });
afterAll(async () => runtime.dispose());
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
type SchemaRow = { type: string; name: string; sql: string };
type TableDump = { name: string; columns: string[]; rows: Record<string, unknown>[] };

async function migrate(db: D1Database) {
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = (await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map(part => part.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) { trigger += `${part}; `; if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; } }
      else await db.prepare(part).run();
    }
    if (trigger) throw new Error(`Trigger incompleto en ${name}`);
  }
}

describe('Restauración lógica aislada · T29', () => {
  it('reconstruye esquema y datos en otra D1 y ejecuta el Worker sobre el corte recuperado', async () => {
    const source = await runtime.getD1Database('SOURCE'); const copy = await runtime.getD1Database('COPY'); await migrate(source);
    const call = (db: D1Database, path: string, token = '', payload?: Record<string, unknown>) => worker.fetch(new Request(`http://localhost${path}`, { method: payload ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) }), { DB: db });
    const bootstrap = await call(source, '/api/auth/bootstrap', '', { username: 'restore-admin@granja.test', password: 'RestauracionFicticia2026!', name: 'Administrador de ensayo' }); expect(bootstrap.status).toBe(201); const token = (await bootstrap.json() as { token: string }).token;
    const user = await call(source, '/api/admin/users', token, { username: 'restore-responsable@granja.test', name: 'Responsable de ensayo', role: 'responsable', password: 'ResponsableFicticio2026!', barnIds: [1] }); expect(user.status, await user.clone().text()).toBe(201);
    const initial = { movementType: 'initial', effectiveDate: '2026-11-08', barnId: 1, locationCode: 'galpon_a', lotCode: 'lote_levante_a', stageCode: 'levante', sex: 'macho', quantity: 12, reason: 'Apertura ficticia de restauración', operationKey: 'restore-initial' };
    expect((await call(source, '/api/inventory/movements', token, initial)).status).toBe(201); expect((await call(source, '/api/inventory/movements', token, { ...initial, movementType: 'sale', saleAmount: '180.00', currencyCode: 'PEN', quantity: 2, causeCode: 'baja_produccion', operationKey: 'restore-sale' })).status).toBe(201);
    const income = await call(source, '/api/finance/entries', token, { direction: 'income', category: 'Venta', concept: 'Venta ficticia de restauración', operationDate: '2026-11-08', amount: '180.00', currencyCode: 'PEN', reason: 'Ensayo de recuperación', operationKey: 'restore-income', allocations: [{ barnId: 1, amount: '180.00' }] }); expect(income.status, await income.clone().text()).toBe(201); const entryId = (await income.json() as { entry: { id: number } }).entry.id;
    const allocation = await source.prepare('SELECT id FROM financial_allocations WHERE entry_id=?').bind(entryId).first<{ id: number }>();
    expect((await call(source, '/api/finance/cash/opening', token, { effectiveDate: '2026-11-07', currencyCode: 'PEN', amount: '1500.00', reason: 'Caja ficticia de recuperación', operationKey: 'restore-opening' })).status).toBe(201);
    expect((await call(source, `/api/finance/entries/${entryId}/settlements`, token, { settlementDate: '2026-11-08', amount: '40.00', paymentMethod: 'efectivo', reason: 'Abono ficticio de recuperación', operationKey: 'restore-payment', allocations: [{ allocationId: allocation!.id, amount: '40.00' }] })).status).toBe(201);
    const beforeUsers = await (await call(source, '/api/admin/users', token)).json(); const beforeInventory = await (await call(source, '/api/inventory?asOf=2026-11-08', token)).json(); const beforeFinance = await (await call(source, '/api/finance/entries?from=2026-11-01&to=2026-11-08', token)).json(); const beforeCash = await (await call(source, '/api/finance/cashflow?from=2026-11-08&to=2026-11-08', token)).json();
    const started = performance.now();
    const schema = (await source.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name").all<SchemaRow>()).results ?? [];
    const tables: TableDump[] = [];
    for (const table of schema.filter(row => row.type === 'table')) { const columns = (await source.prepare(`PRAGMA table_info(${identifier(table.name)})`).all<{ name: string }>()).results?.map(row => row.name) ?? []; const rows = (await source.prepare(`SELECT * FROM ${identifier(table.name)}`).all<Record<string, unknown>>()).results ?? []; tables.push({ name: table.name, columns, rows }); }
    const sequences = (await source.prepare('SELECT name,seq FROM sqlite_sequence').all<{ name: string; seq: number }>()).results ?? [];
    // Serialize the complete logical snapshot; the copy never reads the source again.
    const backup = JSON.parse(JSON.stringify({ schema, tables, sequences })) as { schema: SchemaRow[]; tables: TableDump[]; sequences: { name: string; seq: number }[] };
    const exportedMs = performance.now() - started;
    expect((await call(source, '/api/inventory/movements', token, { ...initial, movementType: 'purchase', quantity: 5, operationKey: 'restore-after-cut' })).status).toBe(201);
    for (const table of backup.schema.filter(row => row.type === 'table')) await copy.prepare(table.sql).run();
    const statements = [copy.prepare('PRAGMA defer_foreign_keys=ON')];
    for (const table of backup.tables) for (const row of table.rows) statements.push(copy.prepare(`INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(',')}) VALUES (${table.columns.map(() => '?').join(',')})`).bind(...table.columns.map(column => row[column])));
    for (const sequence of backup.sequences) { statements.push(copy.prepare('DELETE FROM sqlite_sequence WHERE name=?').bind(sequence.name)); statements.push(copy.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').bind(sequence.name, sequence.seq)); }
    await copy.batch(statements);
    for (const item of backup.schema.filter(row => row.type !== 'table')) await copy.prepare(item.sql).run();
    const restoredMs = performance.now() - started;
    expect((await copy.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect(await (await call(copy, '/api/admin/users', token)).json()).toEqual(beforeUsers);
    expect(await (await call(copy, '/api/inventory?asOf=2026-11-08', token)).json()).toEqual(beforeInventory);
    expect(await (await call(copy, '/api/finance/entries?from=2026-11-01&to=2026-11-08', token)).json()).toEqual(beforeFinance);
    expect(await (await call(copy, '/api/finance/cashflow?from=2026-11-08&to=2026-11-08', token)).json()).toEqual(beforeCash);
    expect((await copy.prepare('SELECT COUNT(*) n FROM user_barns').first<{ n: number }>())!.n).toBeGreaterThan(0);
    expect((await copy.prepare('SELECT SUM(CASE WHEN movement_type=\'sale\' THEN -quantity ELSE quantity END) n FROM inventory_movements').first<{ n: number }>())!.n).toBe(10);
    expect((await source.prepare('SELECT COUNT(*) n FROM inventory_movements').first<{ n: number }>())!.n).toBe(3);
    console.info('Ensayo local de restauración lógica', { tables: backup.tables.length, rows: backup.tables.reduce((sum, table) => sum + table.rows.length, 0), exportMs: Math.round(exportedMs), restoreAndExportMs: Math.round(restoredMs), foreignKeyErrors: 0, sourcePostCutMovementsExcluded: 1 });
  }, 60000);
});

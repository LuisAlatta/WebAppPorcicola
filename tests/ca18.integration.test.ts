import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';
import worker from '../worker/index';
import { generarReportePdf, type ReportColumn } from '../src/utils/exportPdf';
import { generarReporteXlsx } from '../src/utils/exportXlsx';

const runtime = new Miniflare({ workers: [{
  config: { name: 'ca18-test', compatibilityDate: '2026-07-01', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
    env: { DB: { type: 'd1', id: 'ca18-database' } } },
}] });
afterAll(async () => runtime.dispose());

async function migrate(db: D1Database) {
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
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
}

type Report = {
  rows: Record<string, unknown>[];
  asOf: string;
  farmName?: string;
  moneyTotals: Record<string, { income: number; expense: number; balance: number }>;
  totals: Record<string, number | null>;
};

describe('CA-18 · exportación de venta y consumo individual', () => {
  it('concilia venta180 y consumo24 una sola vez en pantalla y archivos generados del reporte autorizado', async () => {
    const db = await runtime.getD1Database('DB');
    await migrate(db);
    let token = '';
    const api = (path: string, payload?: Record<string, unknown>) => worker.fetch(new Request(`http://localhost${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }), { DB: db });
    const created = async (path: string, payload: Record<string, unknown>) => {
      const response = await api(path, payload);
      expect(response.status, await response.clone().text()).toBe(201);
      return response;
    };
    const bootstrap = await created('/api/auth/bootstrap', { username: 'admin-ca18@granja.test', password: 'PruebaCA18Segura2026!', name: 'Administrador CA18' });
    token = (await bootstrap.json() as { token: string }).token;
    await created('/api/animals', {
      code: 'CA18-001', animalType: 'lechon', sex: 'macho', birthDate: '2026-11-01', entryDate: '2026-11-01', entryStageCode: 'preinicio',
      barnId: 1, locationCode: 'galpon_a', originType: 'nacimiento', reason: 'Alta ficticia de CA18', operationKey: 'ca18-animal',
    });
    const feed = { effectiveDate: '2026-11-07', warehouseId: 1, feedCode: 'preinicio', lotCode: 'CA18-LOTE', quantityKg: 8, costPerKg: 3, currencyCode: 'PEN', reason: 'Alimento ficticio de CA18' };
    await created('/api/feed/movements', { ...feed, movementType: 'purchase', supplier: 'Proveedor CA18', operationKey: 'ca18-food-purchase' });
    const delivery = { ...feed, movementType: 'delivery', animalCode: 'CA18-001', operationKey: 'ca18-food-delivery' };
    await created('/api/feed/movements', delivery);
    const replayDelivery = await api('/api/feed/movements', delivery);
    expect(replayDelivery.status, await replayDelivery.clone().text()).toBe(200);
    const sale = { exitType: 'sale', causeCode: 'edad', effectiveDate: '2026-11-07', saleAmount: '180.00', currencyCode: 'PEN', counterparty: 'Cliente CA18', documentReference: 'CA18-VENTA', reason: 'Venta ficticia de CA18', operationKey: 'ca18-animal-sale' };
    await created('/api/animals/CA18-001/exit', sale);
    const replaySale = await api('/api/animals/CA18-001/exit', sale);
    expect(replaySale.status, await replaySale.clone().text()).toBe(200);
    expect(await db.prepare("SELECT COUNT(*) n,SUM(total_cost_minor) cost FROM feed_movements WHERE movement_type='delivery'").first()).toMatchObject({ n: 1, cost: 2400 });
    expect(await db.prepare("SELECT COUNT(*) n,SUM(amount_minor) amount FROM financial_entries WHERE direction='expense'").first()).toMatchObject({ n: 1, amount: 2400 });
    expect(await db.prepare("SELECT COUNT(*) n,SUM(amount_minor) amount FROM financial_entries WHERE source_type='animal_sale'").first()).toMatchObject({ n: 1, amount: 18000 });
    expect(await db.prepare('SELECT COUNT(*) n FROM financial_settlements').first()).toMatchObject({ n: 0 });
    const definition = { source: 'economics', name: 'Ventas y alimento CA18', purpose: 'Conciliar venta y consumo individual del mes', from: '2026-11-01', to: '2026-11-08', barnId: 1, columns: ['month', 'barn', 'currency', 'sales', 'feedCost'], groupBy: 'barn,month', filters: { currency: 'PEN' } };
    const previewResponse = await api('/api/reports/preview', definition);
    expect(previewResponse.status, await previewResponse.clone().text()).toBe(200);
    const preview = await previewResponse.json() as Report;
    expect(preview.rows).toEqual([{ month: '2026-11', barn: 'Galpón A', currency: 'PEN', sales: 180, feedCost: 24 }]);
    expect(preview.moneyTotals).toEqual({ PEN: { income: 180, expense: 24, balance: 156 } });
    const exportResponse = await api('/api/reports/export', { definition });
    expect(exportResponse.status, await exportResponse.clone().text()).toBe(200);
    const exported = await exportResponse.json() as Report;
    expect(exported.rows).toEqual(preview.rows);
    expect(exported.moneyTotals).toEqual(preview.moneyTotals);
    const columns: ReportColumn[] = [
      { key: 'month', label: 'Mes', dataType: 'text' }, { key: 'barn', label: 'Galpón', dataType: 'text' },
      { key: 'currency', label: 'Moneda', dataType: 'text' }, { key: 'sales', label: 'Ventas', dataType: 'money' }, { key: 'feedCost', label: 'Costo de alimento', dataType: 'money' },
    ];
    const options = { title: definition.name, purpose: definition.purpose, from: definition.from, to: definition.to, asOf: exported.asOf, generatedAt: '08/11/2026', filters: { Galpón: 'Galpón A', Moneda: 'PEN' }, columns, rows: exported.rows, totals: exported.totals, moneyTotals: exported.moneyTotals };
    const pdfBytes = await generarReportePdf({ ...options, farm: exported.farmName ?? 'Granja CA18' });
    const pdf = await PDFDocument.load(pdfBytes);
    const pieces: string[] = [];
    for (const page of pdf.getPages()) {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents];
      for (const stream of streams) if (stream instanceof PDFRawStream) {
        const bytes = stream.dict.get(PDFName.of('Filter')) ? inflateSync(stream.contents) : stream.contents;
        const operators = Buffer.from(bytes).toString('latin1');
        for (const match of operators.matchAll(/<([\dA-Fa-f]+)>\s*Tj/g)) pieces.push(Buffer.from(match[1], 'hex').toString('latin1'));
      }
    }
    const pdfText = pieces.join(' ');
    expect(pdfText).toContain('180.00'); expect(pdfText).toContain('24.00'); expect(pdfText).toContain('Galpón A');
    const xlsxBytes = generarReporteXlsx({ ...options, sheetName: 'CA18' });
    const sheetXml = strFromU8(unzipSync(xlsxBytes)['xl/worksheets/sheet1.xml']);
    expect(sheetXml).toContain('<c r="D11"><v>180</v></c>'); expect(sheetXml).toContain('<c r="E11"><v>24</v></c>');
    expect(sheetXml).toContain('<c r="A11" t="inlineStr"><is><t xml:space="preserve">2026-11</t></is></c>');
    if (process.env.EXPORT_ARTIFACTS === '1') {
      await mkdir('test-results', { recursive: true });
      await writeFile('test-results/ca18.pdf', pdfBytes); await writeFile('test-results/ca18.xlsx', xlsxBytes);
    }
  }, 60000);
});

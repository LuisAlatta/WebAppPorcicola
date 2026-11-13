import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { backupXlsx, backupPdf, type BarnBackup } from '../src/utils/barnBackup';

const backup: BarnBackup = {
  format: 'webporcicola-barn-backup', version: 1, exportedAt: '2026-11-12T12:00:00Z', barnId: 1,
  tables: { barns: [{ id: 1, code: 'GA', name: 'Galpón A' }], animals: [{ id: 2, code: '00007', note: '=SUM(A1:A3)', exit_date: null }], audit_log: [] },
  references: {},
  manifest: { schemaHash: 'a'.repeat(64), digest: 'b'.repeat(64), exportOperationId: '00000000-0000-4000-8000-000000000000' },
};

describe('Respaldo de galpones: formatos de archivo', () => {
  it('genera Excel con historial consultable y hoja de restauración sin fórmulas', async () => {
    const files = unzipSync(await backupXlsx(backup));
    const workbook = strFromU8(files['xl/workbook.xml']);
    expect(workbook).toContain('Historial completo');
    expect(workbook).toContain('Restauracion');
    const history = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(history).toContain('00007');
    expect(history).toContain('=SUM(A1:A3)');
    expect(history).not.toContain('<f>');
    const snapshot = strFromU8(files['xl/worksheets/sheet2.xml']);
    expect(snapshot).toContain('webporcicola-barn-backup:1');
    expect(snapshot).toContain('&quot;exit_date&quot;:null');
    expect(snapshot).toContain('&quot;audit_log&quot;:[]');
  });

  it('divide contenidos largos sin perder el final ni exceder el límite de una celda Excel', async () => {
    const long = 'Historial clínico '.repeat(4000) + 'FINAL';
    const files = unzipSync(await backupXlsx({ ...backup, tables: { ...backup.tables, animal_weights: [{ id: 8, note: long }] } }));
    const sheet = strFromU8(files['xl/worksheets/sheet2.xml']);
    const texts = Array.from(sheet.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)).map(match => match[1]);
    expect(texts.length).toBeGreaterThan(4);
    expect(texts.slice(2).join('')).toContain('FINAL');
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('note (');
  });

  it('protege los textos que Excel interpreta como escapes OOXML', async () => {
    const sample = { ...backup, tables: { ...backup.tables, animals: [{ id: 2, note: '_x0041_ y _x005F_' }] } };
    const files = unzipSync(await backupXlsx(sample));
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('_x005F_x0041_');
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('_x005F_x0041_');
  });

  it('no divide pares Unicode entre bloques de restauración', async () => {
    const sample = { ...backup, tables: { ...backup.tables, animals: [{ id: 2, note: String.fromCodePoint(0x1f416).repeat(13000) + 'FINAL' }] } };
    const files = unzipSync(await backupXlsx(sample));
    const sheet = strFromU8(files['xl/worksheets/sheet2.xml']);
    const encoded = Array.from(sheet.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)).slice(2).map(match => match[1]).join('');
    const decoded = encoded.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    expect(JSON.parse(decoded)).toEqual(sample);
  });

  it('genera PDF de consulta con advertencia de no reimportación', async () => {
    const bytes = await backupPdf(backup);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe('Historial completo de Galpón A');
    expect(pdf.getSubject()).toContain('no permite restaurar');
    const unicodePdf = await backupPdf({ ...backup, tables: { ...backup.tables, animals: [{ id: 2, note: String.fromCodePoint(0x1f416) }] } });
    expect((await PDFDocument.load(unicodePdf)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

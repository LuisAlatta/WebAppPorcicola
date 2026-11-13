import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { generarReporteXlsx } from './exportXlsx';
import { generarReportePdf } from './exportPdf';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { BARN_BACKUP_LIMITS, type BarnBackup } from '../types/barn-backup';
export type { BarnBackup } from '../types/barn-backup';

const MAX_BYTES = 20 * 1024 * 1024;
const xml = (value: string) => value.replace(/_x[0-9a-f]{4}_/gi, match => `_x005F_${match.slice(1)}`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const decodeOoxml = (value: string) => value.replace(/_x([0-9a-f]{4})_/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', strToU8(text)))).map(value => value.toString(16).padStart(2, '0')).join('');

export function backupName(backup: BarnBackup): string {
  return String(backup.tables.barns?.[0]?.name ?? 'Galpón');
}

function reportRows(backup: BarnBackup): Record<string, unknown>[] {
  const tables = [...Object.entries(backup.tables), ...Object.entries(backup.references).map(([table, rows]) => [`Referencia: ${table}`, rows] as const)];
  return tables.flatMap(([table, rows]) => rows.flatMap((row, index) => Object.entries(row).flatMap(([field, value]) => {
    const text = value === null ? '(nulo)' : String(value);
    const chunks = text.match(/[\s\S]{1,12000}/gu) ?? [''];
    return chunks.map((chunk, part) => ({ table, record: String(row.id ?? index + 1), field: chunks.length > 1 ? `${field} (${part + 1}/${chunks.length})` : field, value: chunk }));
  })));
}

const columns = [
  { key: 'table', label: 'Historial / tabla', dataType: 'text' as const },
  { key: 'record', label: 'Registro', dataType: 'text' as const },
  { key: 'field', label: 'Campo', dataType: 'text' as const },
  { key: 'value', label: 'Valor', dataType: 'text' as const },
];

export async function backupXlsx(backup: BarnBackup): Promise<Uint8Array> {
  const json = JSON.stringify(backup);
  if ([...Object.values(backup.tables), ...Object.values(backup.references)].reduce((total, rows) => total + rows.length, 0) > BARN_BACKUP_LIMITS.rows) throw new Error('El respaldo supera el límite de registros de importación. No se ha descargado un archivo incompleto.');
  if (strToU8(json).length > BARN_BACKUP_LIMITS.bytes) throw new Error('El respaldo supera el límite de 8 MB. No se ha descargado un archivo incompleto.');
  const base = generarReporteXlsx({ sheetName: 'Historial completo', title: `Respaldo de ${backupName(backup)}`, purpose: 'Consulta del historial completo. Para restaurar, importe este Excel sin modificar la hoja Restauracion; los cambios en la hoja de consulta no se importan. El PDF no es reimportable.', generatedAt: backup.exportedAt, asOf: backup.exportedAt.slice(0, 10), filters: {}, columns, rows: reportRows(backup) });
  const files = unzipSync(base);
  const chunks = json.match(/[\s\S]{1,12000}/gu) ?? [];
  const checksum = await digest(json);
  const values = ['webporcicola-barn-backup:1', checksum, ...chunks];
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${values.map((value, index) => `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c></row>`).join('')}</sheetData></worksheet>`;
  files['xl/worksheets/sheet2.xml'] = strToU8(sheet);
  files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']).replace('</sheets>', '<sheet name="Restauracion" sheetId="2" r:id="rId3"/></sheets>'));
  files['xl/_rels/workbook.xml.rels'] = strToU8(strFromU8(files['xl/_rels/workbook.xml.rels']).replace('</Relationships>', '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'));
  files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>', '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
  const bytes = zipSync(files);
  if (bytes.length > MAX_BYTES) throw new Error('El Excel supera el límite de importación de 20 MB. No se ha descargado un respaldo incompleto.');
  return bytes;
}

export async function backupPdf(backup: BarnBackup): Promise<Uint8Array> {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const characters = new Map<string, string>();
  const printable = (text: string) => Array.from(text).map(character => {
    if (character === '\n' || character === '\r' || character === '\t') return character;
    if (!characters.has(character)) {
      try {
        font.encodeText(character);
        characters.set(character, character);
      } catch {
        characters.set(character, `\\u{${character.codePointAt(0)!.toString(16)}}`);
      }
    }
    return characters.get(character)!;
  }).join('');
  const rows = reportRows(backup).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, printable(String(value))])));
  return generarReportePdf({ title: `Historial completo de ${printable(backupName(backup))}`, purpose: 'Respaldo de consulta. Este PDF no permite restaurar datos: conserve también el Excel. Caracteres fuera de la fuente se representan como códigos Unicode (\\u{...}).', farm: 'Mi Granja PRO', generatedAt: backup.exportedAt, asOf: backup.exportedAt.slice(0, 10), filters: {}, columns, rows });
}

function parseXml(bytes: Uint8Array | undefined): Document {
  if (!bytes) throw new Error('El Excel no contiene una hoja de restauración válida.');
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('El Excel contiene XML no permitido.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('El Excel está dañado.');
  return document;
}

export async function readBackupXlsx(file: File): Promise<BarnBackup> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Seleccione el Excel .xlsx exportado como respaldo de un galpón.');
  if (file.size > MAX_BYTES) throw new Error('El Excel supera el límite de 20 MB.');
  let expanded = 0;
  const archive = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(archive, { filter(entry) {
    if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml)$/.test(entry.name)) return false;
    expanded += entry.originalSize;
    if (expanded > 80 * 1024 * 1024) throw new Error('El contenido del Excel supera el límite permitido.');
    return true;
  } });
  const workbook = parseXml(files['xl/workbook.xml']);
  const sheet = Array.from(workbook.getElementsByTagName('sheet')).find(item => item.getAttribute('name') === 'Restauracion');
  const relationshipId = sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relationships = parseXml(files['xl/_rels/workbook.xml.rels']);
  const relationship = Array.from(relationships.getElementsByTagName('Relationship')).find(item => item.getAttribute('Id') === relationshipId);
  const target = relationship?.getAttribute('Target') ?? '';
  const path = target.startsWith('/xl/') ? target.slice(1) : `xl/${target}`;
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path) || relationship?.getAttribute('TargetMode') === 'External') throw new Error('El Excel no contiene el respaldo de restauración.');
  const shared = files['xl/sharedStrings.xml'] ? Array.from(parseXml(files['xl/sharedStrings.xml']).getElementsByTagName('si')).map(item => item.textContent ?? '') : [];
  const restored = unzipSync(archive, { filter(entry) {
    if (entry.name !== path) return false;
    expanded += entry.originalSize;
    if (expanded > 80 * 1024 * 1024) throw new Error('El contenido de restauración supera el límite permitido.');
    return true;
  } });
  const document = parseXml(restored[path]);
  const cells = Array.from(document.getElementsByTagName('c'));
  if (cells.some(cell => cell.getElementsByTagName('f').length || !/^A[1-9]\d*$/.test(cell.getAttribute('r') ?? ''))) throw new Error('La hoja Restauracion fue modificada o contiene fórmulas.');
  const values = cells.sort((a, b) => Number(a.getAttribute('r')?.slice(1)) - Number(b.getAttribute('r')?.slice(1))).map(cell => {
    const value = cell.getAttribute('t') === 's'
      ? shared[Number(cell.getElementsByTagName('v')[0]?.textContent)] ?? ''
      : cell.getElementsByTagName('is')[0]?.textContent ?? cell.getElementsByTagName('v')[0]?.textContent ?? '';
    return decodeOoxml(value);
  });
  if (values[0] !== 'webporcicola-barn-backup:1' || values.length < 3) throw new Error('No es un respaldo de galpón compatible.');
  const json = values.slice(2).join('');
  if (strToU8(json).length > BARN_BACKUP_LIMITS.bytes || await digest(json) !== values[1]) throw new Error('El respaldo está incompleto o fue modificado. Importe el Excel original.');
  const backup = JSON.parse(json) as BarnBackup;
  if (!backup || backup.format !== 'webporcicola-barn-backup' || backup.version !== 1 || typeof backup.exportedAt !== 'string' || !Number.isInteger(backup.barnId) || !backup.tables || Array.isArray(backup.tables) || typeof backup.tables !== 'object' || !Array.isArray(backup.tables.barns) || backup.tables.barns.length !== 1) throw new Error('El respaldo no es válido.');
  if (!backup.references || typeof backup.references !== 'object' || Array.isArray(backup.references) || !backup.manifest || typeof backup.manifest !== 'object' || !/^[a-f0-9]{64}$/.test(backup.manifest.digest) || !/^[a-f0-9]{64}$/.test(backup.manifest.schemaHash) || !/^[a-f0-9-]{36}$/.test(backup.manifest.exportOperationId)) throw new Error('El respaldo no contiene su constancia de exportación.');
  let rowCount = 0;
  for (const rows of [...Object.values(backup.tables), ...Object.values(backup.references)]) {
    if (!Array.isArray(rows)) throw new Error('Las tablas del respaldo no son válidas.');
    rowCount += rows.length;
    if (rowCount > BARN_BACKUP_LIMITS.rows) throw new Error('El respaldo supera el límite de registros permitido.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.values(row).some(value => value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('Un registro del respaldo no es válido.');
    }
  }
  return backup;
}

export function downloadBackup(bytes: Uint8Array, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

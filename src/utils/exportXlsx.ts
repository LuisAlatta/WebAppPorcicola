import { zipSync, strToU8 } from 'fflate';

export interface ReporteItemXlsx {
  arete: string;
  galpon: string;
  etapa: string;
  pesoKg: number;
  valorSoles: number;
  fechaIngreso: string;
  estado: string;
}

export interface ReporteXlsxOpciones {
  nombreHoja: string;
  items: ReporteItemXlsx[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generarReporteXlsx(opciones: ReporteXlsxOpciones): Uint8Array {
  // Construir filas de la hoja
  let sheetRowsXml = '';

  // Fila 1: Encabezados
  sheetRowsXml += '<row r="1">';
  const headers = ['Arete / Código', 'Galpón', 'Etapa', 'Peso (kg)', 'Valor (S/)', 'Fecha Ingreso', 'Estado'];
  headers.forEach((h, idx) => {
    const col = String.fromCharCode(65 + idx);
    sheetRowsXml += `<c r="${col}1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`;
  });
  sheetRowsXml += '</row>';

  // Filas de datos
  opciones.items.forEach((item, rowIdx) => {
    const r = rowIdx + 2;
    sheetRowsXml += `<row r="${r}">`;
    sheetRowsXml += `<c r="A${r}" t="inlineStr"><is><t>${escapeXml(item.arete)}</t></is></c>`;
    sheetRowsXml += `<c r="B${r}" t="inlineStr"><is><t>${escapeXml(item.galpon)}</t></is></c>`;
    sheetRowsXml += `<c r="C${r}" t="inlineStr"><is><t>${escapeXml(item.etapa)}</t></is></c>`;
    sheetRowsXml += `<c r="D${r}"><v>${item.pesoKg.toFixed(2)}</v></c>`;
    sheetRowsXml += `<c r="E${r}"><v>${item.valorSoles.toFixed(2)}</v></c>`;
    sheetRowsXml += `<c r="F${r}" t="inlineStr"><is><t>${escapeXml(item.fechaIngreso)}</t></is></c>`;
    sheetRowsXml += `<c r="G${r}" t="inlineStr"><is><t>${escapeXml(item.estado)}</t></is></c>`;
    sheetRowsXml += '</row>';
  });

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(opciones.nombreHoja)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const zipFiles: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(sheet1Xml),
  };

  return zipSync(zipFiles);
}

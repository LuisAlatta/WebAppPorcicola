import { strToU8, zipSync } from 'fflate';
import type { ReportColumn } from './exportPdf';

export interface XlsxOptions {
  sheetName: string;
  title: string;
  purpose: string;
  generatedAt: string;
  from?: string;
  to?: string;
  asOf: string;
  filters: Record<string,string>;
  columns: ReportColumn[];
  rows: Record<string,unknown>[];
  totals?: Record<string,number|null>;
  moneyTotals?: Record<string,{income:number;expense:number;balance:number}>;
}

const xml=(value:string)=>Array.from(value).filter(character=>{const code=character.charCodeAt(0);return code>=32||code===9||code===10||code===13;}).join('').replace(/_x[0-9a-f]{4}_/gi,match=>`_x005F_${match.slice(1)}`).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const columnName=(index:number)=>{let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
const serialDate=(value:unknown)=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return null;
  const date=new Date(`${value.slice(0,10)}T00:00:00Z`);if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value.slice(0,10))return null;
  return (date.getTime()-Date.UTC(1899,11,30))/86400000;
};
const textCell=(ref:string,value:unknown)=>`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value===null||value===undefined?'':String(value))}</t></is></c>`;

export function generarReporteXlsx(options:XlsxOptions):Uint8Array{
  if(!options.columns.length)throw new Error('El informe requiere al menos una columna');
  let safeSheet=options.sheetName||'Reporte';for(const character of ['\\','/','*','?',':','[',']'])safeSheet=safeSheet.replaceAll(character,' ');safeSheet=safeSheet.trim().slice(0,31)||'Reporte';
  const metadata=[['Informe',options.title],['Finalidad',options.purpose],['Periodo',`${options.from||'inicio'} a ${options.to||'hoy'}`],['Fecha de corte',options.asOf],['Generado',options.generatedAt],['Filtros',Object.entries(options.filters).map(([k,v])=>`${k}: ${v}`).join(' · ')||'ninguno']];
  const rowsXml:string[]=[];let rowNumber=1;
  for(const [label,value] of metadata){rowsXml.push(`<row r="${rowNumber}">${textCell(`A${rowNumber}`,label)}${textCell(`B${rowNumber}`,value)}</row>`);rowNumber++;}
  for(const [key,value] of Object.entries(options.totals??{}))if(typeof value==='number'){rowsXml.push(`<row r="${rowNumber}">${textCell(`A${rowNumber}`,key)}<c r="B${rowNumber}"><v>${value}</v></c></row>`);rowNumber++;}
  for(const [currency,value] of Object.entries(options.moneyTotals??{})){rowsXml.push(`<row r="${rowNumber}">${textCell(`A${rowNumber}`,`Ingresos ${currency}`)}<c r="B${rowNumber}"><v>${value.income}</v></c>${textCell(`C${rowNumber}`,`Egresos ${currency}`)}<c r="D${rowNumber}"><v>${value.expense}</v></c>${textCell(`E${rowNumber}`,`Saldo ${currency}`)}<c r="F${rowNumber}"><v>${value.balance}</v></c></row>`);rowNumber++;}
  rowNumber++;
  const headerRow=rowNumber;rowsXml.push(`<row r="${rowNumber}">${options.columns.map((column,index)=>textCell(`${columnName(index)}${rowNumber}`,column.unit?`${column.label} (${column.unit})`:column.label)).join('')}</row>`);rowNumber++;
  for(const row of options.rows){
    const cells=options.columns.map((column,index)=>{
      const ref=`${columnName(index)}${rowNumber}`;const value=row[column.key];
      if(value===null||value===undefined)return `<c r="${ref}"/>`;
      if(column.dataType==='date'){const serial=serialDate(value);return serial===null?textCell(ref,value):`<c r="${ref}" s="1"><v>${serial}</v></c>`;}
      if((column.dataType==='number'||column.dataType==='money'||column.dataType==='percent')&&typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}"><v>${value}</v></c>`;
      return textCell(ref,value);
    }).join('');rowsXml.push(`<row r="${rowNumber}">${cells}</row>`);rowNumber++;
  }
  const worksheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rowsXml.join('')}</sheetData><autoFilter ref="A${headerRow}:${columnName(options.columns.length-1)}${rowNumber-1}"/></worksheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeSheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  return zipSync({'[Content_Types].xml':strToU8(contentTypes),'_rels/.rels':strToU8(rootRels),'xl/workbook.xml':strToU8(workbook),'xl/_rels/workbook.xml.rels':strToU8(rels),'xl/worksheets/sheet1.xml':strToU8(worksheet),'xl/styles.xml':strToU8(styles)});
}

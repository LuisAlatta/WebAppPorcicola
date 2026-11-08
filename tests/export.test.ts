import { describe,expect,it } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import { strFromU8,unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { generarReportePdf,ReportColumn,wrapReportText } from '../src/utils/exportPdf';
import { generarReporteXlsx } from '../src/utils/exportXlsx';

const columns:ReportColumn[]=[{key:'animalCode',label:'Código',dataType:'text'},{key:'weight',label:'Peso',dataType:'number',unit:'kg'},{key:'date',label:'Fecha',dataType:'date'},{key:'concept',label:'Concepto',dataType:'text'}];
const rows=Array.from({length:301},(_,index)=>({animalCode:String(index+1).padStart(3,'0'),weight:30.25+index,date:'2026-11-07',concept:index===0?'=HYPERLINK("https://evil.test")':'Lechón'}));
const base={title:'Informe de producción porcina',purpose:'Revisar peso y movimientos',generatedAt:'2026-11-08 10:30',from:'2026-11-01',to:'2026-11-08',asOf:'2026-11-08',filters:{barn:'Galpón A'},columns,rows,totals:{rows:301,sum:55219.25},moneyTotals:{PEN:{income:300,expense:30,balance:270}}};
const artifact=(name:string,bytes:Uint8Array)=>{if(process.env.EXPORT_ARTIFACTS==='1'){mkdirSync('test-results',{recursive:true});writeFileSync(`test-results/${name}`,bytes);}};

describe('Exportaciones PDF y XLSX · T03/T26',()=>{
  it('genera PDF paginado con contexto, encabezados repetibles y todas las filas',async()=>{
    const bytes=await generarReportePdf({...base,farm:'Granja Porcícola San Luis'});const pdf=await PDFDocument.load(bytes);
    artifact('exportacion.pdf',bytes);
    expect(String.fromCharCode(...bytes.slice(0,5))).toBe('%PDF-');expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
  it('conserva texto largo completo y permite continuar una celda entre páginas',async()=>{
    const longText='Motivo clínico y observación extensa '.repeat(700)+'FIN';
    const lines=wrapReportText(longText,text=>text.length*4,100);
    expect(lines.join('')).toBe(longText);
    const bytes=await generarReportePdf({...base,farm:'Granja',rows:[{animalCode:'001',concept:longText}],totals:{rows:1}});
    artifact('texto-largo.pdf',bytes);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
  it('genera XLSX con números y fechas tipados, texto seguro, filtro y filas completas',()=>{
    const bytes=generarReporteXlsx({...base,sheetName:'Producción / Galpón A'});expect([...bytes.slice(0,4)]).toEqual([0x50,0x4b,0x03,0x04]);
    artifact('exportacion.xlsx',bytes);
    const zip=unzipSync(bytes);expect(zip['xl/styles.xml']).toBeDefined();const sheet=strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('autoFilter');expect(sheet).toContain('state="frozen"');expect(sheet).toContain('r="B12"><v>30.25</v>');expect(sheet).toContain('r="C12" s="1"><v>46333</v>');expect(sheet).toContain('r="D12" t="inlineStr"');expect(sheet).toContain('=HYPERLINK(');expect(sheet).not.toContain('<f>HYPERLINK');expect(sheet).toContain('301');
    const workbook=strFromU8(zip['xl/workbook.xml']);expect(workbook).toContain('Producción   Galpón A');
  });
  it('no acepta exportaciones sin columnas',()=>expect(()=>generarReporteXlsx({...base,sheetName:'Vacío',columns:[]})).toThrow('al menos una columna'));
});

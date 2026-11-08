import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReportColumn { key: string; label: string; dataType: 'text'|'date'|'number'|'money'|'percent'; unit?: string }
export interface ReportFileOptions {
  title: string;
  purpose: string;
  farm: string;
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

const display = (value: unknown) => value === null || value === undefined ? '—' : value instanceof Date ? value.toLocaleDateString('es-PE') : String(value);

export function wrapReportText(text:string,measure:(text:string)=>number,width:number):string[]{
  const lines:string[]=[];let line='';
  for(const character of text.replace(/\r/g,'')){
    if(character==='\n'){lines.push(line);line='';continue;}
    if(line&&measure(line+character)>width){lines.push(line);line='';}
    line+=character;
  }
  lines.push(line);return lines;
}

export async function generarReportePdf(options: ReportFileOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const landscape = options.columns.length > 5;
  const pageSize: [number,number] = landscape ? [841.89,595.28] : [595.28,841.89];
  const margin = 32;
  if(!options.columns.length)throw new Error('El informe requiere al menos una columna');
  const width=pageSize[0]-2*margin;const columnWidth=width/options.columns.length;
  let page=doc.addPage(pageSize);let y=pageSize[1]-margin;
  const newPage=()=>{page=doc.addPage(pageSize);y=pageSize[1]-margin;};
  const paragraph=(text:string,size=8,font=regular)=>{
    for(const line of wrapReportText(text,value=>font.widthOfTextAtSize(value,size),width)){
      if(y<margin+15)newPage();page.drawText(line,{x:margin,y,size,font});y-=size+4;
    }
    y-=4;
  };
  paragraph(options.farm,9);paragraph(options.title,15,bold);
  paragraph(`Finalidad: ${options.purpose}`);
  paragraph(`Periodo: ${options.from||'inicio'} a ${options.to||'hoy'} · Corte: ${options.asOf} · Generado: ${options.generatedAt}`);
  paragraph(`Filtros: ${Object.entries(options.filters).map(([key,value])=>`${key}: ${value}`).join(' · ')||'ninguno'}`);
  paragraph(`Filas: ${options.rows.length}`);
  for(const [key,value] of Object.entries(options.totals??{}))if(typeof value==='number')paragraph(`${key}: ${value.toFixed(2)}`);
  for(const [currency,value] of Object.entries(options.moneyTotals??{}))paragraph(`${currency}: ingresos ${value.income.toFixed(2)} · egresos ${value.expense.toFixed(2)} · saldo ${value.balance.toFixed(2)}`);
  const headerLines=options.columns.map(column=>wrapReportText(column.unit?`${column.label} (${column.unit})`:column.label,value=>bold.widthOfTextAtSize(value,7.5),columnWidth-8));
  const headerHeight=Math.max(...headerLines.map(lines=>lines.length))*11+8;
  const header=()=>{
    if(y<headerHeight+margin+20)newPage();
    page.drawRectangle({x:margin,y:y-headerHeight+8,width,height:headerHeight,color:rgb(.91,.94,.91)});
    headerLines.forEach((lines,index)=>lines.forEach((line,n)=>page.drawText(line,{x:margin+index*columnWidth+4,y:y-n*11,size:7.5,font:bold})));y-=headerHeight;
  };
  header();
  for(const row of options.rows){
    const cells=options.columns.map(column=>wrapReportText(display(row[column.key]).replace(/\t/g,' '),value=>regular.widthOfTextAtSize(value,7),columnWidth-8));
    const lineCount=Math.max(...cells.map(lines=>lines.length));
    for(let lineIndex=0;lineIndex<lineCount;lineIndex++){
      if(y<margin+12){newPage();header();}
      cells.forEach((lines,index)=>{if(lines[lineIndex]!==undefined)page.drawText(lines[lineIndex],{x:margin+index*columnWidth+4,y,size:7,font:regular});});y-=11;
    }
    y-=7;
  }
  const pages=doc.getPages();pages.forEach((item,index)=>item.drawText(`Página ${index+1} de ${pages.length}`,{x:pageSize[0]/2-28,y:14,size:8,font:regular}));
  doc.setTitle(options.title);doc.setSubject(options.purpose);doc.setProducer('Web Porcícola');
  return doc.save();
}

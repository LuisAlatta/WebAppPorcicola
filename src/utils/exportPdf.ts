import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReporteItemPdf {
  arete: string;
  galpon: string;
  etapa: string;
  pesoKg: number;
  valorSoles: number;
  fechaIngreso: string;
  estado: string;
}

export interface ReportePdfOpciones {
  titulo: string;
  granja: string;
  fechaEmision: string;
  items: ReporteItemPdf[];
}

export async function generarReportePdf(opciones: ReportePdfOpciones): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const itemsPorPagina = 25;
  const totalPaginas = Math.ceil(opciones.items.length / itemsPorPagina) || 1;

  for (let pag = 0; pag < totalPaginas; pag++) {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    let currentY = height - 40;

    // Encabezado
    page.drawText(opciones.granja, {
      x: 40,
      y: currentY,
      size: 10,
      font: fontRegular,
      color: rgb(0.3, 0.4, 0.3),
    });

    page.drawText(`Fecha: ${opciones.fechaEmision}`, {
      x: width - 150,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    currentY -= 22;
    page.drawText(opciones.titulo, {
      x: 40,
      y: currentY,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.1),
    });

    currentY -= 25;

    // Cabecera de tabla
    page.drawRectangle({
      x: 40,
      y: currentY - 5,
      width: width - 80,
      height: 20,
      color: rgb(0.92, 0.95, 0.92),
    });

    page.drawText('Arete', { x: 45, y: currentY, size: 9, font: fontBold });
    page.drawText('Galpón', { x: 95, y: currentY, size: 9, font: fontBold });
    page.drawText('Etapa', { x: 170, y: currentY, size: 9, font: fontBold });
    page.drawText('Peso (kg)', { x: 250, y: currentY, size: 9, font: fontBold });
    page.drawText('Valor (S/)', { x: 325, y: currentY, size: 9, font: fontBold });
    page.drawText('Fecha', { x: 400, y: currentY, size: 9, font: fontBold });
    page.drawText('Estado', { x: 470, y: currentY, size: 9, font: fontBold });

    currentY -= 18;

    // Filas
    const inicio = pag * itemsPorPagina;
    const fin = Math.min(inicio + itemsPorPagina, opciones.items.length);
    const itemsPagina = opciones.items.slice(inicio, fin);

    for (const item of itemsPagina) {
      page.drawText(item.arete, { x: 45, y: currentY, size: 8.5, font: fontRegular });
      page.drawText(item.galpon, { x: 95, y: currentY, size: 8.5, font: fontRegular });
      page.drawText(item.etapa, { x: 170, y: currentY, size: 8.5, font: fontRegular });
      page.drawText(`${item.pesoKg.toFixed(1)} kg`, { x: 250, y: currentY, size: 8.5, font: fontRegular });
      page.drawText(`S/ ${item.valorSoles.toFixed(2)}`, { x: 325, y: currentY, size: 8.5, font: fontRegular });
      page.drawText(item.fechaIngreso, { x: 400, y: currentY, size: 8.5, font: fontRegular });
      page.drawText(item.estado, { x: 470, y: currentY, size: 8.5, font: fontRegular });

      currentY -= 16;
    }

    // Pie de página con numeración
    page.drawText(`Página ${pag + 1} de ${totalPaginas}`, {
      x: width / 2 - 25,
      y: 25,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return await pdfDoc.save();
}

import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { generarReportePdf, ReporteItemPdf } from '../src/utils/exportPdf';
import { generarReporteXlsx, ReporteItemXlsx } from '../src/utils/exportXlsx';

const generarMuestra = (cantidad: number): ReporteItemPdf[] => {
  return Array.from({ length: cantidad }, (_, i) => ({
    arete: String(i + 1).padStart(3, '0'),
    galpon: i % 2 === 0 ? 'Galpón A' : 'Galpón B',
    etapa: i % 3 === 0 ? 'Gestación' : i % 3 === 1 ? 'Crecimiento' : 'Engorde',
    pesoKg: 30.5 + (i % 50),
    valorSoles: 350.0 + (i * 12.5),
    fechaIngreso: '07/11/2026',
    estado: i % 4 === 0 ? 'Retiro clínico' : 'Sano',
  }));
};

describe('Exportaciones PDF y XLSX · T03', () => {
  it('genera un PDF válido de varias páginas con acentos y moneda S/', async () => {
    const items = generarMuestra(60); // Genera 3 páginas (25 por página)
    const t0 = performance.now();
    const bytes = await generarReportePdf({
      titulo: 'Reporte de Existencias e Inventario Porcino',
      granja: 'Granja Porcícola San Luis',
      fechaEmision: '07/11/2026',
      items,
    });
    const duracionMs = performance.now() - t0;

    // Firma válida de PDF
    const signature = String.fromCharCode(...bytes.slice(0, 5));
    expect(signature).toBe('%PDF-');

    // Debe tener tamaño razonable (menor a 200 KB para 60 filas)
    const tamanoKb = bytes.byteLength / 1024;
    expect(tamanoKb).toBeGreaterThan(1);
    expect(tamanoKb).toBeLessThan(200);

    // Medición de rendimiento (debe ser muy rápido, < 500 ms)
    expect(duracionMs).toBeLessThan(1000);
  });

  it('genera un archivo XLSX OpenXML válido con números y acentos legibles', () => {
    const items: ReporteItemXlsx[] = generarMuestra(100);
    const t0 = performance.now();
    const bytes = generarReporteXlsx({
      nombreHoja: 'Inventario Galpón A',
      items,
    });
    const duracionMs = performance.now() - t0;

    // Firma de archivo ZIP / OpenXML (PK\x03\x04)
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const tamanoKb = bytes.byteLength / 1024;
    expect(tamanoKb).toBeGreaterThan(1);
    expect(tamanoKb).toBeLessThan(100);
    expect(duracionMs).toBeLessThan(500);

    // Validar contenido real descomprimiendo el archivo
    const unzipped = unzipSync(bytes);
    expect(unzipped['[Content_Types].xml']).toBeDefined();
    expect(unzipped['xl/workbook.xml']).toBeDefined();
    expect(unzipped['xl/worksheets/sheet1.xml']).toBeDefined();

    const sheetXml = strFromU8(unzipped['xl/worksheets/sheet1.xml']);
    expect(sheetXml).toContain('Galpón A');
    expect(sheetXml).toContain('Gestación');
    expect(sheetXml).toContain('350.00');
    expect(sheetXml).toContain('001');
  });

  it('mide volumen y tiempo con muestra representativa de 300 animales', async () => {
    const muestra300 = generarMuestra(300);

    const t0Pdf = performance.now();
    const pdfBytes = await generarReportePdf({
      titulo: 'Cierre Mensual de Piara',
      granja: 'Granja San Luis',
      fechaEmision: '07/11/2026',
      items: muestra300,
    });
    const duracionPdf = performance.now() - t0Pdf;

    const t0Xlsx = performance.now();
    const xlsxBytes = generarReporteXlsx({
      nombreHoja: 'Cierre 300',
      items: muestra300,
    });
    const duracionXlsx = performance.now() - t0Xlsx;

    // Validación de límites técnicos medidos
    expect(pdfBytes.byteLength / 1024).toBeLessThan(500); // Menos de 500 KB para 12 páginas
    expect(xlsxBytes.byteLength / 1024).toBeLessThan(150); // Menos de 150 KB
    expect(duracionPdf).toBeLessThan(3000); // Menos de 3s en entorno de prueba
    expect(duracionXlsx).toBeLessThan(500); // Menos de 500ms
  });
});

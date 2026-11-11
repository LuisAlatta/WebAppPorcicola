import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModuloReportes } from '../src/components/ModuloReportes';
import { InformesProductivos } from '../src/components/InformesProductivos';
import { ModuloAlertas } from '../src/components/ModuloAlertas';

describe('Navegación de reportes y alertas', () => {
  it('conserva las cuatro etiquetas accesibles de reportes y el panel no usa tablas', () => {
    const html = renderToStaticMarkup(createElement(ModuloReportes, { perfil: 'administrador' }));
    expect(html).toContain('module-tabs');
    expect(html).toContain('Pestaña Panel General de estadísticas e indicadores');
    expect(html).toContain('Pestaña Informes Productivos: pesajes, partos y camadas');
    expect(html).toContain('Pestaña Diseñar Reporte: constructor personalizado de informes');
    expect(html).toContain('Pestaña Informes Guardados: 0 plantillas disponibles');
    expect(html).not.toContain('<table');
  });

  it('pesos y nacimientos son pestañas y conservan filtros accesibles', () => {
    const html = renderToStaticMarkup(createElement(InformesProductivos, { barns: [] }));
    expect(html).toContain('aria-label="Tipo de informe productivo"');
    expect(html).toContain('Pesajes y ganancia de peso');
    expect(html).toContain('Partos, camadas y mortalidad');
    expect(html).toContain('productive-report-barn');
    expect(html).not.toContain('id="productive-report-kind"');
  });

  it('solo administración ve reglas y se conservan las otras pestañas', () => {
    const admin = renderToStaticMarkup(createElement(ModuloAlertas, { perfil: 'administrador' }));
    const operator = renderToStaticMarkup(createElement(ModuloAlertas, { perfil: 'operario' }));
    expect(admin).toContain('Pestaña Reglas de Escalamiento crítico');
    expect(operator).not.toContain('Pestaña Reglas de Escalamiento crítico');
    expect(operator).toContain('Pestaña Agenda Operativa');
    expect(operator).toContain('Pestaña Notificaciones');
    expect(operator).toContain('Pestaña Crear Aviso operativo manual');
    expect(operator).not.toContain('<table');
  });
});

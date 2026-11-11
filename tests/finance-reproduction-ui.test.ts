import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModuloFinanzas } from '../src/components/ModuloFinanzas';
import { ModuloReproduccion } from '../src/components/ModuloReproduccion';

describe('Navegación de finanzas y reproducción', () => {
  it('conserva etiquetas de finanzas y ofrece registro solo a perfiles autorizados', () => {
    const admin = renderToStaticMarkup(createElement(ModuloFinanzas, { perfil: 'administrador' }));
    const viewer = renderToStaticMarkup(createElement(ModuloFinanzas, { perfil: 'veterinario' }));
    expect(admin).toContain('module-tabs');
    expect(admin).toContain('Pestaña Libro Financiero: ingresos, egresos y saldos pendientes');
    expect(admin).toContain('Pestaña Registrar Operación: nuevo ingreso o gasto distribuido');
    expect(viewer).not.toContain('Pestaña Registrar Operación');
    expect(admin).toContain('data-skeleton');
    expect(admin).not.toContain('Sin operaciones financieras en este rango');
    expect(admin).not.toContain('<table');
  });

  it('muestra la carga reproductiva y oculta registro al operario', () => {
    const html = renderToStaticMarkup(createElement(ModuloReproduccion, { perfil: 'operario' }));
    expect(html).toContain('Secciones del módulo reproductivo');
    expect(html).toContain('Cargando ciclos reproductivos');
    expect(html).toContain('data-skeleton');
    expect(html).not.toContain('Registrar servicio / Gestante');
    expect(html).not.toContain('Sin ciclos reproductivos para los filtros seleccionados');
  });
});

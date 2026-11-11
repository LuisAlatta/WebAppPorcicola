import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModuloConfiguracion } from '../src/components/ModuloConfiguracion';
import { ModuloAdministracion } from '../src/components/ModuloAdministracion';

describe('Navegación de configuración y administración', () => {
  it('ofrece cuatro pestañas y un esqueleto durante la carga de configuración', () => {
    const html = renderToStaticMarkup(createElement(ModuloConfiguracion));
    expect(html).toContain('aria-label="Secciones de configuración"');
    for (const label of ['Parámetros', 'Catálogos', 'Etapas y Raciones', 'Ubicaciones y Lotes']) expect(html).toContain(label);
    expect(html).toContain('data-skeleton');
    expect(html).not.toContain('<table');
  });
  it('separa la gestión completa del acceso específico por galpones', () => {
    const html = renderToStaticMarkup(createElement(ModuloAdministracion, { perfil: 'administrador', onNavigate: () => {} }));
    expect(html).toContain('aria-label="Secciones de administración"');
    for (const label of ['Usuarios', 'Galpones', 'Equipo operativo', 'Historial', 'Auditoría', 'Configuración']) expect(html).toContain(label);
    expect(html).toContain('role="tablist"');
  });
});

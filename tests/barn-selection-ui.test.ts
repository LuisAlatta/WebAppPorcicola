import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SelectorGalpones } from '../src/components/SelectorGalpones';
import { ModuloAdministracion } from '../src/components/ModuloAdministracion';
import type { Perfil } from '../src/types';

describe('Acceso a gestión desde Galpones', () => {
  it.each<Perfil>(['administrador', 'responsable', 'operario', 'veterinario'])('muestra gestión solo al administrador: %s', perfil => {
    const html = renderToStaticMarkup(createElement(SelectorGalpones, { perfil, selected: [], onContinue: () => {} }));
    expect(html.includes('Administrar galpones')).toBe(perfil === 'administrador');
    expect(html).toContain('<h1>Galpones</h1>');
    expect(html).toContain('Cargando galpones');
  });
  it('abre la gestión específica directamente en galpones y conserva personal e historial', () => {
    const html = renderToStaticMarkup(createElement(ModuloAdministracion, { perfil: 'administrador', barnsOnly: true, onNavigate: () => {} }));
    expect(html).toContain('Galpones e Instalaciones');
    expect(html).toContain('Nuevo Galpón');
    expect(html).toContain('Equipo operativo');
    expect(html).toContain('Historial');
    expect(html).not.toContain('Usuarios (');
    expect(html).not.toContain('Auditoría (');
  });
  it('no permite abrir la gestión con un perfil operativo', () => {
    const html = renderToStaticMarkup(createElement(ModuloAdministracion, { perfil: 'operario', barnsOnly: true, onNavigate: () => {} }));
    expect(html).toContain('Acceso denegado');
    expect(html).not.toContain('Nuevo Galpón');
  });
  it('ordena la gestión de galpones con barra, pestañas simétricas y estado vacío claro', () => {
    const html = renderToStaticMarkup(createElement(ModuloAdministracion, { perfil: 'administrador', barnsOnly: true, onNavigate: () => {} }));
    expect(html).toContain('admin-toolbar');
    expect(html).toContain('admin-tabs-compact');
    expect(html).toContain('admin-panel-header');
    expect(html).not.toContain('data-status=');
    expect(html).not.toContain('style="grid-column:span 2"');
  });
  it('presenta la carga con tarjetas provisionales y una acción de continuación clara', () => {
    const html = renderToStaticMarkup(createElement(SelectorGalpones, { perfil: 'responsable', selected: [], onContinue: () => {} }));
    expect(html).toContain('barn-selector-header');
    expect(html.match(/class="barn-option-skeleton"/g)).toHaveLength(4);
    expect(html).toContain('barn-selection-footer');
    expect(html).toContain('Preparando la selección');
    expect(html).toContain('disabled=""');
  });
});

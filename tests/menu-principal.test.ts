import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MenuPrincipal } from '../src/components/MenuPrincipal';
import type { Perfil } from '../src/types';

const render = (perfil: Perfil) => renderToStaticMarkup(createElement(MenuPrincipal, { perfil, onNavigate: () => {} }));

describe('Menú principal', () => {
  it('muestra ocho módulos con descripción y encabezado propio', () => {
    const html = render('operario');
    expect(html).toContain('menu-app-header');
    expect(html).toContain('Tu granja');
    expect(html.match(/class="menu-app-tile/g)).toHaveLength(8);
    expect(html).toContain('menu-tile-description');
    expect(html).toContain('Fichas, pesajes y padrón');
    expect(html).not.toContain('Configuración');
    expect(html).not.toContain('Administración');
  });

  it('añade configuración y administración solo al administrador', () => {
    const html = render('administrador');
    expect(html.match(/class="menu-app-tile/g)).toHaveLength(10);
    expect(html).toContain('Configuración');
    expect(html).toContain('Administración');
    expect(html).toContain('Parámetros de la granja');
  });
});

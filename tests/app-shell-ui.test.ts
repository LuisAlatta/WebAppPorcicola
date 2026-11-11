import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Navbar } from '../src/components/Navbar';
import { AnimalWorkspace } from '../src/components/AnimalWorkspace';

describe('Barra superior de aplicación', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('mantiene producto, módulo y cuenta en grupos independientes', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const html = renderToStaticMarkup(createElement(Navbar, { vistaActual: 'animales', perfilActual: 'administrador', usuario: 'encargado@granja.test', onNavigate: () => {}, onLogout: () => {} }));
    expect(html).toContain('Mi Granja PRO');
    expect(html).toContain('Padrón de Animales');
    expect(html).toContain('navbar-account');
    expect(html).toContain('encargado@granja.test');
    expect(html).toContain('aria-label="Cerrar sesión"');
    expect(html).not.toContain('>Salir<');
  });
  it('conserva el contenido de los enlaces directos cuando no son un modal', () => {
    const html = renderToStaticMarkup(createElement(AnimalWorkspace, { modal: false, title: 'Ficha', onClose: () => {}, busy: false, children: 'Contenido de la ficha' }));
    expect(html).toBe('Contenido de la ficha');
  });
});

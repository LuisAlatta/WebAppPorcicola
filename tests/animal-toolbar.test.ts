import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnimalToolbar } from '../src/components/AnimalToolbar';
import { availabilityForStatus } from '../src/utils/animal-filters';

describe('Cabecera compacta del padrón', () => {
  it('muestra nombres separados con bordes distintos y ambas acciones', () => {
    const html = renderToStaticMarkup(createElement(AnimalToolbar, { barns: ['Galpón 1', 'Galpón B'], onChangeBarns: () => {}, onRefresh: () => {}, loading: false }));
    expect(html).not.toContain('Galpones:');
    expect(html).toContain('Galpón 1</span>');
    expect(html).toContain('Galpón B</span>');
    expect(new Set([...html.matchAll(/--barn-hue:([^";]+)/g)].map(match => match[1])).size).toBe(2);
    expect(html).toContain('Cambiar galpones');
    expect(html).toContain('aria-label="Actualizar"');
  });
});

describe('Filtros compatibles con las salidas físicas', () => {
  it.each(['vendido', 'muerto', 'descartado'])('no cruza %s con solo activas', status => {
    expect(availabilityForStatus(status, '1')).toBe('');
    expect(availabilityForStatus(status, '0')).toBe('0');
  });
  it('conserva la disponibilidad para fichas activas y sin estado', () => {
    expect(availabilityForStatus('activo', '1')).toBe('1');
    expect(availabilityForStatus('', '0')).toBe('0');
  });
});

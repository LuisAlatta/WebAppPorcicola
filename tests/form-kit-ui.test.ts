import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormField, DataTable, DataCardNote } from '../src/components/ui';

describe('FormField', () => {
  it('reproduce el form-group con label y control', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Código', htmlFor: 'ani-code', children: createElement('input', { id: 'ani-code', className: 'form-input' }) }));
    expect(html).toBe('<div class="form-group"><label class="form-label" for="ani-code">Código</label><input id="ani-code" class="form-input"/></div>');
  });
  it('añade variantes de clase al form-group', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'X', className: 'form-span-2 mb-3', children: createElement('input', null) }));
    expect(html).toContain('<div class="form-group form-span-2 mb-3">');
  });
  it('renderiza error accesible y helper con sus ids', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Código', htmlFor: 'ani-code', error: 'Requerido', errorId: 'ani-code-error', helper: 'Se conserva tal cual', helperId: 'ani-code-helper', children: createElement('input', { id: 'ani-code' }) }));
    expect(html).toContain('<p id="ani-code-error" class="field-error-message" role="alert">');
    expect(html).toContain('<span>Requerido</span>');
    expect(html).toContain('<p id="ani-code-helper" class="form-helper">Se conserva tal cual</p>');
  });
  it('omite label, error y helper cuando no se pasan', () => {
    const html = renderToStaticMarkup(createElement(FormField, { children: createElement('input', null) }));
    expect(html).toBe('<div class="form-group"><input/></div>');
  });
});

describe('DataTable', () => {
  it('reproduce el shell table-responsive + data-table con aria-label', () => {
    const html = renderToStaticMarkup(createElement(DataTable, { label: 'Padrón de animales', children: createElement('thead', null, createElement('tr', null, createElement('th', null, 'Código'))) }));
    expect(html).toBe('<div class="table-responsive"><table class="data-table" aria-label="Padrón de animales"><thead><tr><th>Código</th></tr></thead></table></div>');
  });
  it('añade clase al wrapper y omite aria-label si no se pasa', () => {
    const html = renderToStaticMarkup(createElement(DataTable, { className: 'mb-4', children: createElement('tbody', null) }));
    expect(html).toBe('<div class="table-responsive mb-4"><table class="data-table"><tbody></tbody></table></div>');
  });
});

describe('DataCardNote', () => {
  it('renderiza un p data-card-note sin clase extra por defecto', () => {
    const html = renderToStaticMarkup(createElement(DataCardNote, { children: 'Nota' }));
    expect(html).toBe('<p class="data-card-note">Nota</p>');
  });
  it('añade className preservando el tag p', () => {
    const html = renderToStaticMarkup(createElement(DataCardNote, { className: 'font-mono mb-3', children: 'Nota' }));
    expect(html).toBe('<p class="data-card-note font-mono mb-3">Nota</p>');
  });
});
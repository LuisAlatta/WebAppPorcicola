import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormField, DataTable, DataCardNote } from '../src/components/ui';
import { SearchField } from '../src/components/ui/SearchField';
import { AnimalPicker } from '../src/components/AnimalPicker';

describe('FormField', () => {
  it('integra el título en el borde conservando la etiqueta del control', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Código', htmlFor: 'ani-code', children: createElement('input', { id: 'ani-code', className: 'form-input' }) }));
    expect(html).toBe('<div class="form-group"><fieldset class="field-outline"><legend><label class="form-label" for="ani-code">Código</label></legend><div class="field-control"><input id="ani-code" class="form-input"/></div></fieldset></div>');
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
  it('asocia automáticamente la etiqueta a un control sin id', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Galpón', children: createElement('select', { disabled: true }, createElement('option', null, 'A')) }));
    const id = html.match(/<label[^>]*for="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('<select disabled=""');
  });
  it('asigna el id explícito al input cuando no lo tenía', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Raza', htmlFor: 'breed', children: createElement('input', { required: true }) }));
    expect(html).toContain('for="breed"');
    expect(html).toContain('id="breed"');
    expect(html).toContain('required=""');
  });
  it('conserva el id existente y admite títulos largos y áreas de texto', () => {
    const html = renderToStaticMarkup(createElement(FormField, { label: 'Motivo detallado de la corrección', children: createElement('textarea', { id: 'reason', rows: 3, defaultValue: 'Dato existente' }) }));
    expect(html).toContain('for="reason"');
    expect(html).toContain('<textarea id="reason" rows="3"');
    expect(html).toContain('Dato existente</textarea>');
  });
});

describe('Campos compartidos con título integrado', () => {
  it('aplica el borde con título al buscador conservando su icono y valor', () => {
    const html = renderToStaticMarkup(createElement(SearchField, { label: 'Buscar alimento', placeholder: 'Código o nombre', value: 'Maíz', onChange: () => {} }));
    expect(html).toContain('<fieldset class="field-outline">');
    expect(html).toContain('Buscar alimento</label></legend>');
    expect(html).toContain('class="search-icon"');
    expect(html).toContain('value="Maíz"');
  });
  it('aplica el mismo componente a la búsqueda y selección de progenitores', () => {
    const html = renderToStaticMarkup(createElement(AnimalPicker, { label: 'Madre interna', searchLabel: 'Buscar madre interna', value: [], onChange: () => {} }));
    expect(html.match(/class="field-outline"/g)).toHaveLength(2);
    expect(html).toContain('Buscar madre interna</label></legend>');
    expect(html).toContain('Madre interna</label></legend>');
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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

describe('Radio global de botones', () => {
  it('usa el mismo radio de 12 px que los campos', () => {
    expect(css).toContain('--radius-ui: 0.75rem;');
    expect(css).toContain('--radius-lg: var(--radius-ui);');
    expect(css).toMatch(/\.field-outline\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/);
    expect(css).toMatch(/button,\s*\.btn,\s*\[role="button"\],\s*input\[type="button"\],\s*input\[type="submit"\],\s*input\[type="reset"\]\s*\{\s*border-radius:\s*var\(--radius-ui\) !important;/);
  });
  it('centraliza todos los tamaños anteriores en una sola variable', () => {
    for (const size of ['sm', 'md', 'lg']) {
      expect(css).toContain(`--radius-${size}: var(--radius-ui);`);
    }
    expect(css.match(/--radius-ui\s*:/g)).toHaveLength(1);
    expect(css).toMatch(/\.card\s*\{[^}]*border-radius:\s*var\(--radius-md\)/);
    expect(css).toMatch(/\.data-card\s*\{[^}]*border-radius:\s*var\(--radius-md\)/);
    expect(css).toMatch(/\.table-responsive\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/);
  });
  it('solo conserva valores fijos para círculos, checkboxes y barras de desplazamiento', () => {
    const values = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map(match => match[1]);
    for (const value of values) {
      expect(value.startsWith('var(--radius-') || ['3px', '4px', '50%', '999px'].includes(value)).toBe(true);
    }
    expect(css).toContain('border-radius: var(--radius-ui) var(--radius-ui) 0 0;');
  });
});

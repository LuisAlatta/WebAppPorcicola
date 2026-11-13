import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

describe('Radio global de botones', () => {
  it('usa el mismo radio de 12 px que los campos', () => {
    expect(css).toContain('--radius-lg: 0.75rem;');
    expect(css).toMatch(/\.field-outline\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/);
    expect(css).toMatch(/button,\s*\.btn,\s*\[role="button"\],\s*input\[type="button"\],\s*input\[type="submit"\],\s*input\[type="reset"\]\s*\{\s*border-radius:\s*var\(--radius-lg\) !important;/);
  });
});

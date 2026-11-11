import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBarnIds } from '../worker/barn-scope';
import { installBarnScopeFetch, setSelectedBarnIds } from '../src/utils/barn-scope';

describe('Selección múltiple de galpones', () => {
  it('admite uno o varios galpones sin duplicados', () => {
    expect(parseBarnIds('1,3,1')).toEqual([1, 3]);
    expect(parseBarnIds('2')).toEqual([2]);
  });
  it.each(['', '0', '-1', '1,', '1.2', '1,otro', '9007199254740992'])('rechaza una selección inválida: %s', value => {
    expect(() => parseBarnIds(value)).toThrow('Selección de galpones inválida');
  });
});

describe('Alcance enviado al servidor', () => {
  afterEach(() => { vi.unstubAllGlobals(); setSelectedBarnIds([]); });
  it('envía los galpones a módulos y exportaciones, sin modificar autenticación ni URLs externas', async () => {
    const original = vi.fn().mockResolvedValue(new Response('{}'));
    const windowMock = { fetch: original, location: { origin: 'https://granja.test' } };
    vi.stubGlobal('window', windowMock);
    installBarnScopeFetch();
    setSelectedBarnIds([1, 3]);
    await windowMock.fetch('/api/animals', { headers: { 'Content-Type': 'application/json' } });
    expect(new Headers(original.mock.calls[0][1].headers).get('X-Barn-Ids')).toBe('1,3');
    expect(new Headers(original.mock.calls[0][1].headers).get('Content-Type')).toBe('application/json');
    await windowMock.fetch('/api/reports/export', { method: 'POST' });
    expect(new Headers(original.mock.calls[1][1].headers).get('X-Barn-Ids')).toBe('1,3');
    for (const url of ['/api/auth/me', '/api/barns', '/api/config', '/api/admin/barns', 'https://externo.test/api/animals']) {
      await windowMock.fetch(url);
      expect(original.mock.calls.at(-1)?.[1]).toBeUndefined();
    }
    setSelectedBarnIds([]);
    await windowMock.fetch('/api/animals');
    expect(original.mock.calls.at(-1)?.[1]).toBeUndefined();
  });
});

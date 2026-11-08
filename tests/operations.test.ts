import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOperation } from '../src/utils/operations';

const request = (payload: Record<string, unknown>): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
afterEach(() => vi.unstubAllGlobals());

describe('Reintentos online de formularios · T28', () => {
  it('confirma una sola operación si se perdió la respuesta y el formulario reenvía una clave recién creada', async () => {
    const committed = new Map<string, number>();
    const keys: string[] = [];
    let loseResponse = true;
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { operationKey: string };
      keys.push(body.operationKey);
      if (!committed.has(body.operationKey)) committed.set(body.operationKey, committed.size + 1);
      if (loseResponse) { loseResponse = false; throw new TypeError('Respuesta perdida después del commit'); }
      return Response.json({ ok: true, id: committed.get(body.operationKey) });
    }));
    await expect(fetchOperation('/api/test/response-lost', request({ amount: '100.00', barnId: 1, operationKey: 'primera-clave' }))).rejects.toThrow('No se pudo confirmar');
    const replay = await fetchOperation('/api/test/response-lost', request({ operationKey: 'otra-clave-generada', barnId: 1, amount: '100.00' }));
    expect(await replay.json()).toMatchObject({ ok: true, id: 1 });
    expect(keys).toEqual(['primera-clave', 'primera-clave']);
    expect(committed.size).toBe(1);
    await fetchOperation('/api/test/response-lost', request({ amount: '100.00', barnId: 1, operationKey: 'nuevo-evento-confirmado' }));
    expect(committed.size).toBe(2);
  });

  it('no reutiliza la clave de un payload incierto si cambian cantidad o destino', async () => {
    const keys: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init: RequestInit) => { keys.push((JSON.parse(String(init.body)) as { operationKey: string }).operationKey); throw new TypeError('Sin respuesta'); }));
    await expect(fetchOperation('/api/test/changed', request({ quantityKg: 12, barnId: 1, operationKey: 'cantidad-12' }))).rejects.toThrow('No se pudo confirmar');
    await expect(fetchOperation('/api/test/changed', request({ quantityKg: 13, barnId: 1, operationKey: 'cantidad-13' }))).rejects.toThrow('No se pudo confirmar');
    await expect(fetchOperation('/api/test/changed', request({ quantityKg: 12, barnId: 1, operationKey: 'nueva-innecesaria' }))).rejects.toThrow('No se pudo confirmar');
    expect(keys).toEqual(['cantidad-12', 'cantidad-13', 'cantidad-12']);
  });

  it('no envía ni confirma guardado cuando el dispositivo informa que está sin conexión', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('navigator', { onLine: false });
    await expect(fetchOperation('/api/test/offline', request({ quantityKg: 12 }))).rejects.toThrow('Este intento no se envió');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantiene el intento cuando recibe una cabecera de éxito pero el JSON quedó interrumpido', async () => {
    const keys: string[] = []; let first = true;
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init: RequestInit) => { keys.push((JSON.parse(String(init.body)) as { operationKey: string }).operationKey); if (first) { first = false; return new Response('{"ok":', { status: 200 }); } return Response.json({ ok: true }); }));
    await expect(fetchOperation('/api/test/body-lost', request({ amount: '30.00', operationKey: 'conservar' }))).rejects.toThrow('No se pudo confirmar');
    await fetchOperation('/api/test/body-lost', request({ amount: '30.00', operationKey: 'descartar' }));
    expect(keys).toEqual(['conservar', 'conservar']);
  });
});

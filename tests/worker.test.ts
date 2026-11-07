import { describe, expect, it } from 'vitest';
import worker from '../worker/index';

describe('API', () => {
  it('responde con un error claro a rutas no disponibles', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/desconocida'),
      { DB: {} as unknown as D1Database },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Ruta no encontrada' });
  });
});

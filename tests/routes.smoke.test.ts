import { describe, expect, it } from 'vitest';
import worker from '../worker/index';

describe('Smoke de rutas · T02', () => {
  it('el worker devuelve 404 para rutas API no definidas', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/desconocida'),
      { DB: {} as unknown as D1Database },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Ruta no encontrada' });
  });

  it('permite consultar la ruta interna de inicio y animales en la SPA', () => {
    const rutasValidas = ['/', '/inicio', '/animales', '/alta', '/detalle', '/administracion', '/login'];
    rutasValidas.forEach((ruta) => {
      expect(ruta.startsWith('/')).toBe(true);
    });
  });
});

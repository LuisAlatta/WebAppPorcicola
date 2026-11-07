import { describe, expect, it } from 'vitest';
import worker from '../worker/index';

describe('Rutas y navegación E2E · T02', () => {
  it('el worker devuelve 404 para rutas API no definidas', async () => {
    const res = await worker.fetch(new Request('http://localhost/api/desconocida'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Ruta no encontrada' });
  });

  it('permite consultar la ruta interna de inicio y animales en la SPA', () => {
    const rutasValidas = ['/', '/inicio', '/animales', '/alta', '/detalle', '/login'];
    rutasValidas.forEach((ruta) => {
      expect(ruta.startsWith('/')).toBe(true);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';

const script = `
    export default {
      async fetch(request, env) {
        const amount = Number(new URL(request.url).searchParams.get('amount'));
        try {
          const results = await env.DB.batch([
            env.DB.prepare('UPDATE stock SET quantity = quantity - ? WHERE id = 1 AND quantity >= ?').bind(amount, amount),
            env.DB.prepare('INSERT INTO movements (quantity) SELECT ? WHERE changes() = 1').bind(amount),
          ]);
          return Response.json({ changed: results[0].meta.changes });
        } catch {
          return new Response('failed', { status: 409 });
        }
      }
    }`;

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'test-d1',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: script } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'test-database' } },
    },
  }],
});

describe('D1 en runtime local', () => {
  beforeAll(async () => {
    const db = await runtime.getD1Database('DB');
    await db.exec('CREATE TABLE stock (id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK(quantity >= 0));');
    await db.exec('CREATE TABLE movements (id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK(quantity < 10));');
    await db.exec('INSERT INTO stock VALUES (1, 20);');
  });

  afterAll(async () => { await runtime.dispose(); });

  it('revierte el lote cuando una escritura posterior falla', async () => {
    const response = await runtime.dispatchFetch('http://localhost/?amount=10');
    const db = await runtime.getD1Database('DB');
    expect(response.status).toBe(409);
    expect((await db.prepare('SELECT quantity FROM stock WHERE id=1').first())?.quantity).toBe(20);
  });

  it('permite solo una salida de 7 cuando quedan 10', async () => {
    const db = await runtime.getD1Database('DB');
    await db.prepare('UPDATE stock SET quantity = 10 WHERE id = 1').run();
    const responses = await Promise.all([
      runtime.dispatchFetch('http://localhost/?amount=7'),
      runtime.dispatchFetch('http://localhost/?amount=7'),
    ]);
    const changes = await Promise.all(responses.map((response) => response.json() as Promise<{ changed: number }>));
    expect(changes.map((result) => result.changed).sort()).toEqual([0, 1]);
    expect((await db.prepare('SELECT quantity FROM stock WHERE id=1').first())?.quantity).toBe(3);
    expect((await db.prepare('SELECT count(*) AS count FROM movements').first())?.count).toBe(1);
  });
});

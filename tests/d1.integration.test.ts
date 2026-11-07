import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';

const script = `
    export default {
      async fetch(request, env) {
        const url = new URL(request.url);
        const amount = Number(url.searchParams.get('amount') || 0);
        const idemKey = url.searchParams.get('idem_key');

        if (idemKey) {
          // Manejo de idempotencia y reintentos ante pérdida de respuesta
          const existing = await env.DB.prepare('SELECT payload_hash, response FROM idempotency_keys WHERE key = ?')
            .bind(idemKey)
            .first();

          if (existing) {
            const expectedHash = 'amount=' + amount;
            if (existing.payload_hash !== expectedHash) {
              return Response.json({ error: 'Conflicto: misma clave con datos diferentes' }, { status: 409 });
            }
            return new Response(existing.response, {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'X-Idempotent-Replay': 'true' },
            });
          }

          // Ejecución atómica con registro de clave de evento
          try {
            const responseBody = JSON.stringify({ ok: true, amount, key: idemKey });
            await env.DB.batch([
              env.DB.prepare('INSERT INTO idempotency_keys (key, payload_hash, response) VALUES (?, ?, ?)')
                .bind(idemKey, 'amount=' + amount, responseBody),
              env.DB.prepare('UPDATE stock SET quantity = quantity - ? WHERE id = 1 AND quantity >= ?')
                .bind(amount, amount),
              env.DB.prepare('INSERT INTO movements (quantity) SELECT ? WHERE changes() = 1')
                .bind(amount),
            ]);
            return new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json' } });
          } catch {
            return new Response('failed', { status: 409 });
          }
        }

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
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec('CREATE TABLE stock (id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK(quantity >= 0));');
    await db.exec('CREATE TABLE movements (id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK(quantity < 10));');
    await db.exec('CREATE TABLE animals (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);');
    await db.exec('CREATE TABLE weights (id INTEGER PRIMARY KEY, animal_id INTEGER NOT NULL REFERENCES animals(id), weight INTEGER NOT NULL CHECK(weight > 0));');
    await db.exec('CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, response TEXT NOT NULL);');
    await db.exec('CREATE INDEX weights_by_animal ON weights(animal_id);');
    await db.exec('INSERT INTO stock VALUES (1, 20);');
  });

  afterAll(async () => { await runtime.dispose(); });

  it('aplica restricciones de identidad, referencia y peso', async () => {
    const db = await runtime.getD1Database('DB');
    await db.prepare('INSERT INTO animals VALUES (?, ?)').bind(1, '002').run();
    await expect(db.prepare('INSERT INTO animals VALUES (?, ?)').bind(2, '002').run()).rejects.toThrow();
    await expect(db.prepare('INSERT INTO weights VALUES (?, ?, ?)').bind(1, 99, 10).run()).rejects.toThrow();
    await expect(db.prepare('INSERT INTO weights VALUES (?, ?, ?)').bind(2, 1, 0).run()).rejects.toThrow();
    await db.prepare('INSERT INTO weights VALUES (?, ?, ?)').bind(3, 1, 10).run();
    const rows = await db.prepare('SELECT weight FROM weights WHERE animal_id = ?').bind(1).all();
    expect(rows.results).toHaveLength(1);
    const plan = await db.prepare('EXPLAIN QUERY PLAN SELECT weight FROM weights WHERE animal_id = ?').bind(1).all();
    expect(JSON.stringify(plan.results)).toContain('weights_by_animal');
  });

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

  it('soporta reintentos idempotentes tras pérdida de respuesta sin duplicar efectos', async () => {
    const db = await runtime.getD1Database('DB');
    await db.prepare('UPDATE stock SET quantity = 20 WHERE id = 1').run();

    // Primer intento con clave única
    const res1 = await runtime.dispatchFetch('http://localhost/?amount=4&idem_key=EVT-PART-001');
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as { ok: boolean; amount: number; key: string };
    expect(body1.ok).toBe(true);
    expect((await db.prepare('SELECT quantity FROM stock WHERE id = 1').first())?.quantity).toBe(16);

    // Reintento idéntico simulando reconexión tras pérdida de red
    const res2 = await runtime.dispatchFetch('http://localhost/?amount=4&idem_key=EVT-PART-001');
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-Idempotent-Replay')).toBe('true');
    const body2 = await res2.json() as { ok: boolean; amount: number; key: string };
    expect(body2).toEqual(body1);

    // El stock no debe haberse descontado dos veces
    expect((await db.prepare('SELECT quantity FROM stock WHERE id = 1').first())?.quantity).toBe(16);

    // Reintento con misma clave pero datos conflictivos debe ser rechazado
    const resConflict = await runtime.dispatchFetch('http://localhost/?amount=8&idem_key=EVT-PART-001');
    expect(resConflict.status).toBe(409);
    const conflictBody = await resConflict.json() as { error: string };
    expect(conflictBody.error).toContain('Conflicto');
  });

  it('ejecuta migraciones secuenciales sobre D1 preservando integridad y datos previos', async () => {
    const db = await runtime.getD1Database('DB');

    // Tabla de control de versiones de migraciones
    await db.exec('CREATE TABLE IF NOT EXISTS _d1_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);');

    // Migración 1: tabla inicial de galpones
    await db.exec('CREATE TABLE barns (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);');
    await db.exec("INSERT INTO barns (id, code, name) VALUES (1, 'G-A', 'Galpón A');");
    await db.exec("INSERT INTO _d1_migrations (version, name, applied_at) VALUES (1, '0001_create_barns', '2026-11-07T12:00:00Z');");

    // Migración 2: evolución de esquema añadiendo capacidad y corrales dependientes
    await db.exec('ALTER TABLE barns ADD COLUMN capacity INTEGER NOT NULL DEFAULT 80;');
    await db.exec('CREATE TABLE pens (id INTEGER PRIMARY KEY, barn_id INTEGER NOT NULL REFERENCES barns(id) ON DELETE RESTRICT, code TEXT NOT NULL, UNIQUE(barn_id, code));');
    await db.exec("INSERT INTO pens (id, barn_id, code) VALUES (1, 1, 'Corral A1');");
    await db.exec("INSERT INTO pens (id, barn_id, code) VALUES (2, 1, 'Corral A2');");
    await db.exec("INSERT INTO _d1_migrations (version, name, applied_at) VALUES (2, '0002_add_pens', '2026-11-07T12:05:00Z');");

    // Verificar que los datos previos subsisten y el nuevo esquema funciona
    const barn = await db.prepare('SELECT * FROM barns WHERE id = 1').first() as { id: number; code: string; capacity: number };
    expect(barn.code).toBe('G-A');
    expect(barn.capacity).toBe(80);

    const pens = await db.prepare('SELECT count(*) as count FROM pens WHERE barn_id = 1').first() as { count: number };
    expect(pens.count).toBe(2);

    // Verificar clave foránea en la migración: insertar corral para galpón inexistente debe fallar
    await expect(db.prepare('INSERT INTO pens (id, barn_id, code) VALUES (?, ?, ?)').bind(3, 999, 'Corral X').run()).rejects.toThrow();

    // Comprobar registro ordenado de versiones
    const migrations = await db.prepare('SELECT version FROM _d1_migrations ORDER BY version ASC').all();
    expect(migrations.results.map((m: Record<string, unknown>) => m.version)).toEqual([1, 2]);
  });
});

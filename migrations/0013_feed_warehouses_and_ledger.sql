-- T15: almacenes de alimento, lotes valorizados y movimientos auditables.
CREATE TABLE IF NOT EXISTS feed_warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  barn_id INTEGER REFERENCES barns(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO feed_warehouses (id,code,name,location,barn_id,is_active,created_by_user_id,created_at)
  VALUES (1,'ALM-PRINCIPAL','Almacén principal',NULL,NULL,1,NULL,'2026-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS feed_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL UNIQUE REFERENCES operation_log(id),
  warehouse_id INTEGER NOT NULL REFERENCES feed_warehouses(id),
  movement_type TEXT NOT NULL CHECK(movement_type IN ('opening','purchase','return_in','delivery','waste','return_supplier')),
  effective_date TEXT NOT NULL,
  feed_code TEXT NOT NULL,
  lot_code TEXT NOT NULL,
  supplier TEXT,
  quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
  stock_delta_kg REAL NOT NULL,
  unit_cost_minor INTEGER NOT NULL CHECK(unit_cost_minor >= 0),
  total_cost_minor INTEGER NOT NULL CHECK(total_cost_minor >= 0),
  destination_barn_id INTEGER REFERENCES barns(id),
  animal_id INTEGER REFERENCES animals(id),
  reason TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK((movement_type IN ('opening','purchase','return_in') AND stock_delta_kg > 0)
     OR (movement_type IN ('delivery','waste','return_supplier') AND stock_delta_kg < 0)),
  CHECK((movement_type='delivery' AND destination_barn_id IS NOT NULL)
     OR (movement_type<>'delivery' AND destination_barn_id IS NULL AND animal_id IS NULL)),
  CHECK(animal_id IS NULL OR destination_barn_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_feed_movements_stock ON feed_movements(warehouse_id,feed_code,lot_code,effective_date,id);
CREATE INDEX IF NOT EXISTS idx_feed_movements_reporting ON feed_movements(effective_date,destination_barn_id,movement_type);
CREATE TABLE IF NOT EXISTS feed_stock_guard (
  guard_id INTEGER NOT NULL CHECK(guard_id >= 0)
);

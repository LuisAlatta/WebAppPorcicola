-- Migración 0005: inventario individual y colectivo (T08 · INV-01..INV-03)
--
-- Cada fila es un movimiento inmutable de cabezas. Las categorías son
-- excluyentes: saldo inicial, compra, nacimiento, venta, muerte, traslado
-- recibido, traslado enviado y ajuste. Los traslados internos se registran como
-- dos filas del mismo grupo para que se cancelen en el total de la granja.
--
-- quantity es siempre positivo salvo en los ajustes, donde el signo indica la
-- dirección. La fecha efectiva permite reconstruir existencias a cualquier fecha.

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT REFERENCES operation_log(id),
  movement_type TEXT NOT NULL CHECK(movement_type IN (
    'initial', 'purchase', 'birth', 'sale', 'death', 'transfer_in', 'transfer_out', 'adjustment'
  )),
  effective_date TEXT NOT NULL,
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  stage_code TEXT NOT NULL,
  sex TEXT NOT NULL CHECK(sex IN ('macho', 'hembra', 'pendiente')),
  quantity INTEGER NOT NULL CHECK(
    (movement_type = 'adjustment' AND quantity <> 0)
    OR (movement_type <> 'adjustment' AND quantity > 0)
  ),
  cause_code TEXT,
  transfer_group_id TEXT,
  notes TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_date
  ON inventory_movements(effective_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_bucket
  ON inventory_movements(barn_id, location_code, lot_code, stage_code, sex, effective_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_stage
  ON inventory_movements(stage_code, effective_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_transfer
  ON inventory_movements(transfer_group_id);

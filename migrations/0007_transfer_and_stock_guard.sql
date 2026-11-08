-- Migración 0007: traslados y garantía de saldos bajo concurrencia (T10).

-- Fila temporal dentro del lote de D1. El CHECK convierte la revalidación del
-- saldo en un fallo atómico si otra escritura consumió las cabezas primero.
CREATE TABLE IF NOT EXISTS inventory_write_guard (
  guard_id INTEGER NOT NULL CHECK (guard_id >= 0)
);

-- Conteos físicos y diferencias aprobadas, asociados al ajuste del libro.
CREATE TABLE IF NOT EXISTS inventory_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL REFERENCES operation_log(id),
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  stage_code TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('macho', 'hembra', 'pendiente')),
  effective_date TEXT NOT NULL,
  expected_heads INTEGER NOT NULL CHECK (expected_heads >= 0),
  counted_heads INTEGER NOT NULL CHECK (counted_heads >= 0),
  variance INTEGER NOT NULL,
  adjustment_movement_id INTEGER REFERENCES inventory_movements(id),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (variance = counted_heads - expected_heads)
);

CREATE INDEX IF NOT EXISTS idx_inventory_reconciliations_bucket
  ON inventory_reconciliations(barn_id, location_code, lot_code, stage_code, sex, effective_date);

-- Enlaza un evento de corrección con la fila original sin modificarla.
ALTER TABLE inventory_movements ADD COLUMN reverses_movement_id INTEGER REFERENCES inventory_movements(id);

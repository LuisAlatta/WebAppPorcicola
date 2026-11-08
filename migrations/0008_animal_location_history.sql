-- Migración 0008: ubicación histórica de cada ficha identificada (T10).
CREATE TABLE IF NOT EXISTS animal_location_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id INTEGER NOT NULL REFERENCES animals(id),
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  stage_code TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  operation_log_id TEXT REFERENCES operation_log(id),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_location_current
  ON animal_location_history(animal_id) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_animal_location_asof
  ON animal_location_history(valid_from, valid_until, barn_id, location_code, lot_code, stage_code);

-- Hasta T10 no existían traslados de fichas; el último dato vigente sirve como
-- ubicación inicial del historial y se conserva desde la fecha de ingreso.
INSERT INTO animal_location_history
  (animal_id, barn_id, location_code, lot_code, stage_code, valid_from, valid_until, operation_log_id, created_by_user_id, created_at)
SELECT a.id, a.barn_id, a.location_code, a.lot_code, a.current_stage_code, a.entry_date, NULL, NULL,
  a.created_by_user_id, a.created_at
FROM animals a
WHERE NOT EXISTS (SELECT 1 FROM animal_location_history h WHERE h.animal_id = a.id);

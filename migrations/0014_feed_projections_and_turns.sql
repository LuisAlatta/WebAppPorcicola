-- T16: turnos de alimentación enlazados a la única salida real del almacén.
CREATE TABLE IF NOT EXISTS feed_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL UNIQUE REFERENCES operation_log(id),
  feed_movement_id INTEGER NOT NULL UNIQUE REFERENCES feed_movements(id),
  effective_date TEXT NOT NULL,
  shift_code TEXT NOT NULL CHECK(shift_code IN ('manana','tarde','noche')),
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  stage_code TEXT NOT NULL,
  feed_code TEXT NOT NULL,
  lot_code TEXT NOT NULL,
  planned_kg REAL NOT NULL CHECK(planned_kg >= 0),
  served_kg REAL NOT NULL CHECK(served_kg > 0),
  consumed_kg REAL CHECK(consumed_kg IS NULL OR (consumed_kg >= 0 AND consumed_kg <= served_kg)),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_turns_group ON feed_turns(effective_date,barn_id,stage_code);

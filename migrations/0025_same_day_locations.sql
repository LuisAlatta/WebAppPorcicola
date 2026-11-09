-- Conserva los cambios sucesivos del mismo día; el estado al cierre del día
-- corresponde al único intervalo abierto y los anteriores quedan auditados.
CREATE TABLE animal_location_history_new (
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
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
INSERT INTO animal_location_history_new SELECT * FROM animal_location_history;
DROP TABLE animal_location_history;
ALTER TABLE animal_location_history_new RENAME TO animal_location_history;
CREATE UNIQUE INDEX uq_animal_location_current ON animal_location_history(animal_id) WHERE valid_until IS NULL;
CREATE INDEX idx_animal_location_asof ON animal_location_history(valid_from,valid_until,barn_id,location_code,lot_code,stage_code);

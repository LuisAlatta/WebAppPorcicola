-- Permite registrar el descarte sin clasificarlo como muerte o adopción.
CREATE TABLE litter_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL REFERENCES operation_log(id),
  litter_id TEXT NOT NULL REFERENCES litters(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('death','weaning','adoption_in','adoption_out','discard','sale','sale_return')),
  effective_date TEXT NOT NULL,
  sex TEXT NOT NULL CHECK(sex IN ('macho','hembra','pendiente')),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  destination_litter_id TEXT REFERENCES litters(id),
  destination_stage_code TEXT,
  destination_barn_id INTEGER REFERENCES barns(id),
  destination_location_code TEXT,
  destination_lot_code TEXT,
  weight_kg REAL CHECK(weight_kg IS NULL OR weight_kg > 0),
  cause TEXT,
  reason TEXT NOT NULL,
  observations TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
INSERT INTO litter_events_new SELECT * FROM litter_events;
DROP TABLE litter_events;
ALTER TABLE litter_events_new RENAME TO litter_events;
CREATE INDEX idx_litter_events_balance ON litter_events(litter_id,sex,effective_date);

-- T17: historial sanitario individual/grupal, composición histórica y retiros.
CREATE TABLE IF NOT EXISTS health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL UNIQUE REFERENCES operation_log(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('treatment','deworming','other','death')),
  effective_date TEXT NOT NULL,
  product TEXT,
  product_lot TEXT,
  dosage REAL,
  dosage_unit TEXT,
  next_due_date TEXT,
  withdrawal_until TEXT,
  cause_code TEXT,
  inventory_movement_id INTEGER UNIQUE REFERENCES inventory_movements(id),
  observations TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_event_animals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  health_event_id INTEGER NOT NULL REFERENCES health_events(id),
  animal_id INTEGER NOT NULL REFERENCES animals(id),
  animal_code_snapshot TEXT NOT NULL,
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  barn_name_snapshot TEXT NOT NULL,
  location_code_snapshot TEXT,
  lot_code_snapshot TEXT,
  stage_code_snapshot TEXT NOT NULL,
  withdrawal_until TEXT,
  UNIQUE(health_event_id,animal_id)
);
CREATE INDEX IF NOT EXISTS idx_health_event_animals_animal ON health_event_animals(animal_id,health_event_id);
CREATE INDEX IF NOT EXISTS idx_health_events_date ON health_events(effective_date,event_type);
ALTER TABLE inventory_movements ADD COLUMN health_event_id INTEGER REFERENCES health_events(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movement_health_event ON inventory_movements(health_event_id) WHERE health_event_id IS NOT NULL;

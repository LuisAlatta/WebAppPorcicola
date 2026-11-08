-- T14: eventos de lactancia y plan de celo/repeticiones por ciclo.
CREATE TABLE IF NOT EXISTS litter_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL REFERENCES operation_log(id),
  litter_id TEXT NOT NULL REFERENCES litters(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('death','weaning','adoption_in','adoption_out')),
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
CREATE INDEX IF NOT EXISTS idx_litter_events_balance ON litter_events(litter_id,sex,effective_date);
CREATE TABLE IF NOT EXISTS litter_event_guard (
  guard_id INTEGER NOT NULL CHECK(guard_id >= 0)
);
CREATE TABLE IF NOT EXISTS reproduction_weaning_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL UNIQUE REFERENCES reproduction_cycles(id),
  reference_weaning_date TEXT NOT NULL,
  heat_interval_days INTEGER NOT NULL CHECK(heat_interval_days > 0),
  first_repeat_interval_days INTEGER NOT NULL CHECK(first_repeat_interval_days > 0),
  second_repeat_interval_days INTEGER NOT NULL CHECK(second_repeat_interval_days > 0),
  expected_heat_date TEXT NOT NULL,
  expected_first_repeat_date TEXT NOT NULL,
  expected_second_repeat_date TEXT NOT NULL,
  actual_heat_date TEXT,
  actual_first_repeat_date TEXT,
  actual_second_repeat_date TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);

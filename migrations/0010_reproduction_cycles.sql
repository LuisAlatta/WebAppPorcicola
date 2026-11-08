-- Ciclos reproductivos y eventos históricos (T12).
INSERT OR IGNORE INTO catalog_versions
  (catalog_key, item_code, name, sort_order, effective_from, created_at)
VALUES ('tipo_servicio', 'transferencia_embriones', 'Transferencia de embriones', 3,
  '2026-01-01', '2026-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS reproduction_cycles (
  id TEXT PRIMARY KEY,
  female_animal_id INTEGER NOT NULL REFERENCES animals(id),
  cycle_number INTEGER NOT NULL,
  cycle_status TEXT NOT NULL DEFAULT 'open' CHECK(cycle_status IN ('open', 'aborted', 'farrowed', 'closed')),
  reproductive_status TEXT NOT NULL DEFAULT 'possible_pregnancy'
    CHECK(reproductive_status IN ('empty', 'possible_pregnancy', 'gestation', 'abortion')),
  cycle_opened_on TEXT NOT NULL,
  service_anchor_date TEXT,
  gestation_days INTEGER NOT NULL CHECK(gestation_days > 0 AND gestation_days <= 150),
  probable_farrowing_date TEXT NOT NULL,
  due_date_source TEXT NOT NULL DEFAULT 'calculated' CHECK(due_date_source IN ('calculated', 'manual', 'antecedent')),
  due_date_reason TEXT,
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  female_breed_snapshot TEXT,
  aptitude TEXT,
  last_farrowing_date TEXT,
  observations TEXT,
  antecedent INTEGER NOT NULL DEFAULT 0 CHECK(antecedent IN (0,1)),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(female_animal_id, cycle_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reproduction_open_cycle_per_female
  ON reproduction_cycles(female_animal_id) WHERE cycle_status = 'open';
CREATE INDEX IF NOT EXISTS idx_reproduction_cycles_due
  ON reproduction_cycles(cycle_status, probable_farrowing_date, barn_id);

CREATE TABLE IF NOT EXISTS reproduction_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL REFERENCES reproduction_cycles(id),
  service_number INTEGER NOT NULL,
  service_date TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK(service_type IN ('monta_natural', 'inseminacion_artificial', 'transferencia_embriones')),
  sire_animal_id INTEGER REFERENCES animals(id),
  sire_code_snapshot TEXT,
  sire_breed_snapshot TEXT,
  material_source TEXT NOT NULL CHECK(material_source IN ('internal', 'external')),
  external_source TEXT,
  aptitude TEXT,
  observations TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(cycle_id, service_number)
);
CREATE INDEX IF NOT EXISTS idx_reproduction_services_date ON reproduction_services(service_date, cycle_id);

CREATE TABLE IF NOT EXISTS reproduction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL REFERENCES reproduction_cycles(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('palpation', 'pregnancy_confirmed', 'repeat', 'abortion', 'manual_due_date', 'closed')),
  event_date TEXT NOT NULL,
  physiological_status TEXT,
  service_id INTEGER REFERENCES reproduction_services(id),
  reason TEXT,
  observations TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reproduction_events_cycle ON reproduction_events(cycle_id, event_date, id);

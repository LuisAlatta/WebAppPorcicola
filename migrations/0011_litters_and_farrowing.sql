-- T13: registro de parto/camada y vinculación de fichas individuales.
CREATE TABLE IF NOT EXISTS litters (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL UNIQUE REFERENCES reproduction_cycles(id),
  female_animal_id INTEGER NOT NULL REFERENCES animals(id),
  parity_number INTEGER NOT NULL CHECK(parity_number > 0),
  farrowing_date TEXT NOT NULL,
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  father_code_snapshot TEXT,
  father_breed_snapshot TEXT,
  male_alive INTEGER NOT NULL CHECK(male_alive >= 0),
  female_alive INTEGER NOT NULL CHECK(female_alive >= 0),
  unsexed_alive INTEGER NOT NULL CHECK(unsexed_alive >= 0),
  male_stillborn INTEGER NOT NULL CHECK(male_stillborn >= 0),
  female_stillborn INTEGER NOT NULL CHECK(female_stillborn >= 0),
  unsexed_stillborn INTEGER NOT NULL CHECK(unsexed_stillborn >= 0),
  live_count INTEGER NOT NULL CHECK(live_count >= 0),
  stillborn_count INTEGER NOT NULL CHECK(stillborn_count >= 0),
  total_born INTEGER NOT NULL CHECK(total_born = live_count + stillborn_count),
  mortality_percent REAL,
  average_weight_kg REAL CHECK(average_weight_kg IS NULL OR average_weight_kg > 0),
  expected_weaning_date TEXT,
  actual_weaning_date TEXT,
  observations TEXT,
  historical_only INTEGER NOT NULL DEFAULT 0 CHECK(historical_only IN (0,1)),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(female_animal_id, parity_number),
  CHECK(live_count = male_alive + female_alive + unsexed_alive),
  CHECK(stillborn_count = male_stillborn + female_stillborn + unsexed_stillborn)
);
CREATE INDEX IF NOT EXISTS idx_litters_farrowing ON litters(farrowing_date, barn_id);
ALTER TABLE inventory_movements ADD COLUMN litter_id TEXT REFERENCES litters(id);
ALTER TABLE animals ADD COLUMN litter_id TEXT REFERENCES litters(id);
CREATE INDEX IF NOT EXISTS idx_animals_litter ON animals(litter_id, sex);
CREATE TABLE IF NOT EXISTS litter_identification_guard (
  guard_id INTEGER NOT NULL CHECK(guard_id >= 0)
);
CREATE TABLE IF NOT EXISTS litter_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  litter_id TEXT NOT NULL REFERENCES litters(id),
  operation_log_id TEXT NOT NULL REFERENCES operation_log(id),
  reason TEXT NOT NULL,
  previous_data TEXT NOT NULL,
  new_data TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

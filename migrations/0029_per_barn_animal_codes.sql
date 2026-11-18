-- Permite repetir códigos y aretes vigentes entre galpones distintos;
-- la unicidad activa se aplica dentro de cada galpón.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE _mig0029_animal_tags AS SELECT * FROM animal_tags;
CREATE TABLE _mig0029_animal_type_history AS SELECT * FROM animal_type_history;
CREATE TABLE _mig0029_animal_weights AS SELECT * FROM animal_weights;

CREATE TABLE animals_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  alias TEXT,
  animal_type TEXT NOT NULL CHECK(animal_type IN ('cerda', 'verraco', 'lechon', 'reemplazo')),
  sex TEXT NOT NULL CHECK(sex IN ('macho', 'hembra', 'pendiente')),
  breed TEXT,
  birth_date TEXT,
  birth_weight_kg REAL CHECK(birth_weight_kg IS NULL OR birth_weight_kg >= 0),
  weaning_date TEXT,
  weaning_weight_kg REAL CHECK(weaning_weight_kg IS NULL OR weaning_weight_kg >= 0),
  status TEXT NOT NULL DEFAULT 'activo' CHECK(status IN ('activo', 'vendido', 'descartado', 'muerto')),
  aptitude TEXT,
  mother_id INTEGER REFERENCES animals(id),
  father_id INTEGER REFERENCES animals(id),
  mother_external TEXT,
  father_external TEXT,
  origin_type TEXT NOT NULL DEFAULT 'externa'
    CHECK(origin_type IN ('nacimiento', 'compra', 'interna', 'inicial')),
  origin_detail TEXT,
  entry_date TEXT NOT NULL,
  entry_stage_code TEXT NOT NULL,
  current_stage_code TEXT NOT NULL,
  barn_id INTEGER NOT NULL REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  observations TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  deactivated_at TEXT,
  deactivation_reason TEXT,
  exit_date TEXT,
  exit_type TEXT CHECK(exit_type IS NULL OR exit_type IN ('sale', 'death')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  litter_id TEXT REFERENCES litters(id)
);

INSERT INTO animals_new (
  id, code, alias, animal_type, sex, breed, birth_date, birth_weight_kg,
  weaning_date, weaning_weight_kg, status, aptitude, mother_id, father_id,
  mother_external, father_external, origin_type, origin_detail, entry_date,
  entry_stage_code, current_stage_code, barn_id, location_code, lot_code,
  observations, is_active, deactivated_at, deactivation_reason, exit_date,
  exit_type, created_by_user_id, created_at, updated_at, litter_id
)
SELECT
  id, code, alias, animal_type, sex, breed, birth_date, birth_weight_kg,
  weaning_date, weaning_weight_kg, status, aptitude, mother_id, father_id,
  mother_external, father_external, origin_type, origin_detail, entry_date,
  entry_stage_code, current_stage_code, barn_id, location_code, lot_code,
  observations, is_active, deactivated_at, deactivation_reason, exit_date,
  exit_type, created_by_user_id, created_at, updated_at, litter_id
FROM animals ORDER BY id;

DROP TABLE animals;
ALTER TABLE animals_new RENAME TO animals;

CREATE UNIQUE INDEX IF NOT EXISTS uq_animals_active_barn_code ON animals(barn_id, code) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_animals_code ON animals(code);
CREATE INDEX IF NOT EXISTS idx_animals_barn ON animals(barn_id, is_active);
CREATE INDEX IF NOT EXISTS idx_animals_bucket ON animals(barn_id, location_code, lot_code, current_stage_code, sex);
CREATE INDEX IF NOT EXISTS idx_animals_mother ON animals(mother_id);
CREATE INDEX IF NOT EXISTS idx_animals_father ON animals(father_id);
CREATE INDEX IF NOT EXISTS idx_animals_litter ON animals(litter_id, sex);

INSERT OR IGNORE INTO animal_tags SELECT * FROM _mig0029_animal_tags ORDER BY id;
INSERT OR IGNORE INTO animal_type_history SELECT * FROM _mig0029_animal_type_history ORDER BY id;
INSERT OR IGNORE INTO animal_weights SELECT * FROM _mig0029_animal_weights ORDER BY id;

DROP TABLE _mig0029_animal_tags;
DROP TABLE _mig0029_animal_type_history;
DROP TABLE _mig0029_animal_weights;

DROP INDEX IF EXISTS uq_animal_tags_tag_current;
CREATE INDEX IF NOT EXISTS idx_animal_tags_tag_current ON animal_tags(tag) WHERE is_current = 1;

PRAGMA defer_foreign_keys = OFF;

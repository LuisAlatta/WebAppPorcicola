-- Migración 0006: fichas individuales de animales (T09 · ANI-01..ANI-08, INV-04)
--
-- El código es el identificador permanente y se guarda como texto para conservar
-- los ceros iniciales. Los aretes se versionan aparte: al cambiar un arete se
-- cierra la vigencia del anterior sin borrarlo. La genealogía admite madre y
-- padre conocidos (ficha interna) o externos, y trata el vacío como desconocido.
-- Los pesos históricos viven en animal_weights; el peso actual se deriva del
-- último pesaje válido por fecha. T11 agregará el formulario de pesajes.

CREATE TABLE IF NOT EXISTS animals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_animals_barn ON animals(barn_id, is_active);
CREATE INDEX IF NOT EXISTS idx_animals_bucket
  ON animals(barn_id, location_code, lot_code, current_stage_code, sex);
CREATE INDEX IF NOT EXISTS idx_animals_mother ON animals(mother_id);
CREATE INDEX IF NOT EXISTS idx_animals_father ON animals(father_id);

-- Aretes históricos. Solo uno vigente por animal y por número de arete.
CREATE TABLE IF NOT EXISTS animal_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_tags_current
  ON animal_tags(animal_id) WHERE is_current = 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_tags_tag_current
  ON animal_tags(tag) WHERE is_current = 1;
CREATE INDEX IF NOT EXISTS idx_animal_tags_animal ON animal_tags(animal_id, valid_from);

-- Cambios de tipo (cerda, verraco, lechón, reemplazo) con vigencia.
CREATE TABLE IF NOT EXISTS animal_type_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  animal_type TEXT NOT NULL CHECK(animal_type IN ('cerda', 'verraco', 'lechon', 'reemplazo')),
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_type_current
  ON animal_type_history(animal_id) WHERE is_current = 1;
CREATE INDEX IF NOT EXISTS idx_animal_type_history_animal
  ON animal_type_history(animal_id, valid_from);

-- Pesajes individuales. El peso actual es el del último pesaje por fecha.
CREATE TABLE IF NOT EXISTS animal_weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  weighed_on TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK(weight_kg > 0),
  stage_code TEXT,
  barn_id INTEGER REFERENCES barns(id),
  location_code TEXT,
  lot_code TEXT,
  note TEXT,
  recorded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_animal_weights_animal
  ON animal_weights(animal_id, weighed_on, id);

-- Vínculo del movimiento de inventario con la ficha individual (INV-04).
ALTER TABLE inventory_movements ADD COLUMN animal_id INTEGER REFERENCES animals(id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_animal
  ON inventory_movements(animal_id);

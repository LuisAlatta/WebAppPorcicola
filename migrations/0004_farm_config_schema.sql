-- Migración 0004: configuración versionada de la granja (T07 · CFG-01..CFG-05)
-- Cada cambio se guarda como una nueva versión con fecha de vigencia explícita.
-- Las filas anteriores conservan sus valores para los informes históricos.

CREATE TABLE IF NOT EXISTS catalog_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_key TEXT NOT NULL,
  item_code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'retired')),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_versions
  ON catalog_versions(catalog_key, item_code, effective_from);
CREATE INDEX IF NOT EXISTS idx_catalog_versions_lookup
  ON catalog_versions(catalog_key, effective_from);

CREATE TABLE IF NOT EXISTS stage_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  initial_weight_kg REAL,
  final_weight_kg REAL,
  initial_age_days INTEGER,
  final_age_days INTEGER,
  duration_days INTEGER,
  ration_name TEXT,
  daily_feed_kg REAL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'retired')),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_versions
  ON stage_versions(code, effective_from);
CREATE INDEX IF NOT EXISTS idx_stage_versions_lookup
  ON stage_versions(code, effective_from);

CREATE TABLE IF NOT EXISTS farm_setting_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL,
  value TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_setting_versions
  ON farm_setting_versions(setting_key, effective_from);

CREATE TABLE IF NOT EXISTS location_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK(location_type IN ('galpon', 'corral', 'area', 'otro')),
  parent_code TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'retired')),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_versions
  ON location_versions(code, effective_from);
CREATE INDEX IF NOT EXISTS idx_location_versions_lookup
  ON location_versions(code, effective_from);

CREATE TABLE IF NOT EXISTS lot_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  stage_code TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'retired')),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lot_versions
  ON lot_versions(code, effective_from);
CREATE INDEX IF NOT EXISTS idx_lot_versions_lookup
  ON lot_versions(code, effective_from);

-- Datos iniciales con vigencia desde el 1 de enero de 2026.
INSERT OR IGNORE INTO farm_setting_versions
  (setting_key, value, effective_from, created_at)
VALUES
  ('farm_name', 'Granja San Luis', '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('timezone', 'America/Lima', '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('currency', 'S/', '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('weight_unit', 'kg', '2026-01-01', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO catalog_versions
  (catalog_key, item_code, name, sort_order, effective_from, created_at)
VALUES
  ('sexo', 'macho', 'Macho', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('sexo', 'hembra', 'Hembra', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('sexo', 'pendiente', 'Pendiente de sexado', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('estado_animal', 'activo', 'Activo', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('estado_animal', 'vendido', 'Vendido', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('estado_animal', 'descartado', 'Descartado', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('estado_animal', 'muerto', 'Muerto', 4, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('etapa', 'preinicio', 'Preinicio', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'inicio', 'Inicio', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'levante', 'Levante', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'engorde', 'Engorde', 4, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'gestacion', 'Gestación', 5, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'lactancia', 'Cerda en lactancia', 6, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'vacia', 'Cerda vacía', 7, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('etapa', 'reproductor', 'Reproductor', 8, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('aptitud', 'pie_de_cria', 'Pie de cría', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('aptitud', 'engorde', 'Engorde', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('ubicacion', 'galpon', 'Galpón', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('ubicacion', 'corral', 'Corral', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('ubicacion', 'area', 'Área', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('lote', 'lote_a', 'Lote A', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('lote', 'lote_b', 'Lote B', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('causa_descarte', 'baja_produccion', 'Baja producción', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_descarte', 'enfermedad', 'Enfermedad', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_descarte', 'edad', 'Edad', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_descarte', 'deformidad', 'Deformidad', 4, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_descarte', 'otro', 'Otro', 5, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('causa_muerte', 'enfermedad', 'Enfermedad', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_muerte', 'accidente', 'Accidente', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_muerte', 'parto', 'Complicación de parto', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('causa_muerte', 'desconocida', 'Desconocida', 4, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('tipo_servicio', 'monta_natural', 'Monta natural', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('tipo_servicio', 'inseminacion_artificial', 'Inseminación artificial', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('estado_fisiologico', 'vacia', 'Vacía', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('estado_fisiologico', 'gestante', 'Gestante', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('estado_fisiologico', 'lactante', 'Lactante', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('estado_fisiologico', 'destetada', 'Destetada', 4, '2026-01-01', '2026-01-01T00:00:00.000Z'),

  ('alimento', 'preinicio', 'Alimento preinicio', 1, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('alimento', 'inicio', 'Alimento inicio', 2, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('alimento', 'levante', 'Alimento levante', 3, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('alimento', 'engorde', 'Alimento engorde', 4, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('alimento', 'gestacion', 'Alimento gestación', 5, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('alimento', 'lactancia', 'Alimento lactancia', 6, '2026-01-01', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO stage_versions
  (code, name, sort_order, initial_weight_kg, final_weight_kg, initial_age_days, final_age_days,
   duration_days, ration_name, daily_feed_kg, effective_from, created_at)
VALUES
  ('preinicio', 'Preinicio', 1, 6.0, 12.0, 0, 21, 21, 'Alimento preinicio', 0.65, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('inicio', 'Inicio', 2, 12.0, 25.0, 21, 49, 28, 'Alimento inicio', 1.00, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('levante', 'Levante', 3, 25.0, 45.0, 49, 77, 28, 'Alimento levante', 1.60, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('engorde', 'Engorde', 4, 45.0, 110.0, 77, 154, 77, 'Alimento engorde', 2.50, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('gestacion', 'Gestación', 5, NULL, NULL, 0, 114, 114, 'Alimento gestación', 2.20, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('lactancia', 'Cerda en lactancia', 6, NULL, NULL, 0, 21, 21, 'Alimento lactancia', 5.50, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('vacia', 'Cerda vacía', 7, NULL, NULL, NULL, NULL, NULL, 'Alimento gestación', 2.00, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('reproductor', 'Reproductor', 8, NULL, NULL, NULL, NULL, NULL, 'Alimento gestación', 2.50, '2026-01-01', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO location_versions
  (code, name, location_type, parent_code, effective_from, created_at)
VALUES
  ('galpon_a', 'Galpón A', 'galpon', NULL, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('galpon_b', 'Galpón B', 'galpon', NULL, '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('corral_maternidad', 'Corral Maternidad', 'corral', 'galpon_a', '2026-01-01', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO lot_versions
  (code, name, stage_code, effective_from, created_at)
VALUES
  ('lote_levante_a', 'Lote Levante A', 'levante', '2026-01-01', '2026-01-01T00:00:00.000Z'),
  ('lote_engorde_a', 'Lote Engorde A', 'engorde', '2026-01-01', '2026-01-01T00:00:00.000Z');

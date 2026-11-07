-- Migración 0002: Esquema para administración de galpones, equipo operativo e historial
ALTER TABLE barns ADD COLUMN zone TEXT NOT NULL DEFAULT '';
ALTER TABLE barns ADD COLUMN status TEXT NOT NULL DEFAULT 'preparacion';
ALTER TABLE barns ADD COLUMN responsable_id INTEGER REFERENCES users(id);
ALTER TABLE barns ADD COLUMN operario_id INTEGER REFERENCES users(id);
ALTER TABLE barns ADD COLUMN veterinario_id INTEGER REFERENCES users(id);
ALTER TABLE barns ADD COLUMN updated_at TEXT;

-- Historial de asignaciones de equipo por galpón con vigencias y autor
CREATE TABLE IF NOT EXISTS barn_team_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barn_id INTEGER NOT NULL REFERENCES barns(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('responsable', 'operario', 'veterinario')),
  previous_user_id INTEGER REFERENCES users(id),
  new_user_id INTEGER NOT NULL REFERENCES users(id),
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  changed_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_barn_team_history_barn_id ON barn_team_history(barn_id);
CREATE INDEX IF NOT EXISTS idx_barn_team_history_user_id ON barn_team_history(new_user_id);

-- Corrales vinculados al galpón (CFG-06)
CREATE TABLE IF NOT EXISTS barn_pens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barn_id INTEGER NOT NULL REFERENCES barns(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  UNIQUE(barn_id, code)
);

CREATE INDEX IF NOT EXISTS idx_barn_pens_barn_id ON barn_pens(barn_id);

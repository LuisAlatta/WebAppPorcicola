-- Migración 0003: operaciones idempotentes y auditoría de eventos (T06 · ACC-04, GES-03)

-- Registro único por operación con clave de reintento y contenido normalizado.
-- La UNIQUE(author_user_id, operation_key) garantiza un solo evento por reintento.
CREATE TABLE IF NOT EXISTS operation_log (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  author_user_id INTEGER NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  barn_id INTEGER REFERENCES barns(id),
  content_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  result_payload TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'committed' CHECK(status IN ('committed', 'annulled')),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(author_user_id, operation_key)
);

CREATE INDEX IF NOT EXISTS idx_operation_log_key ON operation_log(operation_key);
CREATE INDEX IF NOT EXISTS idx_operation_log_entity ON operation_log(entity_type, entity_id);

-- Auditoría de quién creó, corrigió o anuló cada evento, cuándo y por qué.
-- previous_data conserva el registro original disponible para el responsable.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT REFERENCES operation_log(id),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'correct', 'annul', 'delete')),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  barn_id INTEGER REFERENCES barns(id),
  reason TEXT NOT NULL,
  previous_data TEXT,
  new_data TEXT,
  effective_date TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_barn_id ON audit_log(barn_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_recorded_at ON audit_log(recorded_at);

-- Versionado del historial de equipo: la fila original se conserva y se marca
-- como reemplazada por la corrección, sin borrar ni reescribir sus valores.
ALTER TABLE barn_team_history ADD COLUMN reason TEXT;
ALTER TABLE barn_team_history ADD COLUMN corrects_history_id INTEGER REFERENCES barn_team_history(id);
ALTER TABLE barn_team_history ADD COLUMN superseded_by_id INTEGER REFERENCES barn_team_history(id);
ALTER TABLE barn_team_history ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1;

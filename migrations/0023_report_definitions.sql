-- T25: definiciones de reportes guardadas por usuario.
CREATE TABLE IF NOT EXISTS report_definitions (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 1 AND 500),
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_definitions_owner_updated
  ON report_definitions(owner_user_id, updated_at DESC);

-- T22: ocurrencias de agenda y alertas con identidad estable y resolución auditable.
CREATE TABLE IF NOT EXISTS alert_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('vaccine','farrowing','weaning','treatment','feeding','manual')),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  due_bucket TEXT NOT NULL CHECK(due_bucket IN ('overdue','today','upcoming','future','undated')),
  title TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  animal_code TEXT,
  barn_id INTEGER REFERENCES barns(id),
  barn_name_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','attended','resolved')),
  created_by_user_id INTEGER REFERENCES users(id),
  acknowledged_by_user_id INTEGER REFERENCES users(id),
  acknowledged_at TEXT,
  resolution_reason TEXT,
  linked_event_type TEXT,
  linked_event_id TEXT,
  last_seen_run TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_occurrences_status_date ON alert_occurrences(status,due_date,alert_type,barn_id);
CREATE INDEX IF NOT EXISTS idx_alert_occurrences_source ON alert_occurrences(source_type,source_id);

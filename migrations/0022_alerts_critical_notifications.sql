-- T23: alertas por peso/venta, escalamiento crítico y notificaciones internas.
INSERT OR IGNORE INTO farm_setting_versions(setting_key,value,effective_from,created_at)
VALUES('sale_target_weight_kg','100','2026-01-01','2026-01-01T00:00:00.000Z');
DROP INDEX IF EXISTS idx_alert_occurrences_status_date;
DROP INDEX IF EXISTS idx_alert_occurrences_source;
ALTER TABLE alert_occurrences RENAME TO alert_occurrences_t22;

CREATE TABLE alert_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('vaccine','farrowing','weaning','treatment','feeding','manual','low_weight','sale_suggestion')),
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
  notification_created_at TEXT,
  notification_bucket TEXT,
  critical_notified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
INSERT INTO alert_occurrences(id,alert_key,alert_type,source_type,source_id,due_date,due_bucket,title,detail_json,animal_code,barn_id,barn_name_snapshot,status,created_by_user_id,acknowledged_by_user_id,acknowledged_at,resolution_reason,linked_event_type,linked_event_id,last_seen_run,created_at,updated_at,resolved_at)
SELECT id,alert_key,alert_type,source_type,source_id,due_date,due_bucket,title,detail_json,animal_code,barn_id,barn_name_snapshot,status,created_by_user_id,acknowledged_by_user_id,acknowledged_at,resolution_reason,linked_event_type,linked_event_id,last_seen_run,created_at,updated_at,resolved_at FROM alert_occurrences_t22;
DROP TABLE alert_occurrences_t22;
CREATE INDEX idx_alert_occurrences_status_date ON alert_occurrences(status,due_date,alert_type,barn_id);
CREATE INDEX idx_alert_occurrences_source ON alert_occurrences(source_type,source_id);

CREATE TABLE alert_escalation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('vaccine','farrowing','weaning','treatment','feeding','manual','low_weight','sale_suggestion')),
  overdue_days INTEGER NOT NULL CHECK(overdue_days>=0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(alert_type)
);
CREATE TABLE alert_escalation_recipients (
  rule_id INTEGER NOT NULL REFERENCES alert_escalation_rules(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('administrador','responsable','operario','veterinario')),
  PRIMARY KEY(rule_id,role)
);
CREATE TABLE alert_escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_occurrence_id INTEGER NOT NULL REFERENCES alert_occurrences(id) ON DELETE CASCADE,
  rule_id INTEGER NOT NULL REFERENCES alert_escalation_rules(id),
  overdue_days INTEGER NOT NULL,
  escalated_at TEXT NOT NULL,
  UNIQUE(alert_occurrence_id,rule_id)
);
CREATE TABLE alert_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_key TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  alert_occurrence_id INTEGER NOT NULL REFERENCES alert_occurrences(id) ON DELETE CASCADE,
  transition TEXT NOT NULL CHECK(transition IN ('created','today','overdue','critical')),
  priority TEXT NOT NULL CHECK(priority IN ('normal','critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX idx_alert_notifications_user_read ON alert_notifications(user_id,read_at,created_at DESC);

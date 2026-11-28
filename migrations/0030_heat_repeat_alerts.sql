-- Agrega el tipo de alerta 'heat_repeat' (repetición probable de celo)
-- conservando todas las alertas, reglas, escalamientos y notificaciones existentes.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE _mig0030_alert_escalations AS SELECT * FROM alert_escalations;
CREATE TABLE _mig0030_alert_notifications AS SELECT * FROM alert_notifications;
CREATE TABLE _mig0030_alert_escalation_recipients AS SELECT * FROM alert_escalation_recipients;

CREATE TABLE alert_occurrences_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('vaccine','farrowing','heat_repeat','weaning','treatment','feeding','manual','low_weight','sale_suggestion')),
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

INSERT INTO alert_occurrences_new (
  id, alert_key, alert_type, source_type, source_id, due_date, due_bucket, title, detail_json,
  animal_code, barn_id, barn_name_snapshot, status, created_by_user_id, acknowledged_by_user_id,
  acknowledged_at, resolution_reason, linked_event_type, linked_event_id, last_seen_run,
  notification_created_at, notification_bucket, critical_notified_at, created_at, updated_at, resolved_at
)
SELECT
  id, alert_key, alert_type, source_type, source_id, due_date, due_bucket, title, detail_json,
  animal_code, barn_id, barn_name_snapshot, status, created_by_user_id, acknowledged_by_user_id,
  acknowledged_at, resolution_reason, linked_event_type, linked_event_id, last_seen_run,
  notification_created_at, notification_bucket, critical_notified_at, created_at, updated_at, resolved_at
FROM alert_occurrences ORDER BY id;

DROP TABLE alert_occurrences;
ALTER TABLE alert_occurrences_new RENAME TO alert_occurrences;

CREATE INDEX IF NOT EXISTS idx_alert_occurrences_status_date ON alert_occurrences(status,due_date,alert_type,barn_id);
CREATE INDEX IF NOT EXISTS idx_alert_occurrences_source ON alert_occurrences(source_type,source_id);

CREATE TABLE alert_escalation_rules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('vaccine','farrowing','heat_repeat','weaning','treatment','feeding','manual','low_weight','sale_suggestion')),
  overdue_days INTEGER NOT NULL CHECK(overdue_days>=0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(alert_type)
);

INSERT INTO alert_escalation_rules_new (id, alert_type, overdue_days, is_active, created_by_user_id, created_at, updated_at)
SELECT id, alert_type, overdue_days, is_active, created_by_user_id, created_at, updated_at
FROM alert_escalation_rules ORDER BY id;

DROP TABLE alert_escalation_rules;
ALTER TABLE alert_escalation_rules_new RENAME TO alert_escalation_rules;

INSERT OR IGNORE INTO alert_escalation_recipients SELECT * FROM _mig0030_alert_escalation_recipients;
INSERT OR IGNORE INTO alert_escalations SELECT * FROM _mig0030_alert_escalations ORDER BY id;
INSERT OR IGNORE INTO alert_notifications SELECT * FROM _mig0030_alert_notifications ORDER BY id;

DROP TABLE _mig0030_alert_escalation_recipients;
DROP TABLE _mig0030_alert_escalations;
DROP TABLE _mig0030_alert_notifications;

PRAGMA defer_foreign_keys = OFF;

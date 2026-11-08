-- T18: reglas versionadas, ocurrencias vacunales idempotentes y aplicaciones enlazadas.
CREATE TABLE IF NOT EXISTS vaccine_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  vaccine_name TEXT NOT NULL,
  target_category TEXT NOT NULL CHECK(target_category IN ('cerda_primeriza','cerda_multipara','verraco','lechon','reemplazo')),
  base_event TEXT NOT NULL CHECK(base_event IN ('farrowing','semiannual','birth','age','manual')),
  offset_days INTEGER NOT NULL DEFAULT 0 CHECK(offset_days BETWEEN -3650 AND 3650),
  target_age_days INTEGER CHECK(target_age_days IS NULL OR target_age_days>=0),
  recurrence_days INTEGER CHECK(recurrence_days IS NULL OR recurrence_days>0),
  reference_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(rule_key,version)
);
CREATE INDEX IF NOT EXISTS idx_vaccine_rules_active ON vaccine_rules(is_active,is_current,target_category,base_event);
CREATE TABLE IF NOT EXISTS vaccine_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key TEXT,
  rule_version_id INTEGER REFERENCES vaccine_rules(id),
  animal_id INTEGER NOT NULL REFERENCES animals(id),
  animal_code_snapshot TEXT NOT NULL,
  animal_type_snapshot TEXT NOT NULL,
  target_category_snapshot TEXT NOT NULL,
  source_event_type TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  source_date TEXT NOT NULL,
  occurrence_number INTEGER NOT NULL DEFAULT 1,
  vaccine_name_snapshot TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','cancelled')),
  is_manual INTEGER NOT NULL DEFAULT 0 CHECK(is_manual IN (0,1)),
  applied_date TEXT,
  application_health_event_id INTEGER UNIQUE REFERENCES health_events(id),
  observations TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(rule_key,animal_id,source_event_type,source_event_id,occurrence_number)
);
CREATE INDEX IF NOT EXISTS idx_vaccine_occurrences_agenda ON vaccine_occurrences(scheduled_date,status,animal_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_occurrences_rule ON vaccine_occurrences(rule_key,animal_id,status);

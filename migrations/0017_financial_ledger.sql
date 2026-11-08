-- T19: libro auditable de ingresos y egresos con distribución por galpón.
CREATE TABLE IF NOT EXISTS financial_entries (
  id INTEGER PRIMARY KEY,
  operation_log_id TEXT NOT NULL UNIQUE REFERENCES operation_log(id),
  direction TEXT NOT NULL CHECK(direction IN ('income','expense')),
  category TEXT NOT NULL,
  concept TEXT NOT NULL,
  operation_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  currency_code TEXT NOT NULL CHECK(length(currency_code)=3 AND currency_code=upper(currency_code)),
  counterparty TEXT,
  reference TEXT,
  notes TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_entries_date ON financial_entries(operation_date,direction,currency_code);
CREATE TABLE IF NOT EXISTS financial_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES financial_entries(id),
  barn_id INTEGER REFERENCES barns(id),
  barn_name_snapshot TEXT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  animal_id INTEGER REFERENCES animals(id),
  animal_code_snapshot TEXT,
  lot_code TEXT,
  supply_code TEXT,
  quantity REAL CHECK(quantity IS NULL OR quantity>0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_entry ON financial_allocations(entry_id,barn_id);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_barn ON financial_allocations(barn_id,entry_id);

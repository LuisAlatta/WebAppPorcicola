-- T21: cobros y pagos efectivos separados de la fecha de operación.
CREATE TABLE IF NOT EXISTS financial_settlements (
  id INTEGER PRIMARY KEY,
  operation_log_id TEXT NOT NULL UNIQUE REFERENCES operation_log(id),
  financial_entry_id INTEGER NOT NULL REFERENCES financial_entries(id),
  settlement_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  payment_method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_settlements_entry_date ON financial_settlements(financial_entry_id,settlement_date);
CREATE INDEX IF NOT EXISTS idx_financial_settlements_date ON financial_settlements(settlement_date);

CREATE TABLE IF NOT EXISTS financial_settlement_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL REFERENCES financial_settlements(id),
  financial_allocation_id INTEGER NOT NULL REFERENCES financial_allocations(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  UNIQUE(settlement_id,financial_allocation_id)
);
CREATE INDEX IF NOT EXISTS idx_financial_settlement_allocations_allocation ON financial_settlement_allocations(financial_allocation_id,settlement_id);

-- Saldo inicial real por moneda; solo el administrador puede fijarlo mediante la API.
CREATE TABLE IF NOT EXISTS financial_cash_openings (
  id INTEGER PRIMARY KEY,
  operation_log_id TEXT NOT NULL UNIQUE REFERENCES operation_log(id),
  effective_date TEXT NOT NULL,
  currency_code TEXT NOT NULL CHECK(length(currency_code)=3 AND currency_code=upper(currency_code)),
  amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(effective_date,currency_code)
);
CREATE INDEX IF NOT EXISTS idx_financial_cash_openings_date ON financial_cash_openings(currency_code,effective_date DESC);

-- Evita sobrepagos incluso si dos solicitudes concurrentes validaron el mismo saldo.
CREATE TRIGGER IF NOT EXISTS trg_financial_settlement_allocation_balance
BEFORE INSERT ON financial_settlement_allocations
WHEN NEW.amount_minor + COALESCE((
  SELECT SUM(sa.amount_minor)
  FROM financial_settlement_allocations sa
  WHERE sa.financial_allocation_id=NEW.financial_allocation_id
),0) > (
  SELECT fa.amount_minor FROM financial_allocations fa WHERE fa.id=NEW.financial_allocation_id
)
BEGIN
  SELECT RAISE(ABORT,'financial settlement exceeds allocation balance');
END;

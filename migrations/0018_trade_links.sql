-- T20: enlaza las compras y ventas con su origen operativo.
ALTER TABLE financial_entries ADD COLUMN source_type TEXT;
ALTER TABLE financial_entries ADD COLUMN source_id TEXT;
ALTER TABLE financial_entries ADD COLUMN reversal_of_id INTEGER REFERENCES financial_entries(id);
ALTER TABLE financial_entries ADD COLUMN reversed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_financial_source ON financial_entries(source_type,source_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_reversal_original ON financial_entries(reversal_of_id) WHERE reversal_of_id IS NOT NULL;
ALTER TABLE feed_movements ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'PEN';
ALTER TABLE feed_movements ADD COLUMN document_reference TEXT;

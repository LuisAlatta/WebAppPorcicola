-- Vincula las raíces físicas al identificador estable del galpón.
ALTER TABLE location_versions ADD COLUMN barn_id INTEGER REFERENCES barns(id);
CREATE INDEX IF NOT EXISTS idx_location_versions_barn ON location_versions(barn_id);

-- Solo se reconocen las dos raíces originales; no se modifica inventario ni fichas.
UPDATE location_versions
SET barn_id = (SELECT id FROM barns WHERE code = CASE location_versions.code
  WHEN 'galpon_a' THEN 'G-A' WHEN 'galpon_b' THEN 'G-B' END)
WHERE barn_id IS NULL AND code IN ('galpon_a', 'galpon_b')
  AND location_type = 'galpon' AND parent_code IS NULL
  AND effective_from = '2026-01-01' AND created_at = '2026-01-01T00:00:00.000Z';

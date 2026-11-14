ALTER TABLE reproduction_cycles ADD COLUMN heat_repeat_days INTEGER NOT NULL DEFAULT 21 CHECK (heat_repeat_days BETWEEN 1 AND 120);

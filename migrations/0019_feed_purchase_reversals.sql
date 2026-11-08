-- T20: conserva el vínculo entre una compra de alimento y su devolución.
ALTER TABLE feed_movements ADD COLUMN reverses_movement_id INTEGER REFERENCES feed_movements(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_reversal_purchase ON feed_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

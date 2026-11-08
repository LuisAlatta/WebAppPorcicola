-- Migración 0009: hora explícita y correcciones enlazadas de pesajes (T11).
ALTER TABLE animal_weights ADD COLUMN weighed_time TEXT NOT NULL DEFAULT '12:00';
ALTER TABLE animal_weights ADD COLUMN corrects_weight_id INTEGER REFERENCES animal_weights(id);

CREATE INDEX IF NOT EXISTS idx_animal_weights_timeline
  ON animal_weights(animal_id, weighed_on, weighed_time, id);
CREATE INDEX IF NOT EXISTS idx_animal_weights_correction
  ON animal_weights(corrects_weight_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_animal_weights_single_correction
  ON animal_weights(corrects_weight_id) WHERE corrects_weight_id IS NOT NULL;

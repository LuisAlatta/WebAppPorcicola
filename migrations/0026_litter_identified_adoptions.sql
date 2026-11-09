-- Conserva la pertenencia anterior cuando una cría identificada cambia de camada.
CREATE TABLE litter_identified_adoptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_log_id TEXT NOT NULL REFERENCES operation_log(id),
  animal_id INTEGER NOT NULL REFERENCES animals(id),
  source_litter_id TEXT NOT NULL REFERENCES litters(id),
  target_litter_id TEXT NOT NULL REFERENCES litters(id),
  effective_date TEXT NOT NULL,
  UNIQUE(operation_log_id,animal_id)
);
CREATE INDEX idx_litter_adoptions_source ON litter_identified_adoptions(source_litter_id,animal_id);
CREATE INDEX idx_litter_adoptions_target ON litter_identified_adoptions(target_litter_id,animal_id);
CREATE INDEX idx_litter_adoptions_animal_dates ON litter_identified_adoptions(animal_id,effective_date,id);
CREATE INDEX idx_litter_events_operation_litter ON litter_events(operation_log_id,litter_id,id);
CREATE INDEX idx_animal_location_history_animal_dates ON animal_location_history(animal_id,valid_from,valid_until);
CREATE INDEX idx_inventory_movements_animal_date ON inventory_movements(animal_id,effective_date,id);

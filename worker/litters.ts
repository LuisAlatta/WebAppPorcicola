import { getConfigSnapshot } from './config';
import { ApiError, commitOperation, createOperationClaim, currentFarmDate, isValidDateString, lookupExistingOperation, normalizeReason } from './events';
import { stockGuardStatement } from './inventory';

type Row = Record<string, unknown>;
export type FarrowingInput = {
  farrowingDate?: unknown; parityNumber?: unknown; maleAlive?: unknown; femaleAlive?: unknown; unsexedAlive?: unknown;
  maleStillborn?: unknown; femaleStillborn?: unknown; unsexedStillborn?: unknown; averageWeightKg?: unknown;
  observations?: unknown; reason?: unknown; operationKey?: string;
  expectedCounts?: unknown;
};
export type LitterEventInput = {
  eventType?: unknown; effectiveDate?: unknown; sex?: unknown; quantity?: unknown; destinationLitterId?: unknown;
  animalCodes?: unknown;
  destinationStageCode?: unknown; destinationBarnId?: unknown; destinationLocationCode?: unknown; destinationLotCode?: unknown;
  weightKg?: unknown; cause?: unknown; reason?: unknown; observations?: unknown; operationKey?: string;
};
export type LitterDateCorrectionInput = { farrowingDate?:unknown; expectedCurrentDate?:unknown; reason?:unknown; operationKey?:string };
const optionalCount = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new ApiError(400, `${label}: indique un entero no negativo`);
  return number;
};
const optionalText = (value: unknown, label: string, max: number) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const valueText = String(value).trim();
  if (valueText.length > max) throw new ApiError(400, `${label} supera ${max} caracteres`);
  return valueText;
};
const addDays = (date: string, days: number) => {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};

async function litterBalance(db: D1Database, litter: Row, sex: string) {
  const initialField = sex === 'macho' ? 'male_alive' : sex === 'hembra' ? 'female_alive' : 'unsexed_alive';
  const events = await db.prepare(`SELECT event_type,quantity FROM litter_events WHERE litter_id=? AND sex=?`)
    .bind(litter.id, sex).all<{event_type:string;quantity:number}>();
  let balance = Number(litter[initialField]);
  for (const event of events.results ?? []) {
    if (event.event_type === 'adoption_in') balance += Number(event.quantity);
    else balance -= Number(event.quantity);
  }
  return balance;
}

export async function recordLitterEvent(db: D1Database, actorUserId: number, litterId: string, input: LitterEventInput, scope: { allowedBarnNames?: string[] | null } = {}) {
  const litter = await db.prepare('SELECT * FROM litters WHERE id=?').bind(litterId).first<Row>();
  if (!litter || Number(litter.historical_only) === 1) throw new ApiError(404, 'Camada activa no encontrada');
  const allowedBarns = scope.allowedBarnNames;
  const sourceBarn = await db.prepare('SELECT name FROM barns WHERE id=?').bind(litter.barn_id).first<{name:string}>();
  if (allowedBarns && (!sourceBarn || !allowedBarns.includes(sourceBarn.name))) throw new ApiError(404, 'Camada no encontrada');
  const eventType = String(input.eventType ?? '');
  if (!['death','weaning','adoption'].includes(eventType)) throw new ApiError(400, 'Tipo de evento de camada inválido');
  const effectiveDate = String(input.effectiveDate ?? '');
  if (!isValidDateString(effectiveDate) || effectiveDate < String(litter.farrowing_date) || effectiveDate > currentFarmDate()) throw new ApiError(400, 'Fecha del evento fuera de la vigencia de la camada');
  const sex = String(input.sex ?? '') as 'macho'|'hembra'|'pendiente';
  if (!['macho','hembra','pendiente'].includes(sex)) throw new ApiError(400, 'Sexo de camada inválido');
  const lastSourceEvent=await db.prepare('SELECT MAX(effective_date) AS date FROM litter_events WHERE litter_id=? AND sex=?').bind(litterId,sex).first<{date:string|null}>();
  const quantity = optionalCount(input.quantity, 'Cantidad');
  if (!quantity) throw new ApiError(400, 'La cantidad debe ser mayor que cero');
  if (input.animalCodes !== undefined && !Array.isArray(input.animalCodes)) throw new ApiError(400, 'La selección de animales es inválida');
  const animalCodes = (input.animalCodes as unknown[] | undefined ?? []).map(code => String(code).trim()).sort();
  if (animalCodes.some(code => !code || code.length > 80) || new Set(animalCodes).size !== animalCodes.length || animalCodes.length > quantity || (animalCodes.length && eventType !== 'weaning')) throw new ApiError(400, 'Revise los animales seleccionados para el destete');
  const available = await litterBalance(db,litter,sex);
  const reason = optionalText(input.reason,'Motivo',300);
  if (!reason || reason.length < 5) throw new ApiError(400, 'Indique un motivo de al menos 5 caracteres');
  const observations = optionalText(input.observations,'Observaciones',1000);
  const weightKg = input.weightKg === undefined || input.weightKg === '' ? null : Number(input.weightKg);
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 50)) throw new ApiError(400, 'Peso promedio de destete inválido');
  if (eventType === 'weaning' && weightKg === null) throw new ApiError(400, 'Indique el peso promedio de destete');
  let target: Row | null = null;
  let lastTargetDate: string | null = null;
  let targetBarnId: number | null = null;
  let destinationStage: string | null = null;
  let destinationLocation: string | null = null;
  let destinationLot: string | null = null;
  if (eventType === 'adoption') {
    const targetId = String(input.destinationLitterId ?? '');
    target = await db.prepare('SELECT * FROM litters WHERE id=?').bind(targetId).first<Row>();
    if (!target || target.id === litter.id || Number(target.historical_only) === 1 || effectiveDate < String(target.farrowing_date)) throw new ApiError(400, 'Seleccione una camada destino válida');
    const lastTargetEvent=await db.prepare('SELECT MAX(effective_date) AS date FROM litter_events WHERE litter_id=? AND sex=?').bind(targetId,sex).first<{date:string|null}>();
    lastTargetDate=lastTargetEvent?.date??null;
    targetBarnId = Number(target.barn_id);
    const targetBarn = await db.prepare('SELECT name FROM barns WHERE id=?').bind(targetBarnId).first<{name:string}>();
    if (allowedBarns && (!targetBarn || !allowedBarns.includes(targetBarn.name))) throw new ApiError(403, 'No tiene acceso a la camada destino');
  }
  if (eventType === 'weaning') {
    targetBarnId = Number(input.destinationBarnId ?? litter.barn_id);
    const targetBarn = await db.prepare('SELECT name FROM barns WHERE id=?').bind(targetBarnId).first<{name:string}>();
    if (!targetBarn) throw new ApiError(404,'Galpón destino no encontrado');
    if (allowedBarns && !allowedBarns.includes(targetBarn.name)) throw new ApiError(403,'No tiene acceso al galpón destino');
    destinationStage = String(input.destinationStageCode ?? 'inicio');
    if (destinationStage === 'preinicio') throw new ApiError(400,'Seleccione una etapa posterior a preinicio para el destete');
    destinationLocation = optionalText(input.destinationLocationCode,'Ubicación destino',60);
    destinationLot = optionalText(input.destinationLotCode,'Lote destino',60);
    const config = await getConfigSnapshot(db,effectiveDate);
    if (!config.stages.some((stage)=>stage.code===destinationStage)) throw new ApiError(400,'Etapa destino no vigente');
    if (destinationLocation && !config.locations.some((location)=>location.code===destinationLocation)) throw new ApiError(400,'Ubicación destino no vigente');
    if (destinationLot && !config.lots.some((lot)=>lot.code===destinationLot)) throw new ApiError(400,'Lote destino no vigente');
  }
  const payload = { litterId,eventType,effectiveDate,sex,quantity,targetLitterId:target?.id??null,targetBarnId,destinationStage,destinationLocation,destinationLot,weightKg,cause:optionalText(input.cause,'Causa',120),reason,observations,...(animalCodes.length ? {animalCodes} : {}) };
  if (eventType === 'death' && !payload.cause) throw new ApiError(400,'Indique la causa de la baja');
  const replay = await lookupExistingOperation(db,actorUserId,input.operationKey,payload);
  if (replay) return { replayed:true,balance:await litterBalance(db,litter,sex) };
  if(lastSourceEvent?.date&&effectiveDate<String(lastSourceEvent.date)) throw new ApiError(409,'Registre el evento después del último movimiento de esta camada y sexo');
  if(lastTargetDate&&effectiveDate<lastTargetDate) throw new ApiError(409,'La adopción debe ser posterior al último movimiento de la camada destino');
  if (quantity > available) throw new ApiError(409, `La camada solo tiene ${available} cabezas pendientes de ese sexo`);
  let selectedAnimals: Row[];
  {
    const identified = await db.prepare(`SELECT a.id,a.code,a.barn_id,a.location_code,a.lot_code,a.current_stage_code,a.status FROM animals a
      JOIN animal_location_history h ON h.animal_id=a.id AND h.valid_from<=? AND (h.valid_until IS NULL OR h.valid_until>?)
      WHERE a.litter_id=? AND a.sex=? AND a.entry_date<=? AND (a.exit_date IS NULL OR a.exit_date>?) AND h.stage_code='preinicio'
        AND NOT EXISTS (SELECT 1 FROM inventory_movements m JOIN operation_log o ON o.id=m.operation_log_id
          WHERE m.animal_id=a.id AND m.litter_id=a.litter_id AND m.quantity<0 AND m.effective_date<=? AND o.operation_type='litter.weaning')`)
      .bind(effectiveDate,effectiveDate,litterId,sex,effectiveDate,effectiveDate,effectiveDate).all<Row>();
    const candidates = identified.results ?? [];
    selectedAnimals = candidates.filter(animal => animalCodes.includes(String(animal.code)));
    if (selectedAnimals.length !== animalCodes.length || selectedAnimals.some(animal => animal.status!=='activo' || animal.current_stage_code!=='preinicio' || Number(animal.barn_id)!==Number(litter.barn_id) || (animal.location_code??null)!==(litter.location_code??null) || (animal.lot_code??null)!==(litter.lot_code??null))) throw new ApiError(409,'Seleccione únicamente animales de la camada presentes en la ubicación de origen');
    if (quantity - selectedAnimals.length > available - candidates.length) throw new ApiError(409,eventType === 'weaning' ? 'Seleccione las fichas identificadas que participan en el destete' : 'La operación incluye animales identificados; gestione sus fichas antes de continuar');
    for (const animal of selectedAnimals) {
      const later = await db.prepare('SELECT id FROM animal_location_history WHERE animal_id=? AND valid_from>=? LIMIT 1').bind(animal.id,effectiveDate).first();
      if (later) throw new ApiError(409,`El animal ${String(animal.code)} tiene movimientos posteriores`);
    }
  }
  const claim = await createOperationClaim({operationKey:input.operationKey,operationType:`litter.${eventType}`,authorUserId:actorUserId,
    entityType:'litter',entityId:null,barnId:Number(litter.barn_id),effectiveDate,payload,result:{litterId,eventType,quantity}});
  const now = claim.recordedAt;
  const initialCountColumn = sex==='macho'?'male_alive':sex==='hembra'?'female_alive':'unsexed_alive';
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO litter_event_guard (guard_id)
    SELECT CASE WHEN (SELECT ${initialCountColumn} FROM litters WHERE id=?) + COALESCE((SELECT SUM(CASE WHEN event_type='adoption_in' THEN quantity ELSE -quantity END)
      FROM litter_events WHERE litter_id=? AND sex=?),0) >= ? THEN 0 ELSE -1 END`).bind(litterId,litterId,sex,quantity),db.prepare(`INSERT INTO litter_events
    (operation_log_id,litter_id,event_type,effective_date,sex,quantity,destination_litter_id,destination_stage_code,destination_barn_id,destination_location_code,destination_lot_code,weight_kg,cause,reason,observations,created_by_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,litterId,eventType==='adoption'?'adoption_out':eventType,effectiveDate,sex,quantity,target?.id??null,destinationStage,targetBarnId,destinationLocation,destinationLot,weightKg,payload.cause,reason,observations,actorUserId,now)];
  statements.unshift(db.prepare(`INSERT INTO litter_event_guard (guard_id)
    SELECT CASE WHEN (SELECT ${initialCountColumn} FROM litters WHERE id=?)
      + COALESCE((SELECT SUM(CASE WHEN event_type='adoption_in' THEN quantity ELSE -quantity END) FROM litter_events WHERE litter_id=? AND sex=?),0)
      - (SELECT COUNT(*) FROM animals a JOIN animal_location_history h ON h.animal_id=a.id AND h.valid_from<=? AND (h.valid_until IS NULL OR h.valid_until>?)
        WHERE a.litter_id=? AND a.sex=? AND a.entry_date<=? AND (a.exit_date IS NULL OR a.exit_date>?) AND h.stage_code='preinicio'
          AND NOT EXISTS (SELECT 1 FROM inventory_movements m JOIN operation_log o ON o.id=m.operation_log_id WHERE m.animal_id=a.id AND m.litter_id=a.litter_id AND m.quantity<0 AND m.effective_date<=? AND o.operation_type='litter.weaning'))
      >= ? THEN 0 ELSE -1 END`).bind(litterId,litterId,sex,effectiveDate,effectiveDate,litterId,sex,effectiveDate,effectiveDate,effectiveDate,quantity-selectedAnimals.length));
  statements.unshift(db.prepare(`INSERT INTO litter_event_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM litters WHERE id=? AND farrowing_date<=?) AND NOT EXISTS(SELECT 1 FROM litter_events WHERE litter_id=? AND sex=? AND effective_date>?) THEN 0 ELSE -1 END`).bind(litterId,effectiveDate,litterId,sex,effectiveDate));
  if(target)statements.unshift(db.prepare(`INSERT INTO litter_event_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM litters WHERE id=? AND farrowing_date<=?) AND NOT EXISTS(SELECT 1 FROM litter_events WHERE litter_id=? AND sex=? AND effective_date>?) THEN 0 ELSE -1 END`).bind(target.id,effectiveDate,target.id,sex,effectiveDate));
  if (eventType === 'adoption' && target) statements.push(db.prepare(`INSERT INTO litter_events
    (operation_log_id,litter_id,event_type,effective_date,sex,quantity,destination_litter_id,destination_barn_id,reason,observations,created_by_user_id,created_at)
    VALUES (?,?,'adoption_in',?,?,?,?,?,?,?,?,?)`).bind(claim.id,target.id,effectiveDate,sex,quantity,litterId,Number(target.barn_id),reason,observations,actorUserId,now));
  if (eventType === 'death') statements.push(db.prepare(`INSERT INTO inventory_movements
    (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,cause_code,notes,created_by_user_id,created_at,litter_id)
    VALUES (?,'death',?,?,?,?,?,?,?, ?,?,?,?,?)`).bind(claim.id,effectiveDate,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,quantity,payload.cause,reason,actorUserId,now,litterId));
  if (eventType === 'weaning') {
    for (const animal of selectedAnimals) {
      statements.unshift(db.prepare(`INSERT INTO litter_event_guard (guard_id) SELECT CASE WHEN EXISTS (
        SELECT 1 FROM animals a WHERE a.id=? AND a.litter_id=? AND a.sex=? AND a.status='activo' AND a.current_stage_code='preinicio'
          AND a.barn_id=? AND a.location_code IS ? AND a.lot_code IS ?
          AND NOT EXISTS (SELECT 1 FROM animal_location_history h WHERE h.animal_id=a.id AND h.valid_from>=?)
          AND NOT EXISTS (SELECT 1 FROM inventory_movements m JOIN operation_log o ON o.id=m.operation_log_id WHERE m.animal_id=a.id AND m.litter_id=a.litter_id AND m.quantity<0 AND m.effective_date<=? AND o.operation_type='litter.weaning')
      ) THEN 0 ELSE -1 END`).bind(animal.id,litterId,sex,litter.barn_id,litter.location_code,litter.lot_code,effectiveDate,effectiveDate));
      statements.push(db.prepare('UPDATE animal_location_history SET valid_until=? WHERE animal_id=? AND valid_until IS NULL').bind(effectiveDate,animal.id));
      statements.push(db.prepare(`INSERT INTO animal_location_history (animal_id,barn_id,location_code,lot_code,stage_code,valid_from,valid_until,operation_log_id,created_by_user_id,created_at)
        VALUES (?,?,?,?,?,?,NULL,?,?,?)`).bind(animal.id,targetBarnId,destinationLocation,destinationLot,destinationStage,effectiveDate,claim.id,actorUserId,now));
      statements.push(db.prepare('UPDATE animals SET barn_id=?,location_code=?,lot_code=?,current_stage_code=?,updated_at=? WHERE id=?').bind(targetBarnId,destinationLocation,destinationLot,destinationStage,now,animal.id));
      statements.push(db.prepare(`INSERT INTO inventory_movements
        (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,animal_id,created_by_user_id,created_at,litter_id)
        VALUES (?,'adjustment',?,?,?,?,?,?,-1,?,?,?,?,?)`).bind(claim.id,effectiveDate,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,`Destete camada ${litterId}: ${reason}`,animal.id,actorUserId,now,litterId));
      statements.push(db.prepare(`INSERT INTO inventory_movements
        (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,animal_id,created_by_user_id,created_at,litter_id)
        VALUES (?,'adjustment',?,?,?,?,?,?,1,?,?,?,?,?)`).bind(claim.id,effectiveDate,targetBarnId,destinationLocation,destinationLot,destinationStage,sex,`Destino de destete ${litterId}: ${reason}`,animal.id,actorUserId,now,litterId));
    }
    const groupedQuantity=quantity-selectedAnimals.length;
    if (groupedQuantity) statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'adjustment',?,?,?,?,?,?,?, ?,?,?,?)`).bind(claim.id,effectiveDate,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,-groupedQuantity,`Destete camada ${litterId}: ${reason}`,actorUserId,now,litterId));
    if (groupedQuantity) statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'adjustment',?,?,?,?,?,?,?, ?,?,?,?)`).bind(claim.id,effectiveDate,targetBarnId,destinationLocation,destinationLot,destinationStage,sex,groupedQuantity,`Destino de destete ${litterId}: ${reason}`,actorUserId,now,litterId));
    statements.push(db.prepare(`UPDATE litters SET actual_weaning_date=? WHERE id=? AND actual_weaning_date IS NULL
      AND male_alive+COALESCE((SELECT SUM(CASE WHEN event_type='adoption_in' THEN quantity ELSE -quantity END) FROM litter_events WHERE litter_id=litters.id AND sex='macho'),0)=0
      AND female_alive+COALESCE((SELECT SUM(CASE WHEN event_type='adoption_in' THEN quantity ELSE -quantity END) FROM litter_events WHERE litter_id=litters.id AND sex='hembra'),0)=0
      AND unsexed_alive+COALESCE((SELECT SUM(CASE WHEN event_type='adoption_in' THEN quantity ELSE -quantity END) FROM litter_events WHERE litter_id=litters.id AND sex='pendiente'),0)=0`).bind(effectiveDate,litterId));
  }
  if (eventType === 'death' || eventType === 'weaning') {
    statements.unshift(db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)'));
    statements.push(stockGuardStatement(db,Number(litter.barn_id),litter.location_code===null?null:String(litter.location_code),litter.lot_code===null?null:String(litter.lot_code),'preinicio',sex));
    if (eventType === 'weaning') statements.push(stockGuardStatement(db,targetBarnId!,destinationLocation,destinationLot,destinationStage!,sex));
    statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  }
  statements.push(db.prepare('DELETE FROM litter_event_guard'));
  await commitOperation(db,claim,statements,[{entityType:'litter',entityId:0,action:'update',actorUserId,barnId:Number(litter.barn_id),reason,
    previousData:{available,sex},newData:payload,effectiveDate,recordedAt:now}]);
  return {replayed:false,balance:await litterBalance(db,litter,sex)};
}

export async function recordFarrowing(db: D1Database, actorUserId: number, cycleId: string, input: FarrowingInput, scope: { allowedBarnNames?: string[] | null } = {}) {
  const cycle = await db.prepare(`SELECT c.*, a.code AS female_code, a.entry_date, a.exit_date
    FROM reproduction_cycles c JOIN animals a ON a.id=c.female_animal_id WHERE c.id=?`).bind(cycleId).first<Row>();
  if (!cycle) throw new ApiError(404, 'Ciclo reproductivo no encontrado');
  const farrowingDate = String(input.farrowingDate ?? '');
  if (!isValidDateString(farrowingDate) || farrowingDate > currentFarmDate()) throw new ApiError(400, 'Fecha de parto inválida o futura');
  if (farrowingDate < String(cycle.cycle_opened_on) && Number(cycle.antecedent) !== 1) throw new ApiError(400, 'El parto debe ser posterior al inicio del ciclo');
  if (cycle.exit_date && farrowingDate > String(cycle.exit_date)) throw new ApiError(400, 'La hembra ya no estaba en la granja en la fecha del parto');
  const historicalOnly = farrowingDate < String(cycle.entry_date);
  if (historicalOnly && Number(cycle.antecedent) !== 1) throw new ApiError(400, 'Solo un ciclo antecedente admite partos previos al ingreso');
  const location = historicalOnly ? null : await db.prepare(`SELECT barn_id,location_code,lot_code FROM animal_location_history
    WHERE animal_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?) ORDER BY valid_from DESC,id DESC LIMIT 1`)
    .bind(cycle.female_animal_id, farrowingDate, farrowingDate).first<Row>();
  if (!historicalOnly && !location) throw new ApiError(409, 'No hay ubicación histórica de la hembra para el parto');
  const barnId = Number(location?.barn_id ?? cycle.barn_id);
  if (scope.allowedBarnNames) {
    const barn = await db.prepare('SELECT name FROM barns WHERE id=?').bind(barnId).first<{ name: string }>();
    if (!barn || !scope.allowedBarnNames.includes(barn.name)) throw new ApiError(403, 'No tiene acceso al galpón del parto');
  }
  if (cycle.cycle_status !== 'open' && cycle.cycle_status !== 'farrowed') throw new ApiError(409, 'El ciclo no admite registro de parto');
  const maleAlive = optionalCount(input.maleAlive, 'Machos vivos');
  const femaleAlive = optionalCount(input.femaleAlive, 'Hembras vivas');
  const unsexedAlive = optionalCount(input.unsexedAlive, 'Vivos pendientes de sexado');
  const maleStillborn = optionalCount(input.maleStillborn, 'Machos muertos');
  const femaleStillborn = optionalCount(input.femaleStillborn, 'Hembras muertas');
  const unsexedStillborn = optionalCount(input.unsexedStillborn, 'Muertos pendientes de sexado');
  const liveCount = maleAlive + femaleAlive + unsexedAlive;
  const stillbornCount = maleStillborn + femaleStillborn + unsexedStillborn;
  const totalBorn = liveCount + stillbornCount;
  const mortalityPercent = totalBorn ? stillbornCount * 100 / totalBorn : null;
  const weight = input.averageWeightKg === undefined || input.averageWeightKg === null || input.averageWeightKg === '' ? null : Number(input.averageWeightKg);
  if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 10 || !liveCount)) throw new ApiError(400, 'El peso promedio debe ser positivo, hasta 10 kg y requiere nacidos vivos');
  const parityInput = input.parityNumber === undefined || input.parityNumber === '' ? null : Number(input.parityNumber);
  const cycleLitter = await db.prepare('SELECT parity_number FROM litters WHERE cycle_id=?').bind(cycleId).first<{ parity_number: number }>();
  const prior = await db.prepare('SELECT COALESCE(MAX(parity_number),0) AS n FROM litters WHERE female_animal_id=?').bind(cycle.female_animal_id).first<{ n: number }>();
  const parityNumber = parityInput ?? Number(cycleLitter?.parity_number ?? (Number(prior?.n ?? 0) + 1));
  if (!Number.isSafeInteger(parityNumber) || parityNumber < 1) throw new ApiError(400, 'Número de parto inválido');
  const config = await getConfigSnapshot(db, farrowingDate);
  const lactation = config.stages.find((stage) => stage.code === 'lactancia');
  const expectedWeaningDate = lactation?.durationDays ? addDays(farrowingDate, lactation.durationDays) : null;
  const observations = optionalText(input.observations, 'Observaciones', 1000);
  const reason = normalizeReason(input.reason, { required: true, fallback: 'Registro de parto y camada' });
  const father = await db.prepare(`SELECT sire_code_snapshot, sire_breed_snapshot FROM reproduction_services WHERE cycle_id=?
    ORDER BY service_date DESC,service_number DESC LIMIT 1`).bind(cycleId).first<Row>();
  const payload = { cycleId, farrowingDate, parityNumber, maleAlive, femaleAlive, unsexedAlive, maleStillborn, femaleStillborn, unsexedStillborn, weight, observations, historicalOnly };
  const existing = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (existing) return { replayed: true, litterId: String((existing.result as { litterId: string }).litterId), liveCount, stillbornCount, totalBorn, mortalityPercent, expectedWeaningDate, historicalOnly };
  if (cycle.cycle_status !== 'open') throw new ApiError(409, 'El ciclo ya tiene un parto registrado');
  const id = crypto.randomUUID();
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'reproduction.farrowing', authorUserId: actorUserId,
    entityType: 'litter', entityId: null, barnId, effectiveDate: farrowingDate, payload, result: { litterId: id } });
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO litters
    (id,cycle_id,female_animal_id,parity_number,farrowing_date,barn_id,location_code,lot_code,father_code_snapshot,father_breed_snapshot,
    male_alive,female_alive,unsexed_alive,male_stillborn,female_stillborn,unsexed_stillborn,live_count,stillborn_count,total_born,mortality_percent,
    average_weight_kg,expected_weaning_date,observations,historical_only,created_by_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, cycleId, cycle.female_animal_id, parityNumber, farrowingDate, barnId,
      location?.location_code ?? null, location?.lot_code ?? null, father?.sire_code_snapshot ?? null, father?.sire_breed_snapshot ?? null,
      maleAlive,femaleAlive,unsexedAlive,maleStillborn,femaleStillborn,unsexedStillborn,liveCount,stillbornCount,totalBorn,mortalityPercent,weight,expectedWeaningDate,observations,historicalOnly?1:0,actorUserId,claim.recordedAt),
    db.prepare(`UPDATE reproduction_cycles SET cycle_status='farrowed',reproductive_status='gestation',last_farrowing_date=?,updated_at=? WHERE id=? AND cycle_status='open'`).bind(farrowingDate,claim.recordedAt,cycleId)];
  if (!historicalOnly) {
    const locationCode = location?.location_code == null ? null : String(location.location_code);
    const lotCode = location?.lot_code == null ? null : String(location.lot_code);
    const groups = [['macho',maleAlive],['hembra',femaleAlive],['pendiente',unsexedAlive]] as const;
    for (const [sex, quantity] of groups) if (quantity > 0) statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,cause_code,transfer_group_id,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'birth',?,?,?,?,?, ?,?,NULL,NULL,?,?,?,?)`).bind(claim.id,farrowingDate,barnId,locationCode,lotCode,'preinicio',sex,quantity,
        `Parto ${String(cycle.female_code)} · camada ${id}`,actorUserId,claim.recordedAt,id));
    statements.push(db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)'));
    for (const [sex, quantity] of groups) if (quantity > 0) statements.push(stockGuardStatement(db,barnId,locationCode,lotCode,'preinicio',sex));
    statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  }
  await commitOperation(db, claim, statements, [{ entityType: 'litter', entityId: 0, action: 'create', actorUserId, barnId, reason,
    previousData: null, newData: { ...payload, litterId:id, liveCount, stillbornCount,totalBorn,mortalityPercent,expectedWeaningDate },effectiveDate:farrowingDate,recordedAt:claim.recordedAt }]);
  return { replayed:false,litterId:id,liveCount,stillbornCount,totalBorn,mortalityPercent,expectedWeaningDate,historicalOnly };
}

export async function correctLitter(db: D1Database, actorUserId: number, litterId: string, input: FarrowingInput, scope: { allowedBarnNames?: string[] | null } = {}) {
  const litter = await db.prepare('SELECT * FROM litters WHERE id=?').bind(litterId).first<Row>();
  if (!litter) throw new ApiError(404, 'Camada no encontrada');
  if (Number(litter.historical_only) === 1) throw new ApiError(409, 'El antecedente histórico no afecta el inventario actual');
  const barn = await db.prepare('SELECT name FROM barns WHERE id=?').bind(litter.barn_id).first<{name:string}>();
  if (scope.allowedBarnNames && (!barn || !scope.allowedBarnNames.includes(barn.name))) throw new ApiError(403, 'No tiene acceso al galpón de la camada');
  const keys = ['maleAlive','femaleAlive','unsexedAlive','maleStillborn','femaleStillborn','unsexedStillborn'] as const;
  const fields = ['male_alive','female_alive','unsexed_alive','male_stillborn','female_stillborn','unsexed_stillborn'] as const;
  const counts = keys.map((key,index) => input[key] === undefined ? Number(litter[fields[index]]) : optionalCount(input[key], key));
  const [maleAlive,femaleAlive,unsexedAlive,maleStillborn,femaleStillborn,unsexedStillborn] = counts;
  const liveCount = maleAlive + femaleAlive + unsexedAlive;
  const stillbornCount = maleStillborn + femaleStillborn + unsexedStillborn;
  const totalBorn = liveCount + stillbornCount;
  const mortalityPercent = totalBorn ? stillbornCount * 100 / totalBorn : null;
  const reason = normalizeReason(input.reason, { required:true });
  const expectedCounts = input.expectedCounts === undefined ? null : input.expectedCounts;
  if (expectedCounts !== null && (!Array.isArray(expectedCounts) || expectedCounts.length !== 6 || expectedCounts.some(value => !Number.isSafeInteger(value) || value < 0))) throw new ApiError(400,'Los valores originales de la camada son inválidos');
  const payload = { litterId, counts, reason, ...(expectedCounts ? {expectedCounts} : {}) };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { replayed:true, litterId, liveCount, stillbornCount, totalBorn, mortalityPercent };
  const originalCounts=fields.map(field=>Number(litter[field]));
  if (expectedCounts && expectedCounts.some((value,index)=>value!==originalCounts[index])) throw new ApiError(409,'La camada cambió desde que abrió el formulario; actualice los datos antes de corregir');
  const identifiedRows = await db.prepare(`SELECT sex,COUNT(*) AS n FROM animals WHERE litter_id=? AND status='activo' GROUP BY sex`).bind(litterId).all<{sex:string;n:number}>();
  const identified = new Map((identifiedRows.results??[]).map((row) => [row.sex,Number(row.n)]));
  if (identified.get('macho')! > maleAlive || identified.get('hembra')! > femaleAlive || identified.get('pendiente')! > unsexedAlive) {
    throw new ApiError(409, 'No se puede reducir la camada: ya hay más cabezas individualizadas que las cantidades propuestas');
  }
  const eventRows=await db.prepare('SELECT id,sex,event_type,quantity FROM litter_events WHERE litter_id=? ORDER BY effective_date,id').bind(litterId).all<{id:number;sex:string;event_type:string;quantity:number}>();
  const remaining:Record<string,number>={macho:maleAlive,hembra:femaleAlive,pendiente:unsexedAlive};
  for(const event of eventRows.results??[]){remaining[event.sex]+=(event.event_type==='adoption_in'?1:-1)*Number(event.quantity);if(remaining[event.sex]<0)throw new ApiError(409,`La corrección de ${event.sex} contradice bajas, adopciones o destetes anteriores; concilie primero la camada`);}
  const lastEventId=(eventRows.results??[]).reduce((max,event)=>Math.max(max,Number(event.id)),0);
  const births=(await db.prepare("SELECT b.id,b.sex,b.quantity,(SELECT MIN(root.id) FROM inventory_movements root WHERE root.litter_id=b.litter_id AND root.sex=b.sex AND root.movement_type='birth') AS root_id FROM inventory_movements b WHERE b.litter_id=? AND b.movement_type='birth' AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reverses_movement_id=b.id AND r.movement_type='adjustment' AND r.notes LIKE 'Reversión del movimiento #%')").bind(litterId).all<{id:number;sex:string;quantity:number;root_id:number}>()).results??[];
  const legacyAdjustments=(await db.prepare("SELECT m.id,m.sex,m.quantity,m.effective_date FROM inventory_movements m JOIN operation_log o ON o.id=m.operation_log_id WHERE m.litter_id=? AND m.movement_type='adjustment' AND m.reverses_movement_id IS NULL AND o.operation_type='reproduction.litter.correction' AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reverses_movement_id=m.id AND r.movement_type='adjustment' AND r.notes LIKE 'Reversión del movimiento #%')").bind(litterId).all<{id:number;sex:string;quantity:number;effective_date:string}>()).results??[];
  const movementSnapshot=await db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM inventory_movements WHERE litter_id=?').bind(litterId).first<{id:number}>();
  const claim = await createOperationClaim({ operationKey:input.operationKey, operationType:'reproduction.litter.correction', authorUserId:actorUserId,
    entityType:'litter', entityId:null, barnId:Number(litter.barn_id), effectiveDate:currentFarmDate(), payload, result:{litterId,liveCount} });
  const now = claim.recordedAt;
  const statements: D1PreparedStatement[] = [db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)'),
    db.prepare(`INSERT INTO inventory_write_guard (guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM litters
      WHERE id=? AND male_alive=? AND female_alive=? AND unsexed_alive=? AND male_stillborn=? AND female_stillborn=? AND unsexed_stillborn=? AND farrowing_date=?)
      AND (SELECT COALESCE(MAX(id),0) FROM litter_events WHERE litter_id=?)=?
      AND (SELECT COALESCE(MAX(id),0) FROM inventory_movements WHERE litter_id=?)=?
      AND (SELECT COUNT(*) FROM animals WHERE litter_id=? AND sex='macho' AND status='activo')<=?
      AND (SELECT COUNT(*) FROM animals WHERE litter_id=? AND sex='hembra' AND status='activo')<=?
      AND (SELECT COUNT(*) FROM animals WHERE litter_id=? AND sex='pendiente' AND status='activo')<=?
      THEN 0 ELSE -1 END`).bind(litterId,...originalCounts,litter.farrowing_date,litterId,lastEventId,litterId,movementSnapshot?.id??0,litterId,maleAlive,litterId,femaleAlive,litterId,unsexedAlive)];
  const groups = [['macho',Number(litter.male_alive),maleAlive],['hembra',Number(litter.female_alive),femaleAlive],['pendiente',Number(litter.unsexed_alive),unsexedAlive]] as const;
  for (const [sex,previous,next] of groups) if (previous !== next) {
    for (const adjustment of legacyAdjustments.filter(item=>item.sex===sex)) statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,reverses_movement_id,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'adjustment',?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,adjustment.effective_date,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,-Number(adjustment.quantity),adjustment.id,`Reversión del movimiento #${adjustment.id}`,actorUserId,now,litterId));
    for (const birth of births.filter(item=>item.sex===sex)) statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,reverses_movement_id,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'adjustment',?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,litter.farrowing_date,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,-Number(birth.quantity),birth.id,`Reversión del movimiento #${birth.id}`,actorUserId,now,litterId));
    if (next>0) statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,reverses_movement_id,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'birth',?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,litter.farrowing_date,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,next,births.find(item=>item.sex===sex)?.root_id??null,`Corrección de camada ${litterId}: ${reason}`,actorUserId,now,litterId));
  }
  for (const [sex,previous,next] of groups) if (previous !== next) statements.push(stockGuardStatement(db,Number(litter.barn_id),litter.location_code===null?null:String(litter.location_code),litter.lot_code===null?null:String(litter.lot_code),'preinicio',sex));
  statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  statements.push(db.prepare(`UPDATE litters SET male_alive=?,female_alive=?,unsexed_alive=?,male_stillborn=?,female_stillborn=?,unsexed_stillborn=?,
    live_count=?,stillborn_count=?,total_born=?,mortality_percent=?,actual_weaning_date=CASE WHEN ?>0 THEN NULL ELSE actual_weaning_date END WHERE id=?`).bind(maleAlive,femaleAlive,unsexedAlive,maleStillborn,femaleStillborn,unsexedStillborn,liveCount,stillbornCount,totalBorn,mortalityPercent,remaining.macho+remaining.hembra+remaining.pendiente,litterId));
  statements.push(db.prepare(`INSERT INTO litter_corrections (litter_id,operation_log_id,reason,previous_data,new_data,effective_date,actor_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(litterId,claim.id,reason,JSON.stringify(Object.fromEntries(fields.map((field)=>[field,litter[field]]))),JSON.stringify(Object.fromEntries(fields.map((field,index)=>[field,counts[index]]))),currentFarmDate(),actorUserId,now));
  const committed=await commitOperation(db,claim,statements,[{entityType:'litter',entityId:0,action:'correct',actorUserId,barnId:Number(litter.barn_id),reason,
    previousData:Object.fromEntries(fields.map((field)=>[field,litter[field]])),newData:{...payload,liveCount,stillbornCount,totalBorn,mortalityPercent},effectiveDate:currentFarmDate(),recordedAt:now}]).catch((error:unknown)=>{if(/guard_id/.test(String(error)))throw new ApiError(409,'La camada o su inventario cambió; actualice los datos antes de corregir');throw error;});
  return {replayed:committed.replayed,litterId,liveCount,stillbornCount,totalBorn,mortalityPercent};
}

/** Rebooks the original birth quantities without modifying any original ledger row. */
export async function correctLitterDate(db:D1Database,actorUserId:number,litterId:string,input:LitterDateCorrectionInput,scope:{allowedBarnNames?:string[]|null}={}){
  const farrowingDate=String(input.farrowingDate??'');const expectedCurrentDate=String(input.expectedCurrentDate??'');
  if(!isValidDateString(farrowingDate)||farrowingDate>currentFarmDate()||!isValidDateString(expectedCurrentDate))throw new ApiError(400,'Indique fechas válidas y un parto no futuro');
  const reason=normalizeReason(input.reason,{required:true});const payload={litterId,farrowingDate,expectedCurrentDate,reason};
  const litter=await db.prepare(`SELECT l.*,a.entry_date,a.exit_date,a.barn_id AS animal_barn_id,a.updated_at AS animal_updated_at,c.cycle_opened_on,c.cycle_number,c.antecedent,c.updated_at AS cycle_updated_at FROM litters l JOIN animals a ON a.id=l.female_animal_id JOIN reproduction_cycles c ON c.id=l.cycle_id WHERE l.id=?`).bind(litterId).first<Row>();
  if(!litter)throw new ApiError(404,'Camada no encontrada');
  const barn=await db.prepare('SELECT name FROM barns WHERE id=?').bind(litter.barn_id).first<{name:string}>();
  if(scope.allowedBarnNames&&(!barn||!scope.allowedBarnNames.includes(barn.name)))throw new ApiError(403,'Sin acceso al galpón de la camada');
  if(scope.allowedBarnNames){const currentBarn=await db.prepare('SELECT name FROM barns WHERE id=?').bind(litter.animal_barn_id).first<{name:string}>();if(!currentBarn||!scope.allowedBarnNames.includes(currentBarn.name))throw new ApiError(403,'Sin acceso al galpón actual de la madre');}
  const replay=await lookupExistingOperation(db,actorUserId,input.operationKey,payload);if(replay)return{...(replay.result as {litterId:string;farrowingDate:string}),replayed:true};
  if(Number(litter.historical_only)===1)throw new ApiError(409,'Reconciliar el antecedente histórico antes de cambiar su fecha');
  if(String(litter.farrowing_date)!==expectedCurrentDate)throw new ApiError(409,'La fecha de la camada cambió; actualice antes de corregir');
  if(farrowingDate===expectedCurrentDate)throw new ApiError(400,'La nueva fecha debe ser distinta');
  if(farrowingDate<String(litter.entry_date)||(litter.exit_date&&farrowingDate>String(litter.exit_date))||(Number(litter.antecedent)!==1&&farrowingDate<String(litter.cycle_opened_on)))throw new ApiError(409,'La fecha no corresponde a la permanencia de la madre o al ciclo');

  const snapshot=await db.prepare(`SELECT (SELECT COALESCE(MAX(id),0) FROM inventory_movements WHERE litter_id=?) movements,(SELECT COALESCE(MAX(id),0) FROM litter_events WHERE litter_id=?) events,(SELECT COALESCE(MAX(id),0) FROM litter_corrections WHERE litter_id=?) corrections,(SELECT COALESCE(MAX(id),0) FROM animal_location_history WHERE animal_id=?) history,(SELECT COUNT(*) FROM litters WHERE female_animal_id=?) parities,(SELECT COALESCE(MAX(lc.id),0) FROM litter_corrections lc JOIN litters l ON l.id=lc.litter_id WHERE l.female_animal_id=?) family_corrections`).bind(litterId,litterId,litterId,litter.female_animal_id,litter.female_animal_id,litter.female_animal_id).first<Row>();
  const location=await db.prepare('SELECT barn_id,location_code,lot_code FROM animal_location_history WHERE animal_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?) ORDER BY valid_from DESC,id DESC LIMIT 1').bind(litter.female_animal_id,farrowingDate,farrowingDate).first<Row>();
  if(!location||location.barn_id!==litter.barn_id||location.location_code!==litter.location_code||location.lot_code!==litter.lot_code)throw new ApiError(409,'La nueva fecha cambia la ubicación histórica; reconcilie el origen antes de corregir');
  const invalid=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM animals WHERE litter_id=?) identified,
    (SELECT COUNT(*) FROM reproduction_services WHERE cycle_id=? AND service_date>?) later_services,
    (SELECT COUNT(*) FROM reproduction_cycles c WHERE c.female_animal_id=? AND c.cycle_number>? AND (c.cycle_opened_on<? OR EXISTS(SELECT 1 FROM reproduction_services s WHERE s.cycle_id=c.id AND s.service_date<?))) later_cycles,
    (SELECT COUNT(*) FROM litters WHERE female_animal_id=? AND id<>? AND ((parity_number<? AND farrowing_date>=?) OR (parity_number>? AND farrowing_date<=?))) invalid_parities,
    (SELECT COUNT(*) FROM litter_events WHERE litter_id=? AND effective_date<?) earlier_events,
    (SELECT COUNT(*) FROM inventory_movements im JOIN operation_log o ON o.id=im.operation_log_id WHERE im.litter_id=? AND im.movement_type<>'birth' AND (o.operation_type NOT IN ('reproduction.litter.date_correction','reproduction.litter.correction') OR (o.operation_type='reproduction.litter.correction' AND im.reverses_movement_id IS NULL AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reverses_movement_id=im.id AND r.movement_type='adjustment' AND r.notes LIKE 'Reversión del movimiento #%'))) AND im.effective_date<?) earlier_movements,
    (SELECT COUNT(*) FROM vaccine_occurrences v JOIN vaccine_rules r ON r.id=v.rule_version_id WHERE v.status='pending' AND v.source_event_type='farrowing' AND v.source_event_id=? AND (date(?,printf('%+d days',r.offset_days))<? OR (? IS NOT NULL AND date(?,printf('%+d days',r.offset_days))>?))) early_vaccines`).bind(litterId,litter.cycle_id,farrowingDate,litter.female_animal_id,litter.cycle_number,farrowingDate,farrowingDate,litter.female_animal_id,litterId,litter.parity_number,farrowingDate,litter.parity_number,farrowingDate,litterId,farrowingDate,litterId,farrowingDate,litterId,farrowingDate,litter.entry_date,litter.exit_date,farrowingDate,litter.exit_date).first<Row>();
  if(Object.values(invalid??{}).some(value=>Number(value)>0)||(litter.actual_weaning_date&&farrowingDate>String(litter.actual_weaning_date)))throw new ApiError(409,'La corrección requiere reconciliar identificados, servicios, eventos posteriores o vacunas fuera de permanencia');
  const originalBirths=(await db.prepare("SELECT b.id,b.sex,b.quantity,b.effective_date,(SELECT MIN(root.id) FROM inventory_movements root WHERE root.litter_id=b.litter_id AND root.sex=b.sex AND root.movement_type='birth') AS root_id FROM inventory_movements b WHERE b.litter_id=? AND b.movement_type='birth' AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reverses_movement_id=b.id AND r.movement_type='adjustment' AND r.notes LIKE 'Reversión del movimiento #%')").bind(litterId).all<{id:number;sex:'macho'|'hembra'|'pendiente';quantity:number;effective_date:string;root_id:number}>()).results??[];
  const config=await getConfigSnapshot(db,farrowingDate);const lactation=config.stages.find(stage=>stage.code==='lactancia');const expectedWeaningDate=lactation?.durationDays?addDays(farrowingDate,lactation.durationDays):null;
  const result={litterId,farrowingDate,expectedWeaningDate};const claim=await createOperationClaim({operationKey:input.operationKey,operationType:'reproduction.litter.date_correction',authorUserId:actorUserId,entityType:'litter',entityId:null,barnId:Number(litter.barn_id),effectiveDate:currentFarmDate(),payload,result});
  const statements:D1PreparedStatement[]=[db.prepare(`INSERT INTO litter_identification_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM litters l JOIN animals a ON a.id=l.female_animal_id JOIN reproduction_cycles c ON c.id=l.cycle_id WHERE l.id=? AND l.farrowing_date=? AND a.updated_at=? AND c.updated_at=?) AND NOT EXISTS(SELECT 1 FROM animals WHERE litter_id=?) AND (SELECT COALESCE(MAX(id),0) FROM inventory_movements WHERE litter_id=?)=? AND (SELECT COALESCE(MAX(id),0) FROM litter_events WHERE litter_id=?)=? AND (SELECT COALESCE(MAX(id),0) FROM litter_corrections WHERE litter_id=?)=? AND (SELECT COALESCE(MAX(id),0) FROM animal_location_history WHERE animal_id=?)=? THEN 0 ELSE -1 END`).bind(litterId,expectedCurrentDate,litter.animal_updated_at,litter.cycle_updated_at,litterId,litterId,snapshot?.movements,litterId,snapshot?.events,litterId,snapshot?.corrections,litter.female_animal_id,snapshot?.history),db.prepare('INSERT INTO inventory_write_guard(guard_id) VALUES(1)')];
  statements.unshift(db.prepare(`INSERT INTO litter_identification_guard(guard_id) SELECT CASE WHEN (SELECT COUNT(*) FROM litters WHERE female_animal_id=?)=? AND (SELECT COALESCE(MAX(lc.id),0) FROM litter_corrections lc JOIN litters l ON l.id=lc.litter_id WHERE l.female_animal_id=?)=? THEN 0 ELSE -1 END`).bind(litter.female_animal_id,snapshot?.parities,litter.female_animal_id,snapshot?.family_corrections));
  statements.unshift(db.prepare(`INSERT INTO litter_identification_guard(guard_id) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM reproduction_cycles c WHERE c.female_animal_id=? AND c.cycle_number>? AND (c.cycle_opened_on<? OR EXISTS(SELECT 1 FROM reproduction_services s WHERE s.cycle_id=c.id AND s.service_date<?))) THEN 0 ELSE -1 END`).bind(litter.female_animal_id,litter.cycle_number,farrowingDate,farrowingDate));
  for(const birth of originalBirths){
    for(const [date,quantity,type,notes]of [[birth.effective_date,-Number(birth.quantity),'adjustment',`Reversión del movimiento #${birth.id}`],[farrowingDate,Number(birth.quantity),'birth',`Corrección de fecha del movimiento #${birth.id}: ${reason}`]] as const)statements.push(db.prepare(`INSERT INTO inventory_movements(operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,reverses_movement_id,notes,created_by_user_id,created_at,litter_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,type,date,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',birth.sex,quantity,type==='birth'?birth.root_id:birth.id,notes,actorUserId,claim.recordedAt,litterId));
    statements.push(stockGuardStatement(db,Number(litter.barn_id),litter.location_code===null?null:String(litter.location_code),litter.lot_code===null?null:String(litter.lot_code),'preinicio',birth.sex));
  }
  statements.push(db.prepare(`INSERT INTO litter_identification_guard(guard_id) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vaccine_occurrences v JOIN vaccine_rules r ON r.id=v.rule_version_id JOIN animals a ON a.id=v.animal_id WHERE v.status='pending' AND v.source_event_type='farrowing' AND v.source_event_id=? AND (date(?,printf('%+d days',r.offset_days))<a.entry_date OR (a.exit_date IS NOT NULL AND date(?,printf('%+d days',r.offset_days))>a.exit_date))) THEN 0 ELSE -1 END`).bind(litterId,farrowingDate,farrowingDate));
  statements.push(db.prepare('UPDATE litters SET farrowing_date=?,expected_weaning_date=? WHERE id=? AND farrowing_date=?').bind(farrowingDate,expectedWeaningDate,litterId,expectedCurrentDate),db.prepare('UPDATE reproduction_cycles SET last_farrowing_date=?,updated_at=? WHERE id=?').bind(farrowingDate,claim.recordedAt,litter.cycle_id),db.prepare(`UPDATE vaccine_occurrences SET source_date=?,scheduled_date=date(?,printf('%+d days',(SELECT offset_days FROM vaccine_rules WHERE id=vaccine_occurrences.rule_version_id))),updated_at=? WHERE status='pending' AND source_event_type='farrowing' AND source_event_id=? AND rule_version_id IS NOT NULL`).bind(farrowingDate,farrowingDate,claim.recordedAt,litterId),db.prepare('INSERT INTO litter_corrections(litter_id,operation_log_id,reason,previous_data,new_data,effective_date,actor_user_id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(litterId,claim.id,reason,JSON.stringify({farrowingDate:expectedCurrentDate,expectedWeaningDate:litter.expected_weaning_date}),JSON.stringify(result),currentFarmDate(),actorUserId,claim.recordedAt),db.prepare('DELETE FROM inventory_write_guard'),db.prepare('DELETE FROM litter_identification_guard'));
  statements.push(db.prepare(`INSERT INTO vaccine_occurrences(rule_key,rule_version_id,animal_id,animal_code_snapshot,animal_type_snapshot,target_category_snapshot,source_event_type,source_event_id,source_date,occurrence_number,vaccine_name_snapshot,scheduled_date,status,is_manual,created_by_user_id,created_at,updated_at)
    SELECT r.rule_key,r.id,a.id,a.code,a.animal_type,r.target_category,'farrowing',l.id,l.farrowing_date,1,r.vaccine_name,date(l.farrowing_date,printf('%+d days',r.offset_days)),'pending',0,?,?,?
    FROM litters l JOIN animals a ON a.id=l.female_animal_id JOIN vaccine_rules r ON r.base_event='farrowing' AND r.is_active=1 AND r.is_current=1 AND r.target_category=CASE WHEN a.animal_type='cerda' THEN CASE WHEN (SELECT COALESCE(MAX(parity_number),0) FROM litters WHERE female_animal_id=a.id AND historical_only=0)>0 THEN 'cerda_multipara' ELSE 'cerda_primeriza' END ELSE a.animal_type END
    WHERE l.id=? AND l.historical_only=0 AND a.is_active=1 AND a.exit_date IS NULL AND date(l.farrowing_date,printf('%+d days',r.offset_days))>=a.entry_date AND EXISTS(SELECT 1 FROM animal_location_history h WHERE h.animal_id=a.id AND h.valid_from<=date(l.farrowing_date,printf('%+d days',r.offset_days)) AND (h.valid_until IS NULL OR h.valid_until>date(l.farrowing_date,printf('%+d days',r.offset_days))))
    ON CONFLICT(rule_key,animal_id,source_event_type,source_event_id,occurrence_number) DO NOTHING`).bind(actorUserId,claim.recordedAt,claim.recordedAt,litterId));
  const committed=await commitOperation(db,claim,statements,[{entityType:'litter',entityId:0,action:'correct',actorUserId,barnId:Number(litter.barn_id),reason,previousData:{litterId,farrowingDate:expectedCurrentDate},newData:result,effectiveDate:currentFarmDate(),recordedAt:claim.recordedAt}]);
  return{...result,replayed:committed.replayed};
}

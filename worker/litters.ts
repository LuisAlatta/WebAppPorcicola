import { getConfigSnapshot } from './config';
import { ApiError, commitOperation, createOperationClaim, currentFarmDate, isValidDateString, lookupExistingOperation, normalizeReason } from './events';
import { stockGuardStatement } from './inventory';

type Row = Record<string, unknown>;
export type FarrowingInput = {
  farrowingDate?: unknown; parityNumber?: unknown; maleAlive?: unknown; femaleAlive?: unknown; unsexedAlive?: unknown;
  maleStillborn?: unknown; femaleStillborn?: unknown; unsexedStillborn?: unknown; averageWeightKg?: unknown;
  observations?: unknown; reason?: unknown; operationKey?: string;
};
export type LitterEventInput = {
  eventType?: unknown; effectiveDate?: unknown; sex?: unknown; quantity?: unknown; destinationLitterId?: unknown;
  destinationStageCode?: unknown; destinationBarnId?: unknown; destinationLocationCode?: unknown; destinationLotCode?: unknown;
  weightKg?: unknown; cause?: unknown; reason?: unknown; observations?: unknown; operationKey?: string;
};
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
  if(lastSourceEvent?.date&&effectiveDate<String(lastSourceEvent.date)) throw new ApiError(409,'Registre el evento después del último movimiento de esta camada y sexo');
  const quantity = optionalCount(input.quantity, 'Cantidad');
  if (!quantity) throw new ApiError(400, 'La cantidad debe ser mayor que cero');
  const available = await litterBalance(db,litter,sex);
  const reason = optionalText(input.reason,'Motivo',300);
  if (!reason || reason.length < 5) throw new ApiError(400, 'Indique un motivo de al menos 5 caracteres');
  const observations = optionalText(input.observations,'Observaciones',1000);
  const weightKg = input.weightKg === undefined || input.weightKg === '' ? null : Number(input.weightKg);
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 50)) throw new ApiError(400, 'Peso promedio de destete inválido');
  if (eventType === 'weaning' && weightKg === null) throw new ApiError(400, 'Indique el peso promedio de destete');
  let target: Row | null = null;
  let targetBarnId: number | null = null;
  let destinationStage: string | null = null;
  let destinationLocation: string | null = null;
  let destinationLot: string | null = null;
  if (eventType === 'adoption') {
    const targetId = String(input.destinationLitterId ?? '');
    target = await db.prepare('SELECT * FROM litters WHERE id=?').bind(targetId).first<Row>();
    if (!target || target.id === litter.id || Number(target.historical_only) === 1 || effectiveDate < String(target.farrowing_date)) throw new ApiError(400, 'Seleccione una camada destino válida');
    const lastTargetEvent=await db.prepare('SELECT MAX(effective_date) AS date FROM litter_events WHERE litter_id=? AND sex=?').bind(targetId,sex).first<{date:string|null}>();
    if(lastTargetEvent?.date&&effectiveDate<String(lastTargetEvent.date)) throw new ApiError(409,'La adopción debe ser posterior al último movimiento de la camada destino');
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
    destinationLocation = optionalText(input.destinationLocationCode,'Ubicación destino',60);
    destinationLot = optionalText(input.destinationLotCode,'Lote destino',60);
    const config = await getConfigSnapshot(db,effectiveDate);
    if (!config.stages.some((stage)=>stage.code===destinationStage)) throw new ApiError(400,'Etapa destino no vigente');
    if (destinationLocation && !config.locations.some((location)=>location.code===destinationLocation)) throw new ApiError(400,'Ubicación destino no vigente');
    if (destinationLot && !config.lots.some((lot)=>lot.code===destinationLot)) throw new ApiError(400,'Lote destino no vigente');
  }
  const payload = { litterId,eventType,effectiveDate,sex,quantity,targetLitterId:target?.id??null,targetBarnId,destinationStage,destinationLocation,destinationLot,weightKg,cause:optionalText(input.cause,'Causa',120),reason,observations };
  if (eventType === 'death' && !payload.cause) throw new ApiError(400,'Indique la causa de la baja');
  const replay = await lookupExistingOperation(db,actorUserId,input.operationKey,payload);
  if (replay) return { replayed:true,balance:await litterBalance(db,litter,sex) };
  if (quantity > available) throw new ApiError(409, `La camada solo tiene ${available} cabezas pendientes de ese sexo`);
  const claim = await createOperationClaim({operationKey:input.operationKey,operationType:`litter.${eventType}`,authorUserId:actorUserId,
    entityType:'litter',entityId:null,barnId:Number(litter.barn_id),effectiveDate,payload,result:{litterId,eventType,quantity}});
  const now = claim.recordedAt;
  const initialCountColumn = sex==='macho'?'male_alive':sex==='hembra'?'female_alive':'unsexed_alive';
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO litter_event_guard (guard_id)
    SELECT CASE WHEN (SELECT ${initialCountColumn} FROM litters WHERE id=?) + COALESCE((SELECT SUM(CASE WHEN event_type='adoption_in' THEN quantity ELSE -quantity END)
      FROM litter_events WHERE litter_id=? AND sex=?),0) >= ? THEN 0 ELSE -1 END`).bind(litterId,litterId,sex,quantity),db.prepare(`INSERT INTO litter_events
    (operation_log_id,litter_id,event_type,effective_date,sex,quantity,destination_litter_id,destination_stage_code,destination_barn_id,destination_location_code,destination_lot_code,weight_kg,cause,reason,observations,created_by_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,litterId,eventType==='adoption'?'adoption_out':eventType,effectiveDate,sex,quantity,target?.id??null,destinationStage,targetBarnId,destinationLocation,destinationLot,weightKg,payload.cause,reason,observations,actorUserId,now)];
  if (eventType === 'adoption' && target) statements.push(db.prepare(`INSERT INTO litter_events
    (operation_log_id,litter_id,event_type,effective_date,sex,quantity,destination_litter_id,destination_barn_id,reason,observations,created_by_user_id,created_at)
    VALUES (?,?,'adoption_in',?,?,?,?,?,?,?,?,?)`).bind(claim.id,target.id,effectiveDate,sex,quantity,litterId,Number(target.barn_id),reason,observations,actorUserId,now));
  if (eventType === 'death') statements.push(db.prepare(`INSERT INTO inventory_movements
    (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,cause_code,notes,created_by_user_id,created_at,litter_id)
    VALUES (?,'death',?,?,?,?,?,?,?, ?,?,?,?,?)`).bind(claim.id,effectiveDate,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,quantity,payload.cause,reason,actorUserId,now,litterId));
  if (eventType === 'weaning') {
    statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'adjustment',?,?,?,?,?,?,?, ?,?,?,?)`).bind(claim.id,effectiveDate,litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,-quantity,`Destete camada ${litterId}: ${reason}`,actorUserId,now,litterId));
    statements.push(db.prepare(`INSERT INTO inventory_movements
      (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,created_by_user_id,created_at,litter_id)
      VALUES (?,'adjustment',?,?,?,?,?,?,?, ?,?,?,?)`).bind(claim.id,effectiveDate,targetBarnId,destinationLocation,destinationLot,destinationStage,sex,quantity,`Destino de destete ${litterId}: ${reason}`,actorUserId,now,litterId));
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
  const payload = { litterId, counts, reason };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { replayed:true, litterId, liveCount, stillbornCount, totalBorn, mortalityPercent };
  const identifiedRows = await db.prepare(`SELECT sex,COUNT(*) AS n FROM animals WHERE litter_id=? AND status='activo' GROUP BY sex`).bind(litterId).all<{sex:string;n:number}>();
  const identified = new Map((identifiedRows.results??[]).map((row) => [row.sex,Number(row.n)]));
  if (identified.get('macho')! > maleAlive || identified.get('hembra')! > femaleAlive || identified.get('pendiente')! > unsexedAlive) {
    throw new ApiError(409, 'No se puede reducir la camada: ya hay más cabezas individualizadas que las cantidades propuestas');
  }
  const claim = await createOperationClaim({ operationKey:input.operationKey, operationType:'reproduction.litter.correction', authorUserId:actorUserId,
    entityType:'litter', entityId:null, barnId:Number(litter.barn_id), effectiveDate:currentFarmDate(), payload, result:{litterId,liveCount} });
  const now = claim.recordedAt;
  const statements: D1PreparedStatement[] = [db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)')];
  const groups = [['macho',Number(litter.male_alive),maleAlive],['hembra',Number(litter.female_alive),femaleAlive],['pendiente',Number(litter.unsexed_alive),unsexedAlive]] as const;
  for (const [sex,previous,next] of groups) if (previous !== next) statements.push(db.prepare(`INSERT INTO inventory_movements
    (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,cause_code,transfer_group_id,notes,created_by_user_id,created_at,litter_id)
    VALUES (?,'adjustment',?,?,?,?,?,?,?,NULL,NULL,?,?,?,?)`).bind(claim.id,currentFarmDate(),litter.barn_id,litter.location_code,litter.lot_code,'preinicio',sex,next-previous,
      `Corrección de camada ${litterId}: ${reason}`,actorUserId,now,litterId));
  for (const [sex,previous,next] of groups) if (previous !== next) statements.push(stockGuardStatement(db,Number(litter.barn_id),litter.location_code===null?null:String(litter.location_code),litter.lot_code===null?null:String(litter.lot_code),'preinicio',sex));
  statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  statements.push(db.prepare(`UPDATE litters SET male_alive=?,female_alive=?,unsexed_alive=?,male_stillborn=?,female_stillborn=?,unsexed_stillborn=?,
    live_count=?,stillborn_count=?,total_born=?,mortality_percent=? WHERE id=?`).bind(maleAlive,femaleAlive,unsexedAlive,maleStillborn,femaleStillborn,unsexedStillborn,liveCount,stillbornCount,totalBorn,mortalityPercent,litterId));
  statements.push(db.prepare(`INSERT INTO litter_corrections (litter_id,operation_log_id,reason,previous_data,new_data,effective_date,actor_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(litterId,claim.id,reason,JSON.stringify(Object.fromEntries(fields.map((field)=>[field,litter[field]]))),JSON.stringify(Object.fromEntries(fields.map((field,index)=>[field,counts[index]]))),currentFarmDate(),actorUserId,now));
  await commitOperation(db,claim,statements,[{entityType:'litter',entityId:0,action:'correct',actorUserId,barnId:Number(litter.barn_id),reason,
    previousData:Object.fromEntries(fields.map((field)=>[field,litter[field]])),newData:{...payload,liveCount,stillbornCount,totalBorn,mortalityPercent},effectiveDate:currentFarmDate(),recordedAt:now}]);
  return {replayed:false,litterId,liveCount,stillbornCount,totalBorn,mortalityPercent};
}

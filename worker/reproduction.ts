import {
  ApiError, commitOperation, createOperationClaim, currentFarmDate, isValidDateString,
  lookupExistingOperation, normalizeReason,
} from './events';
import { getConfigSnapshot } from './config';

type Row = Record<string, unknown>;
export interface ReproductionScope { allowedBarnNames?: string[] | null }
export type LitterTarget = { litterId: string; motherCode: string; barnName: string; historicalOnly: boolean };
type ServiceInput = {
  femaleCode?: unknown; serviceDate?: unknown; serviceType?: unknown; sireCode?: unknown;
  sireBreed?: unknown; materialSource?: unknown; externalSource?: unknown; aptitude?: unknown;
  dueDate?: unknown; dueDateReason?: unknown; lastFarrowingDate?: unknown; observations?: unknown; operationKey?: string;
};
type EventInput = { eventType?: unknown; eventDate?: unknown; physiologicalStatus?: unknown;
  serviceId?: unknown; reason?: unknown; observations?: unknown; operationKey?: string };

const SERVICE_TYPES = ['monta_natural', 'inseminacion_artificial', 'transferencia_embriones'];
const PHYSIOLOGICAL_STATES = ['empty', 'possible_pregnancy', 'gestation', 'abortion'];
const DAY_MS = 86400000;

function date(value: unknown, field: string): string {
  if (!isValidDateString(value)) throw new ApiError(400, `${field} inválida: use AAAA-MM-DD`);
  return String(value);
}
function addDays(isoDate: string, days: number): string {
  const result = new Date(`${isoDate}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
function diffDays(isoDate: string, referenceDate: string): number {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / DAY_MS);
}
function optionalText(value: unknown, field: string, max = 300): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const result = String(value).trim();
  if (result.length > max) throw new ApiError(400, `${field} no puede superar ${max} caracteres`);
  return result;
}
function materialSource(value: unknown): 'internal' | 'external' {
  if (value === undefined || value === null || value === '' || value === 'internal') return 'internal';
  if (value === 'external') return 'external';
  throw new ApiError(400, 'Procedencia del material reproductivo no válida');
}
async function barnIds(db: D1Database, scope: ReproductionScope): Promise<number[] | null> {
  if (!scope.allowedBarnNames) return null;
  if (!scope.allowedBarnNames.length) return [];
  const placeholders = scope.allowedBarnNames.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT id FROM barns WHERE name IN (${placeholders})`).bind(...scope.allowedBarnNames).all<{ id: number }>();
  return (rows.results ?? []).map((item) => Number(item.id));
}
async function femaleAtDate(db: D1Database, code: string, effectiveDate: string, scope: ReproductionScope) {
  const female = await db.prepare(`SELECT id, code, sex, animal_type, breed, aptitude, entry_date, exit_date
    FROM animals WHERE code = ?`).bind(code).first<Row>();
  if (!female) throw new ApiError(404, 'Hembra no encontrada');
  if (female.sex !== 'hembra' || !['cerda', 'reemplazo'].includes(String(female.animal_type))) throw new ApiError(400, 'El animal seleccionado no es una hembra reproductiva');
  if (effectiveDate < String(female.entry_date) || (female.exit_date && effectiveDate > String(female.exit_date))) throw new ApiError(400, 'La hembra debe estar presente en la granja en la fecha del evento');
  const location = await db.prepare(`SELECT h.barn_id, h.location_code, h.lot_code FROM animal_location_history h
    WHERE h.animal_id = ? AND h.valid_from <= ? AND (h.valid_until IS NULL OR h.valid_until > ?)
    ORDER BY h.valid_from DESC, h.id DESC LIMIT 1`).bind(Number(female.id), effectiveDate, effectiveDate).first<Row>();
  if (!location) throw new ApiError(409, 'No existe ubicación histórica de la hembra para esa fecha');
  const barnId = Number(location.barn_id);
  const allowed = await barnIds(db, scope);
  if (allowed !== null && !allowed.includes(barnId)) throw new ApiError(403, 'No tiene acceso al galpón de la hembra en la fecha indicada');
  return { female, barnId, locationCode: location.location_code === null ? null : String(location.location_code), lotCode: location.lot_code === null ? null : String(location.lot_code) };
}
async function assertSireAccess(db: D1Database, sire: Row, effectiveDate: string, scope: ReproductionScope) {
  if (effectiveDate < String(sire.entry_date) || (sire.exit_date && effectiveDate > String(sire.exit_date))) throw new ApiError(400, 'El verraco no estaba presente en la granja en la fecha del servicio');
  const location = await db.prepare(`SELECT barn_id FROM animal_location_history WHERE animal_id=? AND valid_from<=?
    AND (valid_until IS NULL OR valid_until>?) ORDER BY valid_from DESC,id DESC LIMIT 1`).bind(Number(sire.id), effectiveDate, effectiveDate).first<{ barn_id: number }>();
  if (!location) throw new ApiError(409, 'No existe ubicación histórica del verraco para esa fecha');
  const allowed = await barnIds(db, scope);
  if (allowed !== null && !allowed.includes(Number(location.barn_id))) throw new ApiError(403, 'No tiene acceso al galpón del verraco en la fecha del servicio');
  return Number(location.barn_id);
}
function serviceLocationGuard(db:D1Database,context:Awaited<ReturnType<typeof femaleAtDate>>,sire:Row|null,sireBarnId:number|null,effectiveDate:string){
  return db.prepare(`INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM animals a JOIN animal_location_history h ON h.animal_id=a.id WHERE a.id=? AND a.entry_date<=? AND (a.exit_date IS NULL OR a.exit_date>=?) AND h.valid_from<=? AND (h.valid_until IS NULL OR h.valid_until>?) AND h.barn_id=? AND h.location_code IS ? AND h.lot_code IS ?) AND (? IS NULL OR EXISTS(SELECT 1 FROM animals a JOIN animal_location_history h ON h.animal_id=a.id WHERE a.id=? AND a.entry_date<=? AND (a.exit_date IS NULL OR a.exit_date>=?) AND h.valid_from<=? AND (h.valid_until IS NULL OR h.valid_until>?) AND h.barn_id=?)) THEN 0 ELSE -1 END`).bind(context.female.id,effectiveDate,effectiveDate,effectiveDate,effectiveDate,context.barnId,context.locationCode,context.lotCode,sire?.id??null,sire?.id??null,effectiveDate,effectiveDate,effectiveDate,effectiveDate,sireBarnId);
}
function reschedulePrepartum(db:D1Database,cycleId:string,dueDate:string,now:string){return [
  db.prepare(`INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vaccine_occurrences v JOIN vaccine_rules r ON r.id=v.rule_version_id JOIN animals a ON a.id=v.animal_id WHERE v.status='pending' AND v.source_event_type='expected_farrowing' AND v.source_event_id=? AND (date(?,printf('%+d days',r.offset_days))<a.entry_date OR (a.exit_date IS NOT NULL AND date(?,printf('%+d days',r.offset_days))>a.exit_date))) THEN 0 ELSE -1 END`).bind(cycleId,dueDate,dueDate),
  db.prepare(`UPDATE vaccine_occurrences SET source_date=?,scheduled_date=date(?,printf('%+d days',(SELECT offset_days FROM vaccine_rules WHERE id=vaccine_occurrences.rule_version_id))),updated_at=? WHERE status='pending' AND source_event_type='expected_farrowing' AND source_event_id=? AND rule_version_id IS NOT NULL`).bind(dueDate,dueDate,now,cycleId),
];}
function openCycleGuard(db:D1Database,cycleId:string,updatedAt:unknown){return db.prepare("INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM reproduction_cycles WHERE id=? AND cycle_status='open' AND updated_at=?) THEN 0 ELSE -1 END").bind(cycleId,updatedAt);}
function mapService(row: Row) {
  return { id: Number(row.id), serviceNumber: Number(row.service_number), serviceDate: String(row.service_date),
    serviceType: String(row.service_type), sireAnimalId: row.sire_animal_id === null ? null : Number(row.sire_animal_id),
    sireCode: row.sire_code_snapshot === null ? null : String(row.sire_code_snapshot), sireBreed: row.sire_breed_snapshot === null ? null : String(row.sire_breed_snapshot),
    materialSource: String(row.material_source), externalSource: row.external_source === null ? null : String(row.external_source),
    aptitude: row.aptitude === null ? null : String(row.aptitude), observations: row.observations === null ? null : String(row.observations) };
}
function mapEvent(row: Row) {
  return { id: Number(row.id), eventType: String(row.event_type), eventDate: String(row.event_date),
    physiologicalStatus: row.physiological_status === null ? null : String(row.physiological_status),
    serviceId: row.service_id === null ? null : Number(row.service_id), reason: row.reason === null ? null : String(row.reason),
    observations: row.observations === null ? null : String(row.observations) };
}

export async function listReproductionCycles(db: D1Database, filters: { from?: unknown; to?: unknown; status?: unknown } = {}, scope: ReproductionScope = {}) {
  const from = filters.from ? date(filters.from, 'Fecha inicial') : '0001-01-01';
  const to = filters.to ? date(filters.to, 'Fecha final') : '9999-12-31';
  if (from > to) throw new ApiError(400, 'El rango de fechas está invertido');
  const ids = await barnIds(db, scope);
  if (ids && !ids.length) return { cycles: [], dateCriterion: 'Fecha del servicio; antecedente usa fecha probable', asOf: currentFarmDate() };
  const clauses = ['COALESCE(c.service_anchor_date, c.probable_farrowing_date) BETWEEN ? AND ?'];
  const params: unknown[] = [from, to];
  if (ids) { clauses.push(`c.barn_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  if (filters.status === 'pending') clauses.push(`c.cycle_status = 'open' AND c.reproductive_status IN ('possible_pregnancy','gestation')`);
  else if (filters.status && filters.status !== 'all') { clauses.push('c.cycle_status = ?'); params.push(String(filters.status)); }
  const result = await db.prepare(`SELECT c.*, a.code AS female_code, a.alias AS female_alias,a.status AS female_status,a.is_active AS female_is_active,a.exit_date AS female_exit_date, b.name AS barn_name
    FROM reproduction_cycles c JOIN animals a ON a.id = c.female_animal_id JOIN barns b ON b.id=c.barn_id
    WHERE ${clauses.join(' AND ')} ORDER BY COALESCE(c.service_anchor_date,c.probable_farrowing_date) DESC,c.id DESC LIMIT 500`)
    .bind(...params).all<Row>();
  const today = currentFarmDate();
  const cycles = await Promise.all((result.results ?? []).map(async (row) => {
    const [serviceRows, eventRows, planRow, litterRow, previousLitter] = await Promise.all([
      db.prepare('SELECT * FROM reproduction_services WHERE cycle_id = ? ORDER BY service_date, service_number').bind(row.id).all<Row>(),
      db.prepare('SELECT * FROM reproduction_events WHERE cycle_id = ? ORDER BY event_date, id').bind(row.id).all<Row>(),
      db.prepare('SELECT * FROM reproduction_weaning_plans WHERE cycle_id=?').bind(row.id).first<Row>(),
      db.prepare('SELECT * FROM litters WHERE cycle_id=?').bind(row.id).first<Row>(),
      db.prepare(`SELECT id,actual_weaning_date,barn_id,historical_only FROM litters WHERE female_animal_id=? AND cycle_id<>? AND farrowing_date<=? ORDER BY farrowing_date DESC,id DESC LIMIT 1`).bind(row.female_animal_id,row.id,row.service_anchor_date??row.cycle_opened_on).first<Row>(),
    ]);
    const remainingDays = diffDays(String(row.probable_farrowing_date), today);
    const reproductiveStatus = row.cycle_status === 'farrowed' ? 'lactation' : String(row.reproductive_status);
    let litter = null;
    if (litterRow) {
      const [litterEvents, identifiedAnimals] = await Promise.all([
        db.prepare('SELECT event_type,sex,quantity FROM litter_events WHERE litter_id=?').bind(litterRow.id).all<{event_type:string;sex:string;quantity:number}>(),
        db.prepare(`SELECT a.code,a.sex FROM animals a WHERE a.litter_id=? AND a.status='activo' AND a.current_stage_code='preinicio'
          ${ids===null?'':`AND a.barn_id IN (${ids.map(()=>'?').join(',')})`} AND NOT EXISTS (SELECT 1 FROM inventory_movements m
            JOIN operation_log o ON o.id=m.operation_log_id WHERE m.animal_id=a.id AND m.litter_id=a.litter_id AND m.quantity<0 AND o.operation_type='litter.weaning') ORDER BY a.code`).bind(litterRow.id,...(ids??[])).all<{code:string;sex:string}>(),
      ]);
      const counts = { macho:Number(litterRow.male_alive), hembra:Number(litterRow.female_alive), pendiente:Number(litterRow.unsexed_alive) };
      for (const item of litterEvents.results ?? []) counts[item.sex as keyof typeof counts] += ['adoption_in','sale_return'].includes(item.event_type) ? Number(item.quantity) : -Number(item.quantity);
      litter = { id:String(litterRow.id), farrowingDate:String(litterRow.farrowing_date), liveCount:Number(litterRow.live_count), maleAlive:counts.macho, femaleAlive:counts.hembra, unsexedAlive:counts.pendiente,
        stillbornCount:Number(litterRow.stillborn_count), averageWeightKg:litterRow.average_weight_kg===null?null:Number(litterRow.average_weight_kg), expectedWeaningDate:litterRow.expected_weaning_date===null?null:String(litterRow.expected_weaning_date),
        actualWeaningDate:litterRow.actual_weaning_date===null?null:String(litterRow.actual_weaning_date), identifiedAnimals:identifiedAnimals.results ?? [], historicalOnly:Number(litterRow.historical_only)===1,
        birthCounts:{maleAlive:Number(litterRow.male_alive),femaleAlive:Number(litterRow.female_alive),unsexedAlive:Number(litterRow.unsexed_alive),maleStillborn:Number(litterRow.male_stillborn),femaleStillborn:Number(litterRow.female_stillborn),unsexedStillborn:Number(litterRow.unsexed_stillborn)} };
    }
    return { id: String(row.id), femaleAnimalId: Number(row.female_animal_id), femaleCode: String(row.female_code), femaleAlias: row.female_alias === null ? null : String(row.female_alias),
      cycleNumber: Number(row.cycle_number), cycleStatus: String(row.cycle_status), reproductiveStatus,
      femalePresent:row.female_status === 'activo' && Number(row.female_is_active) === 1 && row.female_exit_date === null,
      serviceAnchorDate: row.service_anchor_date === null ? null : String(row.service_anchor_date), gestationDays: Number(row.gestation_days),
      probableFarrowingDate: String(row.probable_farrowing_date), dueDateSource: String(row.due_date_source), dueDateReason: row.due_date_reason === null ? null : String(row.due_date_reason),
      daysRemaining: remainingDays, dueLabel: row.cycle_status !== 'open' ? 'cerrado' : reproductiveStatus === 'empty' ? 'sin gestación' : remainingDays < 0 ? 'vencido' : remainingDays === 0 ? 'previsto hoy' : 'próximo',
      barnId: Number(row.barn_id), barnName: String(row.barn_name), locationCode: row.location_code === null ? null : String(row.location_code), lotCode: row.lot_code === null ? null : String(row.lot_code),
      femaleBreed: row.female_breed_snapshot === null ? null : String(row.female_breed_snapshot), aptitude: row.aptitude === null ? null : String(row.aptitude),
      lastFarrowingDate: row.last_farrowing_date === null ? null : String(row.last_farrowing_date), observations: row.observations === null ? null : String(row.observations), antecedent: Number(row.antecedent) === 1,
      previousWeaningDate:previousLitter?.actual_weaning_date && (ids===null || ids.includes(Number(previousLitter.barn_id))) ? String(previousLitter.actual_weaning_date) : null,
      previousWeaningPending:!!previousLitter && !previousLitter.actual_weaning_date && Number(previousLitter.historical_only)!==1 && (ids===null || ids.includes(Number(previousLitter.barn_id))),
      weaningPlan: planRow ? { referenceWeaningDate:String(planRow.reference_weaning_date), heatIntervalDays:Number(planRow.heat_interval_days),
        firstRepeatIntervalDays:Number(planRow.first_repeat_interval_days), secondRepeatIntervalDays:Number(planRow.second_repeat_interval_days),
        expectedHeatDate:String(planRow.expected_heat_date), expectedFirstRepeatDate:String(planRow.expected_first_repeat_date), expectedSecondRepeatDate:String(planRow.expected_second_repeat_date),
        actualHeatDate:planRow.actual_heat_date===null?null:String(planRow.actual_heat_date), actualFirstRepeatDate:planRow.actual_first_repeat_date===null?null:String(planRow.actual_first_repeat_date),
        actualSecondRepeatDate:planRow.actual_second_repeat_date===null?null:String(planRow.actual_second_repeat_date) } : null,
      litter,
      services: (serviceRows.results ?? []).map(mapService), events: (eventRows.results ?? []).map(mapEvent) };
  }));
  return { cycles, dateCriterion: 'Fecha del último servicio; antecedente usa fecha probable', asOf: today };
}

export async function listLitterTargets(db: D1Database, scope: ReproductionScope = {}): Promise<{ targets: LitterTarget[] }> {
  const ids = await barnIds(db, scope);
  if (ids && !ids.length) return { targets: [] };
  const barnClause = ids ? `AND l.barn_id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = await db.prepare(`SELECT l.id AS litter_id, a.code AS mother_code, b.name AS barn_name, l.farrowing_date, l.historical_only
    FROM litters l
    JOIN reproduction_cycles c ON c.id = l.cycle_id
    JOIN animals a ON a.id = c.female_animal_id
    JOIN barns b ON b.id = l.barn_id
    WHERE l.historical_only = 0 ${barnClause}
    ORDER BY l.farrowing_date DESC, l.id DESC`)
    .bind(...(ids ?? []))
    .all<{ litter_id: string; mother_code: string; barn_name: string; farrowing_date: string; historical_only: number }>();
  return { targets: (rows.results ?? []).map((row) => ({
    litterId: String(row.litter_id),
    motherCode: String(row.mother_code),
    barnName: String(row.barn_name),
    farrowingDate: String(row.farrowing_date),
    historicalOnly: Number(row.historical_only) === 1,
  })) };
}

async function getGestationDays(db: D1Database, effectiveDate: string): Promise<number> {
  const config = await getConfigSnapshot(db, effectiveDate);
  const value = config.stages.find((stage) => stage.code === 'gestacion')?.durationDays;
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > 150) throw new ApiError(409, `Configure una duración de gestación válida antes de registrar el servicio (vigencia ${effectiveDate})`);
  return Number(value);
}

export async function createReproductionCycle(db: D1Database, actorUserId: number, input: ServiceInput, scope: ReproductionScope = {}) {
  const femaleCode = String(input.femaleCode ?? '').trim();
  if (!femaleCode) throw new ApiError(400, 'Seleccione la hembra');
  const serviceDate = date(input.serviceDate, 'Fecha de servicio');
  if (serviceDate > currentFarmDate()) throw new ApiError(400, 'La fecha de servicio no puede ser futura');
  const serviceType = String(input.serviceType ?? '');
  if (!SERVICE_TYPES.includes(serviceType)) throw new ApiError(400, 'Tipo de servicio no válido');
  const source = materialSource(input.materialSource);
  const externalSource = optionalText(input.externalSource, 'Procedencia externa', 160);
  const sireCode = optionalText(input.sireCode, 'Código del verraco', 40);
  if (source === 'external' && !externalSource) throw new ApiError(400, 'Indique la procedencia externa del material reproductivo');
  if (source === 'internal' && !sireCode) throw new ApiError(400, 'Seleccione el verraco o indique que el material es externo');
  const context = await femaleAtDate(db, femaleCode, serviceDate, scope);
  let sire: Row | null = null;
  let sireBarnId:number|null=null;
  if (source === 'internal') {
    sire = await db.prepare(`SELECT id, code, sex, animal_type, breed, entry_date, exit_date FROM animals WHERE code = ?`).bind(sireCode).first<Row>();
    if (!sire || sire.sex !== 'macho' || sire.animal_type !== 'verraco') throw new ApiError(400, 'El reproductor interno debe ser un verraco existente');
    sireBarnId=await assertSireAccess(db, sire, serviceDate, scope);
  }
  const gestationDays = await getGestationDays(db, serviceDate);
  const suppliedDue = input.dueDate ? date(input.dueDate, 'Fecha probable de parto') : null;
  if (suppliedDue && suppliedDue < serviceDate) throw new ApiError(400, 'La fecha probable de parto no puede preceder al servicio');
  const dueDate = suppliedDue ?? addDays(serviceDate, gestationDays);
  const dueDateSource = suppliedDue ? 'manual' : 'calculated';
  const dueDateReason = suppliedDue ? optionalText(input.dueDateReason, 'Motivo de fecha manual', 300) : null;
  if (suppliedDue && !dueDateReason) throw new ApiError(400, 'Indique el motivo de la fecha probable manual');
  const sireBreed = optionalText(input.sireBreed ?? sire?.breed, 'Raza del padre', 80);
  const aptitude = optionalText(input.aptitude ?? context.female.aptitude, 'Aptitud', 60);
  const priorFarrowing = input.lastFarrowingDate ? null : await db.prepare(`SELECT MAX(last_farrowing_date) AS date FROM reproduction_cycles
    WHERE female_animal_id=? AND last_farrowing_date IS NOT NULL`).bind(context.female.id).first<{ date: string | null }>();
  const lastFarrowing = input.lastFarrowingDate ? date(input.lastFarrowingDate, 'Último parto') : priorFarrowing?.date ?? null;
  if (lastFarrowing && lastFarrowing > serviceDate) throw new ApiError(400, 'El último parto no puede ser posterior al servicio');
  const observations = optionalText(input.observations, 'Observaciones', 1000);
  const previous = await db.prepare('SELECT MAX(cycle_number) AS n FROM reproduction_cycles WHERE female_animal_id = ?').bind(context.female.id).first<{ n: number | null }>();
  const cycleNumber = Number(previous?.n ?? 0) + 1;
  const id = crypto.randomUUID();
  const payload = { femaleCode, serviceDate, serviceType, sireCode, sireBreed, materialSource: source, externalSource, aptitude,
    gestationDays, dueDate, dueDateSource, dueDateReason, lastFarrowing, observations, barnId: context.barnId };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) {
    const cycles = await listReproductionCycles(db, {}, scope);
    return { ...cycles, createdCycleId: (replay.result as { id: string }).id, replayed: true };
  }
  const openCycle = await db.prepare(`SELECT id FROM reproduction_cycles WHERE female_animal_id = ? AND cycle_status = 'open'`).bind(context.female.id).first();
  if (openCycle) throw new ApiError(409, 'La hembra ya tiene un ciclo abierto; agregue el servicio al ciclo existente');
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'reproduction.cycle.create', authorUserId: actorUserId,
    entityType: 'reproduction_cycle', entityId: Number(context.female.id), barnId: context.barnId, effectiveDate: serviceDate, payload, result: { id, cycleNumber, dueDate } });
  const statements: D1PreparedStatement[] = [serviceLocationGuard(db,context,sire,sireBarnId,serviceDate),db.prepare(`INSERT INTO inventory_write_guard(guard_id)
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM reproduction_cycles WHERE female_animal_id=? AND last_farrowing_date>?)
      AND NOT EXISTS(SELECT 1 FROM litters WHERE female_animal_id=? AND farrowing_date>?) THEN 0 ELSE -1 END`)
    .bind(context.female.id,serviceDate,context.female.id,serviceDate),db.prepare(`INSERT INTO reproduction_cycles
    (id,female_animal_id,cycle_number,cycle_status,reproductive_status,cycle_opened_on,service_anchor_date,gestation_days,probable_farrowing_date,due_date_source,due_date_reason,
     barn_id,location_code,lot_code,female_breed_snapshot,aptitude,last_farrowing_date,observations,created_by_user_id,created_at,updated_at)
    VALUES (?,?,?,'open','possible_pregnancy',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, context.female.id, cycleNumber, serviceDate, serviceDate, gestationDays, dueDate, dueDateSource, dueDateReason, context.barnId, context.locationCode, context.lotCode,
      context.female.breed ?? null, aptitude, lastFarrowing, observations, actorUserId, claim.recordedAt, claim.recordedAt),
  db.prepare(`INSERT INTO reproduction_services (cycle_id,service_number,service_date,service_type,sire_animal_id,sire_code_snapshot,sire_breed_snapshot,material_source,external_source,aptitude,observations,created_by_user_id,created_at)
    VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, serviceDate, serviceType, sire?.id ?? null, sire?.code ?? (source === 'external' ? externalSource : null), sireBreed,
      source, externalSource, aptitude, observations, actorUserId, claim.recordedAt)];
  if (suppliedDue) statements.push(db.prepare(`INSERT INTO reproduction_events (cycle_id,event_type,event_date,reason,observations,created_by_user_id,created_at)
    VALUES (?,'manual_due_date',?,?,?, ?,?)`).bind(id, serviceDate, dueDateReason, `Fecha probable: ${dueDate}`, actorUserId, claim.recordedAt));
  statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  await commitOperation(db, claim, statements, [{ entityType: 'reproduction_cycle', entityId: Number(context.female.id), action: 'create', actorUserId, barnId: context.barnId,
    reason: 'Apertura de ciclo reproductivo', previousData: null, newData: { ...payload, cycleId: id }, effectiveDate: serviceDate, recordedAt: claim.recordedAt }]).catch((error:unknown)=>{if(/guard_id/.test(String(error)))throw new ApiError(409,'La ubicación o permanencia de un reproductor cambió; actualice antes de guardar');throw error;});
  const result = await listReproductionCycles(db, { from: '0001-01-01', to: '9999-12-31' }, scope);
  return { ...result, createdCycleId: id, replayed: false };
}

export async function addReproductionService(db: D1Database, actorUserId: number, cycleId: string, input: Omit<ServiceInput, 'femaleCode'>, scope: ReproductionScope = {}) {
  const cycle = await db.prepare('SELECT c.*,a.code AS female_code FROM reproduction_cycles c JOIN animals a ON a.id=c.female_animal_id WHERE c.id=?').bind(cycleId).first<Row>();
  if (!cycle) throw new ApiError(404, 'Ciclo no encontrado');
  if (cycle.cycle_status !== 'open') throw new ApiError(409, 'No se puede agregar servicio a un ciclo cerrado');
  const allowedBarns = await barnIds(db, scope);
  if (allowedBarns !== null && !allowedBarns.includes(Number(cycle.barn_id))) throw new ApiError(404, 'Ciclo no encontrado');
  const serviceDate = date(input.serviceDate, 'Fecha del servicio');
  if (serviceDate < String(cycle.service_anchor_date) || serviceDate > currentFarmDate()) throw new ApiError(400, 'La fecha del nuevo servicio debe ser posterior al inicio del ciclo y no futura');
  const context = await femaleAtDate(db, String(cycle.female_code), serviceDate, scope);
  const serviceType = String(input.serviceType ?? '');
  if (!SERVICE_TYPES.includes(serviceType)) throw new ApiError(400, 'Tipo de servicio no válido');
  const source = materialSource(input.materialSource);
  const external = optionalText(input.externalSource, 'Procedencia externa', 160);
  const sireCode = optionalText(input.sireCode, 'Código del verraco', 40);
  if (source === 'external' && !external) throw new ApiError(400, 'Indique la procedencia externa');
  if (source === 'internal' && !sireCode) throw new ApiError(400, 'Seleccione el verraco o use material externo');
  const sire = source === 'internal' ? await db.prepare(`SELECT id,code,sex,animal_type,breed,entry_date,exit_date FROM animals WHERE code=?`).bind(sireCode).first<Row>() : null;
  if (source === 'internal' && (!sire || sire.sex !== 'macho' || sire.animal_type !== 'verraco')) throw new ApiError(400, 'El reproductor interno debe ser un verraco existente');
  const sireBarnId=sire?await assertSireAccess(db, sire, serviceDate, scope):null;
  const latest = await db.prepare('SELECT MAX(service_number) AS n FROM reproduction_services WHERE cycle_id=?').bind(cycleId).first<{ n: number | null }>();
  const serviceNumber = Number(latest?.n ?? 0) + 1;
  const days = Number(cycle.gestation_days);
  const due = addDays(serviceDate, days);
  const observations = optionalText(input.observations, 'Observaciones', 1000);
  const sireBreed = optionalText(input.sireBreed ?? sire?.breed, 'Raza del padre', 80);
  const aptitude = optionalText(input.aptitude ?? context.female.aptitude, 'Aptitud', 60);
  const payload = { cycleId, serviceDate, serviceType, source, external, sireCode, sireBreed, aptitude, due, observations };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { replayed: true, cycle: (await listReproductionCycles(db, {}, scope)).cycles.find((item) => item.id === cycleId) ?? null };
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'reproduction.service.add', authorUserId: actorUserId,
    entityType: 'reproduction_cycle', entityId: Number(cycle.female_animal_id), barnId: context.barnId, effectiveDate: serviceDate, payload, result: { cycleId, serviceNumber, due } });
  const statements: D1PreparedStatement[] = [openCycleGuard(db,cycleId,cycle.updated_at),serviceLocationGuard(db,context,sire,sireBarnId,serviceDate),db.prepare(`INSERT INTO reproduction_services
    (cycle_id,service_number,service_date,service_type,sire_animal_id,sire_code_snapshot,sire_breed_snapshot,material_source,external_source,aptitude,observations,created_by_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(cycleId, serviceNumber, serviceDate, serviceType, sire?.id ?? null,
      sire?.code ?? (source === 'external' ? external : null), sireBreed, source, external, aptitude, observations, actorUserId, claim.recordedAt),
  db.prepare(`UPDATE reproduction_cycles SET service_anchor_date=?,probable_farrowing_date=?,due_date_source='calculated',due_date_reason=NULL,reproductive_status='possible_pregnancy',barn_id=?,location_code=?,lot_code=?,updated_at=? WHERE id=?`)
    .bind(serviceDate, due, context.barnId, context.locationCode, context.lotCode, claim.recordedAt, cycleId)];
  statements.push(db.prepare(`INSERT INTO reproduction_events (cycle_id,event_type,event_date,service_id,observations,created_by_user_id,created_at)
    VALUES (?,'repeat',?,(SELECT id FROM reproduction_services WHERE cycle_id=? AND service_number=?),?,?,?)`)
    .bind(cycleId, serviceDate, cycleId, serviceNumber, observations ?? `Servicio número ${serviceNumber}`, actorUserId, claim.recordedAt));
  statements.push(...reschedulePrepartum(db,cycleId,due,claim.recordedAt));
  statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  await commitOperation(db, claim, statements, [{ entityType: 'reproduction_cycle', entityId: Number(context.female.id), action: 'update', actorUserId, barnId: context.barnId,
    reason: 'Nuevo servicio del ciclo', previousData: { dueDate: cycle.probable_farrowing_date }, newData: payload, effectiveDate: serviceDate, recordedAt: claim.recordedAt }]).catch((error:unknown)=>{if(/guard_id/.test(String(error)))throw new ApiError(409,'La ubicación o permanencia de un reproductor cambió; actualice antes de guardar');throw error;});
  return { replayed: false, cycle: (await listReproductionCycles(db, {}, scope)).cycles.find((item) => item.id === cycleId) ?? null };
}

export async function recordReproductionEvent(db: D1Database, actorUserId: number, cycleId: string, input: EventInput, scope: ReproductionScope = {}) {
  const cycle = await db.prepare(`SELECT c.*,a.code AS female_code,a.entry_date,a.exit_date FROM reproduction_cycles c JOIN animals a ON a.id=c.female_animal_id WHERE c.id=?`).bind(cycleId).first<Row>();
  if (!cycle) throw new ApiError(404, 'Ciclo no encontrado');
  const eventType = String(input.eventType ?? '');
  if (!['palpation', 'pregnancy_confirmed', 'abortion', 'closed'].includes(eventType)) throw new ApiError(400, 'Tipo de evento reproductivo no válido');
  const eventDate = date(input.eventDate, 'Fecha del evento');
  if (eventDate < String(cycle.cycle_opened_on) || eventDate > currentFarmDate()) throw new ApiError(400, 'La fecha del evento debe estar entre el inicio del ciclo y hoy');
  const context = await femaleAtDate(db, String(cycle.female_code), eventDate, scope);
  const physiologicalStatus = input.physiologicalStatus === undefined ? null : String(input.physiologicalStatus);
  if (physiologicalStatus && !PHYSIOLOGICAL_STATES.includes(physiologicalStatus)) throw new ApiError(400, 'Estado fisiológico no válido');
  if (eventType === 'palpation' && !physiologicalStatus) throw new ApiError(400, 'Seleccione el resultado fisiológico de la palpación');
  if (eventType === 'abortion' && !optionalText(input.reason, 'Motivo de aborto')) throw new ApiError(400, 'Indique el motivo del aborto');
  let serviceId = input.serviceId ? Number(input.serviceId) : null;
  if (serviceId) {
    const service = await db.prepare('SELECT id,service_date FROM reproduction_services WHERE id=? AND cycle_id=?').bind(serviceId, cycleId).first<Row>();
    if (!service || String(service.service_date) > eventDate) throw new ApiError(400, 'Seleccione un servicio válido anterior o igual al evento');
  } else if (eventType === 'palpation' || eventType === 'pregnancy_confirmed') {
    const latestService = await db.prepare('SELECT id FROM reproduction_services WHERE cycle_id=? AND service_date<=? ORDER BY service_date DESC,service_number DESC LIMIT 1')
      .bind(cycleId, eventDate).first<{ id: number }>();
    serviceId = latestService ? Number(latestService.id) : null;
    if (!serviceId && Number(cycle.antecedent) !== 1) throw new ApiError(409, 'No hay un servicio anterior para vincular este evento');
  }
  const reason = eventType === 'abortion' || eventType === 'closed' ? normalizeReason(input.reason, { required: true }) : optionalText(input.reason, 'Motivo');
  const observations = optionalText(input.observations, 'Observaciones', 1000);
  const status = eventType === 'abortion' ? 'abortion' : eventType === 'pregnancy_confirmed' ? 'gestation' : physiologicalStatus ?? String(cycle.reproductive_status);
  const eventStatus = eventType === 'pregnancy_confirmed' ? 'gestation' : physiologicalStatus ?? (eventType === 'abortion' ? 'abortion' : null);
  const payload = { cycleId, eventType, eventDate, physiologicalStatus, serviceId, reason, observations };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { replayed: true, cycle: (await listReproductionCycles(db, {}, scope)).cycles.find((item) => item.id === cycleId) ?? null };
  if (cycle.cycle_status !== 'open') throw new ApiError(409, 'El ciclo ya está cerrado');
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: `reproduction.${eventType}`, authorUserId: actorUserId,
    entityType: 'reproduction_cycle', entityId: Number(context.female.id), barnId: context.barnId, effectiveDate: eventDate, payload, result: { cycleId, eventType } });
  const closes = eventType === 'abortion' || eventType === 'closed';
  const committed=await commitOperation(db, claim, [openCycleGuard(db,cycleId,cycle.updated_at),db.prepare(`INSERT INTO reproduction_events
    (cycle_id,event_type,event_date,physiological_status,service_id,reason,observations,created_by_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(cycleId, eventType, eventDate, eventStatus, serviceId, reason, observations, actorUserId, claim.recordedAt),
  db.prepare(`UPDATE reproduction_cycles SET cycle_status=?,reproductive_status=?,updated_at=? WHERE id=?`)
    .bind(closes ? (eventType === 'abortion' ? 'aborted' : 'closed') : 'open', status, claim.recordedAt, cycleId),
  ...(closes?[db.prepare("UPDATE vaccine_occurrences SET status='cancelled',updated_at=? WHERE source_event_type='expected_farrowing' AND source_event_id=? AND status='pending'").bind(claim.recordedAt,cycleId)]:[]),db.prepare('DELETE FROM inventory_write_guard')],
  [{ entityType: 'reproduction_cycle', entityId: Number(context.female.id), action: closes ? 'annul' : 'update', actorUserId, barnId: context.barnId,
    reason: reason ?? `Evento ${eventType}`, previousData: { status: cycle.reproductive_status, cycleStatus: cycle.cycle_status }, newData: payload,
    effectiveDate: eventDate, recordedAt: claim.recordedAt }]).catch((error:unknown)=>{if(/guard_id/.test(String(error)))throw new ApiError(409,'El ciclo cambió; actualice antes de registrar el evento');throw error;});
  return { replayed: committed.replayed, cycle: (await listReproductionCycles(db, {}, scope)).cycles.find((item) => item.id === cycleId) ?? null };
}

export async function updateReproductionCycle(db: D1Database, actorUserId: number, cycleId: string, input: { dueDate?: unknown; dueDateReason?: unknown; observations?: unknown; operationKey?: string }, scope: ReproductionScope = {}) {
  const cycle = await db.prepare('SELECT * FROM reproduction_cycles WHERE id=?').bind(cycleId).first<Row>();
  if (!cycle) throw new ApiError(404, 'Ciclo no encontrado');
  if (cycle.cycle_status !== 'open') throw new ApiError(409, 'No se puede modificar un ciclo cerrado');
  const dueDate = input.dueDate ? date(input.dueDate, 'Fecha probable de parto') : String(cycle.probable_farrowing_date);
  if (cycle.service_anchor_date && dueDate < String(cycle.service_anchor_date)) throw new ApiError(400, 'La fecha probable no puede preceder al último servicio');
  const dueDateReason = input.dueDate ? optionalText(input.dueDateReason, 'Motivo de fecha manual', 300) : cycle.due_date_reason;
  if (input.dueDate && !dueDateReason) throw new ApiError(400, 'Indique el motivo de la fecha manual');
  const observations = input.observations === undefined ? (cycle.observations === null ? null : String(cycle.observations)) : optionalText(input.observations, 'Observaciones', 1000);
  const payload = { cycleId, dueDate, dueDateSource: input.dueDate ? 'manual' : cycle.due_date_source, dueDateReason, observations };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { replayed: true, cycle: (await listReproductionCycles(db, {}, scope)).cycles.find((item) => item.id === cycleId) ?? null };
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'reproduction.cycle.update', authorUserId: actorUserId,
    entityType: 'reproduction_cycle', entityId: Number(cycle.female_animal_id), barnId: Number(cycle.barn_id), effectiveDate: currentFarmDate(), payload, result: { cycleId, dueDate } });
  const statements: D1PreparedStatement[] = [openCycleGuard(db,cycleId,cycle.updated_at),db.prepare(`UPDATE reproduction_cycles SET probable_farrowing_date=?,due_date_source=?,due_date_reason=?,observations=?,updated_at=? WHERE id=?`)
    .bind(dueDate, payload.dueDateSource, dueDateReason, observations, claim.recordedAt, cycleId)];
  if (input.dueDate) statements.push(db.prepare(`INSERT INTO reproduction_events (cycle_id,event_type,event_date,reason,observations,created_by_user_id,created_at)
    VALUES (?,'manual_due_date',?,?,?, ?,?)`).bind(cycleId, currentFarmDate(), dueDateReason, `Nueva fecha probable: ${dueDate}`, actorUserId, claim.recordedAt));
  if(input.dueDate)statements.push(...reschedulePrepartum(db,cycleId,dueDate,claim.recordedAt));
  statements.push(db.prepare('DELETE FROM inventory_write_guard'));
  await commitOperation(db, claim, statements, [{ entityType: 'reproduction_cycle', entityId: Number(cycle.female_animal_id), action: 'update', actorUserId, barnId: Number(cycle.barn_id),
    reason: String(dueDateReason ?? 'Actualización de ciclo reproductivo'), previousData: { dueDate: cycle.probable_farrowing_date, observations: cycle.observations }, newData: payload,
    effectiveDate: currentFarmDate(), recordedAt: claim.recordedAt }]);
  return { replayed: false, cycle: (await listReproductionCycles(db, {}, scope)).cycles.find((item) => item.id === cycleId) ?? null };
}

export async function createPregnantAntecedent(db: D1Database, actorUserId: number, input: ServiceInput & { dueDate?: unknown; gestationDays?: unknown }, scope: ReproductionScope = {}) {
  const femaleCode = String(input.femaleCode ?? '').trim();
  const recordedDate = date(input.serviceDate, 'Fecha de registro del antecedente');
  if (recordedDate > currentFarmDate()) throw new ApiError(400, 'La fecha de registro no puede ser futura');
  const context = await femaleAtDate(db, femaleCode, recordedDate, scope);
  const dueDate = date(input.dueDate, 'Fecha probable de parto');
  if (dueDate < recordedDate) throw new ApiError(400, 'La fecha probable debe ser igual o posterior al registro');
  const gestationDays = await getGestationDays(db, recordedDate);
  if (!Number.isInteger(gestationDays) || gestationDays <= 0 || gestationDays > 150) throw new ApiError(400, 'Duración de gestación inválida');
  const lastFarrowing = input.lastFarrowingDate ? date(input.lastFarrowingDate, 'Último parto conocido') : null;
  if (lastFarrowing && lastFarrowing > recordedDate) throw new ApiError(400, 'El último parto conocido no puede ser posterior al antecedente');
  const previous = await db.prepare('SELECT MAX(cycle_number) AS n FROM reproduction_cycles WHERE female_animal_id=?').bind(context.female.id).first<{n:number|null}>();
  const number = Number(previous?.n ?? 0) + 1; const id = crypto.randomUUID();
  const observations = optionalText(input.observations, 'Antecedentes', 1000);
  const aptitude = optionalText(input.aptitude ?? context.female.aptitude, 'Aptitud', 60);
  const payload = { femaleCode, recordedDate, dueDate, gestationDays, lastFarrowing, observations, aptitude, barnId: context.barnId };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { ...(await listReproductionCycles(db, {}, scope)), replayed: true };
  if (await db.prepare(`SELECT id FROM reproduction_cycles WHERE female_animal_id=? AND cycle_status='open'`).bind(context.female.id).first()) throw new ApiError(409, 'La hembra ya tiene un ciclo abierto');
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'reproduction.antecedent', authorUserId: actorUserId,
    entityType: 'reproduction_cycle', entityId: Number(context.female.id), barnId: context.barnId, effectiveDate: recordedDate, payload, result: { id, dueDate } });
  await commitOperation(db, claim, [db.prepare(`INSERT INTO reproduction_cycles
    (id,female_animal_id,cycle_number,cycle_status,reproductive_status,cycle_opened_on,service_anchor_date,gestation_days,probable_farrowing_date,due_date_source,due_date_reason,barn_id,location_code,lot_code,female_breed_snapshot,aptitude,last_farrowing_date,observations,antecedent,created_by_user_id,created_at,updated_at)
    VALUES (?,?,?,'open','gestation',?,NULL,?,?,'antecedent','Antecedente de ingreso',?,?,?,?,?,?,?,1,?,?,?)`)
    .bind(id, context.female.id, number, recordedDate, gestationDays, dueDate, context.barnId, context.locationCode, context.lotCode, context.female.breed ?? null,
      aptitude, lastFarrowing, observations, actorUserId, claim.recordedAt, claim.recordedAt)],
  [{ entityType: 'reproduction_cycle', entityId: Number(context.female.id), action: 'create', actorUserId, barnId: context.barnId, reason: 'Ingreso de antecedente gestante',
    previousData: null, newData: { ...payload, cycleId: id }, effectiveDate: recordedDate, recordedAt: claim.recordedAt }]);
  return { ...(await listReproductionCycles(db, {}, scope)), createdCycleId: id, replayed: false };
}

export async function saveWeaningPlan(db:D1Database,actorUserId:number,cycleId:string,input:{referenceWeaningDate?:unknown;heatIntervalDays?:unknown;firstRepeatIntervalDays?:unknown;secondRepeatIntervalDays?:unknown;actualHeatDate?:unknown;actualFirstRepeatDate?:unknown;actualSecondRepeatDate?:unknown;reason?:unknown;operationKey?:string},scope:ReproductionScope={}) {
  const cycle=await db.prepare('SELECT * FROM reproduction_cycles WHERE id=?').bind(cycleId).first<Row>();
  if(!cycle) throw new ApiError(404,'Ciclo reproductivo no encontrado');
  const barn=await db.prepare('SELECT name FROM barns WHERE id=?').bind(cycle.barn_id).first<{name:string}>();
  if(scope.allowedBarnNames&&(!barn||!scope.allowedBarnNames.includes(barn.name))) throw new ApiError(404,'Ciclo reproductivo no encontrado');
  const referenceWeaningDate=date(input.referenceWeaningDate,'Fecha real del destete anterior');
  const serviceDate=String(cycle.service_anchor_date??cycle.cycle_opened_on);
  if(referenceWeaningDate>serviceDate) throw new ApiError(400,'El destete de referencia debe ser anterior o igual al servicio');
  const previousLitter=await db.prepare('SELECT id,actual_weaning_date,barn_id,historical_only FROM litters WHERE female_animal_id=? AND cycle_id<>? AND farrowing_date<=? ORDER BY farrowing_date DESC,id DESC LIMIT 1').bind(cycle.female_animal_id,cycleId,serviceDate).first<Row>();
  const allowed=await barnIds(db,scope);if(previousLitter&&allowed!==null&&!allowed.includes(Number(previousLitter.barn_id)))throw new ApiError(403,'No tiene acceso a la camada anterior');
  const interval=(raw:unknown,label:string)=>{const n=Number(raw);if(!Number.isInteger(n)||n<1||n>120)throw new ApiError(400,`${label} debe ser un entero entre 1 y 120 días`);return n;};
  const heatIntervalDays=interval(input.heatIntervalDays,'Intervalo a celo');
  const firstRepeatIntervalDays=interval(input.firstRepeatIntervalDays,'Intervalo a primera repetición');
  const secondRepeatIntervalDays=interval(input.secondRepeatIntervalDays,'Intervalo a segunda repetición');
  const expectedHeatDate=addDays(referenceWeaningDate,heatIntervalDays);
  const expectedFirstRepeatDate=addDays(expectedHeatDate,firstRepeatIntervalDays);
  const expectedSecondRepeatDate=addDays(expectedFirstRepeatDate,secondRepeatIntervalDays);
  const actualHeatDate=input.actualHeatDate?date(input.actualHeatDate,'Fecha observada de celo'):null;
  const actualFirstRepeatDate=input.actualFirstRepeatDate?date(input.actualFirstRepeatDate,'Fecha observada de primera repetición'):null;
  const actualSecondRepeatDate=input.actualSecondRepeatDate?date(input.actualSecondRepeatDate,'Fecha observada de segunda repetición'):null;
  for(const observed of [actualHeatDate,actualFirstRepeatDate,actualSecondRepeatDate]) if(observed&&observed<referenceWeaningDate) throw new ApiError(400,'Las fechas observadas no pueden preceder al destete de referencia');
  const reason=optionalText(input.reason,'Motivo',300);
  if(!reason||reason.length<5) throw new ApiError(400,'Indique el motivo del plan');
  const payload={cycleId,referenceWeaningDate,heatIntervalDays,firstRepeatIntervalDays,secondRepeatIntervalDays,expectedHeatDate,expectedFirstRepeatDate,expectedSecondRepeatDate,actualHeatDate,actualFirstRepeatDate,actualSecondRepeatDate,reason};
  const replay=await lookupExistingOperation(db,actorUserId,input.operationKey,payload);
  if(replay) return {replayed:true,cycles:await listReproductionCycles(db,{},scope)};
  if(previousLitter&&!previousLitter.actual_weaning_date&&Number(previousLitter.historical_only)!==1)throw new ApiError(409,'La camada anterior todavía no tiene un destete completo registrado');
  if(previousLitter?.actual_weaning_date&&referenceWeaningDate!==String(previousLitter.actual_weaning_date))throw new ApiError(409,'La fecha no coincide con el destete real registrado de la camada anterior');
  const previous=await db.prepare('SELECT * FROM reproduction_weaning_plans WHERE cycle_id=?').bind(cycleId).first<Row>();
  const claim=await createOperationClaim({operationKey:input.operationKey,operationType:'reproduction.weaning_plan.save',authorUserId:actorUserId,entityType:'reproduction_cycle',entityId:Number(cycle.female_animal_id),barnId:Number(cycle.barn_id),effectiveDate:referenceWeaningDate,payload,result:payload});
  const committed=await commitOperation(db,claim,[db.prepare(`INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN (SELECT id FROM litters WHERE female_animal_id=? AND cycle_id<>? AND farrowing_date<=? ORDER BY farrowing_date DESC,id DESC LIMIT 1) IS ? AND (SELECT actual_weaning_date FROM litters WHERE id=?) IS ? THEN 0 ELSE -1 END`).bind(cycle.female_animal_id,cycleId,serviceDate,previousLitter?.id??null,previousLitter?.id??null,previousLitter?.actual_weaning_date??null),db.prepare(`INSERT INTO reproduction_weaning_plans
    (cycle_id,reference_weaning_date,heat_interval_days,first_repeat_interval_days,second_repeat_interval_days,expected_heat_date,expected_first_repeat_date,expected_second_repeat_date,actual_heat_date,actual_first_repeat_date,actual_second_repeat_date,created_by_user_id,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(cycle_id) DO UPDATE SET reference_weaning_date=excluded.reference_weaning_date,heat_interval_days=excluded.heat_interval_days,
    first_repeat_interval_days=excluded.first_repeat_interval_days,second_repeat_interval_days=excluded.second_repeat_interval_days,expected_heat_date=excluded.expected_heat_date,
    expected_first_repeat_date=excluded.expected_first_repeat_date,expected_second_repeat_date=excluded.expected_second_repeat_date,actual_heat_date=excluded.actual_heat_date,
    actual_first_repeat_date=excluded.actual_first_repeat_date,actual_second_repeat_date=excluded.actual_second_repeat_date,updated_at=excluded.updated_at`)
      .bind(cycleId,referenceWeaningDate,heatIntervalDays,firstRepeatIntervalDays,secondRepeatIntervalDays,expectedHeatDate,expectedFirstRepeatDate,expectedSecondRepeatDate,actualHeatDate,actualFirstRepeatDate,actualSecondRepeatDate,actorUserId,claim.recordedAt),db.prepare('DELETE FROM inventory_write_guard')],
    [{entityType:'reproduction_cycle',entityId:Number(cycle.female_animal_id),action:previous?'update':'create',actorUserId,barnId:Number(cycle.barn_id),reason,
      previousData:previous?{referenceWeaningDate:previous.reference_weaning_date,heatIntervalDays:previous.heat_interval_days,firstRepeatIntervalDays:previous.first_repeat_interval_days,secondRepeatIntervalDays:previous.second_repeat_interval_days}:null,
      newData:payload,effectiveDate:referenceWeaningDate,recordedAt:claim.recordedAt}]).catch((error:unknown)=>{if(/guard_id/.test(String(error)))throw new ApiError(409,'Cambió el destete anterior; actualice el plan');throw error;});
  return {replayed:committed.replayed,cycles:await listReproductionCycles(db,{},scope)};
}

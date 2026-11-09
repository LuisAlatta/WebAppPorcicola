import { getConfigSnapshot } from './config';
import { ApiError, commitOperation, createOperationClaim, isValidDateString, lookupExistingOperation, normalizeReason } from './events';
import type { FeedScope } from './feed';

export type FeedPlanInput = {
  effectiveDate?: unknown;
  shiftCode?: unknown;
  barnId?: unknown;
  stageCode?: unknown;
  feedCode?: unknown;
  plannedKg?: unknown;
  reason?: unknown;
  operationKey?: string;
};
type PlanDefinition = {
  id: number;
  groupKey: string;
  effectiveDate: string;
  shiftCode: string;
  barnId: number;
  barnName: string;
  stageCode: string;
  feedCode: string;
  plannedKg: number;
  reason: string;
  version: number;
};
export type FeedPlanRow = PlanDefinition & { servedKg: number; consumedKg: number | null; pendingKg: number };

export async function listFeedPlans(db: D1Database, filters: { from?: unknown; to?: unknown } = {}, scope: FeedScope = {}): Promise<FeedPlanRow[]> {
  const where = ["o.operation_type='feed.plan'", "o.status='committed'"];
  const params: (string | number)[] = [];
  for (const [key, comparison] of [['from', '>='], ['to', '<=']] as const) {
    if (filters[key] !== undefined) {
      if (!isValidDateString(filters[key])) throw new ApiError(400, 'Fecha de programación inválida');
      where.push(`o.effective_date${comparison}?`); params.push(filters[key]);
    }
  }
  if (filters.from && filters.to && String(filters.from) > String(filters.to)) throw new ApiError(400, 'El inicio del periodo debe ser anterior a su fin');
  if (scope.allowedBarnNames) {
    if (!scope.allowedBarnNames.length) return [];
    where.push(`b.name IN (${scope.allowedBarnNames.map(() => '?').join(',')})`); params.push(...scope.allowedBarnNames);
  }
  const rows = await db.prepare(`WITH versions AS (
    SELECT o.result_payload,ROW_NUMBER() OVER (PARTITION BY json_extract(o.payload,'$.groupKey') ORDER BY o.version DESC,o.recorded_at DESC,o.id DESC) AS position
    FROM operation_log o JOIN barns b ON b.id=o.barn_id WHERE ${where.join(' AND ')}
  ) SELECT result_payload FROM versions WHERE position=1`).bind(...params).all<{ result_payload: string }>();
  const plans = (rows.results ?? []).map(row => JSON.parse(row.result_payload) as PlanDefinition);
  return Promise.all(plans.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.barnId - b.barnId || a.shiftCode.localeCompare(b.shiftCode)).map(async plan => {
    const totals = await db.prepare(`SELECT COALESCE(SUM(served_kg),0) AS served,CASE WHEN COUNT(*)=0 OR SUM(CASE WHEN consumed_kg IS NULL THEN 1 ELSE 0 END)>0 THEN NULL ELSE SUM(consumed_kg) END AS consumed
      FROM feed_turns WHERE effective_date=? AND shift_code=? AND barn_id=? AND stage_code=? AND feed_code=?`).bind(plan.effectiveDate, plan.shiftCode, plan.barnId, plan.stageCode, plan.feedCode).first<{ served: number; consumed: number | null }>();
    const servedKg = Number(Number(totals?.served ?? 0).toFixed(3));
    return { ...plan, servedKg, consumedKg: totals?.consumed === null || totals?.consumed === undefined ? null : Number(Number(totals.consumed).toFixed(3)), pendingKg: Number(Math.max(0, plan.plannedKg - servedKg).toFixed(3)) };
  }));
}

export async function registerFeedPlan(db: D1Database, actorUserId: number, input: FeedPlanInput, scope: FeedScope = {}) {
  if (!isValidDateString(input.effectiveDate)) throw new ApiError(400, 'Fecha de programación inválida: use AAAA-MM-DD');
  const effectiveDate = input.effectiveDate;
  const shiftCode = String(input.shiftCode ?? '').trim();
  if (!['manana', 'tarde', 'noche'].includes(shiftCode)) throw new ApiError(400, 'Turno inválido');
  const barnId = Number(input.barnId);
  if (!Number.isInteger(barnId) || barnId <= 0) throw new ApiError(400, 'Seleccione el galpón');
  const barn = await db.prepare('SELECT name FROM barns WHERE id=?').bind(barnId).first<{ name: string }>();
  if (!barn) throw new ApiError(404, 'Galpón no encontrado');
  if (scope.allowedBarnNames && !scope.allowedBarnNames.includes(barn.name)) throw new ApiError(403, 'No tiene acceso al galpón');
  const stageCode = String(input.stageCode ?? '').trim(); const feedCode = String(input.feedCode ?? '').trim();
  const plannedKg = Number(input.plannedKg);
  if (!Number.isFinite(plannedKg) || plannedKg < 0 || Math.round(plannedKg * 1000) !== plannedKg * 1000) throw new ApiError(400, 'La cantidad prevista debe ser cero o positiva con hasta 3 decimales');
  const reason = normalizeReason(input.reason, { required: true });
  const groupKey = `${effectiveDate}:${shiftCode}:${barnId}:${stageCode}:${feedCode}`;
  const payload = { groupKey, effectiveDate, shiftCode, barnId, stageCode, feedCode, plannedKg, reason };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { replayed: true, plan: replay.result as PlanDefinition };
  const previous = await db.prepare("SELECT entity_id,version,result_payload FROM operation_log WHERE operation_type='feed.plan' AND status='committed' AND json_extract(payload,'$.groupKey')=? ORDER BY version DESC LIMIT 1").bind(groupKey).first<{ entity_id: number; version: number; result_payload: string }>();
  if (plannedKg === 0 && !previous) throw new ApiError(400, 'No existe una programación para cancelar');
  const config = await getConfigSnapshot(db, effectiveDate);
  const stage = config.stages.find(item => item.code === stageCode);
  const ration = config.catalogs.find(item => item.key === 'alimento')?.items.find(item => item.code === feedCode);
  if (plannedKg > 0 && (!stage || !ration || stage.rationName?.toLocaleLowerCase('es-PE') !== ration.name.toLocaleLowerCase('es-PE'))) throw new ApiError(400, 'Seleccione la etapa y su alimento configurado');
  const count = Number((await db.prepare("SELECT COUNT(*) AS count FROM operation_log WHERE operation_type='feed.plan' AND status='committed' AND json_extract(payload,'$.groupKey')=?").bind(groupKey).first<{ count: number }>())!.count);
  const id = previous ? Number(previous.entity_id) : Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const version = Number(previous?.version ?? 0) + 1;
  const plan: PlanDefinition = { id, ...payload, barnName: barn.name, version };
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'feed.plan', authorUserId: actorUserId, entityType: 'feed_plan', entityId: id, barnId, effectiveDate, payload, result: plan });
  const committed = await commitOperation(db, claim, [
    db.prepare(`INSERT INTO feed_stock_guard(guard_id) SELECT CASE WHEN COUNT(*)=? AND COALESCE(MAX(version),0)=? THEN 0 ELSE -1 END FROM operation_log
      WHERE operation_type='feed.plan' AND status='committed' AND json_extract(payload,'$.groupKey')=? AND id<>?`).bind(count, version - 1, groupKey, claim.id),
    db.prepare('UPDATE operation_log SET version=? WHERE id=?').bind(version, claim.id),
    db.prepare('DELETE FROM feed_stock_guard'),
  ], [{ entityType: 'feed_plan', entityId: id, action: previous ? 'update' : 'create', actorUserId, barnId, reason, previousData: previous ? JSON.parse(previous.result_payload) : null, newData: plan, effectiveDate, recordedAt: claim.recordedAt }]).catch((error: unknown) => {
    if (/guard_id/.test(String(error))) throw new ApiError(409, 'La programación cambió; actualice antes de reintentar');
    throw error;
  });
  return { replayed: committed.replayed, plan: committed.result as PlanDefinition };
}

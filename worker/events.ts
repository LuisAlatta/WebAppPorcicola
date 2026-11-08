/**
 * Operaciones idempotentes y auditoría de eventos · T06 (ACC-04, GES-03)
 *
 * Convención reutilizable por los módulos siguientes:
 * - Toda escritura relevante se identifica con una clave de reintento estable.
 * - El contenido se normaliza a JSON canónico y se firma con SHA-256.
 * - Misma clave + mismo contenido devuelve el resultado anterior (un solo evento).
 * - Misma clave + contenido distinto responde conflicto (409) sin escribir nada.
 * - Cada commit agrega una fila de auditoría con autor, motivo, fecha efectiva,
 *   fecha de registro y el registro original en previous_data.
 */

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type AuditAction = 'create' | 'update' | 'correct' | 'annul' | 'delete';

export interface OperationClaim {
  id: string;
  operationKey: string;
  operationType: string;
  authorUserId: number;
  entityType: string;
  entityId: number | null;
  barnId: number | null;
  effectiveDate: string;
  recordedAt: string;
  contentHash: string;
  payload: unknown;
  result: unknown;
}

export interface AuditRecordInput {
  entityType: string;
  entityId: number;
  action: AuditAction;
  actorUserId: number;
  barnId?: number | null;
  reason: string;
  previousData?: unknown;
  newData?: unknown;
  effectiveDate: string;
  recordedAt: string;
}

export interface AuditItem {
  id: number;
  operation_log_id: string | null;
  operation_key: string | null;
  entity_type: string;
  entity_id: number;
  action: AuditAction;
  actor_user_id: number;
  actor_name: string;
  barn_id: number | null;
  barn_code: string | null;
  barn_name: string | null;
  reason: string;
  previous_data: unknown;
  new_data: unknown;
  effective_date: string;
  recorded_at: string;
}

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Serializa un valor a JSON canónico: claves ordenadas y sin propiedades
 * undefined. Mismo contenido lógico produce siempre la misma cadena y hash.
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(',')}}`;
  }
  return 'null';
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bufferToHex(digest);
}

/** Fecha operativa local de la granja (America/Lima, UTC-05 sin horario de verano). */
export function currentFarmDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Convierte una fecha operativa YYYY-MM-DD al instante UTC de inicio de día en la granja. */
export function farmDateToUtcIso(value: string): string {
  return new Date(`${value}T00:00:00.000-05:00`).toISOString();
}

export function normalizeReason(value: unknown, options: { required?: boolean; fallback?: string; minLength?: number } = {}): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  const minLength = options.minLength ?? 5;
  if (reason.length === 0) {
    if (options.required) {
      throw new ApiError(400, `El motivo es obligatorio y debe describir la causa (mínimo ${minLength} caracteres)`);
    }
    return options.fallback ?? 'Operación registrada';
  }
  if (reason.length < minLength) {
    throw new ApiError(400, `El motivo debe describir la causa (mínimo ${minLength} caracteres)`);
  }
  return reason;
}

export interface CreateOperationInput {
  operationKey?: string;
  operationType: string;
  authorUserId: number;
  entityType: string;
  entityId?: number | null;
  barnId?: number | null;
  effectiveDate?: string;
  payload: unknown;
  result: unknown;
}

/**
 * Construye la identidad de una operación: clave de reintento, versión,
 * fechas efectiva y de registro, contenido canónico y resultado a devolver.
 */
export async function createOperationClaim(input: CreateOperationInput): Promise<OperationClaim> {
  let operationKey = typeof input.operationKey === 'string' ? input.operationKey.trim() : '';
  if (operationKey.length === 0) {
    // Compatibilidad para clientes antiguos sin clave explícita: se crea una
    // clave única; el reintento seguro requiere que el cliente la reenvíe.
    operationKey = `auto-${crypto.randomUUID()}`;
  } else if (!OPERATION_KEY_PATTERN.test(operationKey)) {
    throw new ApiError(400, 'Clave de reintento inválida: use entre 8 y 128 caracteres alfanuméricos, punto, guion o dos puntos');
  }

  const effectiveDate = input.effectiveDate ?? currentFarmDate();
  if (!isValidDateString(effectiveDate)) {
    throw new ApiError(400, 'Fecha efectiva inválida: use el formato AAAA-MM-DD');
  }

  if (!Number.isInteger(input.authorUserId) || input.authorUserId <= 0) {
    throw new ApiError(400, 'Autor de la operación inválido');
  }

  return {
    id: crypto.randomUUID(),
    operationKey,
    operationType: input.operationType,
    authorUserId: input.authorUserId,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    barnId: input.barnId ?? null,
    effectiveDate,
    recordedAt: new Date().toISOString(),
    contentHash: await sha256Hex(canonicalize(input.payload)),
    payload: input.payload,
    result: input.result,
  };
}

/**
 * Consulta previa de reintento. Se usa antes de validar estado que la propia
 * operación ya pudo modificar (por ejemplo, una fila ya corregida).
 * Devuelve el resultado anterior si la clave y el contenido coinciden.
 */
export async function lookupExistingOperation(
  db: D1Database,
  authorUserId: number,
  operationKey: string | undefined,
  payload: unknown,
): Promise<{ replayed: true; result: unknown } | null> {
  if (!operationKey) return null;

  const row = await db.prepare(`
    SELECT content_hash, result_payload
    FROM operation_log
    WHERE author_user_id = ? AND operation_key = ?
  `).bind(authorUserId, operationKey).first() as { content_hash: string; result_payload: string } | null;

  if (!row) return null;

  const contentHash = await sha256Hex(canonicalize(payload));
  if (String(row.content_hash) !== contentHash) {
    throw new ApiError(
      409,
      'Conflicto de reintento: la clave ya fue usada con un contenido distinto. No se registró ningún cambio',
    );
  }

  return { replayed: true, result: parseResultPayload(row.result_payload) };
}

function parseResultPayload(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function operationInsertStatement(db: D1Database, claim: OperationClaim): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO operation_log (
      id, operation_key, operation_type, author_user_id, entity_type, entity_id, barn_id,
      content_hash, payload, result_payload, effective_date, recorded_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    claim.id,
    claim.operationKey,
    claim.operationType,
    claim.authorUserId,
    claim.entityType,
    claim.entityId,
    claim.barnId,
    claim.contentHash,
    canonicalize(claim.payload),
    canonicalize(claim.result),
    claim.effectiveDate,
    claim.recordedAt,
  );
}

export function auditInsertStatement(db: D1Database, claim: OperationClaim, record: AuditRecordInput): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO audit_log (
      operation_log_id, entity_type, entity_id, action, actor_user_id, barn_id,
      reason, previous_data, new_data, effective_date, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    claim.id,
    record.entityType,
    record.entityId,
    record.action,
    record.actorUserId,
    record.barnId ?? null,
    record.reason,
    record.previousData === undefined ? null : canonicalize(record.previousData),
    record.newData === undefined ? null : canonicalize(record.newData),
    record.effectiveDate,
    record.recordedAt,
  );
}

export interface CommitResult {
  replayed: boolean;
  result: unknown;
}

/**
 * Confirma la operación y sus efectos en un único lote atómico de D1.
 * Si la clave ya existe con el mismo contenido devuelve el resultado guardado.
 * Si existe con contenido distinto lanza 409 sin aplicar efectos.
 */
export async function commitOperation(
  db: D1Database,
  claim: OperationClaim,
  effectStatements: D1PreparedStatement[],
  auditRecords: AuditRecordInput[],
): Promise<CommitResult> {
  const statements: D1PreparedStatement[] = [
    operationInsertStatement(db, claim),
    ...effectStatements,
    ...auditRecords.map((record) => auditInsertStatement(db, claim, record)),
  ];

  try {
    await db.batch(statements);
    return { replayed: false, result: claim.result };
  } catch (error) {
    // El lote es atómico: si falló por clave duplicada no aplicó ningún efecto.
    const existing = await db.prepare(`
      SELECT content_hash, result_payload
      FROM operation_log
      WHERE author_user_id = ? AND operation_key = ?
    `).bind(claim.authorUserId, claim.operationKey).first() as { content_hash: string; result_payload: string } | null;

    if (!existing) {
      throw error;
    }

    if (String(existing.content_hash) !== claim.contentHash) {
      throw new ApiError(
        409,
        'Conflicto de reintento: la clave ya fue usada con un contenido distinto. No se registró ningún cambio',
      );
    }

    return { replayed: true, result: parseResultPayload(existing.result_payload) };
  }
}

export interface AuditFilters {
  entityType?: string;
  entityId?: number;
  barnId?: number;
  limit?: number;
}

/** Consulta de auditoría para el responsable: conserva el registro original. */
export async function listAuditLog(db: D1Database, filters: AuditFilters = {}): Promise<AuditItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.entityType) {
    where.push('a.entity_type = ?');
    params.push(filters.entityType);
  }
  if (filters.entityId !== undefined) {
    where.push('a.entity_id = ?');
    params.push(filters.entityId);
  }
  if (filters.barnId !== undefined) {
    where.push('a.barn_id = ?');
    params.push(filters.barnId);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 200);

  const sql = `
    SELECT
      a.id, a.operation_log_id, o.operation_key, a.entity_type, a.entity_id, a.action,
      a.actor_user_id, u.name as actor_name,
      a.barn_id, b.code as barn_code, b.name as barn_name,
      a.reason, a.previous_data, a.new_data, a.effective_date, a.recorded_at
    FROM audit_log a
    INNER JOIN users u ON a.actor_user_id = u.id
    LEFT JOIN barns b ON a.barn_id = b.id
    LEFT JOIN operation_log o ON a.operation_log_id = o.id
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.recorded_at DESC, a.id DESC
    LIMIT ?
  `;

  const res = await db.prepare(sql).bind(...params, limit).all();

  return (res.results ?? []).map((row: Record<string, unknown>) => {
    const parse = (value: unknown) => {
      if (value === null || value === undefined) return null;
      try {
        return JSON.parse(String(value));
      } catch {
        return String(value);
      }
    };

    return {
      id: Number(row.id),
      operation_log_id: row.operation_log_id ? String(row.operation_log_id) : null,
      operation_key: row.operation_key ? String(row.operation_key) : null,
      entity_type: String(row.entity_type),
      entity_id: Number(row.entity_id),
      action: row.action as AuditAction,
      actor_user_id: Number(row.actor_user_id),
      actor_name: String(row.actor_name),
      barn_id: row.barn_id === null || row.barn_id === undefined ? null : Number(row.barn_id),
      barn_code: row.barn_code ? String(row.barn_code) : null,
      barn_name: row.barn_name ? String(row.barn_name) : null,
      reason: String(row.reason),
      previous_data: parse(row.previous_data),
      new_data: parse(row.new_data),
      effective_date: String(row.effective_date),
      recorded_at: String(row.recorded_at),
    };
  });
}

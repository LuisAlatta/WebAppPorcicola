import {
  hashPassword,
  findUserByUsername,
  UserRecord,
} from './auth';
import {
  ApiError,
  commitOperation,
  createOperationClaim,
  currentFarmDate,
  farmDateToUtcIso,
  isValidDateString,
  lookupExistingOperation,
  type AuditRecordInput,
} from './events';

export interface Env {
  DB: D1Database;
}

export type Perfil = 'administrador' | 'responsable' | 'operario' | 'veterinario';

export interface UserSummary {
  id: number;
  username: string;
  name: string;
  role: Perfil;
  is_active: number;
  created_at: string;
  updated_at: string;
  barns: { id: number; code: string; name: string }[];
}

export interface BarnTeamMember {
  id: number;
  name: string;
  username: string;
}

export interface BarnDetail {
  id: number;
  code: string;
  name: string;
  zone: string;
  capacity: number;
  status: 'preparacion' | 'operativo' | 'inactivo';
  responsable: BarnTeamMember | null;
  operario: BarnTeamMember | null;
  veterinario: BarnTeamMember | null;
  created_at: string;
  updated_at: string | null;
  pensCount: number;
}

export interface TeamHistoryItem {  id: number;
  barn_id: number;
  barn_code: string;
  barn_name: string;
  role: 'responsable' | 'operario' | 'veterinario';
  previous_user_id: number | null;
  previous_user_name: string | null;
  new_user_id: number;
  new_user_name: string;
  valid_from: string;
  valid_until: string | null;
  reason: string | null;
  is_current: number;
  corrects_history_id: number | null;
  superseded_by_id: number | null;
  changed_by_user_id: number;
  changed_by_name: string;
  created_at: string;
}

async function loadTeamMember(db: D1Database, userId: number | null): Promise<BarnTeamMember | null> {
  if (!userId) return null;
  const row = await db.prepare('SELECT id, name, username FROM users WHERE id = ?')
    .bind(userId).first() as BarnTeamMember | null;
  if (!row) return null;
  return { id: Number(row.id), name: String(row.name), username: String(row.username) };
}

// 1. Listar todos los usuarios con sus galpones asignados
export async function listAllUsers(db: D1Database): Promise<UserSummary[]> {
  const usersRes = await db.prepare(`
    SELECT id, username, name, role, is_active, created_at, updated_at
    FROM users
    ORDER BY id ASC
  `).all();

  const users = (usersRes.results ?? []) as unknown as UserRecord[];

  const barnAssignmentsRes = await db.prepare(`
    SELECT ub.user_id, b.id as barn_id, b.code, b.name
    FROM user_barns ub
    INNER JOIN barns b ON ub.barn_id = b.id
    ORDER BY b.code ASC
  `).all();

  const barnMap = new Map<number, { id: number; code: string; name: string }[]>();
  for (const row of (barnAssignmentsRes.results ?? []) as { user_id: number; barn_id: number; code: string; name: string }[]) {
    if (!barnMap.has(row.user_id)) {
      barnMap.set(row.user_id, []);
    }
    barnMap.get(row.user_id)!.push({
      id: row.barn_id,
      code: row.code,
      name: row.name,
    });
  }

  return users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as Perfil,
    is_active: u.is_active,
    created_at: u.created_at,
    updated_at: u.updated_at,
    barns: barnMap.get(u.id) || [],
  }));
}

// 2. Crear una nueva cuenta de usuario
export async function createUser(
  db: D1Database,
  data: {
    username?: string;
    name?: string;
    role?: Perfil;
    password?: string;
    is_active?: number;
    barnIds?: number[];
  },
): Promise<UserSummary> {
  const username = data.username?.trim().toLowerCase();
  const name = data.name?.trim();
  const role = data.role;
  const password = data.password?.trim();
  const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;
  const barnIds = Array.isArray(data.barnIds) ? data.barnIds : [];

  if (!username || !name || !role || !password) {
    throw new Error('Todos los campos son obligatorios: username, name, role, password');
  }

  const validRoles: Perfil[] = ['administrador', 'responsable', 'operario', 'veterinario'];
  if (!validRoles.includes(role)) {
    throw new Error('Perfil no válido. Debe ser: administrador, responsable, operario o veterinario');
  }

  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }

  // Regla ACC-07 / ADM-02: Cuenta activa con perfil Usuario (responsable) debe tener uno o más galpones
  if (role === 'responsable' && isActive === 1 && barnIds.length === 0) {
    throw new Error('Un Usuario responsable activo debe tener al menos un galpón asignado. Asigne un galpón o cree la cuenta como inactiva');
  }

  const existing = await findUserByUsername(db, username);
  if (existing) {
    throw new Error(`El usuario con identificador "${username}" ya existe`);
  }

  const { hash, salt } = await hashPassword(password);
  const now = new Date().toISOString();

  const insertRes = await db.prepare(`
    INSERT INTO users (username, name, role, password_hash, password_salt, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(username, name, role, hash, salt, isActive, now, now).run();

  const newUserId = Number(insertRes.meta?.last_row_id);

  // Asignar galpones si se proporcionaron
  if (barnIds.length > 0 && newUserId) {
    const stmts: D1PreparedStatement[] = [];
    for (const bId of barnIds) {
      stmts.push(
        db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(newUserId, bId, now),
      );
    }
    if (stmts.length > 0) {
      await db.batch(stmts);
    }
  }

  const createdUser = await db.prepare('SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
    .bind(newUserId)
    .first() as unknown as UserRecord;

  const assignedBarns = await db.prepare(`
    SELECT b.id, b.code, b.name
    FROM user_barns ub
    INNER JOIN barns b ON ub.barn_id = b.id
    WHERE ub.user_id = ?
    ORDER BY b.code ASC
  `).bind(newUserId).all();

  return {
    id: createdUser.id,
    username: createdUser.username,
    name: createdUser.name,
    role: createdUser.role as Perfil,
    is_active: createdUser.is_active,
    created_at: createdUser.created_at,
    updated_at: createdUser.updated_at,
    barns: (assignedBarns.results ?? []) as unknown as { id: number; code: string; name: string }[],
  };
}

// 3. Modificar una cuenta de usuario existente
export async function updateUser(
  db: D1Database,
  userId: number,
  data: {
    name?: string;
    role?: Perfil;
    password?: string;
    is_active?: number;
    barnIds?: number[];
  },
): Promise<UserSummary> {
  const existing = await db.prepare('SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
    .bind(userId)
    .first() as unknown as UserRecord | null;

  if (!existing) {
    throw new Error('Usuario no encontrado');
  }

  const targetRole = data.role !== undefined ? data.role : (existing.role as Perfil);
  const targetActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active;

  // Invariante: La granja no puede quedar sin administrador activo
  if (existing.role === 'administrador' && existing.is_active === 1) {
    const isDeactivating = targetActive === 0;
    const isChangingRole = targetRole !== 'administrador';
    if (isDeactivating || isChangingRole) {
      const remainingAdmins = await db.prepare(`
        SELECT count(*) as count FROM users
        WHERE role = 'administrador' AND is_active = 1 AND id != ?
      `).bind(userId).first() as { count: number } | null;

      if ((remainingAdmins?.count ?? 0) === 0) {
        throw new Error('No es posible desactivar o modificar el rol del único administrador activo');
      }
    }
  }

  // Regla ACC-07 / ADM-03: Usuario responsable activo no puede quedar sin galpones
  if (targetRole === 'responsable' && targetActive === 1) {
    if (data.barnIds !== undefined && data.barnIds.length === 0) {
      throw new Error('Un Usuario responsable activo debe tener al menos un galpón asignado. Asigne otro galpón o desactive la cuenta');
    }
    if (data.barnIds === undefined) {
      // Verificar si actualmente tiene galpones asignados
      const currentBarnsCount = await db.prepare('SELECT count(*) as count FROM user_barns WHERE user_id = ?')
        .bind(userId)
        .first() as { count: number } | null;
      if ((currentBarnsCount?.count ?? 0) === 0) {
        throw new Error('Un Usuario responsable activo debe tener al menos un galpón asignado. Asigne otro galpón o desactive la cuenta');
      }
    }
  }

  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (data.name !== undefined && data.name.trim().length > 0) {
    updates.push('name = ?');
    params.push(data.name.trim());
  }

  if (data.role !== undefined) {
    const validRoles: Perfil[] = ['administrador', 'responsable', 'operario', 'veterinario'];
    if (!validRoles.includes(data.role)) {
      throw new Error('Perfil no válido');
    }
    updates.push('role = ?');
    params.push(data.role);
  }

  if (data.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(targetActive);
  }

  if (data.password && data.password.trim().length > 0) {
    if (data.password.trim().length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    const { hash, salt } = await hashPassword(data.password.trim());
    updates.push('password_hash = ?', 'password_salt = ?');
    params.push(hash, salt);
  }

  params.push(userId);

  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params),
  ];

  // Si se actualizaron galpones
  if (data.barnIds !== undefined) {
    stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ?').bind(userId));
    for (const bId of data.barnIds) {
      stmts.push(
        db.prepare('INSERT INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(userId, bId, now),
      );
    }
  }

  // Revocación inmediata: al desactivar la cuenta se invalidan todas sus sesiones.
  // Reactivar la cuenta no revive tokens emitidos antes de la desactivación.
  if (targetActive === 0 && existing.is_active === 1) {
    stmts.push(db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, userId));
  }

  await db.batch(stmts);

  const updatedUser = await db.prepare('SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
    .bind(userId)
    .first() as unknown as UserRecord;

  const assignedBarns = await db.prepare(`
    SELECT b.id, b.code, b.name
    FROM user_barns ub
    INNER JOIN barns b ON ub.barn_id = b.id
    WHERE ub.user_id = ?
    ORDER BY b.code ASC
  `).bind(userId).all();

  return {
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    role: updatedUser.role as Perfil,
    is_active: updatedUser.is_active,
    created_at: updatedUser.created_at,
    updated_at: updatedUser.updated_at,
    barns: (assignedBarns.results ?? []) as unknown as { id: number; code: string; name: string }[],
  };
}

// 4. Listar galpones con equipo operativo y estado
export async function listAllBarns(db: D1Database): Promise<BarnDetail[]> {
  const barnsRes = await db.prepare(`
    SELECT
      b.id, b.code, b.name, b.zone, b.capacity, b.status, b.created_at, b.updated_at,
      u_resp.id as resp_id, u_resp.name as resp_name, u_resp.username as resp_username,
      u_oper.id as oper_id, u_oper.name as oper_name, u_oper.username as oper_username,
      u_vet.id as vet_id, u_vet.name as vet_name, u_vet.username as vet_username,
      (SELECT count(*) FROM barn_pens bp WHERE bp.barn_id = b.id) as pens_count
    FROM barns b
    LEFT JOIN users u_resp ON b.responsable_id = u_resp.id
    LEFT JOIN users u_oper ON b.operario_id = u_oper.id
    LEFT JOIN users u_vet ON b.veterinario_id = u_vet.id
    ORDER BY b.code ASC
  `).all();

  return (barnsRes.results ?? []).map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    zone: String(row.zone || ''),
    capacity: Number(row.capacity || 80),
    status: (row.status as 'preparacion' | 'operativo' | 'inactivo') || 'preparacion',
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    pensCount: Number(row.pens_count || 0),
    responsable: row.resp_id ? {
      id: Number(row.resp_id),
      name: String(row.resp_name),
      username: String(row.resp_username),
    } : null,
    operario: row.oper_id ? {
      id: Number(row.oper_id),
      name: String(row.oper_name),
      username: String(row.oper_username),
    } : null,
    veterinario: row.vet_id ? {
      id: Number(row.vet_id),
      name: String(row.vet_name),
      username: String(row.vet_username),
    } : null,
  }));
}

// 5. Crear galpón (CFG-06)
export async function createBarn(
  db: D1Database,
  data: {
    code?: string;
    name?: string;
    zone?: string;
    capacity?: number;
  },
): Promise<BarnDetail> {
  const code = data.code?.trim().toUpperCase();
  const name = data.name?.trim();
  const zone = data.zone?.trim() || '';
  const capacity = Number(data.capacity) > 0 ? Number(data.capacity) : 80;

  if (!code || !name) {
    throw new Error('Código y nombre del galpón son obligatorios');
  }

  const existing = await db.prepare('SELECT id FROM barns WHERE code = ?').bind(code).first();
  if (existing) {
    throw new Error(`Ya existe un galpón con el código ${code}`);
  }

  const now = new Date().toISOString();
  const res = await db.prepare(`
    INSERT INTO barns (code, name, zone, capacity, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'preparacion', ?, ?)
  `).bind(code, name, zone, capacity, now, now).run();

  const newBarnId = Number(res.meta?.last_row_id);

  return {
    id: newBarnId,
    code,
    name,
    zone,
    capacity,
    status: 'preparacion',
    responsable: null,
    operario: null,
    veterinario: null,
    created_at: now,
    updated_at: now,
    pensCount: 0,
  };
}

// 6. Actualizar información general de un galpón
export async function updateBarn(
  db: D1Database,
  barnId: number,
  data: {
    name?: string;
    zone?: string;
    capacity?: number;
  },
): Promise<void> {
  const barn = await db.prepare('SELECT id FROM barns WHERE id = ?').bind(barnId).first();
  if (!barn) {
    throw new Error('Galpón no encontrado');
  }

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];

  if (data.name !== undefined && data.name.trim().length > 0) {
    updates.push('name = ?');
    params.push(data.name.trim());
  }

  if (data.zone !== undefined) {
    updates.push('zone = ?');
    params.push(data.zone.trim());
  }

  if (data.capacity !== undefined && Number(data.capacity) > 0) {
    updates.push('capacity = ?');
    params.push(Number(data.capacity));
  }

  params.push(barnId);

  await db.prepare(`UPDATE barns SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
}

// 7. Asignar o sustituir equipo del galpón (ADM-02, ADM-03, CA-28 · ACC-04, GES-03)
export async function assignBarnTeam(
  db: D1Database,
  adminId: number,
  barnId: number,
  data: {
    responsableId: number;
    operarioId: number;
    veterinarioId: number;
    activate?: boolean;
    reason?: string;
    effectiveDate?: string;
    operationKey?: string;
    reassignment?: {
      newBarnId?: number;
      deactivatePreviousResponsable?: boolean;
    };
  },
): Promise<{ barn: BarnDetail; replayed: boolean }> {
  const barn = await db.prepare(`
    SELECT id, code, name, zone, capacity, status, responsable_id, operario_id, veterinario_id, created_at,
      (SELECT count(*) FROM barn_pens bp WHERE bp.barn_id = barns.id) as pens_count
    FROM barns WHERE id = ?
  `).bind(barnId).first() as Record<string, unknown> | null;

  if (!barn) {
    throw new ApiError(404, 'Galpón no encontrado');
  }

  if (!Number.isInteger(data.responsableId) || !Number.isInteger(data.operarioId) || !Number.isInteger(data.veterinarioId)) {
    throw new ApiError(400, 'Debe indicar Usuario responsable, Operario y Médico veterinario para completar el equipo');
  }

  if (data.effectiveDate !== undefined && !isValidDateString(data.effectiveDate)) {
    throw new ApiError(400, 'Fecha efectiva inválida: use el formato AAAA-MM-DD');
  }

  const effectiveDate = data.effectiveDate ?? currentFarmDate();
  const effectiveAt = farmDateToUtcIso(effectiveDate);
  const reason = data.reason?.trim() || 'Asignación de equipo del galpón';

  // ACC-04: si el cliente reintenta la misma operación, se devuelve el
  // resultado anterior antes de validar un estado que ya pudo cambiar.
  const operationPayload = {
    barnId,
    responsableId: data.responsableId,
    operarioId: data.operarioId,
    veterinarioId: data.veterinarioId,
    activate: Boolean(data.activate),
    reassignment: data.reassignment ?? null,
    reason,
    effectiveDate,
  };

  const replay = await lookupExistingOperation(db, adminId, data.operationKey, operationPayload);
  if (replay) {
    return { barn: replay.result as BarnDetail, replayed: true };
  }

  // Validar cuentas y perfiles correspondientes
  const [respUser, operUser, vetUser] = await Promise.all([
    db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').bind(data.responsableId).first() as Promise<UserRecord | null>,
    db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').bind(data.operarioId).first() as Promise<UserRecord | null>,
    db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').bind(data.veterinarioId).first() as Promise<UserRecord | null>,
  ]);

  if (!respUser || respUser.is_active !== 1 || respUser.role !== 'responsable') {
    throw new ApiError(400, 'El usuario responsable seleccionado no es válido o está inactivo');
  }

  if (!operUser || operUser.is_active !== 1 || operUser.role !== 'operario') {
    throw new ApiError(400, 'El operario seleccionado no es válido o está inactivo');
  }

  if (!vetUser || vetUser.is_active !== 1 || vetUser.role !== 'veterinario') {
    throw new ApiError(400, 'El médico veterinario seleccionado no es válido o está inactivo');
  }

  const prevRespId = barn.responsable_id ? Number(barn.responsable_id) : null;
  const prevOperId = barn.operario_id ? Number(barn.operario_id) : null;
  const prevVetId = barn.veterinario_id ? Number(barn.veterinario_id) : null;

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  // Un usuario puede cubrir más de un rol en el mismo galpón: solo se retira
  // el acceso de user_barns cuando ya no ocupa ningún rol tras la operación.
  const holdsRoleAfterOperation = (userId: number | null) => {
    if (!userId) return false;
    return [data.responsableId, data.operarioId, data.veterinarioId].includes(userId);
  };

  // Regla ADM-03: Si un responsable activo perdería su último galpón
  if (prevRespId && prevRespId !== data.responsableId) {
    const otherBarns = await db.prepare(`
      SELECT count(*) as count FROM user_barns
      WHERE user_id = ? AND barn_id != ?
    `).bind(prevRespId, barnId).first() as { count: number } | null;

    if ((otherBarns?.count ?? 0) === 0) {
      const prevUser = await db.prepare('SELECT name, is_active FROM users WHERE id = ?').bind(prevRespId).first() as { name: string; is_active: number } | null;
      if (prevUser && prevUser.is_active === 1) {
        if (data.reassignment?.deactivatePreviousResponsable) {
          // Desactivar cuenta en la misma operación atómica
          stmts.push(db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').bind(now, prevRespId));
        } else if (data.reassignment?.newBarnId) {
          // Asignar al nuevo galpón en la misma operación atómica
          stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(prevRespId, data.reassignment.newBarnId, now));
        } else {
          throw new ApiError(400, `El Usuario responsable anterior (${prevUser.name}) quedaría sin galpones asignados. Debe asignarle otro galpón o desactivar su cuenta en la misma operación`);
        }
      }
    }
  }

  // Marca la fila vigente anterior y registra la nueva con fecha efectiva,
  // autor y motivo. La fila anterior se conserva para reconstruir el historial.
  const reopenRoleHistory = (role: 'responsable' | 'operario' | 'veterinario', previousUserId: number | null, newUserId: number) => {
    stmts.push(
      db.prepare(`
        UPDATE barn_team_history
        SET is_current = 0, valid_until = COALESCE(valid_until, ?)
        WHERE barn_id = ? AND role = ? AND is_current = 1
      `).bind(effectiveAt, barnId, role),
    );
    stmts.push(
      db.prepare(`
        INSERT INTO barn_team_history (barn_id, role, previous_user_id, new_user_id, valid_from, changed_by_user_id, created_at, reason, is_current)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(barnId, role, previousUserId, newUserId, effectiveAt, adminId, now, reason),
    );
  };

  // 1. Responsable
  if (prevRespId !== data.responsableId) {
    reopenRoleHistory('responsable', prevRespId, data.responsableId);
    if (prevRespId && !holdsRoleAfterOperation(prevRespId)) {
      stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(prevRespId, barnId));
    }
    stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(data.responsableId, barnId, now));
  }

  // 2. Operario
  if (prevOperId !== data.operarioId) {
    reopenRoleHistory('operario', prevOperId, data.operarioId);
    if (prevOperId && !holdsRoleAfterOperation(prevOperId)) {
      stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(prevOperId, barnId));
    }
    stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(data.operarioId, barnId, now));
  }

  // 3. Médico Veterinario
  if (prevVetId !== data.veterinarioId) {
    reopenRoleHistory('veterinario', prevVetId, data.veterinarioId);
    if (prevVetId && !holdsRoleAfterOperation(prevVetId)) {
      stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(prevVetId, barnId));
    }
    stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(data.veterinarioId, barnId, now));
  }

  // Determinar nuevo estado del galpón
  let newStatus = String(barn.status);
  if (data.activate) {
    newStatus = 'operativo';
  }

  stmts.push(
    db.prepare(`
      UPDATE barns
      SET responsable_id = ?, operario_id = ?, veterinario_id = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).bind(data.responsableId, data.operarioId, data.veterinarioId, newStatus, now, barnId),
  );

  const previousTeam = {
    responsableId: prevRespId,
    operarioId: prevOperId,
    veterinarioId: prevVetId,
    status: String(barn.status),
  };
  const newTeam = {
    responsableId: data.responsableId,
    operarioId: data.operarioId,
    veterinarioId: data.veterinarioId,
    status: newStatus,
  };

  const resultBarn: BarnDetail = {
    id: barnId,
    code: String(barn.code),
    name: String(barn.name),
    zone: String(barn.zone || ''),
    capacity: Number(barn.capacity || 80),
    status: newStatus as BarnDetail['status'],
    responsable: { id: respUser.id, name: respUser.name, username: respUser.username },
    operario: { id: operUser.id, name: operUser.name, username: operUser.username },
    veterinario: { id: vetUser.id, name: vetUser.name, username: vetUser.username },
    created_at: String(barn.created_at),
    updated_at: now,
    pensCount: Number(barn.pens_count || 0),
  };

  const claim = await createOperationClaim({
    operationKey: data.operationKey,
    operationType: 'barn.team.assign',
    authorUserId: adminId,
    entityType: 'barn',
    entityId: barnId,
    barnId,
    effectiveDate,
    payload: operationPayload,
    result: resultBarn,
  });

  const audit: AuditRecordInput = {
    entityType: 'barn',
    entityId: barnId,
    action: 'update',
    actorUserId: adminId,
    barnId,
    reason,
    previousData: previousTeam,
    newData: newTeam,
    effectiveDate,
    recordedAt: claim.recordedAt,
  };

  const commit = await commitOperation(db, claim, stmts, [audit]);
  return { barn: (commit.result as BarnDetail) ?? resultBarn, replayed: commit.replayed };
}

// 8. Corregir una asignación vigente con historial reconstruible (T06 · GES-03)
export async function correctTeamAssignment(
  db: D1Database,
  adminId: number,
  barnId: number,
  data: {
    historyId?: number;
    role?: 'responsable' | 'operario' | 'veterinario';
    newUserId?: number;
    reason?: string;
    effectiveDate?: string;
    operationKey?: string;
  },
): Promise<{ barn: BarnDetail; correctedHistoryId: number; newHistoryId: number | null; replayed: boolean }> {
  const historyId = Number(data.historyId);
  const newUserId = Number(data.newUserId);
  const role = data.role;

  if (!Number.isInteger(historyId) || historyId <= 0) {
    throw new ApiError(400, 'Debe indicar la asignación histórica que desea corregir');
  }

  if (role !== 'responsable' && role !== 'operario' && role !== 'veterinario') {
    throw new ApiError(400, 'El rol a corregir debe ser responsable, operario o veterinario');
  }

  if (!Number.isInteger(newUserId) || newUserId <= 0) {
    throw new ApiError(400, 'Debe indicar el usuario titular correcto');
  }

  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (reason.length < 5) {
    throw new ApiError(400, 'El motivo de la corrección es obligatorio y debe describir la causa (mínimo 5 caracteres)');
  }

  if (data.effectiveDate !== undefined && !isValidDateString(data.effectiveDate)) {
    throw new ApiError(400, 'Fecha efectiva inválida: use el formato AAAA-MM-DD');
  }
  const effectiveDate = data.effectiveDate ?? currentFarmDate();
  const effectiveAt = farmDateToUtcIso(effectiveDate);
  const now = new Date().toISOString();

  // ACC-04: el reintento debe devolver el resultado previo incluso si la fila
  // ya quedó marcada como corregida por el primer envío.
  const operationPayload = { barnId, historyId, role, newUserId, reason, effectiveDate };
  const replay = await lookupExistingOperation(db, adminId, data.operationKey, operationPayload);
  if (replay) {
    const stored = replay.result as { barn: BarnDetail; correctedHistoryId: number } | null;
    const replayHistory = await db.prepare(`
      SELECT id FROM barn_team_history
      WHERE corrects_history_id = ? AND barn_id = ?
      ORDER BY id DESC LIMIT 1
    `).bind(historyId, barnId).first() as { id: number } | null;
    return {
      barn: stored?.barn as BarnDetail,
      correctedHistoryId: stored?.correctedHistoryId ?? historyId,
      newHistoryId: replayHistory ? Number(replayHistory.id) : null,
      replayed: true,
    };
  }

  const history = await db.prepare(`
    SELECT id, barn_id, role, previous_user_id, new_user_id, valid_from, valid_until,
      changed_by_user_id, created_at, reason, corrects_history_id, superseded_by_id, is_current
    FROM barn_team_history
    WHERE id = ? AND barn_id = ?
  `).bind(historyId, barnId).first() as Record<string, unknown> | null;

  if (!history) {
    throw new ApiError(404, 'Asignación histórica no encontrada para este galpón');
  }

  if (String(history.role) !== role) {
    throw new ApiError(400, 'El rol indicado no coincide con la asignación histórica');
  }

  if (history.superseded_by_id !== null && history.superseded_by_id !== undefined) {
    throw new ApiError(409, 'La asignación ya fue corregida; consulte el historial vigente');
  }

  if (Number(history.is_current) !== 1) {
    throw new ApiError(409, 'Solo puede corregirse la asignación vigente del galpón');
  }

  const latest = await db.prepare(`
    SELECT id FROM barn_team_history
    WHERE barn_id = ? AND role = ?
    ORDER BY id DESC LIMIT 1
  `).bind(barnId, role).first() as { id: number } | null;

  if (!latest || Number(latest.id) !== historyId) {
    throw new ApiError(409, 'Solo puede corregirse la última asignación registrada para ese rol');
  }

  const barn = await db.prepare(`
    SELECT id, code, name, zone, capacity, status, responsable_id, operario_id, veterinario_id, created_at,
      (SELECT count(*) FROM barn_pens bp WHERE bp.barn_id = barns.id) as pens_count
    FROM barns WHERE id = ?
  `).bind(barnId).first() as Record<string, unknown> | null;

  if (!barn) {
    throw new ApiError(404, 'Galpón no encontrado');
  }

  const currentUserId = Number(history.new_user_id);
  const barnRoleKey = role === 'responsable'
    ? 'responsable_id'
    : role === 'operario'
      ? 'operario_id'
      : 'veterinario_id';

  if (Number(barn[barnRoleKey] ?? 0) !== currentUserId) {
    throw new ApiError(409, 'La asignación vigente no coincide con el historial; recargue los datos antes de corregir');
  }

  if (newUserId === currentUserId) {
    throw new ApiError(400, 'La corrección debe reemplazar al titular actual por otro usuario');
  }

  const newUser = await db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?')
    .bind(newUserId).first() as UserRecord | null;

  if (!newUser || newUser.is_active !== 1 || newUser.role !== role) {
    throw new ApiError(400, `El usuario seleccionado no es un ${role} activo`);
  }

  if (role === 'responsable') {
    const oldUser = await db.prepare('SELECT name, is_active FROM users WHERE id = ?')
      .bind(currentUserId).first() as { name: string; is_active: number } | null;
    if (oldUser && oldUser.is_active === 1) {
      const otherBarns = await db.prepare(`
        SELECT count(*) as count FROM user_barns WHERE user_id = ? AND barn_id != ?
      `).bind(currentUserId, barnId).first() as { count: number } | null;
      if ((otherBarns?.count ?? 0) === 0) {
        throw new ApiError(400, `El Usuario responsable anterior (${oldUser.name}) quedaría sin galpones asignados. Use la asignación de equipo con reasignación o desactivación atómica`);
      }
    }
  }

  // Estado resultante del equipo tras aplicar la corrección.
  const newTeamState = {
    responsableId: role === 'responsable' ? newUserId : (barn.responsable_id ? Number(barn.responsable_id) : null),
    operarioId: role === 'operario' ? newUserId : (barn.operario_id ? Number(barn.operario_id) : null),
    veterinarioId: role === 'veterinario' ? newUserId : (barn.veterinario_id ? Number(barn.veterinario_id) : null),
    status: String(barn.status),
  };
  const previousTeamState = {
    responsableId: barn.responsable_id ? Number(barn.responsable_id) : null,
    operarioId: barn.operario_id ? Number(barn.operario_id) : null,
    veterinarioId: barn.veterinario_id ? Number(barn.veterinario_id) : null,
    status: String(barn.status),
  };

  const stmts: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO barn_team_history (
        barn_id, role, previous_user_id, new_user_id, valid_from, changed_by_user_id,
        created_at, reason, corrects_history_id, is_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(barnId, role, currentUserId, newUserId, effectiveAt, adminId, now, reason, historyId),
    db.prepare(`
      UPDATE barn_team_history
      SET valid_until = ?,
        superseded_by_id = (
          SELECT id FROM barn_team_history
          WHERE corrects_history_id = ? AND barn_id = ?
          ORDER BY id DESC LIMIT 1
        ),
        is_current = 0
      WHERE id = ?
    `).bind(effectiveAt, historyId, barnId, historyId),
  ];

  // Retirar el acceso del titular anterior solo si no ocupa otro rol en el galpón.
  const otherRoleIds = [newTeamState.responsableId, newTeamState.operarioId, newTeamState.veterinarioId];
  const previousStillHoldsRole = otherRoleIds.some((id) => id === currentUserId);
  if (!previousStillHoldsRole) {
    stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(currentUserId, barnId));
  }
  stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(newUserId, barnId, now));

  stmts.push(db.prepare(`
    UPDATE barns SET ${barnRoleKey} = ?, updated_at = ? WHERE id = ?
  `).bind(newUserId, now, barnId));

  const [respMember, operMember, vetMember] = await Promise.all([
    loadTeamMember(db, newTeamState.responsableId),
    loadTeamMember(db, newTeamState.operarioId),
    loadTeamMember(db, newTeamState.veterinarioId),
  ]);

  const resultBarn: BarnDetail = {
    id: barnId,
    code: String(barn.code),
    name: String(barn.name),
    zone: String(barn.zone || ''),
    capacity: Number(barn.capacity || 80),
    status: String(barn.status) as BarnDetail['status'],
    responsable: respMember,
    operario: operMember,
    veterinario: vetMember,
    created_at: String(barn.created_at),
    updated_at: now,
    pensCount: Number(barn.pens_count || 0),
  };

  const claim = await createOperationClaim({
    operationKey: data.operationKey,
    operationType: 'barn.team.correct',
    authorUserId: adminId,
    entityType: 'barn',
    entityId: barnId,
    barnId,
    effectiveDate,
    payload: operationPayload,
    result: { barn: resultBarn, correctedHistoryId: historyId },
  });

  const audit: AuditRecordInput = {
    entityType: 'barn',
    entityId: barnId,
    action: 'correct',
    actorUserId: adminId,
    barnId,
    reason,
    previousData: {
      historyId,
      role,
      previous_user_id: history.previous_user_id,
      new_user_id: history.new_user_id,
      valid_from: history.valid_from,
      team: previousTeamState,
    },
    newData: {
      historyId,
      role,
      previous_user_id: currentUserId,
      new_user_id: newUserId,
      valid_from: effectiveAt,
      team: newTeamState,
    },
    effectiveDate,
    recordedAt: claim.recordedAt,
  };

  const commit = await commitOperation(db, claim, stmts, [audit]);
  const stored = commit.result as { barn: BarnDetail; correctedHistoryId: number } | null;
  const finalBarn = stored?.barn ?? resultBarn;

  const newHistory = await db.prepare(`
    SELECT id FROM barn_team_history
    WHERE corrects_history_id = ? AND barn_id = ?
    ORDER BY id DESC LIMIT 1
  `).bind(historyId, barnId).first() as { id: number } | null;

  return {
    barn: finalBarn,
    correctedHistoryId: stored?.correctedHistoryId ?? historyId,
    newHistoryId: newHistory ? Number(newHistory.id) : null,
    replayed: commit.replayed,
  };
}

// 8. Cambiar estado del galpón (validar equipo completo al poner en operación)
export async function updateBarnStatus(
  db: D1Database,
  barnId: number,
  newStatus: 'preparacion' | 'operativo' | 'inactivo',
): Promise<void> {
  const barn = await db.prepare(`
    SELECT id, code, name, status, responsable_id, operario_id, veterinario_id
    FROM barns WHERE id = ?
  `).bind(barnId).first() as {
    id: number;
    code: string;
    name: string;
    status: string;
    responsable_id: number | null;
    operario_id: number | null;
    veterinario_id: number | null;
  } | null;

  if (!barn) {
    throw new Error('Galpón no encontrado');
  }

  // Comprobación crítica: Activar solo cuando el equipo esté completo (ADM-02, CA-27, CA-28)
  if (newStatus === 'operativo') {
    if (!barn.responsable_id || !barn.operario_id || !barn.veterinario_id) {
      throw new Error('No se puede activar el galpón: el equipo está incompleto. Requiere un Usuario responsable, un Operario y un Médico veterinario activos');
    }

    const [resp, oper, vet] = await Promise.all([
      db.prepare('SELECT id, is_active, role FROM users WHERE id = ?').bind(barn.responsable_id).first() as Promise<UserRecord | null>,
      db.prepare('SELECT id, is_active, role FROM users WHERE id = ?').bind(barn.operario_id).first() as Promise<UserRecord | null>,
      db.prepare('SELECT id, is_active, role FROM users WHERE id = ?').bind(barn.veterinario_id).first() as Promise<UserRecord | null>,
    ]);

    if (!resp || resp.is_active !== 1 || resp.role !== 'responsable' ||
        !oper || oper.is_active !== 1 || oper.role !== 'operario' ||
        !vet || vet.is_active !== 1 || vet.role !== 'veterinario') {
      throw new Error('No se puede activar el galpón: el equipo está incompleto. Requiere un Usuario responsable, un Operario y un Médico veterinario activos');
    }
  }

  const now = new Date().toISOString();
  await db.prepare('UPDATE barns SET status = ?, updated_at = ? WHERE id = ?').bind(newStatus, now, barnId).run();
}

// 9. Eliminar galpón si carece de registros asociados (CFG-06)
export async function deleteBarn(db: D1Database, barnId: number): Promise<void> {
  const barn = await db.prepare('SELECT id FROM barns WHERE id = ?').bind(barnId).first();
  if (!barn) {
    throw new Error('Galpón no encontrado');
  }

  // Verificar si hay registros asociados (corrales, historial o auditoría)
  const pensCount = await db.prepare('SELECT count(*) as count FROM barn_pens WHERE barn_id = ?')
    .bind(barnId)
    .first() as { count: number } | null;

  if ((pensCount?.count ?? 0) > 0) {
    throw new Error('El galpón tiene corrales asociados. No puede eliminarse; use desactivación');
  }

  const [historyCount, auditCount] = await Promise.all([
    db.prepare('SELECT count(*) as count FROM barn_team_history WHERE barn_id = ?').bind(barnId).first() as Promise<{ count: number } | null>,
    db.prepare('SELECT count(*) as count FROM audit_log WHERE barn_id = ? OR (entity_type = ? AND entity_id = ?)')
      .bind(barnId, 'barn', barnId).first() as Promise<{ count: number } | null>,
  ]);

  if ((historyCount?.count ?? 0) > 0 || (auditCount?.count ?? 0) > 0) {
    throw new Error('El galpón tiene historial o auditoría asociada. No puede eliminarse; use desactivación');
  }

  await db.batch([
    db.prepare('DELETE FROM user_barns WHERE barn_id = ?').bind(barnId),
    db.prepare('DELETE FROM barn_team_history WHERE barn_id = ?').bind(barnId),
    db.prepare('DELETE FROM barns WHERE id = ?').bind(barnId),
  ]);
}

// 10. Consultar historial de equipo por galpón
export async function getTeamHistory(db: D1Database, barnId?: number): Promise<TeamHistoryItem[]> {
  let query = `
    SELECT
      h.id, h.barn_id, b.code as barn_code, b.name as barn_name, h.role,
      h.previous_user_id, u_prev.name as previous_user_name,
      h.new_user_id, u_new.name as new_user_name,
      h.valid_from, h.valid_until,
      h.reason, h.is_current, h.corrects_history_id, h.superseded_by_id,
      h.changed_by_user_id, u_admin.name as changed_by_name,
      h.created_at
    FROM barn_team_history h
    INNER JOIN barns b ON h.barn_id = b.id
    LEFT JOIN users u_prev ON h.previous_user_id = u_prev.id
    INNER JOIN users u_new ON h.new_user_id = u_new.id
    INNER JOIN users u_admin ON h.changed_by_user_id = u_admin.id
  `;

  if (barnId) {
    query += ' WHERE h.barn_id = ? ORDER BY h.id DESC';
    const res = await db.prepare(query).bind(barnId).all();
    return (res.results ?? []) as unknown as TeamHistoryItem[];
  } else {
    query += ' ORDER BY h.id DESC';
    const res = await db.prepare(query).all();
    return (res.results ?? []) as unknown as TeamHistoryItem[];
  }
}

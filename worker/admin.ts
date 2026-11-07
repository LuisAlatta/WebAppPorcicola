import {
  hashPassword,
  findUserByUsername,
  UserRecord,
} from './auth';

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

export interface TeamHistoryItem {
  id: number;
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
  changed_by_user_id: number;
  changed_by_name: string;
  created_at: string;
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

// 7. Asignar o sustituir equipo del galpón (ADM-02, ADM-03, CA-28)
export async function assignBarnTeam(
  db: D1Database,
  adminId: number,
  barnId: number,
  data: {
    responsableId: number;
    operarioId: number;
    veterinarioId: number;
    activate?: boolean;
    reassignment?: {
      newBarnId?: number;
      deactivatePreviousResponsable?: boolean;
    };
  },
): Promise<BarnDetail> {
  const barn = await db.prepare(`
    SELECT id, code, name, zone, capacity, status, responsable_id, operario_id, veterinario_id
    FROM barns WHERE id = ?
  `).bind(barnId).first() as Record<string, unknown> | null;

  if (!barn) {
    throw new Error('Galpón no encontrado');
  }

  // Validar cuentas y perfiles correspondientes
  const [respUser, operUser, vetUser] = await Promise.all([
    db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').bind(data.responsableId).first() as Promise<UserRecord | null>,
    db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').bind(data.operarioId).first() as Promise<UserRecord | null>,
    db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').bind(data.veterinarioId).first() as Promise<UserRecord | null>,
  ]);

  if (!respUser || respUser.is_active !== 1 || respUser.role !== 'responsable') {
    throw new Error('El usuario responsable seleccionado no es válido o está inactivo');
  }

  if (!operUser || operUser.is_active !== 1 || operUser.role !== 'operario') {
    throw new Error('El operario seleccionado no es válido o está inactivo');
  }

  if (!vetUser || vetUser.is_active !== 1 || vetUser.role !== 'veterinario') {
    throw new Error('El médico veterinario seleccionado no es válido o está inactivo');
  }

  const prevRespId = barn.responsable_id ? Number(barn.responsable_id) : null;
  const prevOperId = barn.operario_id ? Number(barn.operario_id) : null;
  const prevVetId = barn.veterinario_id ? Number(barn.veterinario_id) : null;

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

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
          throw new Error(`El Usuario responsable anterior (${prevUser.name}) quedaría sin galpones asignados. Debe asignarle otro galpón o desactivar su cuenta en la misma operación`);
        }
      }
    }
  }

  // Registrar en historial si hay cambios y sincronizar user_barns
  // 1. Responsable
  if (prevRespId !== data.responsableId) {
    stmts.push(
      db.prepare(`
        INSERT INTO barn_team_history (barn_id, role, previous_user_id, new_user_id, valid_from, changed_by_user_id, created_at)
        VALUES (?, 'responsable', ?, ?, ?, ?, ?)
      `).bind(barnId, prevRespId, data.responsableId, now, adminId, now),
    );
    if (prevRespId) {
      stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(prevRespId, barnId));
    }
    stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(data.responsableId, barnId, now));
  }

  // 2. Operario
  if (prevOperId !== data.operarioId) {
    stmts.push(
      db.prepare(`
        INSERT INTO barn_team_history (barn_id, role, previous_user_id, new_user_id, valid_from, changed_by_user_id, created_at)
        VALUES (?, 'operario', ?, ?, ?, ?, ?)
      `).bind(barnId, prevOperId, data.operarioId, now, adminId, now),
    );
    if (prevOperId) {
      stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(prevOperId, barnId));
    }
    stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(data.operarioId, barnId, now));
  }

  // 3. Médico Veterinario
  if (prevVetId !== data.veterinarioId) {
    stmts.push(
      db.prepare(`
        INSERT INTO barn_team_history (barn_id, role, previous_user_id, new_user_id, valid_from, changed_by_user_id, created_at)
        VALUES (?, 'veterinario', ?, ?, ?, ?, ?)
      `).bind(barnId, prevVetId, data.veterinarioId, now, adminId, now),
    );
    if (prevVetId) {
      stmts.push(db.prepare('DELETE FROM user_barns WHERE user_id = ? AND barn_id = ?').bind(prevVetId, barnId));
    }
    stmts.push(db.prepare('INSERT OR IGNORE INTO user_barns (user_id, barn_id, assigned_at) VALUES (?, ?, ?)').bind(data.veterinarioId, barnId, now));
  }

  // Determinar nuevo estado del galpón
  // Si data.activate es true o si el galpón estaba en preparación y se pide activar
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

  await db.batch(stmts);

  const updatedBarns = await listAllBarns(db);
  const updated = updatedBarns.find((b) => b.id === barnId);
  if (!updated) {
    throw new Error('Error al recargar galpón');
  }
  return updated;
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

  // Verificar si hay registros asociados (corrales, o historial)
  const pensCount = await db.prepare('SELECT count(*) as count FROM barn_pens WHERE barn_id = ?')
    .bind(barnId)
    .first() as { count: number } | null;

  if ((pensCount?.count ?? 0) > 0) {
    throw new Error('El galpón tiene corrales asociados. No puede eliminarse; use desactivación');
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

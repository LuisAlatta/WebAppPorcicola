import React, { useState, useEffect } from 'react';
import { Perfil } from '../types';
import {
  IconShield,
  IconUser,
  IconClipboard,
  IconStethoscope,
  IconBuilding,
  IconPlus,
  IconCheck,
  IconAlertTriangle,
  IconAlertCircle,
  IconClock,
  IconRefreshCw,
  IconTrash,
  IconEdit,
  IconCalendar,
  IconSettings,
} from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import { ModalDialog } from './ModalDialog';
import { ModuloConfiguracion } from './ModuloConfiguracion';

interface ModuloAdministracionProps {
  perfil: Perfil;
  onNavigate: (vista: 'inicio' | 'listado' | 'formulario' | 'detalle' | 'administracion') => void;
}

interface UserItem {
  id: number;
  username: string;
  name: string;
  role: Perfil;
  is_active: number;
  created_at: string;
  updated_at: string;
  barns: { id: number; code: string; name: string }[];
}

interface BarnItem {
  id: number;
  code: string;
  name: string;
  zone: string;
  capacity: number;
  status: 'preparacion' | 'operativo' | 'inactivo';
  responsable: { id: number; name: string; username: string } | null;
  operario: { id: number; name: string; username: string } | null;
  veterinario: { id: number; name: string; username: string } | null;
  pensCount: number;
}

interface HistoryItem {
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
  reason: string | null;
  is_current: number;
  corrects_history_id: number | null;
  superseded_by_id: number | null;
  changed_by_name: string;
  created_at: string;
}

interface AuditItem {
  id: number;
  action: 'create' | 'update' | 'correct' | 'annul' | 'delete';
  entity_type: string;
  entity_id: number;
  barn_id: number | null;
  barn_code: string | null;
  barn_name: string | null;
  actor_name: string;
  reason: string;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  effective_date: string;
  recorded_at: string;
  operation_key: string | null;
}

const ROLE_LABEL: Record<HistoryItem['role'], string> = {
  responsable: 'Usuario Responsable',
  operario: 'Operario de Campo',
  veterinario: 'Médico Veterinario',
};

const ACTION_LABEL: Record<AuditItem['action'], string> = {
  create: 'Alta',
  update: 'Actualización',
  correct: 'Corrección',
  annul: 'Anulación',
  delete: 'Baja',
};

export function ModuloAdministracion({ perfil, onNavigate }: ModuloAdministracionProps) {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'galpones' | 'equipo' | 'historial' | 'auditoria' | 'configuracion'>('usuarios');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [barns, setBarns] = useState<BarnItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState<boolean>(perfil === 'administrador');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario nuevo usuario
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newRole, setNewRole] = useState<Perfil>('operario');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newBarnIds, setNewBarnIds] = useState<number[]>([]);

  // Formulario nuevo galpón
  const [showBarnModal, setShowBarnModal] = useState<boolean>(false);
  const [newBarnCode, setNewBarnCode] = useState<string>('');
  const [newBarnName, setNewBarnName] = useState<string>('');
  const [newBarnZone, setNewBarnZone] = useState<string>('');
  const [newBarnCapacity, setNewBarnCapacity] = useState<number>(80);
  const [barnToDelete, setBarnToDelete] = useState<{ id: number; name: string } | null>(null);
  const [deleteBarnLoading, setDeleteBarnLoading] = useState<boolean>(false);

  // Asignación de equipo (ACC-04: clave de reintento estable por formulario)
  const [selectedBarnId, setSelectedBarnId] = useState<number | ''>('');
  const [selectedRespId, setSelectedRespId] = useState<number | ''>('');
  const [selectedOperId, setSelectedOperId] = useState<number | ''>('');
  const [selectedVetId, setSelectedVetId] = useState<number | ''>('');
  const [autoActivate, setAutoActivate] = useState<boolean>(true);
  const [deactivatePrevResp, setDeactivatePrevResp] = useState<boolean>(false);
  const [assignmentReason, setAssignmentReason] = useState<string>('');
  const [assignmentEffectiveDate, setAssignmentEffectiveDate] = useState<string>(() => farmToday());
  const [assignmentOperationKey, setAssignmentOperationKey] = useState<string>(() => newOperationKey('asig'));
  const [assignmentSaving, setAssignmentSaving] = useState<boolean>(false);

  // Corrección con historial (T06 · GES-03)
  const [correctionTarget, setCorrectionTarget] = useState<HistoryItem | null>(null);
  const [correctionUserId, setCorrectionUserId] = useState<number | ''>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionEffectiveDate, setCorrectionEffectiveDate] = useState<string>(() => farmToday());
  const [correctionOperationKey, setCorrectionOperationKey] = useState<string>(() => newOperationKey('corr'));
  const [correctionSaving, setCorrectionSaving] = useState<boolean>(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const refreshData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [uRes, bRes, hRes, aRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/barns'),
        fetch('/api/admin/history'),
        fetch('/api/admin/audit?limit=100'),
      ]);

      if (uRes.status === 403 || bRes.status === 403 || aRes.status === 403) {
        setErrorMsg('Acceso denegado: solo el Administrador tiene acceso a este módulo (ACC-06, ADM-01).');
        setLoading(false);
        return;
      }

      if (uRes.ok && bRes.ok && hRes.ok) {
        const uData = await uRes.json() as { users: UserItem[] };
        const bData = await bRes.json() as { barns: BarnItem[] };
        const hData = await hRes.json() as { history: HistoryItem[] };
        setUsers(uData.users || []);
        setBarns(bData.barns || []);
        setHistory(hData.history || []);
        if (aRes.ok) {
          const aData = await aRes.json() as { audit: AuditItem[] };
          setAuditLog(aData.audit || []);
        }
        if (bData.barns?.length > 0 && selectedBarnId === '') {
          const firstBarn = bData.barns[0];
          setSelectedBarnId(firstBarn.id);
          setSelectedRespId(firstBarn.responsable?.id || '');
          setSelectedOperId(firstBarn.operario?.id || '');
          setSelectedVetId(firstBarn.veterinario?.id || '');
        }
      }
    } catch {
      setErrorMsg('No se pudieron cargar los datos de administración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (perfil !== 'administrador') return;

    let isMounted = true;
    const loadInitialData = async () => {
      try {
        const [uRes, bRes, hRes, aRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/admin/barns'),
          fetch('/api/admin/history'),
          fetch('/api/admin/audit?limit=100'),
        ]);

        if (!isMounted) return;

        if (uRes.status === 403 || bRes.status === 403 || aRes.status === 403) {
          setErrorMsg('Acceso denegado: solo el Administrador tiene acceso a este módulo (ACC-06, ADM-01).');
          setLoading(false);
          return;
        }

        if (uRes.ok && bRes.ok && hRes.ok) {
          const uData = await uRes.json() as { users: UserItem[] };
          const bData = await bRes.json() as { barns: BarnItem[] };
          const hData = await hRes.json() as { history: HistoryItem[] };
          setUsers(uData.users || []);
          setBarns(bData.barns || []);
          setHistory(hData.history || []);
          if (aRes.ok) {
            const aData = await aRes.json() as { audit: AuditItem[] };
            setAuditLog(aData.audit || []);
          }
          if (bData.barns?.length > 0) {
            const first = bData.barns[0];
            setSelectedBarnId(first.id);
            setSelectedRespId(first.responsable?.id || '');
            setSelectedOperId(first.operario?.id || '');
            setSelectedVetId(first.veterinario?.id || '');
          }
        }
      } catch {
        if (isMounted) setErrorMsg('No se pudieron cargar los datos de administración');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [perfil]);

  // Si el perfil no es administrador, mostrar pantalla de rechazo estricta
  if (perfil !== 'administrador') {
    return (
      <div className="card text-center p-6 mt-4">
        <div className="inline-flex items-center justify-center gap-2 leading-none text-danger mb-3">
          <IconAlertTriangle size={36} />
          <h2 className="text-xl font-bold">Módulo Exclusivo de Administración</h2>
        </div>
        <p className="text-muted mb-4">
          Acceso denegado. Este módulo está reservado exclusivamente para el perfil <strong>Administrador</strong> (ACC-06, ADM-01). Su perfil actual es <strong>{perfil}</strong>.
        </p>
        <div className="banner-alert banner-alert-error mb-4">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={18} />
            <span>Las rutas y operaciones de administración están restringidas en el servidor con código HTTP 403 Forbidden.</span>
          </span>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate('inicio')}
          >
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          name: newName,
          role: newRole,
          password: newPassword,
          barnIds: newBarnIds,
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al crear usuario');
        return;
      }

      setSuccessMsg(`Usuario ${newName} creado exitosamente`);
      setShowUserModal(false);
      setNewUsername('');
      setNewName('');
      setNewPassword('');
      setNewBarnIds([]);
      await refreshData();
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleToggleUserStatus = async (user: UserItem) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const nextStatus = user.is_active === 1 ? 0 : 1;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextStatus }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al actualizar estado del usuario');
        return;
      }

      setSuccessMsg(`Estado de ${user.name} actualizado exitosamente`);
      await refreshData();
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleCreateBarn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/barns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newBarnCode,
          name: newBarnName,
          zone: newBarnZone,
          capacity: newBarnCapacity,
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al crear galpón');
        return;
      }

      setSuccessMsg(`Galpón ${newBarnName} (${newBarnCode}) creado exitosamente`);
      setShowBarnModal(false);
      setNewBarnCode('');
      setNewBarnName('');
      setNewBarnZone('');
      await refreshData();
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (selectedBarnId === '' || selectedRespId === '' || selectedOperId === '' || selectedVetId === '') {
      setErrorMsg('Para asignar equipo se requiere Usuario responsable, Operario y Médico veterinario (ADM-02). Los datos ingresados se conservan.');
      return;
    }

    if (!assignmentEffectiveDate) {
      setErrorMsg('Indique la fecha efectiva de la asignación. Los datos ingresados se conservan.');
      return;
    }

    setAssignmentSaving(true);
    try {
      const res = await fetch(`/api/admin/barns/${selectedBarnId}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responsableId: Number(selectedRespId),
          operarioId: Number(selectedOperId),
          veterinarioId: Number(selectedVetId),
          activate: autoActivate,
          reason: assignmentReason,
          effectiveDate: assignmentEffectiveDate,
          operationKey: assignmentOperationKey,
          reassignment: {
            deactivatePreviousResponsable: deactivatePrevResp,
          },
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string; replayed?: boolean };
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al asignar equipo. Los datos ingresados se conservan.');
        return;
      }

      setSuccessMsg(
        data.replayed
          ? 'Operación ya registrada: se devolvió el resultado anterior sin duplicar el evento (ACC-04).'
          : 'Equipo del galpón actualizado y registrado en historial y auditoría exitosamente.',
      );
      setDeactivatePrevResp(false);
      setAssignmentReason('');
      setAssignmentEffectiveDate(farmToday());
      setAssignmentOperationKey(newOperationKey('asig'));
      await refreshData();
    } catch (err) {
      setErrorMsg(`No se pudo confirmar la operación: ${String(err)}. Reintente con el mismo formulario; la clave de reintento evita duplicados.`);
    } finally {
      setAssignmentSaving(false);
    }
  };

  const openCorrection = (item: HistoryItem) => {
    setCorrectionTarget(item);
    setCorrectionUserId('');
    setCorrectionReason('');
    setCorrectionEffectiveDate(farmToday());
    setCorrectionOperationKey(newOperationKey('corr'));
    setCorrectionError(null);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const closeCorrection = () => {
    setCorrectionTarget(null);
    setCorrectionUserId('');
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const handleCorrectTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    setCorrectionError(null);

    if (correctionUserId === '') {
      setCorrectionError('Seleccione el usuario titular correcto. Los datos ingresados se conservan.');
      return;
    }

    if (correctionReason.trim().length < 5) {
      setCorrectionError('El motivo de la corrección es obligatorio y debe explicar la causa (mínimo 5 caracteres). Los datos ingresados se conservan.');
      return;
    }

    if (!correctionEffectiveDate) {
      setCorrectionError('Indique la fecha efectiva de la corrección. Los datos ingresados se conservan.');
      return;
    }

    setCorrectionSaving(true);
    try {
      const res = await fetch(`/api/admin/barns/${correctionTarget.barn_id}/team/correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: correctionTarget.id,
          role: correctionTarget.role,
          newUserId: Number(correctionUserId),
          reason: correctionReason,
          effectiveDate: correctionEffectiveDate,
          operationKey: correctionOperationKey,
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string; replayed?: boolean; newHistoryId?: number };
      if (!res.ok) {
        setCorrectionError(data.error || 'Error al registrar la corrección. Los datos ingresados se conservan.');
        return;
      }

      closeCorrection();
      setSuccessMsg(
        data.replayed
          ? 'Corrección ya registrada: se devolvió el resultado anterior sin duplicar el evento (ACC-04).'
          : 'Corrección registrada con historial: el registro original se conserva en auditoría (GES-03).',
      );
      await refreshData();
    } catch (err) {
      setCorrectionError(`No se pudo confirmar la corrección: ${String(err)}. Reintente con el mismo formulario; la clave de reintento evita duplicados.`);
    } finally {
      setCorrectionSaving(false);
    }
  };

  const confirmDeleteBarn = async () => {
    if (!barnToDelete) return;
    setDeleteBarnLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/barns/${barnToDelete.id}`, { method: 'DELETE' });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al eliminar galpón');
        return;
      }
      setSuccessMsg(`Galpón ${barnToDelete.name} eliminado exitosamente`);
      setBarnToDelete(null);
      await refreshData();
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setDeleteBarnLoading(false);
    }
  };

  // Listas filtradas para selectores
  const activeResponsables = users.filter((u) => u.role === 'responsable' && u.is_active === 1);
  const activeOperarios = users.filter((u) => u.role === 'operario' && u.is_active === 1);
  const activeVeterinarios = users.filter((u) => u.role === 'veterinario' && u.is_active === 1);

  const correctionCandidates = (() => {
    if (!correctionTarget) return [] as UserItem[];
    const pool = correctionTarget.role === 'responsable'
      ? activeResponsables
      : correctionTarget.role === 'operario'
        ? activeOperarios
        : activeVeterinarios;
    return pool.filter((u) => u.id !== correctionTarget.new_user_id);
  })();

  const formatDateTime = (value: string): string => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-PE');
  };

  const formatDate = (value: string): string => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('es-PE');
  };

  return (
    <div className="admin-container">
      {/* Encabezado */}
      <div className="module-heading mb-4">
        <p className="text-xs text-muted">
          Cuentas de usuario, asignación de galpones y equipo operativo.
        </p>
        <div className="inline-flex items-center justify-center gap-2 leading-none">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={refreshData}
            title="Actualizar datos"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar</span>
            </span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="banner-alert banner-alert-error mb-4" role="alert">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={18} />
            <span>{errorMsg}</span>
          </span>
        </div>
      )}

      {successMsg && (
        <div className="banner-alert banner-alert-success mb-4" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={18} />
            <span>{successMsg}</span>
          </span>
        </div>
      )}

      {/* Pestañas de navegación interna */}
      <div className="admin-tabs mb-4">
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'usuarios' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('usuarios')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconUser size={16} />
            <span>Usuarios ({users.length})</span>
          </span>
        </button>

        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'galpones' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('galpones')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBuilding size={16} />
            <span>Galpones ({barns.length})</span>
          </span>
        </button>

        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'equipo' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('equipo')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClipboard size={16} />
            <span>Equipo operativo</span>
          </span>
        </button>

        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'historial' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('historial')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClock size={16} />
            <span>Historial ({history.length})</span>
          </span>
        </button>

        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'auditoria' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('auditoria')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClipboard size={16} />
            <span>Auditoría ({auditLog.length})</span>
          </span>
        </button>

        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'configuracion' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('configuracion')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconSettings size={16} />
            <span>Configuración</span>
          </span>
        </button>
      </div>

      {/* 1. PESTAÑA: CUENTAS DE USUARIOS */}
      {activeTab === 'usuarios' && (
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h3 className="font-bold text-lg">Cuentas registradas</h3>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowUserModal(true)}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconPlus size={16} />
                <span>Nueva Cuenta</span>
              </span>
            </button>
          </div>

          {loading ? (
            <p className="text-muted p-4 text-center">Cargando cuentas...</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre / Usuario</th>
                    <th>Perfil</th>
                    <th>Estado</th>
                    <th>Galpones Asignados</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <div className="text-xs text-muted font-mono">{u.username}</div>
                      </td>
                      <td>
                        <span className={`badge ${
                          u.role === 'administrador' ? 'badge-primary' :
                          u.role === 'responsable' ? 'badge-info' :
                          u.role === 'veterinario' ? 'badge-success' : 'badge-warning'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.is_active === 1 ? 'badge-success' : 'badge-danger'}`}>
                          {u.is_active === 1 ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </td>
                      <td>
                        {u.role === 'administrador' ? (
                          <span className="text-xs text-muted">Alcance de Granja (Todos)</span>
                        ) : u.barns.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {u.barns.map((b) => (
                              <span key={b.id} className="badge badge-sm badge-outline">
                                {b.code} - {b.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-danger">Sin galpones asignados</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleToggleUserStatus(u)}
                          title={u.is_active === 1 ? 'Desactivar cuenta' : 'Activar cuenta'}
                        >
                          {u.is_active === 1 ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal / Formulario Nueva Cuenta */}
          {showUserModal && (
            <ModalDialog labelledBy="admin-create-user-dialog-title" onDismiss={() => setShowUserModal(false)}>
                <h4 id="admin-create-user-dialog-title" className="text-lg font-bold mb-3">Crear Nueva Cuenta</h4>
                <form onSubmit={handleCreateUser}>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Nombre Completo:</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                    />
                  </div>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Identificador / Correo de Acceso:</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Ej. juan.perez@granja.pe"
                    />
                  </div>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Contraseña (mínimo 8 caracteres):</label>
                    <input
                      type="password"
                      className="form-input"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="********"
                    />
                  </div>
                  <div className="form-group mb-3">
                    <label className="form-label text-sm">Perfil Operativo:</label>
                    <select
                      className="form-select"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as Perfil)}
                    >
                      <option value="operario">Operario (Campo / Tareas)</option>
                      <option value="responsable">Usuario Responsable (Galpones / Producción)</option>
                      <option value="veterinario">Médico Veterinario (Sanidad / Reproducción)</option>
                      <option value="administrador">Administrador (Control total)</option>
                    </select>
                  </div>

                  {newRole === 'responsable' && (
                    <div className="form-group mb-3">
                      <label className="form-label text-sm">
                        Galpón Inicial Asignado (Obligatorio para Responsable activo):
                      </label>
                      <select
                        className="form-select"
                        required
                        value={newBarnIds[0] || ''}
                        onChange={(e) => setNewBarnIds([Number(e.target.value)])}
                      >
                        <option value="">Seleccione un galpón...</option>
                        {barns.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code} - {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowUserModal(false)}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Crear Cuenta
                    </button>
                  </div>
                </form>
            </ModalDialog>
          )}
        </div>
      )}

      {/* 2. PESTAÑA: GALPONES */}
      {activeTab === 'galpones' && (
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-lg">Galpones e Instalaciones</h3>
              <p className="text-xs text-muted">Gestión de ubicaciones, capacidad y estado operativo.</p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowBarnModal(true)}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconPlus size={16} />
                <span>Nuevo Galpón</span>
              </span>
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Ubicación / Zona</th>
                  <th>Capacidad (Cabezas)</th>
                  <th>Estado</th>
                  <th>Equipo Asignado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {barns.map((b) => (
                  <tr key={b.id}>
                    <td><strong className="font-mono">{b.code}</strong></td>
                    <td>{b.name}</td>
                    <td>{b.zone || 'No especificada'}</td>
                    <td className="font-mono">{b.capacity}</td>
                    <td>
                      <span className={`badge ${
                        b.status === 'operativo' ? 'badge-success' :
                        b.status === 'preparacion' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs">
                        <div><strong>Resp:</strong> {b.responsable?.name || <span className="text-danger">Sin asignar</span>}</div>
                        <div><strong>Oper:</strong> {b.operario?.name || <span className="text-danger">Sin asignar</span>}</div>
                        <div><strong>Vet:</strong> {b.veterinario?.name || <span className="text-danger">Sin asignar</span>}</div>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={() => setBarnToDelete({ id: b.id, name: b.name })}
                        title="Eliminar galpón sin registros"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconTrash size={14} />
                          <span>Eliminar</span>
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modal Nuevo Galpón */}
          {showBarnModal && (
            <ModalDialog labelledBy="admin-create-barn-dialog-title" onDismiss={() => setShowBarnModal(false)}>
                <h4 id="admin-create-barn-dialog-title" className="text-lg font-bold mb-3">Registrar Nuevo Galpón</h4>
                <form onSubmit={handleCreateBarn}>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Código Único:</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newBarnCode}
                      onChange={(e) => setNewBarnCode(e.target.value)}
                      placeholder="Ej. G-C"
                    />
                  </div>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Nombre del Galpón:</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newBarnName}
                      onChange={(e) => setNewBarnName(e.target.value)}
                      placeholder="Ej. Galpón C Maternidad"
                    />
                  </div>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Ubicación / Zona:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newBarnZone}
                      onChange={(e) => setNewBarnZone(e.target.value)}
                      placeholder="Ej. Sector Maternidad Norte"
                    />
                  </div>
                  <div className="form-group mb-3">
                    <label className="form-label text-sm">Capacidad en Cabezas:</label>
                    <input
                      type="number"
                      className="form-input"
                      required
                      min={1}
                      value={newBarnCapacity}
                      onChange={(e) => setNewBarnCapacity(Number(e.target.value))}
                    />
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowBarnModal(false)}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Registrar Galpón
                    </button>
                  </div>
                </form>
            </ModalDialog>
          )}

          {/* Modal Confirmar Eliminación de Galpón */}
          {barnToDelete && (
            <ModalDialog labelledBy="admin-delete-barn-dialog-title" onDismiss={() => setBarnToDelete(null)} dismissDisabled={deleteBarnLoading}>
                <h4 id="admin-delete-barn-dialog-title" className="text-lg font-bold mb-2 text-danger">Confirmar Eliminación</h4>
                <p className="text-sm mb-4">
                  ¿Está seguro de eliminar el galpón <strong>{barnToDelete.name}</strong>? Esta acción solo es posible si no tiene registros asociados.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={deleteBarnLoading}
                    onClick={() => setBarnToDelete(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={deleteBarnLoading}
                    onClick={() => void confirmDeleteBarn()}
                  >
                    {deleteBarnLoading ? 'Eliminando…' : 'Eliminar Galpón'}
                  </button>
                </div>
            </ModalDialog>
          )}
        </div>
      )}

      {/* 3. PESTAÑA: ASIGNACIÓN DE EQUIPO */}
      {activeTab === 'equipo' && (
        <div className="card p-4">
          <h3 className="font-bold text-lg mb-2">Asignación y Activación del Equipo Operativo</h3>
          <p className="text-xs text-muted mb-4">
            Cada galpón operativo requiere un Usuario responsable, un Operario y un Médico veterinario activos (ADM-02).
          </p>

          <form onSubmit={handleSaveTeam} className="admin-team-form">
            <div className="form-group mb-3">
              <label className="form-label font-bold">Seleccionar Galpón:</label>
              <select
                className="form-select"
                required
                value={selectedBarnId}
                onChange={(e) => {
                  const bId = Number(e.target.value);
                  setSelectedBarnId(bId);
                  const barn = barns.find((b) => b.id === bId);
                  if (barn) {
                    setSelectedRespId(barn.responsable?.id || '');
                    setSelectedOperId(barn.operario?.id || '');
                    setSelectedVetId(barn.veterinario?.id || '');
                  }
                }}
              >
                {barns.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name} ({b.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid-3 gap-3 mb-4">
              <div className="form-group card p-3">
                <label className="form-label font-bold text-primary">
                  1. Usuario Responsable:
                </label>
                <select
                  className="form-select"
                  required
                  value={selectedRespId}
                  onChange={(e) => setSelectedRespId(Number(e.target.value))}
                >
                  <option value="">Seleccione Responsable...</option>
                  {activeResponsables.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.username})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted mt-1">Supervisa galpones y finanzas</span>
              </div>

              <div className="form-group card p-3">
                <label className="form-label font-bold text-warning">
                  2. Operario de Campo:
                </label>
                <select
                  className="form-select"
                  required
                  value={selectedOperId}
                  onChange={(e) => setSelectedOperId(Number(e.target.value))}
                >
                  <option value="">Seleccione Operario...</option>
                  {activeOperarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.username})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted mt-1">Registra movimientos y pesajes</span>
              </div>

              <div className="form-group card p-3">
                <label className="form-label font-bold text-success inline-flex items-center gap-1">
                  <IconStethoscope size={16} />
                  <span>3. Médico Veterinario:</span>
                </label>
                <select
                  className="form-select"
                  required
                  value={selectedVetId}
                  onChange={(e) => setSelectedVetId(Number(e.target.value))}
                >
                  <option value="">Seleccione Veterinario...</option>
                  {activeVeterinarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.username})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted mt-1">Gestiona sanidad y reproducción</span>
              </div>
            </div>

            <div className="grid-3 gap-3 mb-4">
              <div className="form-group card p-3">
                <label className="form-label font-bold inline-flex items-center gap-1">
                  <IconCalendar size={16} />
                  <span>Fecha efectiva:</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={assignmentEffectiveDate}
                  onChange={(e) => setAssignmentEffectiveDate(e.target.value)}
                />
                <span className="text-xs text-muted mt-1">Fecha local de la granja (America/Lima)</span>
              </div>

              <div className="form-group card p-3" style={{ gridColumn: 'span 2' }}>
                <label className="form-label font-bold">Motivo del cambio (queda en auditoría):</label>
                <input
                  type="text"
                  className="form-input"
                  value={assignmentReason}
                  onChange={(e) => setAssignmentReason(e.target.value)}
                  placeholder="Ej. Sustitución por turno nocturno"
                />
                <span className="text-xs text-muted mt-1">
                  Clave de reintento activa: {assignmentOperationKey.slice(0, 18)}… (ACC-04)
                </span>
              </div>
            </div>

            <div className="card p-3 mb-4 bg-light">
              <label className="checkbox-label mb-2">
                <input
                  type="checkbox"
                  checked={autoActivate}
                  onChange={(e) => setAutoActivate(e.target.checked)}
                />
                <span className="text-sm font-semibold">
                  Poner galpón en estado Operativo si el equipo está completo.
                </span>
              </label>

              <label className="checkbox-label text-xs text-muted">
                <input
                  type="checkbox"
                  checked={deactivatePrevResp}
                  onChange={(e) => setDeactivatePrevResp(e.target.checked)}
                />
                <span>
                  Si el responsable anterior pierde su último galpón, desactivar su cuenta automáticamente.
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary" disabled={assignmentSaving}>
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconCheck size={16} />
                <span>{assignmentSaving ? 'Guardando…' : 'Guardar Asignación de Equipo'}</span>
              </span>
            </button>
          </form>
        </div>
      )}

      {/* 4. PESTAÑA: HISTORIAL */}
      {activeTab === 'historial' && (
        <div className="card p-4">
          <h3 className="font-bold text-lg mb-2">Historial de Asignaciones y Sustituciones (ADM-03)</h3>
          <p className="text-xs text-muted mb-4">
            Auditoría histórica de cambios de personal por galpón con registro de vigencia, motivo, autor y asignación anterior.
            Las correcciones no sobrescriben el registro original: lo reemplazan dejando rastro completo (GES-03).
          </p>

          {history.length === 0 ? (
            <p className="text-muted text-center p-4">No hay cambios de equipo registrados aún.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Galpón</th>
                    <th>Rol Modificado</th>
                    <th>Asignación Anterior</th>
                    <th>Nuevo Titular</th>
                    <th>Vigencia</th>
                    <th>Motivo</th>
                    <th>Autor del Cambio</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const isCurrent = h.is_current === 1;
                    return (
                      <tr key={h.id}>
                        <td>
                          <strong>{h.barn_code}</strong> ({h.barn_name})
                        </td>
                        <td>
                          <span className="badge badge-outline">
                            {ROLE_LABEL[h.role] || h.role}
                          </span>
                        </td>
                        <td>
                          {h.previous_user_name ? (
                            <span className="text-danger">{h.previous_user_name}</span>
                          ) : (
                            <span className="text-muted">(Sin titular previo)</span>
                          )}
                        </td>
                        <td>
                          <strong className="text-success">{h.new_user_name}</strong>
                        </td>
                        <td className="text-xs">
                          <div className="font-mono">Desde: {formatDateTime(h.valid_from)}</div>
                          <div className="font-mono text-muted">
                            Hasta: {h.valid_until ? formatDateTime(h.valid_until) : 'Vigente'}
                          </div>
                          <div className="text-muted">Registrado: {formatDateTime(h.created_at)}</div>
                        </td>
                        <td className="text-xs">
                          {h.reason ? h.reason : <span className="text-muted">Sin motivo registrado</span>}
                        </td>
                        <td>
                          <span className="text-xs text-muted">{h.changed_by_name}</span>
                        </td>
                        <td>
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`badge ${isCurrent ? 'badge-success' : 'badge-outline'}`}>
                              {isCurrent ? 'Vigente' : 'Histórico'}
                            </span>
                            {h.corrects_history_id !== null && (
                              <span className="badge badge-warning">Corrección de #{h.corrects_history_id}</span>
                            )}
                            {h.superseded_by_id !== null && (
                              <span className="text-xs text-muted">Reemplazado por #{h.superseded_by_id}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {isCurrent ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => openCorrection(h)}
                              title="Registrar corrección dejando historial"
                            >
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconEdit size={14} />
                                <span>Corregir</span>
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-muted">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal de corrección con historial */}
          {correctionTarget && (
            <ModalDialog labelledBy="admin-correct-team-dialog-title" onDismiss={closeCorrection} dismissDisabled={correctionSaving}>
                <h4 id="admin-correct-team-dialog-title" className="text-lg font-bold mb-2">Corregir Asignación Vigente</h4>
                <p className="text-xs text-muted mb-3">
                  Galpón <strong>{correctionTarget.barn_code}</strong> · {ROLE_LABEL[correctionTarget.role]} · titular actual{' '}
                  <strong>{correctionTarget.new_user_name}</strong>. La fila original se conserva como histórica (GES-03).
                </p>

                {correctionError && (
                  <div className="banner-alert banner-alert-error mb-3" role="alert">
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconAlertCircle size={16} />
                      <span>{correctionError}</span>
                    </span>
                  </div>
                )}

                <form onSubmit={handleCorrectTeam}>
                  <div className="form-group mb-2">
                    <label className="form-label text-sm">Titular Correcto:</label>
                    <select
                      className="form-select"
                      required
                      value={correctionUserId}
                      onChange={(e) => setCorrectionUserId(Number(e.target.value))}
                    >
                      <option value="">Seleccione el titular correcto...</option>
                      {correctionCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.username})
                        </option>
                      ))}
                    </select>
                    {correctionCandidates.length === 0 && (
                      <span className="text-xs text-danger mt-1">
                        No hay otros usuarios activos con ese perfil disponibles.
                      </span>
                    )}
                  </div>

                  <div className="form-group mb-2">
                    <label className="form-label text-sm inline-flex items-center gap-1">
                      <IconCalendar size={14} />
                      <span>Fecha efectiva de la corrección:</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={correctionEffectiveDate}
                      onChange={(e) => setCorrectionEffectiveDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label text-sm">Motivo de la corrección (obligatorio):</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      minLength={5}
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="Ej. Error de digitación en la asignación anterior"
                    />
                    <span className="text-xs text-muted mt-1">
                      Clave de reintento activa: {correctionOperationKey.slice(0, 18)}… (ACC-04)
                    </span>
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={closeCorrection}
                      disabled={correctionSaving}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={correctionSaving}>
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconCheck size={16} />
                        <span>{correctionSaving ? 'Guardando…' : 'Registrar Corrección'}</span>
                      </span>
                    </button>
                  </div>
                </form>
            </ModalDialog>
          )}
        </div>
      )}

      {/* 5. PESTAÑA: AUDITORÍA */}
      {activeTab === 'auditoria' && (
        <div className="card p-4">
          <h3 className="font-bold text-lg mb-2">Auditoría de Eventos</h3>
          <p className="text-xs text-muted mb-4">
            Registro inmutable de altas, actualizaciones y correcciones con autor, motivo, fecha efectiva y datos previos/nuevos.
            Solo el Administrador puede consultarlo (ACC-06).
          </p>

          {auditLog.length === 0 ? (
            <p className="text-muted text-center p-4">No hay eventos de auditoría registrados aún.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Registrado</th>
                    <th>Fecha Efectiva</th>
                    <th>Acción</th>
                    <th>Galpón</th>
                    <th>Autor</th>
                    <th>Motivo</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs">{formatDateTime(a.recorded_at)}</td>
                      <td className="font-mono text-xs">{formatDate(a.effective_date)}</td>
                      <td>
                        <span className={`badge ${
                          a.action === 'correct' ? 'badge-warning' :
                          a.action === 'delete' ? 'badge-danger' : 'badge-outline'
                        }`}>
                          {ACTION_LABEL[a.action] || a.action}
                        </span>
                      </td>
                      <td className="text-xs">
                        {a.barn_code ? `${a.barn_code} (${a.barn_name || 'Sin nombre'})` : 'No aplica'}
                      </td>
                      <td className="text-xs">{a.actor_name}</td>
                      <td className="text-xs">{a.reason || <span className="text-muted">Sin motivo</span>}</td>
                      <td className="text-xs">
                        <details>
                          <summary className="cursor-pointer text-primary">Ver datos</summary>
                          <div className="mt-2">
                            <div className="font-bold">Anterior</div>
                            <pre className="text-xs whitespace-pre-wrap break-all">
                              {JSON.stringify(a.previous_data, null, 2)}
                            </pre>
                            <div className="font-bold mt-2">Nuevo</div>
                            <pre className="text-xs whitespace-pre-wrap break-all">
                              {JSON.stringify(a.new_data, null, 2)}
                            </pre>
                            <div className="text-muted mt-2">
                              Entidad: {a.entity_type} #{a.entity_id}
                              {a.operation_key ? ` · Clave: ${a.operation_key}` : ''}
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. PESTAÑA: CONFIGURACIÓN VERSIONADA (T07 · CFG-01..CFG-05) */}
      {activeTab === 'configuracion' && (
        <ModuloConfiguracion />
      )}
    </div>
  );
}

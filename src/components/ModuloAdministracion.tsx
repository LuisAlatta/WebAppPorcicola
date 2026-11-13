import React, { useState, useEffect } from 'react';
import { Perfil } from '../types';
import {
  IconUser,
  IconClipboard,
  IconStethoscope,
  IconBuilding,
  IconPlus,
  IconCheck,
  IconAlertTriangle,
  IconClock,
  IconRefreshCw,
  IconTrash,
  IconEdit,
  IconCalendar,
  IconSettings,
  IconActivity,
  IconArrowLeft,
} from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import { formatDate, formatDateTime, errorMessage } from '../utils/format';
import { ModalDialog } from './ModalDialog';
import { DataState } from './DataState';
import { BarnAssociationsModal } from './BarnAssociationsModal';
import { BarnBackupImport } from './BarnBackupImport';
import { ModuloConfiguracion } from './ModuloConfiguracion';
import { ModuleTabs } from './ModuleTabs';
import {
  InlineAlert,
  PageHeader,
  StatusBadge,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardNote,
  DataCardActions,
  FilterChipRow,
  FilterChip,
  FormField,
} from './ui';

interface ModuloAdministracionProps {
  perfil: Perfil;
  onNavigate: (vista: 'inicio' | 'listado' | 'formulario' | 'detalle' | 'administracion') => void;
  barnsOnly?: boolean;
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

const STATUS_LABEL: Record<BarnItem['status'], string> = {
  operativo: 'Operativo',
  preparacion: 'En preparación',
  inactivo: 'Inactivo',
};

const ACTION_LABEL: Record<AuditItem['action'], string> = {
  create: 'Alta',
  update: 'Actualización',
  correct: 'Corrección',
  annul: 'Anulación',
  delete: 'Baja',
};

export function ModuloAdministracion({ perfil, onNavigate, barnsOnly = false }: ModuloAdministracionProps) {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'galpones' | 'equipo' | 'historial' | 'auditoria' | 'configuracion'>(barnsOnly ? 'galpones' : 'usuarios');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [barns, setBarns] = useState<BarnItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditItem[]>([]);
  const [auditAction, setAuditAction] = useState('');
  const visibleAudit = auditAction ? auditLog.filter(item => item.action === auditAction) : auditLog;
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
  const [showBackupImport, setShowBackupImport] = useState(false);
  const [editingBarn, setEditingBarn] = useState<BarnItem | null>(null);
  const [barnSaving, setBarnSaving] = useState(false);
  const [barnError, setBarnError] = useState('');
  const [statusBarn, setStatusBarn] = useState<BarnItem | null>(null);
  const [nextBarnStatus, setNextBarnStatus] = useState<BarnItem['status']>('preparacion');
  const [newBarnCode, setNewBarnCode] = useState<string>('');
  const [newBarnName, setNewBarnName] = useState<string>('');
  const [newBarnZone, setNewBarnZone] = useState<string>('');
  const [newBarnCapacity, setNewBarnCapacity] = useState<number>(80);
  const [barnToDelete, setBarnToDelete] = useState<{ id: number; code: string; name: string } | null>(null);

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
        <InlineAlert tone="error">Las rutas y operaciones de administración están restringidas en el servidor con código HTTP 403 Forbidden.</InlineAlert>
        <div>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center justify-center gap-2"
            onClick={() => onNavigate('inicio')}
          >
            <IconArrowLeft size={16} />
            <span>Volver al Inicio</span>
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
      setErrorMsg(errorMessage(err, 'Error al crear usuario'));
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
      setErrorMsg(errorMessage(err, 'Error al actualizar estado del usuario'));
    }
  };

  const handleCreateBarn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (barnSaving) return;
    setBarnSaving(true);
    setBarnError('');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(editingBarn ? `/api/admin/barns/${editingBarn.id}` : '/api/admin/barns', {
        method: editingBarn ? 'PUT' : 'POST',
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
        setBarnError(data.error || 'No se pudo guardar el galpón');
        return;
      }

      setSuccessMsg(`${newBarnName} ${editingBarn ? 'actualizado' : 'creado'} exitosamente`);
      setShowBarnModal(false);
      setNewBarnCode('');
      setNewBarnName('');
      setNewBarnZone('');
      await refreshData();
    } catch (err) {
      setBarnError(errorMessage(err, 'No se pudo guardar el galpón'));
    } finally {
      setBarnSaving(false);
    }
  };

  const handleSaveBarnStatus = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!statusBarn || barnSaving) return;
    setBarnSaving(true); setBarnError(''); setErrorMsg(null); setSuccessMsg(null);
    try {
      const response = await fetch(`/api/admin/barns/${statusBarn.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextBarnStatus }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) { setBarnError(data.error ?? 'No se pudo cambiar el estado'); return; }
      setStatusBarn(null);
      setSuccessMsg(`Estado de ${statusBarn.name} actualizado`);
      await refreshData();
    } catch { setBarnError('No se pudo confirmar el cambio de estado. Comprueba la conexión.'); }
    finally { setBarnSaving(false); }
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
      setErrorMsg(`No se pudo confirmar la operación: ${errorMessage(err, 'error de conexión')}. Reintente con el mismo formulario; la clave de reintento evita duplicados.`);
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
      setCorrectionError(`No se pudo confirmar la corrección: ${errorMessage(err, 'error de conexión')}. Reintente con el mismo formulario; la clave de reintento evita duplicados.`);
    } finally {
      setCorrectionSaving(false);
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

  return (
    <div className="admin-container">
      {/* Encabezado */}
      {barnsOnly ? (
        <div className="admin-toolbar">
          <p className="admin-toolbar-text">Crea y edita galpones, asigna su personal y revisa los cambios.</p>
          <button
            type="button"
            className="btn btn-outline btn-sm admin-refresh-button"
            onClick={refreshData}
            title="Actualizar datos"
            aria-label="Actualizar datos de administración"
          >
            <IconRefreshCw size={16} />
            <span>Actualizar</span>
          </button>
        </div>
      ) : (
        <PageHeader
          title="Administración"
          subtitle="Cuentas de usuario, asignación de galpones y equipo operativo."
          onRefresh={refreshData}
          refreshing={loading}
        />
      )}

      {showBackupImport && <BarnBackupImport onDismiss={() => setShowBackupImport(false)} onImported={(name) => { setShowBackupImport(false); setSuccessMsg(`${name} y su historial se restauraron correctamente.`); void refreshData(); }} />}

      {errorMsg && <InlineAlert tone="error" onDismiss={() => setErrorMsg(null)}>{errorMsg}</InlineAlert>}
      {successMsg && <InlineAlert tone="success" onDismiss={() => setSuccessMsg(null)} autoDismissMs={6000}>{successMsg}</InlineAlert>}

      {loading && <DataState variant="loading" title="Cargando datos de administración…" />}
      <ModuleTabs label={barnsOnly ? 'Gestión de galpones' : 'Secciones de administración'} active={activeTab} onChange={setActiveTab} columns={3} tabs={[
        ...(!barnsOnly ? [{ id: 'usuarios', label: 'Usuarios', count: users.length, icon: <IconUser size={16} /> }] : []),
        { id: 'galpones', label: 'Galpones', count: barns.length, icon: <IconBuilding size={16} /> },
        { id: 'equipo', label: 'Equipo operativo', icon: <IconClipboard size={16} /> },
        { id: 'historial', label: 'Historial', count: history.length, icon: <IconClock size={16} /> },
        ...(!barnsOnly ? [
          { id: 'auditoria', label: 'Auditoría', count: auditLog.length, icon: <IconClipboard size={16} /> },
          { id: 'configuracion', label: 'Configuración', icon: <IconSettings size={16} /> },
        ] : []),
      ]} />

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
            <DataState variant="loading" title="Cargando cuentas…" />
          ) : (
            <DataCardList label="Cuentas registradas" grid>
              {users.map((u) => (
                <DataCard key={u.id} state={u.is_active === 1 ? 'active' : 'inactive'}>
                  <DataCardHead
                    title={u.name}
                    subtitle={<span className="font-mono">{u.username}</span>}
                    badge={<StatusBadge tone={u.is_active === 1 ? 'success' : 'danger'}>{u.is_active === 1 ? 'ACTIVO' : 'INACTIVO'}</StatusBadge>}
                  />
                  <DataCardMeta items={[
                    { label: 'Perfil', value: u.role === 'administrador' ? 'Administrador' : ROLE_LABEL[u.role] },
                    { label: 'Creación', value: formatDateTime(u.created_at) },
                    { label: 'Actualización', value: formatDateTime(u.updated_at) },
                  ]} />
                  <div>
                    {u.role === 'administrador' ? (
                      <span className="text-xs text-muted">Alcance de Granja (Todos)</span>
                    ) : u.barns.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {u.barns.map((b) => (
                          <StatusBadge key={b.id} tone="outline" className="badge-sm">{b.code} - {b.name}</StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-danger">Sin galpones asignados</span>
                    )}
                  </div>
                  <DataCardActions>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleToggleUserStatus(u)}
                      title={u.is_active === 1 ? 'Desactivar cuenta' : 'Activar cuenta'}
                    >
                      <IconUser size={14} /><span>{u.is_active === 1 ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </DataCardActions>
                </DataCard>
              ))}
            </DataCardList>
          )}

          {/* Modal / Formulario Nueva Cuenta */}
          {showUserModal && (
            <ModalDialog labelledBy="admin-create-user-dialog-title" onDismiss={() => setShowUserModal(false)}>
                <h4 id="admin-create-user-dialog-title" className="text-lg font-bold mb-3">Crear Nueva Cuenta</h4>
                {errorMsg && <InlineAlert tone="error">{errorMsg}</InlineAlert>}
                <form onSubmit={handleCreateUser}>
                  <FormField label="Nombre Completo:" className="mb-2" labelClassName="text-sm">
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                    />
                  </FormField>
                  <FormField label="Identificador / Correo de Acceso:" className="mb-2" labelClassName="text-sm">
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Ej. juan.perez@granja.pe"
                    />
                  </FormField>
                  <FormField label="Contraseña (mínimo 8 caracteres):" className="mb-2" labelClassName="text-sm">
                    <input
                      type="password"
                      className="form-input"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="********"
                    />
                  </FormField>
                  <FormField label="Perfil Operativo:" className="mb-3" labelClassName="text-sm">
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
                  </FormField>

                  {newRole === 'responsable' && (
                    <FormField label="Galpón Inicial Asignado (Obligatorio para Responsable activo):" className="mb-3" labelClassName="text-sm">
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
                    </FormField>
                  )}

                  <div className="form-actions form-actions-sticky mt-4">
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
        <div className="card p-4 admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3 className="font-bold text-lg">Galpones e Instalaciones</h3>
              <p className="text-xs text-muted">Gestión de ubicaciones, capacidad y estado operativo.</p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowBackupImport(true)} disabled={loading}>Importar respaldo Excel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm admin-primary-action"
              onClick={() => { setEditingBarn(null); setNewBarnCode(''); setNewBarnName(''); setNewBarnZone(''); setNewBarnCapacity(80); setBarnError(''); setShowBarnModal(true); }}
            >
              <IconPlus size={16} />
              <span>Nuevo Galpón</span>
            </button>
          </div>

          {!loading && !barns.length && (
            <DataState variant="empty" title="No hay galpones registrados" description="Crea el primero con Nuevo Galpón." icon={<IconBuilding size={26} className="text-primary" />} />
          )}

          {barns.length > 0 && <div className="barn-admin-grid">
            {barns.map((b) => (
              <article key={b.id} className="barn-admin-card" data-status={b.status}>
                <header className="barn-admin-card-head">
                  <div className="barn-admin-identity">
                    <span className="barn-admin-code">{b.code}</span>
                    <h4>{b.name}</h4>
                  </div>
                  <StatusBadge tone={b.status === 'operativo' ? 'success' : b.status === 'preparacion' ? 'warning' : 'danger'}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </StatusBadge>
                </header>

                <dl className="barn-admin-meta">
                  <div>
                    <dt>Zona</dt>
                    <dd>{b.zone || 'No especificada'}</dd>
                  </div>
                  <div>
                    <dt>Capacidad</dt>
                    <dd className="font-mono">{b.capacity} cabezas</dd>
                  </div>
                </dl>

                <ul className="barn-admin-team">
                  <li><IconUser size={14} /><span className="barn-team-role">Responsable</span><span className={b.responsable ? 'barn-team-name' : 'barn-team-missing'}>{b.responsable?.name || 'Sin asignar'}</span></li>
                  <li><IconActivity size={14} /><span className="barn-team-role">Operario</span><span className={b.operario ? 'barn-team-name' : 'barn-team-missing'}>{b.operario?.name || 'Sin asignar'}</span></li>
                  <li><IconStethoscope size={14} /><span className="barn-team-role">Veterinario</span><span className={b.veterinario ? 'barn-team-name' : 'barn-team-missing'}>{b.veterinario?.name || 'Sin asignar'}</span></li>
                </ul>

                <div className="barn-management-actions">
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Editar galpón ${b.name}`} onClick={() => { setEditingBarn(b); setNewBarnCode(b.code); setNewBarnName(b.name); setNewBarnZone(b.zone); setNewBarnCapacity(b.capacity); setBarnError(''); setShowBarnModal(true); }}><IconEdit size={14} /><span>Editar</span></button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Asignar personal a ${b.name}`} onClick={() => { setSelectedBarnId(b.id); setSelectedRespId(b.responsable?.id || ''); setSelectedOperId(b.operario?.id || ''); setSelectedVetId(b.veterinario?.id || ''); setAssignmentReason(''); setAssignmentOperationKey(newOperationKey('asig')); setActiveTab('equipo'); }}><IconUser size={14} /><span>Personal</span></button>
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Cambiar estado de ${b.name}`} onClick={() => { setStatusBarn(b); setNextBarnStatus(b.status); setBarnError(''); }}><IconSettings size={14} /><span>Estado</span></button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-danger"
                    onClick={() => setBarnToDelete({ id: b.id, code: b.code, name: b.name })}
                    title="Ver los datos asociados y eliminar el galpón"
                  >
                    <IconTrash size={14} />
                    <span>Eliminar</span>
                  </button>
                </div>
              </article>
            ))}
          </div>}

          {/* Modal Nuevo Galpón */}
          {statusBarn && <ModalDialog labelledBy="barn-status-title" onDismiss={() => setStatusBarn(null)} dismissDisabled={barnSaving}>
            <form onSubmit={event => void handleSaveBarnStatus(event)}>
              <h4 id="barn-status-title">Estado de {statusBarn.name}</h4>
              <p className="text-sm text-muted">Para activar se necesita el equipo completo. Un galpón con animales no puede cerrarse.</p>
              <label htmlFor="barn-status" className="form-label">Estado del galpón</label>
              <select id="barn-status" className="form-select" value={nextBarnStatus} disabled={barnSaving} onChange={event => setNextBarnStatus(event.target.value as BarnItem['status'])}>
                <option value="preparacion">En preparación</option><option value="operativo">Operativo</option><option value="inactivo">Inactivo</option>
              </select>
              {barnError && <InlineAlert tone="error">{barnError}</InlineAlert>}
              <div className="form-actions form-actions-sticky"><button type="button" className="btn btn-outline" disabled={barnSaving} onClick={() => setStatusBarn(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={barnSaving}>{barnSaving ? 'Guardando…' : 'Guardar estado'}</button></div>
            </form>
          </ModalDialog>}
          {showBarnModal && (
            <ModalDialog labelledBy="admin-create-barn-dialog-title" onDismiss={() => setShowBarnModal(false)} dismissDisabled={barnSaving}>
                <h4 id="admin-create-barn-dialog-title" className="text-lg font-bold mb-3">{editingBarn ? 'Editar galpón' : 'Registrar Nuevo Galpón'}</h4>
                {barnError && <InlineAlert tone="error">{barnError}</InlineAlert>}
                <form onSubmit={handleCreateBarn}>
                  <FormField label="Código Único:" htmlFor="barn-code" className="mb-2" labelClassName="text-sm">
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newBarnCode}
                      id="barn-code"
                      disabled={!!editingBarn || barnSaving}
                      onChange={(e) => setNewBarnCode(e.target.value)}
                      placeholder="Ej. G-C"
                    />
                  </FormField>
                  <FormField label="Nombre del Galpón:" htmlFor="barn-name" className="mb-2" labelClassName="text-sm">
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={newBarnName}
                      id="barn-name"
                      disabled={barnSaving}
                      onChange={(e) => setNewBarnName(e.target.value)}
                      placeholder="Ej. Galpón C Maternidad"
                    />
                  </FormField>
                  <FormField label="Ubicación / Zona:" htmlFor="barn-zone" className="mb-2" labelClassName="text-sm">
                    <input
                      type="text"
                      className="form-input"
                      value={newBarnZone}
                      id="barn-zone"
                      disabled={barnSaving}
                      onChange={(e) => setNewBarnZone(e.target.value)}
                      placeholder="Ej. Sector Maternidad Norte"
                    />
                  </FormField>
                  <FormField label="Capacidad en Cabezas:" htmlFor="barn-capacity" className="mb-3" labelClassName="text-sm">
                    <input
                      type="number"
                      className="form-input"
                      required
                      min={1}
                      value={newBarnCapacity}
                      id="barn-capacity"
                      disabled={barnSaving}
                      onChange={(e) => setNewBarnCapacity(Number(e.target.value))}
                    />
                  </FormField>

                  <div className="form-actions form-actions-sticky mt-4">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowBarnModal(false)}
                      disabled={barnSaving}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={barnSaving || !newBarnName.trim() || !newBarnCode.trim()}>
                      {barnSaving ? 'Guardando…' : editingBarn ? 'Guardar cambios' : 'Registrar Galpón'}
                    </button>
                  </div>
                </form>
            </ModalDialog>
          )}

          {/* Modal Datos asociados del galpón (CFG-06) */}
          {barnToDelete && (
            <BarnAssociationsModal
              barn={barnToDelete}
              barns={barns.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
              onDismiss={() => setBarnToDelete(null)}
              onDeleted={(barnName) => {
                setBarnToDelete(null);
                setSuccessMsg(`${barnName} eliminado exitosamente`);
                void refreshData();
              }}
            />
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
            <FormField label="Seleccionar Galpón:" className="mb-3" labelClassName="font-bold">
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
            </FormField>

            <div className="grid-3 gap-3 mb-4">
              <div className="form-group card p-3 team-role-card" data-role="responsable">
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

              <div className="form-group card p-3 team-role-card" data-role="operario">
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

              <div className="form-group card p-3 team-role-card" data-role="veterinario">
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
              <FormField
                label={<><IconCalendar size={16} /><span>Fecha efectiva:</span></>}
                className="card p-3"
                labelClassName="font-bold inline-flex items-center gap-1"
              >
                <input
                  type="date"
                  className="form-input"
                  required
                  value={assignmentEffectiveDate}
                  onChange={(e) => setAssignmentEffectiveDate(e.target.value)}
                />
                <span className="text-xs text-muted mt-1">Fecha local de la granja (America/Lima)</span>
              </FormField>

              <FormField label="Motivo del cambio (queda en auditoría):" className="card p-3 admin-form-span2" labelClassName="font-bold">
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
              </FormField>
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
            <DataState variant="empty" title="No hay cambios de equipo registrados aún." icon={<IconClock size={26} className="text-primary" />} />
          ) : (
            <ol className="timeline" aria-label="Historial de asignaciones">
                  {history.map((h) => {
                    const isCurrent = h.is_current === 1;
                    return (
                      <li className="timeline-item" key={h.id}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <article className="data-card timeline-record">
                          <DataCardHead
                            title={`${h.barn_code} (${h.barn_name})`}
                            subtitle={ROLE_LABEL[h.role] || h.role}
                            badge={<StatusBadge tone={isCurrent ? 'success' : 'outline'}>{isCurrent ? 'Vigente' : 'Histórico'}</StatusBadge>}
                          />
                          <DataCardMeta items={[
                            { label: 'Asignación anterior', value: h.previous_user_name ? <span className="text-danger">{h.previous_user_name}</span> : <span className="text-muted">(Sin titular previo)</span> },
                            { label: 'Nuevo titular', value: <strong className="text-success">{h.new_user_name}</strong> },
                            { label: 'Vigencia', value: <>
                              <div className="font-mono">Desde: {formatDateTime(h.valid_from)}</div>
                              <div className="font-mono text-muted">Hasta: {h.valid_until ? formatDateTime(h.valid_until) : 'Vigente'}</div>
                              <div className="text-muted">Registrado: {formatDateTime(h.created_at)}</div>
                            </> },
                            { label: 'Motivo', value: h.reason ? h.reason : <span className="text-muted">Sin motivo registrado</span> },
                            { label: 'Autor del cambio', value: <span className="text-xs text-muted">{h.changed_by_name}</span> },
                          ]} />
                          <div className="flex flex-col gap-1 items-start">
                            {h.corrects_history_id !== null && (
                              <StatusBadge tone="warning">Corrección de #{h.corrects_history_id}</StatusBadge>
                            )}
                            {h.superseded_by_id !== null && (
                              <span className="text-xs text-muted">Reemplazado por #{h.superseded_by_id}</span>
                            )}
                          </div>
                          <DataCardActions>
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
                          </DataCardActions>
                        </article>
                      </li>
                    );
                  })}
            </ol>
          )}

          {/* Modal de corrección con historial */}
          {correctionTarget && (
            <ModalDialog labelledBy="admin-correct-team-dialog-title" onDismiss={closeCorrection} dismissDisabled={correctionSaving}>
                <h4 id="admin-correct-team-dialog-title" className="text-lg font-bold mb-2">Corregir Asignación Vigente</h4>
                <p className="text-xs text-muted mb-3">
                  Galpón <strong>{correctionTarget.barn_code}</strong> · {ROLE_LABEL[correctionTarget.role]} · titular actual{' '}
                  <strong>{correctionTarget.new_user_name}</strong>. La fila original se conserva como histórica (GES-03).
                </p>

                {correctionError && <InlineAlert tone="error">{correctionError}</InlineAlert>}

                <form onSubmit={handleCorrectTeam}>
                  <FormField label="Titular Correcto:" className="mb-2" labelClassName="text-sm">
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
                  </FormField>

                  <FormField
                    label={<><IconCalendar size={14} /><span>Fecha efectiva de la corrección:</span></>}
                    className="mb-2"
                    labelClassName="text-sm inline-flex items-center gap-1"
                  >
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={correctionEffectiveDate}
                      onChange={(e) => setCorrectionEffectiveDate(e.target.value)}
                    />
                  </FormField>

                  <FormField label="Motivo de la corrección (obligatorio):" className="mb-3" labelClassName="text-sm">
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
                  </FormField>

                  <div className="form-actions form-actions-sticky mt-4">
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

          <FormField label="Acción auditada" htmlFor="audit-action" className="mb-3">
            <select id="audit-action" className="form-select" value={auditAction} onChange={event => setAuditAction(event.target.value)}>
              <option value="">Todas las acciones</option>
              {Object.entries(ACTION_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </FormField>
          {auditAction && <FilterChipRow><FilterChip label={ACTION_LABEL[auditAction as AuditItem['action']]} onRemove={() => setAuditAction('')} removeLabel="Quitar filtro de auditoría" /></FilterChipRow>}
          {visibleAudit.length === 0 ? (
            <DataState variant="empty" title="No hay eventos de auditoría para los filtros seleccionados." icon={<IconClipboard size={26} className="text-primary" />} />
          ) : (
            <DataCardList label="Eventos de auditoría" grid>
              {visibleAudit.map((a) => (
                <DataCard key={a.id}>
                  <DataCardHead
                    title={`${a.entity_type} #${a.entity_id}`}
                    subtitle={formatDateTime(a.recorded_at)}
                    badge={<StatusBadge tone={a.action === 'correct' ? 'warning' : a.action === 'delete' ? 'danger' : 'outline'}>{ACTION_LABEL[a.action] || a.action}</StatusBadge>}
                  />
                  <DataCardMeta items={[
                    { label: 'Fecha efectiva', value: formatDate(a.effective_date) },
                    { label: 'Galpón', value: a.barn_code ? `${a.barn_code} (${a.barn_name || 'Sin nombre'})` : 'No aplica' },
                    { label: 'Autor', value: a.actor_name },
                  ]} />
                  <DataCardNote>{a.reason || 'Sin motivo'}</DataCardNote>
                  <details className="data-card-disclosure">
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
                </DataCard>
              ))}
            </DataCardList>
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

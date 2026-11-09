import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import { ModalDialog } from './ModalDialog';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconEdit,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconX,
} from './icons';
import type { Perfil } from '../types';

interface Rule {
  id: number;
  ruleKey: string;
  version: number;
  vaccineName: string;
  targetCategory: string;
  baseEvent: string;
  offsetDays: number;
  targetAgeDays: number | null;
  recurrenceDays: number | null;
  referenceDate: string | null;
  isActive: boolean;
  isCurrent: boolean;
}

interface Schedule {
  id: number;
  animalCode: string;
  animalType: string;
  targetCategory: string;
  vaccineName: string;
  scheduledDate: string;
  status: string;
  isManual: boolean;
  appliedDate: string | null;
  barnName: string;
  observations: string | null;
}

const categoryLabels: Record<string, string> = {
  cerda_primeriza: 'Cerda primeriza',
  cerda_multipara: 'Cerda multípara',
  verraco: 'Verraco',
  lechon: 'Lechón',
  reemplazo: 'Reemplazo',
};

const baseLabels: Record<string, string> = {
  birth: 'Nacimiento',
  age: 'Edad',
  farrowing: 'Parto (antes o después)',
  semiannual: 'Fecha de referencia recurrente',
};

export function ModuloVacunas({ perfil }: { perfil: Perfil }) {
  const canWrite = perfil === 'administrador' || perfil === 'veterinario';
  const isAdmin = perfil === 'administrador';
  const [rules, setRules] = useState<Rule[]>([]);
  const [rows, setRows] = useState<Schedule[]>([]);
  const [animals, setAnimals] = useState<{ code: string }[]>([]);
  const [filter, setFilter] = useState({ from: '', to: '', status: 'pending', animalType: '' });

  const hasActiveFilters = useMemo(
    () => Boolean(filter.from || filter.to || filter.animalType || filter.status !== 'pending'),
    [filter]
  );

  const clearFilters = () => {
    setFilter({ from: '', to: '', status: 'pending', animalType: '' });
  };
  const [editKey, setEditKey] = useState<string | null>(null);
  const [form, setForm] = useState({
    vaccineName: '',
    targetCategory: 'reemplazo',
    baseEvent: 'birth',
    offsetDays: '0',
    targetAgeDays: '60',
    recurrenceDays: '180',
    referenceDate: '',
    isActive: true,
    reason: 'Alta de regla de prueba',
  });
  const [manual, setManual] = useState({
    animalCode: '',
    vaccineName: '',
    scheduledDate: farmToday(),
    reason: '',
  });

  const [applyTarget, setApplyTarget] = useState<Schedule | null>(null);
  const [applyForm, setApplyForm] = useState({
    dosage: '2',
    dosageUnit: 'ml',
    appliedDate: farmToday(),
    productLot: '',
    withdrawalUntil: '',
    observations: '',
  });
  const [applyOperationKey, setApplyOperationKey] = useState(() => newOperationKey('vaccine-apply'));

  const [scheduleTarget, setScheduleTarget] = useState<{ row: Schedule; cancel: boolean } | null>(null);
  const [scheduleChangeForm, setScheduleChangeForm] = useState({ date: '', reason: '' });
  const [scheduleOperationKey, setScheduleOperationKey] = useState(() => newOperationKey('vaccine-reschedule'));

  const [deactivateTarget, setDeactivateTarget] = useState<Rule | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateOperationKey, setDeactivateOperationKey] = useState(() => newOperationKey('vaccine-rule-off'));

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status: filter.status });
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
    if (filter.animalType) params.set('animalType', filter.animalType);

    const [rr, sr, ar] = await Promise.all([
      fetch('/api/vaccines/rules'),
      fetch(`/api/vaccines/schedules?${params}`),
      fetch('/api/animals?status=activo&limit=500'),
    ]);

    const [r, s, a] = (await Promise.all([rr.json(), sr.json(), ar.json()])) as [
      { rules?: Rule[]; error?: string },
      { schedules?: Schedule[]; error?: string },
      { animals?: { code: string }[] }
    ];

    if (!rr.ok || !sr.ok || !ar.ok) {
      throw new Error(r.error || s.error || 'No se pudo cargar vacunas');
    }

    setRules(r.rules ?? []);
    setRows(s.schedules ?? []);
    setAnimals(a.animals ?? []);
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : 'Error cargando vacunas'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const send = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetchOperation(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        error?: string;
        created?: number;
        eligible?: number;
        conflictDetected?: boolean;
      };
      if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
      await load();
      setNotice(
        `${success}${
          data.eligible !== undefined
            ? ` Elegibles: ${data.eligible}; programadas o actualizadas: ${data.created}.`
            : ''
        }`
      );
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetchOperation(
        editKey ? `/api/vaccines/rules/${encodeURIComponent(editKey)}` : '/api/vaccines/rules',
        {
          method: editKey ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            offsetDays: Number(form.offsetDays),
            targetAgeDays: Number(form.targetAgeDays),
            recurrenceDays: Number(form.recurrenceDays),
            operationKey: newOperationKey('vaccine-rule'),
          }),
        }
      );
      const data = (await response.json()) as { error?: string; eligible?: number; created?: number };
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la regla');
      setNotice(`Regla guardada. Animales elegibles: ${data.eligible ?? 0}; vacunas generadas: ${data.created ?? 0}.`);
      setEditKey(null);
      setForm((old) => ({ ...old, vaccineName: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la regla');
    } finally {
      setBusy(false);
    }
  };

  const confirmApply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!applyTarget) return;
    const result = await send(
      `/api/vaccines/schedules/${applyTarget.id}/apply`,
      {
        appliedDate: applyForm.appliedDate,
        dosage: Number(applyForm.dosage),
        dosageUnit: applyForm.dosageUnit,
        productLot: applyForm.productLot || undefined,
        withdrawalUntil: applyForm.withdrawalUntil || undefined,
        observations: applyForm.observations || undefined,
        reason: 'Aplicación de vacuna',
        operationKey: applyOperationKey,
      },
      'Vacuna aplicada e incorporada al historial sanitario.'
    );
    if (!result) return;
    setApplyTarget(null);
    setApplyForm({
      dosage: '2',
      dosageUnit: 'ml',
      appliedDate: farmToday(),
      productLot: '',
      withdrawalUntil: '',
      observations: '',
    });
    setApplyOperationKey(newOperationKey('vaccine-apply'));
  };

  const confirmChangeSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scheduleTarget || !canWrite) return;
    const { row, cancel } = scheduleTarget;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetchOperation(`/api/vaccines/schedules/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate: cancel ? undefined : scheduleChangeForm.date,
          cancel,
          reason: scheduleChangeForm.reason,
          operationKey: scheduleOperationKey,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la vacuna');
      await load();
      setNotice(
        cancel
          ? 'Vacuna cancelada; su aviso se cerró.'
          : 'Vacuna reprogramada; su aviso conserva una sola ocurrencia.'
      );
      setScheduleTarget(null);
      setScheduleChangeForm({ date: '', reason: '' });
      setScheduleOperationKey(newOperationKey(cancel ? 'vaccine-cancel' : 'vaccine-reschedule'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeactivate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deactivateTarget) return;
    const result = await send(
      `/api/vaccines/rules/${encodeURIComponent(deactivateTarget.ruleKey)}/deactivate`,
      { reason: deactivateReason, operationKey: deactivateOperationKey },
      'Regla desactivada.'
    );
    if (!result) return;
    setDeactivateTarget(null);
    setDeactivateReason('');
    setDeactivateOperationKey(newOperationKey('vaccine-rule-off'));
  };

  return (
    <section className="card" id="vacunas">
      {/* Encabezado */}
      <div className="card-header">
        <div>
          <h2>Plan de Vacunación Porcina</h2>
          <p className="text-xs text-muted mt-0.5">
            Reglas sanitarias versionadas, agenda preventiva por animal y registro de dosis aplicadas.
          </p>
        </div>
        <button
          className="btn btn-outline btn-sm"
          type="button"
          disabled={busy}
          onClick={() => void send('/api/vaccines/generate', {}, 'Agenda regenerada.')}
          aria-label="Generar vacunas automáticas según reglas activas"
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconRefreshCw size={14} />
            <span>Generar agenda de vacunación</span>
          </span>
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert" aria-live="assertive">{error}</div>}
      {notice && <div className="alert alert-success" role="status" aria-live="polite">{notice}</div>}

      {/* Tablero Focal de Inmunización */}
      <div className="grid-3 mb-4">
        <div className="metric-card">
          <span className="kpi-label">
            <IconCalendar size={16} className="text-warning" />
            <span>Vacunas pendientes</span>
          </span>
          <span className="kpi-value tabular-nums">
            {rows.filter((r) => r.status === 'pending').length}
          </span>
          <span className="kpi-detail">Dosis programadas en agenda</span>
        </div>

        <div className="metric-card">
          <span className="kpi-label">
            <IconCheck size={16} className="text-success" />
            <span>Dosis aplicadas</span>
          </span>
          <span className="kpi-value tabular-nums">
            {rows.filter((r) => r.status === 'applied').length}
          </span>
          <span className="kpi-detail">Inmunizaciones completadas</span>
        </div>

        <div className="metric-card">
          <span className="kpi-label">
            <IconShield size={16} className="text-primary" />
            <span>Reglas vigentes</span>
          </span>
          <span className="kpi-value tabular-nums">
            {rules.filter((r) => r.isActive && r.isCurrent).length}
          </span>
          <span className="kpi-detail">Protocolos preventivos activos</span>
        </div>
      </div>

      {/* Filtros de la Agenda */}
      <div className="card-header-clean mb-2">
        <span className="section-title text-sm">Filtros de la agenda</span>
        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={clearFilters}
            aria-label="Limpiar filtros de la agenda"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconX size={12} />
              <span>Limpiar filtros</span>
            </span>
          </button>
        )}
      </div>
      <div className="grid-4 mb-4">
        <div className="form-group">
          <label className="form-label text-xs">Programada desde</label>
          <input
            type="date"
            className="form-input"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label text-xs">Programada hasta</label>
          <input
            type="date"
            className="form-input"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label text-xs">Tipo de animal</label>
          <select
            className="form-select"
            value={filter.animalType}
            onChange={(e) => setFilter({ ...filter, animalType: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="cerda">Cerda</option>
            <option value="verraco">Verraco</option>
            <option value="lechon">Lechón</option>
            <option value="reemplazo">Reemplazo</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label text-xs">Estado</label>
          <select
            className="form-select"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="pending">Pendientes</option>
            <option value="applied">Aplicadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="">Todos</option>
          </select>
        </div>
      </div>

      {/* Tabla de Agenda */}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th className="text-left">Fecha programada</th>
              <th className="text-left">Animal</th>
              <th className="text-left">Categoría</th>
              <th className="text-left">Vacuna</th>
              <th className="text-left">Galpón</th>
              <th className="text-left">Origen</th>
              <th className="text-center">Estado</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="text-left tabular-nums font-mono">
                  <span className="font-semibold">{row.scheduledDate}</span>
                  {row.appliedDate ? (
                    <span className="text-xs text-muted block tabular-nums">Aplicada: {row.appliedDate}</span>
                  ) : null}
                </td>
                <td className="text-left">
                  <span className="arete-badge">{row.animalCode}</span>
                </td>
                <td className="text-left">{categoryLabels[row.targetCategory] ?? row.targetCategory}</td>
                <td className="text-left">
                  <strong>{row.vaccineName}</strong>
                </td>
                <td className="text-left">{row.barnName}</td>
                <td className="text-left">
                  <span className="text-xs text-muted">{row.isManual ? 'Manual' : 'Regla automática'}</span>
                </td>
                <td className="text-center">
                  <span
                    className={`badge-status ${
                      row.status === 'pending'
                        ? 'badge-warning'
                        : row.status === 'applied'
                        ? 'badge-success'
                        : 'badge-outline'
                    }`}
                  >
                    <span className="status-dot"></span>
                    <span>
                      {row.status === 'pending' ? 'Pendiente' : row.status === 'applied' ? 'Aplicada' : 'Cancelada'}
                    </span>
                  </span>
                </td>
                <td className="text-center">
                  {row.status === 'pending' && canWrite && (
                    <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                      <button
                        className="btn btn-primary btn-xs"
                        type="button"
                        disabled={busy}
                        aria-label={`Aplicar vacuna ${row.vaccineName} al animal ${row.animalCode}`}
                        onClick={() => {
                          setApplyTarget(row);
                          setApplyForm({
                            dosage: '2',
                            dosageUnit: 'ml',
                            appliedDate: farmToday(),
                            productLot: '',
                            withdrawalUntil: '',
                            observations: '',
                          });
                          setApplyOperationKey(newOperationKey('vaccine-apply'));
                        }}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={12} />
                          <span>Aplicar dosis</span>
                        </span>
                      </button>
                      <button
                        className="btn btn-outline btn-xs"
                        type="button"
                        disabled={busy}
                        aria-label={`Reprogramar vacuna ${row.vaccineName} del animal ${row.animalCode}`}
                        onClick={() => {
                          setScheduleTarget({ row, cancel: false });
                          setScheduleChangeForm({ date: row.scheduledDate, reason: '' });
                          setScheduleOperationKey(newOperationKey('vaccine-reschedule'));
                        }}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCalendar size={12} />
                          <span>Reprogramar</span>
                        </span>
                      </button>
                      <button
                        className="btn btn-outline btn-xs text-danger"
                        type="button"
                        disabled={busy}
                        aria-label={`Cancelar vacuna ${row.vaccineName} del animal ${row.animalCode}`}
                        onClick={() => {
                          setScheduleTarget({ row, cancel: true });
                          setScheduleChangeForm({ date: '', reason: '' });
                          setScheduleOperationKey(newOperationKey('vaccine-cancel'));
                        }}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={12} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="p-0">
                  <div className="card empty-state-card m-4">
                    <div className="empty-icon-wrap">
                      <IconCalendar size={28} className="text-primary" />
                    </div>
                    <p className="font-semibold text-base">Agenda de inmunización al día</p>
                    <p className="text-sm text-muted">
                      No hay vacunas programadas ni pendientes para los filtros y fechas seleccionados.
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm mt-3"
                        onClick={clearFilters}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Limpiar filtros</span>
                        </span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Programación Manual */}
      {canWrite && (
        <form
          className="form-stack mt-4 p-3 bg-surface rounded border border-border"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await send(
              '/api/vaccines/schedules/manual',
              { ...manual, operationKey: newOperationKey('vaccine-manual') },
              'Vacuna programada.'
            );
            if (result?.conflictDetected) setNotice('Ya existe esa vacuna para el animal en esa fecha.');
          }}
        >
          <div className="card-header-clean">
            <span className="section-title text-sm">Programación manual de vacuna</span>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label text-xs">Animal</label>
              <select
                required
                className="form-select"
                value={manual.animalCode}
                onChange={(e) => setManual({ ...manual, animalCode: e.target.value })}
              >
                <option value="">Seleccionar animal</option>
                {animals.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label text-xs">Nombre de la vacuna</label>
              <input
                required
                className="form-input"
                value={manual.vaccineName}
                onChange={(e) => setManual({ ...manual, vaccineName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label text-xs">Fecha programada</label>
              <input
                required
                type="date"
                className="form-input"
                value={manual.scheduledDate}
                onChange={(e) => setManual({ ...manual, scheduledDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs">Motivo</label>
              <input
                required
                className="form-input"
                value={manual.reason}
                onChange={(e) => setManual({ ...manual, reason: e.target.value })}
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-outline btn-sm"
              disabled={busy}
              aria-label={busy ? 'Programando vacuna…' : 'Programar aplicación de vacuna manual'}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconPlus size={14} />
                <span>{busy ? 'Programando…' : 'Programar vacuna manual'}</span>
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Reglas de Vacunación (Solo Administrador) */}
      {isAdmin && (
        <>
          <div className="mt-5">
            <div className="card-header-clean mb-3">
              <span className="section-title text-sm">Reglas de vacunación automáticas</span>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Vacuna</th>
                    <th className="text-left">Categoría</th>
                    <th className="text-left">Base</th>
                    <th className="text-right">Ajuste</th>
                    <th className="text-center">Versión</th>
                    <th className="text-center">Estado</th>
                    <th className="text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rules
                    .filter((rule) => rule.isCurrent)
                    .map((rule) => (
                      <tr key={rule.id}>
                        <td className="text-left">
                          <strong>{rule.vaccineName}</strong>
                        </td>
                        <td className="text-left">{categoryLabels[rule.targetCategory] ?? rule.targetCategory}</td>
                        <td className="text-left">{baseLabels[rule.baseEvent] ?? rule.baseEvent}</td>
                        <td className="text-right tabular-nums font-mono font-medium">
                          {rule.offsetDays > 0 ? `+${rule.offsetDays}` : rule.offsetDays} días
                        </td>
                        <td className="text-center tabular-nums font-mono">v{rule.version}</td>
                        <td className="text-center">
                          <span
                            className={`badge-status ${
                              rule.isActive ? 'badge-success' : 'badge-outline'
                            }`}
                          >
                            <span className="status-dot"></span>
                            <span>{rule.isActive ? 'Activa' : 'Inactiva'}</span>
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              className="btn btn-outline btn-xs"
                              aria-label={`Editar regla para ${rule.vaccineName}`}
                              onClick={() => {
                                setEditKey(rule.ruleKey);
                                setForm({
                                  vaccineName: rule.vaccineName,
                                  targetCategory: rule.targetCategory,
                                  baseEvent: rule.baseEvent,
                                  offsetDays: String(rule.offsetDays),
                                  targetAgeDays: String(rule.targetAgeDays ?? 60),
                                  recurrenceDays: String(rule.recurrenceDays ?? 180),
                                  referenceDate: rule.referenceDate ?? '',
                                  isActive: rule.isActive,
                                  reason: 'Actualización de regla',
                                });
                              }}
                            >
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconEdit size={12} />
                                <span>Editar</span>
                              </span>
                            </button>
                            {rule.isActive && (
                              <button
                                type="button"
                                className="btn btn-outline btn-xs text-danger"
                                aria-label={`Desactivar regla para ${rule.vaccineName}`}
                                onClick={() => {
                                  setDeactivateTarget(rule);
                                  setDeactivateReason('');
                                  setDeactivateOperationKey(newOperationKey('vaccine-rule-off'));
                                }}
                              >
                                <span className="inline-flex items-center justify-center gap-2 leading-none">
                                  <IconX size={12} />
                                  <span>Desactivar</span>
                                </span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {!rules.some((rule) => rule.isCurrent) && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="card empty-state-card m-4">
                          <div className="empty-icon-wrap">
                            <IconShield size={28} className="text-muted" />
                          </div>
                          <p className="font-semibold text-base">Sin reglas de vacunación configuradas</p>
                          <p className="text-sm text-muted">
                            Define reglas preventivas automáticas por edad, etapa o eventos reproductivos para generar la agenda de la granja.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <form
            className="form-stack mt-4 p-3 bg-surface rounded border border-border"
            onSubmit={saveRule}
          >
            <div className="card-header-clean">
              <span className="section-title text-sm">
                {editKey ? 'Editar regla de vacunación' : 'Nueva regla de vacunación'}
              </span>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label text-xs">Nombre de la vacuna</label>
                <input
                  required
                  maxLength={120}
                  className="form-input"
                  value={form.vaccineName}
                  onChange={(e) => setForm({ ...form, vaccineName: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs">Categoría objetivo</label>
                <select
                  className="form-select"
                  value={form.targetCategory}
                  onChange={(e) => setForm({ ...form, targetCategory: e.target.value })}
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label text-xs">Evento base</label>
                <select
                  className="form-select"
                  value={form.baseEvent}
                  onChange={(e) => setForm({ ...form, baseEvent: e.target.value })}
                >
                  {Object.entries(baseLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-xs">
                  Ajuste en días
                  {form.baseEvent === 'farrowing' ? ' (negativo: antes del parto probable)' : ''}
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.offsetDays}
                  onChange={(e) => setForm({ ...form, offsetDays: e.target.value })}
                />
              </div>
            </div>

            {form.baseEvent === 'age' && (
              <div className="form-group">
                <label className="form-label text-xs">Edad objetivo en días</label>
                <input
                  required
                  type="number"
                  min="0"
                  className="form-input"
                  value={form.targetAgeDays}
                  onChange={(e) => setForm({ ...form, targetAgeDays: e.target.value })}
                />
              </div>
            )}

            {form.baseEvent === 'semiannual' && (
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label text-xs">Fecha de referencia</label>
                  <input
                    required
                    type="date"
                    className="form-input"
                    value={form.referenceDate}
                    onChange={(e) => setForm({ ...form, referenceDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs">Intervalo en días</label>
                  <input
                    required
                    type="number"
                    min="1"
                    className="form-input"
                    value={form.recurrenceDays}
                    onChange={(e) => setForm({ ...form, recurrenceDays: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label text-xs">Motivo</label>
              <input
                required
                className="form-input"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span>Regla activa</span>
              </label>
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                aria-label={
                  busy
                    ? 'Guardando regla…'
                    : editKey
                    ? 'Guardar nueva versión de la regla'
                    : 'Crear regla y generar agenda'
                }
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={14} />
                  <span>
                    {busy
                      ? 'Guardando…'
                      : editKey
                      ? 'Guardar nueva versión'
                      : 'Crear regla y generar agenda'}
                  </span>
                </span>
              </button>
              {editKey && (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  aria-label="Cancelar edición de regla"
                  onClick={() => setEditKey(null)}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconX size={14} />
                    <span>Cancelar edición</span>
                  </span>
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {!canWrite && (
        <p className="note-box mt-3">
          Perfil de consulta: la programación y aplicación corresponde al veterinario o administrador.
        </p>
      )}

      {/* Modal: Aplicar Vacuna */}
      {applyTarget && (
        <ModalDialog
          labelledBy="vaccine-apply-dialog-title"
          onDismiss={() => setApplyTarget(null)}
          dismissDisabled={busy}
        >
          <h4 id="vaccine-apply-dialog-title" className="text-lg font-bold mb-2">
            Registrar Aplicación de Vacuna
          </h4>
          <p className="text-xs text-muted mb-3">
            Animal <strong className="text-body font-numeric">{applyTarget.animalCode}</strong> · Vacuna{' '}
            <strong className="text-body">{applyTarget.vaccineName}</strong> · {applyTarget.barnName}
          </p>
          <form onSubmit={confirmApply}>
            <div className="form-grid mb-4">
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="apply-dosage">
                  Dosis aplicada:
                </label>
                <input
                  id="apply-dosage"
                  type="number"
                  step="0.001"
                  min="0.001"
                  className="form-input"
                  value={applyForm.dosage}
                  onChange={(e) => setApplyForm({ ...applyForm, dosage: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="apply-unit">
                  Unidad de dosis
                </label>
                <input
                  id="apply-unit"
                  className="form-input"
                  maxLength={30}
                  value={applyForm.dosageUnit}
                  onChange={(e) => setApplyForm({ ...applyForm, dosageUnit: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="apply-date">
                  Fecha aplicada:
                </label>
                <input
                  id="apply-date"
                  type="date"
                  max={farmToday()}
                  className="form-input"
                  value={applyForm.appliedDate}
                  onChange={(e) => setApplyForm({ ...applyForm, appliedDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="apply-lot">
                  Lote producto (opcional):
                </label>
                <input
                  id="apply-lot"
                  className="form-input"
                  value={applyForm.productLot}
                  onChange={(e) => setApplyForm({ ...applyForm, productLot: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="apply-withdrawal">
                  Retiro hasta (opcional):
                </label>
                <input
                  id="apply-withdrawal"
                  type="date"
                  min={applyForm.appliedDate}
                  className="form-input"
                  value={applyForm.withdrawalUntil}
                  onChange={(e) => setApplyForm({ ...applyForm, withdrawalUntil: e.target.value })}
                />
              </div>
              <div className="form-group form-span-2">
                <label className="form-label text-xs" htmlFor="apply-obs">
                  Observaciones (opcional):
                </label>
                <input
                  id="apply-obs"
                  className="form-input"
                  value={applyForm.observations}
                  onChange={(e) => setApplyForm({ ...applyForm, observations: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy}
                aria-label="Cancelar aplicación de vacuna"
                onClick={() => setApplyTarget(null)}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconX size={14} />
                  <span>Cancelar</span>
                </span>
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy}
                aria-label="Confirmar aplicación de vacuna e integrar al historial"
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={14} />
                  <span>{busy ? 'Guardando…' : 'Confirmar Aplicación'}</span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}

      {/* Modal: Reprogramar / Cancelar */}
      {scheduleTarget && (
        <ModalDialog
          labelledBy="vaccine-schedule-dialog-title"
          onDismiss={() => setScheduleTarget(null)}
          dismissDisabled={busy}
        >
          <h4 id="vaccine-schedule-dialog-title" className="text-lg font-bold mb-2">
            {scheduleTarget.cancel ? 'Cancelar Vacuna Programada' : 'Reprogramar Vacuna'}
          </h4>
          <p className="text-xs text-muted mb-3">
            Animal <strong className="text-body font-numeric">{scheduleTarget.row.animalCode}</strong> · Vacuna{' '}
            <strong className="text-body">{scheduleTarget.row.vaccineName}</strong> (Fecha actual:{' '}
            {scheduleTarget.row.scheduledDate})
          </p>
          <form onSubmit={confirmChangeSchedule}>
            <div className="form-stack mb-4">
              {!scheduleTarget.cancel && (
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="sched-new-date">
                    Nueva fecha programada:
                  </label>
                  <input
                    id="sched-new-date"
                    type="date"
                    className="form-input"
                    value={scheduleChangeForm.date}
                    onChange={(e) => setScheduleChangeForm({ ...scheduleChangeForm, date: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="sched-reason">
                  {scheduleTarget.cancel ? 'Motivo de cancelación:' : 'Motivo de reprogramación:'}
                </label>
                <input
                  id="sched-reason"
                  className="form-input"
                  value={scheduleChangeForm.reason}
                  onChange={(e) => setScheduleChangeForm({ ...scheduleChangeForm, reason: e.target.value })}
                  placeholder="ej. Ajuste por condición del animal"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy}
                aria-label="Cancelar y cerrar reprogramación"
                onClick={() => setScheduleTarget(null)}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconX size={14} />
                  <span>Cancelar</span>
                </span>
              </button>
              <button
                type="submit"
                className={`btn btn-sm ${scheduleTarget.cancel ? 'btn-danger' : 'btn-primary'}`}
                aria-label={scheduleTarget.cancel ? 'Confirmar cancelación de vacuna' : 'Guardar nueva fecha programada'}
                disabled={
                  busy ||
                  !scheduleChangeForm.reason.trim() ||
                  (!scheduleTarget.cancel && !scheduleChangeForm.date)
                }
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  {scheduleTarget.cancel ? <IconAlertTriangle size={14} /> : <IconCheck size={14} />}
                  <span>
                    {busy
                      ? 'Guardando…'
                      : scheduleTarget.cancel
                      ? 'Confirmar Cancelación'
                      : 'Guardar Nueva Fecha'}
                  </span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}

      {/* Modal: Desactivar Regla */}
      {deactivateTarget && (
        <ModalDialog
          labelledBy="vaccine-deactivate-dialog-title"
          onDismiss={() => {
            setDeactivateTarget(null);
            setDeactivateReason('');
          }}
          dismissDisabled={busy}
        >
          <h4 id="vaccine-deactivate-dialog-title" className="text-lg font-bold mb-2 text-danger">
            Desactivar Regla de Vacunación
          </h4>
          <p className="text-xs text-muted mb-3">
            Regla: <strong className="text-body">{deactivateTarget.vaccineName}</strong> (
            {categoryLabels[deactivateTarget.targetCategory] ?? deactivateTarget.targetCategory}).
          </p>
          <form onSubmit={confirmDeactivate}>
            <div className="form-group mb-4">
              <label className="form-label text-xs" htmlFor="deact-rule-reason">
                Motivo de desactivación:
              </label>
              <input
                id="deact-rule-reason"
                className="form-input"
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="ej. Cambio de esquema sanitario"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy}
                aria-label="Cancelar desactivación de regla"
                onClick={() => setDeactivateTarget(null)}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconX size={14} />
                  <span>Cancelar</span>
                </span>
              </button>
              <button
                type="submit"
                className="btn btn-danger btn-sm"
                disabled={busy || !deactivateReason.trim()}
                aria-label="Confirmar desactivación de regla de vacunación"
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconAlertTriangle size={14} />
                  <span>{busy ? 'Guardando…' : 'Desactivar Regla'}</span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}
    </section>
  );
}

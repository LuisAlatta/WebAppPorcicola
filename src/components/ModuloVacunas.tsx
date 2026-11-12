import { AnimalPicker } from './AnimalPicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import { errorMessage } from '../utils/format';
import { ModalDialog } from './ModalDialog';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconEdit,
  IconFilter,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconX,
} from './icons';
import { DataState } from './DataState';
import {
  InlineAlert,
  KpiCard,
  StatusBadge,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardActions,
  FilterChip,
  FormField,
} from './ui';
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
  dosage: number | null;
  dosageUnit: string | null;
  productLot: string | null;
  withdrawalUntil: string | null;
  applicationObservations: string | null;
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
  const [filter, setFilter] = useState({ from: '', to: '', status: 'pending', animalType: '' });

  const hasActiveFilters = useMemo(
    () => Boolean(filter.from || filter.to || filter.animalType || filter.status !== 'pending'),
    [filter]
  );

  const filterCount = useMemo(
    () => [filter.from, filter.to, filter.animalType, filter.status !== 'pending' ? filter.status : ''].filter(Boolean).length,
    [filter]
  );

  const clearFilters = () => {
    setFilter({ from: '', to: '', status: 'pending', animalType: '' });
  };
  const [editKey, setEditKey] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const [correctingApplication, setCorrectingApplication] = useState(false);
  const [applyForm, setApplyForm] = useState({
    dosage: '2',
    dosageUnit: 'ml',
    appliedDate: farmToday(),
    productLot: '',
    withdrawalUntil: '',
    observations: '',
    reason: '',
  });
  const [applyOperationKey, setApplyOperationKey] = useState(() => newOperationKey('vaccine-apply'));
  const [annulTarget, setAnnulTarget] = useState<Schedule | null>(null);
  const [annulReason, setAnnulReason] = useState('');
  const [annulOperationKey, setAnnulOperationKey] = useState(() => newOperationKey('vaccine-annul'));

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

    const [rr, sr] = await Promise.all([
      fetch('/api/vaccines/rules'),
      fetch(`/api/vaccines/schedules?${params}`),
    ]);

    const [r, s] = (await Promise.all([rr.json(), sr.json()])) as [
      { rules?: Rule[]; error?: string },
      { schedules?: Schedule[]; error?: string }
    ];

    if (!rr.ok || !sr.ok) {
      throw new Error(r.error || s.error || 'No se pudo cargar vacunas');
    }

    setRules(r.rules ?? []);
    setRows(s.schedules ?? []);
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((err) => setError(errorMessage(err, 'Error cargando vacunas')));
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
      setError(errorMessage(err, 'Error'));
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
      setError(errorMessage(err, 'No se pudo guardar la regla'));
    } finally {
      setBusy(false);
    }
  };

  const confirmApply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!applyTarget) return;
    const result = await send(
      `/api/vaccines/schedules/${applyTarget.id}/${correctingApplication ? 'correction' : 'apply'}`,
      {
        appliedDate: applyForm.appliedDate,
        dosage: Number(applyForm.dosage),
        dosageUnit: applyForm.dosageUnit,
        productLot: applyForm.productLot || undefined,
        withdrawalUntil: applyForm.withdrawalUntil || undefined,
        observations: applyForm.observations || undefined,
        reason: correctingApplication ? applyForm.reason : 'Aplicación de vacuna',
        operationKey: applyOperationKey,
      },
      correctingApplication ? 'Aplicación corregida; el original se conserva en la auditoría.' : 'Vacuna aplicada e incorporada al historial sanitario.'
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
      reason: '',
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
      setError(errorMessage(err, 'Error'));
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

      {error && <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>}
      {notice && <InlineAlert tone="success" onDismiss={() => setNotice('')} autoDismissMs={6000}>{notice}</InlineAlert>}

      {/* Tablero Focal de Inmunización */}
      <div className="grid-3 mb-4">
        <KpiCard
          label="Vacunas pendientes"
          icon={<IconCalendar size={16} className="text-warning" />}
          value={rows.filter((r) => r.status === 'pending').length}
          detail="Dosis programadas en agenda"
        />
        <KpiCard
          label="Dosis aplicadas"
          icon={<IconCheck size={16} className="text-success" />}
          value={rows.filter((r) => r.status === 'applied').length}
          detail="Inmunizaciones completadas"
        />
        <KpiCard
          label="Reglas vigentes"
          icon={<IconShield size={16} className="text-primary" />}
          value={rules.filter((r) => r.isActive && r.isCurrent).length}
          detail="Protocolos preventivos activos"
        />
      </div>

      {/* Filtros de la Agenda */}
      <div className="card-header-clean mb-2 flex-wrap gap-2">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm inline-flex items-center justify-center gap-2"
            aria-label="Filtros"
            aria-expanded={filtersOpen}
            aria-controls="vaccine-filters-panel"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <IconFilter size={14} />
            <span>Filtros</span>
            {hasActiveFilters && <StatusBadge tone="primary" className="tabular-nums font-numeric">{filterCount}</StatusBadge>}
          </button>
          <span className="text-xs text-muted">{rows.length} dosis en la agenda</span>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
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
      {hasActiveFilters && (
        <div className="filter-chip-row mb-3" aria-label="Filtros aplicados">
          {filter.from && <FilterChip label={`Desde ${filter.from}`} onRemove={() => setFilter({ ...filter, from: '' })} removeLabel="Quitar filtro desde" />}
          {filter.to && <FilterChip label={`Hasta ${filter.to}`} onRemove={() => setFilter({ ...filter, to: '' })} removeLabel="Quitar filtro hasta" />}
          {filter.animalType && <FilterChip label={`Tipo: ${filter.animalType}`} onRemove={() => setFilter({ ...filter, animalType: '' })} removeLabel="Quitar filtro tipo de animal" />}
          {filter.status !== 'pending' && <FilterChip label={`Estado: ${filter.status === 'applied' ? 'Aplicadas' : filter.status === 'cancelled' ? 'Canceladas' : 'Todos'}`} onRemove={() => setFilter({ ...filter, status: 'pending' })} removeLabel="Quitar filtro estado" />}
        </div>
      )}
      {filtersOpen && <div id="vaccine-filters-panel" className="grid-4 mb-4">
        <FormField label="Programada desde" htmlFor="vac-filter-from" labelClassName="text-xs">
          <input
            id="vac-filter-from"
            type="date"
            className="form-input"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          />
        </FormField>
        <FormField label="Programada hasta" htmlFor="vac-filter-to" labelClassName="text-xs">
          <input
            id="vac-filter-to"
            type="date"
            className="form-input"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          />
        </FormField>
        <FormField label="Tipo de animal" htmlFor="vac-filter-type" labelClassName="text-xs">
          <select
            id="vac-filter-type"
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
        </FormField>
        <FormField label="Estado" htmlFor="vac-filter-status" labelClassName="text-xs">
          <select
            id="vac-filter-status"
            className="form-select"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="pending">Pendientes</option>
            <option value="applied">Aplicadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="">Todos</option>
          </select>
        </FormField>
      </div>}

      {/* Agenda de vacunas */}
      {rows.length === 0 ? (
        <DataState
          variant="empty"
          title="Agenda de inmunización al día"
          description="No hay vacunas programadas ni pendientes para los filtros y fechas seleccionados."
          icon={<IconCalendar size={28} className="text-primary" />}
          action={hasActiveFilters ? <button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" onClick={clearFilters}><IconX size={16} /><span>Limpiar filtros</span></button> : undefined}
        />
      ) : (
        <DataCardList label="Agenda de vacunas" grid>
          {rows.map((row) => (
            <DataCard key={row.id} state={row.status === 'pending' ? 'active' : row.status === 'applied' ? 'active' : 'inactive'}>
              <DataCardHead
                title={row.vaccineName}
                subtitle={<span className="font-mono">{row.animalCode} · {categoryLabels[row.targetCategory] ?? row.targetCategory}</span>}
                badge={
                  <StatusBadge tone={row.status === 'pending' ? 'warning' : row.status === 'applied' ? 'success' : 'outline'}>
                    <span className="status-dot"></span>
                    <span>{row.status === 'pending' ? 'Pendiente' : row.status === 'applied' ? 'Aplicada' : 'Cancelada'}</span>
                  </StatusBadge>
                }
              />
              <DataCardMeta items={[
                { label: 'Fecha programada', value: row.scheduledDate, className: 'font-mono tabular-nums' },
                { label: 'Aplicada', value: row.appliedDate ?? 'Sin aplicar', className: 'font-mono tabular-nums' },
                { label: 'Galpón', value: row.barnName },
                { label: 'Origen', value: row.isManual ? 'Manual' : 'Regla automática' },
              ]} />
                {row.status === 'pending' && canWrite && (
                  <DataCardActions>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={busy}
                      aria-label={`Aplicar vacuna ${row.vaccineName} al animal ${row.animalCode}`}
                      onClick={() => {
                        setApplyTarget(row);
                        setCorrectingApplication(false);
                        setApplyForm({
                          dosage: '2',
                          dosageUnit: 'ml',
                          appliedDate: farmToday(),
                          productLot: '',
                          withdrawalUntil: '',
                          observations: '',
                          reason: '',
                        });
                        setApplyOperationKey(newOperationKey('vaccine-apply'));
                      }}
                    >
                      <IconCheck size={14} />
                      <span>Aplicar dosis</span>
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={busy}
                      aria-label={`Reprogramar vacuna ${row.vaccineName} del animal ${row.animalCode}`}
                      onClick={() => {
                        setScheduleTarget({ row, cancel: false });
                        setScheduleChangeForm({ date: row.scheduledDate, reason: '' });
                        setScheduleOperationKey(newOperationKey('vaccine-reschedule'));
                      }}
                    >
                      <IconCalendar size={14} />
                      <span>Reprogramar</span>
                    </button>
                    <button
                      className="btn btn-outline text-danger"
                      type="button"
                      disabled={busy}
                      aria-label={`Cancelar vacuna ${row.vaccineName} del animal ${row.animalCode}`}
                      onClick={() => {
                        setScheduleTarget({ row, cancel: true });
                        setScheduleChangeForm({ date: '', reason: '' });
                        setScheduleOperationKey(newOperationKey('vaccine-cancel'));
                      }}
                    >
                      <IconX size={14} />
                      <span>Cancelar</span>
                    </button>
                  </DataCardActions>
                )}
                {row.status === 'applied' && canWrite && (
                  <DataCardActions>
                    <button type="button" className="btn btn-outline" disabled={busy}
                      aria-label={`Corregir aplicación de ${row.vaccineName} al animal ${row.animalCode}`}
                      onClick={() => {
                        setApplyTarget(row); setCorrectingApplication(true);
                        setApplyForm({ dosage: String(row.dosage ?? ''), dosageUnit: row.dosageUnit ?? '', appliedDate: row.appliedDate ?? '', productLot: row.productLot ?? '', withdrawalUntil: row.withdrawalUntil ?? '', observations: row.applicationObservations ?? '', reason: '' });
                        setApplyOperationKey(newOperationKey('vaccine-correction'));
                      }}>
                      <IconEdit size={14} />
                      <span>Corregir aplicación</span>
                    </button>
                    <button type="button" className="btn btn-outline text-danger" disabled={busy}
                      aria-label={`Anular aplicación de ${row.vaccineName} al animal ${row.animalCode}`}
                      onClick={() => { setAnnulTarget(row); setAnnulReason(''); setAnnulOperationKey(newOperationKey('vaccine-annul')); }}>
                      <IconX size={14} />
                      <span>Anular aplicación</span>
                    </button>
                  </DataCardActions>
                )}
            </DataCard>
          ))}
        </DataCardList>
      )}

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
            <FormField>
              <AnimalPicker label="Animal" searchLabel="Buscar animal para vacuna" activeOnly required value={manual.animalCode ? [manual.animalCode] : []} onChange={values => setManual({ ...manual, animalCode: values[0] ?? '' })} />
            </FormField>

            <FormField label="Nombre de la vacuna" labelClassName="text-xs">
              <input
                required
                className="form-input"
                value={manual.vaccineName}
                onChange={(e) => setManual({ ...manual, vaccineName: e.target.value })}
              />
            </FormField>
          </div>

          <div className="grid-2">
            <FormField label="Fecha programada" labelClassName="text-xs">
              <input
                required
                type="date"
                className="form-input"
                value={manual.scheduledDate}
                onChange={(e) => setManual({ ...manual, scheduledDate: e.target.value })}
              />
            </FormField>

            <FormField label="Motivo" labelClassName="text-xs">
              <input
                required
                className="form-input"
                value={manual.reason}
                onChange={(e) => setManual({ ...manual, reason: e.target.value })}
              />
            </FormField>
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

            {rules.some((rule) => rule.isCurrent) ? (
              <DataCardList label="Reglas de vacunación automáticas" grid>
                {rules.filter((rule) => rule.isCurrent).map((rule) => (
                  <DataCard key={rule.id} state={rule.isActive ? 'active' : 'inactive'}>
                    <DataCardHead
                      title={rule.vaccineName}
                      subtitle={<>{categoryLabels[rule.targetCategory] ?? rule.targetCategory} · {baseLabels[rule.baseEvent] ?? rule.baseEvent}</>}
                      badge={
                        <StatusBadge tone={rule.isActive ? 'success' : 'outline'}>
                          <span className="status-dot"></span>
                          <span>{rule.isActive ? 'Activa' : 'Inactiva'}</span>
                        </StatusBadge>
                      }
                    />
                    <DataCardMeta items={[
                      { label: 'Ajuste', value: `${rule.offsetDays > 0 ? `+${rule.offsetDays}` : rule.offsetDays} días`, className: 'font-mono tabular-nums' },
                      { label: 'Versión', value: `v${rule.version}`, className: 'font-mono tabular-nums' },
                      { label: 'Edad objetivo', value: rule.targetAgeDays === null ? 'No aplica' : `${rule.targetAgeDays} días`, className: 'font-mono tabular-nums' },
                      { label: 'Referencia', value: rule.referenceDate ?? 'No aplica', className: 'font-mono tabular-nums' },
                    ]} />
                    <DataCardActions>
                        <button
                          type="button"
                          className="btn btn-outline"
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
                          <IconEdit size={14} />
                          <span>Editar</span>
                        </button>
                        {rule.isActive && (
                          <button
                            type="button"
                            className="btn btn-outline text-danger"
                            aria-label={`Desactivar regla para ${rule.vaccineName}`}
                            onClick={() => {
                              setDeactivateTarget(rule);
                              setDeactivateReason('');
                              setDeactivateOperationKey(newOperationKey('vaccine-rule-off'));
                            }}
                          >
                            <IconX size={14} />
                            <span>Desactivar</span>
                          </button>
                        )}
                    </DataCardActions>
                  </DataCard>
                ))}
              </DataCardList>
            ) : (
              <DataState
                variant="empty"
                title="Sin reglas de vacunación configuradas"
                description="Define reglas preventivas automáticas por edad, etapa o eventos reproductivos para generar la agenda de la granja."
                icon={<IconShield size={28} className="text-muted" />}
              />
            )}
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
              <FormField label="Nombre de la vacuna" labelClassName="text-xs">
                <input
                  required
                  maxLength={120}
                  className="form-input"
                  value={form.vaccineName}
                  onChange={(e) => setForm({ ...form, vaccineName: e.target.value })}
                />
              </FormField>

              <FormField label="Categoría objetivo" labelClassName="text-xs">
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
              </FormField>
            </div>

            <div className="grid-2">
              <FormField label="Evento base" labelClassName="text-xs">
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
              </FormField>

              <FormField
                label={
                  <>
                    Ajuste en días
                    {form.baseEvent === 'farrowing' ? ' (negativo: antes del parto probable)' : ''}
                  </>
                }
                labelClassName="text-xs"
              >
                <input
                  type="number"
                  className="form-input"
                  value={form.offsetDays}
                  onChange={(e) => setForm({ ...form, offsetDays: e.target.value })}
                />
              </FormField>
            </div>

            {form.baseEvent === 'age' && (
              <FormField label="Edad objetivo en días" labelClassName="text-xs">
                <input
                  required
                  type="number"
                  min="0"
                  className="form-input"
                  value={form.targetAgeDays}
                  onChange={(e) => setForm({ ...form, targetAgeDays: e.target.value })}
                />
              </FormField>
            )}

            {form.baseEvent === 'semiannual' && (
              <div className="grid-2">
                <FormField label="Fecha de referencia" labelClassName="text-xs">
                  <input
                    required
                    type="date"
                    className="form-input"
                    value={form.referenceDate}
                    onChange={(e) => setForm({ ...form, referenceDate: e.target.value })}
                  />
                </FormField>
                <FormField label="Intervalo en días" labelClassName="text-xs">
                  <input
                    required
                    type="number"
                    min="1"
                    className="form-input"
                    value={form.recurrenceDays}
                    onChange={(e) => setForm({ ...form, recurrenceDays: e.target.value })}
                  />
                </FormField>
              </div>
            )}

            <FormField label="Motivo" labelClassName="text-xs">
              <input
                required
                className="form-input"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </FormField>

            <FormField>
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span>Regla activa</span>
              </label>
            </FormField>

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
            {correctingApplication ? 'Corregir Aplicación de Vacuna' : 'Registrar Aplicación de Vacuna'}
          </h4>
          <p className="text-xs text-muted mb-3">
            Animal <strong className="text-body font-numeric">{applyTarget.animalCode}</strong> · Vacuna{' '}
            <strong className="text-body">{applyTarget.vaccineName}</strong> · {applyTarget.barnName}
          </p>
          <form onSubmit={confirmApply}>
            <div className="form-grid mb-4">
              <FormField label="Dosis aplicada:" htmlFor="apply-dosage" labelClassName="text-xs">
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
              </FormField>
              <FormField label="Unidad de dosis" htmlFor="apply-unit" labelClassName="text-xs">
                <input
                  id="apply-unit"
                  className="form-input"
                  maxLength={30}
                  value={applyForm.dosageUnit}
                  onChange={(e) => setApplyForm({ ...applyForm, dosageUnit: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Fecha aplicada:" htmlFor="apply-date" labelClassName="text-xs">
                <input
                  id="apply-date"
                  type="date"
                  max={farmToday()}
                  className="form-input"
                  value={applyForm.appliedDate}
                  onChange={(e) => setApplyForm({ ...applyForm, appliedDate: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Lote producto (opcional):" htmlFor="apply-lot" labelClassName="text-xs">
                <input
                  id="apply-lot"
                  className="form-input"
                  value={applyForm.productLot}
                  onChange={(e) => setApplyForm({ ...applyForm, productLot: e.target.value })}
                />
              </FormField>
              <FormField label="Retiro hasta (opcional):" htmlFor="apply-withdrawal" labelClassName="text-xs">
                <input
                  id="apply-withdrawal"
                  type="date"
                  min={applyForm.appliedDate}
                  className="form-input"
                  value={applyForm.withdrawalUntil}
                  onChange={(e) => setApplyForm({ ...applyForm, withdrawalUntil: e.target.value })}
                />
              </FormField>
              <FormField label="Observaciones (opcional):" htmlFor="apply-obs" className="form-span-2" labelClassName="text-xs">
                <input
                  id="apply-obs"
                  className="form-input"
                  value={applyForm.observations}
                  onChange={(e) => setApplyForm({ ...applyForm, observations: e.target.value })}
                />
              </FormField>
              {correctingApplication && (
                <FormField label="Motivo de corrección:" htmlFor="apply-correction-reason" className="form-span-2" labelClassName="text-xs">
                  <input id="apply-correction-reason" className="form-input" required value={applyForm.reason} onChange={(e)=>setApplyForm({...applyForm,reason:e.target.value})}/>
                  <p className="text-xs text-muted">La aplicación anterior se conserva en la auditoría y se sustituye su retiro.</p>
                </FormField>
              )}
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
                disabled={busy || (correctingApplication && !applyForm.reason.trim())}
                aria-label={correctingApplication ? 'Guardar corrección de aplicación' : 'Confirmar aplicación de vacuna e integrar al historial'}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={14} />
                  <span>{busy ? 'Guardando…' : correctingApplication ? 'Guardar corrección' : 'Confirmar Aplicación'}</span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}

      {annulTarget && (
        <ModalDialog labelledBy="vaccine-annul-title" onDismiss={()=>setAnnulTarget(null)} dismissDisabled={busy}>
          <h4 id="vaccine-annul-title" className="text-lg font-bold mb-2">Anular Aplicación de Vacuna</h4>
          <p className="text-xs text-muted mb-3">{annulTarget.vaccineName} · {annulTarget.animalCode}. Se retirará su efecto clínico y su retiro. La dosis volverá a pendientes; las siguientes dosis recurrentes pendientes se retirarán hasta registrar la aplicación real.</p>
          <form onSubmit={async(event)=>{
            event.preventDefault();
            const result=await send(`/api/vaccines/schedules/${annulTarget.id}/annul`,{reason:annulReason,operationKey:annulOperationKey},'Aplicación anulada; la dosis volvió a pendientes y el original se conserva en la auditoría.');
            if(result)setAnnulTarget(null);
          }}>
            <FormField label="Motivo de anulación:" htmlFor="vaccine-annul-reason" className="mb-4" labelClassName="text-xs">
              <input id="vaccine-annul-reason" className="form-input" required autoFocus value={annulReason} onChange={(event)=>setAnnulReason(event.target.value)}/>
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={()=>setAnnulTarget(null)}>Cancelar</button>
              <button type="submit" className="btn btn-danger btn-sm" disabled={busy||!annulReason.trim()} aria-label="Confirmar anulación de aplicación">{busy?'Guardando…':'Anular aplicación'}</button>
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
                <FormField label="Nueva fecha programada:" htmlFor="sched-new-date" labelClassName="text-xs">
                  <input
                    id="sched-new-date"
                    type="date"
                    className="form-input"
                    value={scheduleChangeForm.date}
                    onChange={(e) => setScheduleChangeForm({ ...scheduleChangeForm, date: e.target.value })}
                    required
                  />
                </FormField>
              )}
              <FormField label={scheduleTarget.cancel ? 'Motivo de cancelación:' : 'Motivo de reprogramación:'} htmlFor="sched-reason" labelClassName="text-xs">
                <input
                  id="sched-reason"
                  className="form-input"
                  value={scheduleChangeForm.reason}
                  onChange={(e) => setScheduleChangeForm({ ...scheduleChangeForm, reason: e.target.value })}
                  placeholder="ej. Ajuste por condición del animal"
                  required
                  autoFocus
                />
              </FormField>
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
            <FormField label="Motivo de desactivación:" htmlFor="deact-rule-reason" className="mb-4" labelClassName="text-xs">
              <input
                id="deact-rule-reason"
                className="form-input"
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="ej. Cambio de esquema sanitario"
                required
                autoFocus
              />
            </FormField>
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

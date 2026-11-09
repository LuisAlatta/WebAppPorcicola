import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendar,
  IconCheck,
  IconEdit,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconX,
} from './icons';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import type { Perfil } from '../types';
import { ModuloVacunas } from './ModuloVacunas';
import { ModalDialog } from './ModalDialog';

interface Animal {
  code: string;
  alias: string | null;
  barnName: string;
  lotCode: string | null;
  stageCode: string;
}

interface HealthEvent {
  id: number;
  eventType: string;
  effectiveDate: string;
  product: string | null;
  productLot: string | null;
  dosage: number | null;
  dosageUnit: string | null;
  nextDueDate: string | null;
  withdrawalUntil: string | null;
  causeCode: string | null;
  observations: string | null;
  responsibleName: string;
  animalCode: string;
  barnName: string;
  locationCode: string | null;
  lotCode: string | null;
  stageCode: string;
}

interface Withdrawal {
  animalCode: string;
  product: string | null;
  withdrawalUntil: string;
  eventDate: string;
  barnName: string;
}

interface Upcoming {
  eventId: number;
  eventType: string;
  lastDate: string;
  nextDueDate: string;
  product: string;
  productLot: string | null;
  dosage: number;
  dosageUnit: string;
  animalCode: string;
  barnName: string;
  lotCode: string | null;
  responsibleName: string;
}

const types: Record<string, string> = {
  treatment: 'Tratamiento',
  deworming: 'Desparasitación',
  other: 'Otro evento',
  death: 'Muerte',
  vaccination: 'Vacunación',
};

export function ModuloSanidad({ perfil }: { perfil: Perfil }) {
  const canWrite = perfil === 'administrador' || perfil === 'veterinario';
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [alerts, setAlerts] = useState<Withdrawal[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({
    eventType: 'treatment',
    effectiveDate: farmToday(),
    product: '',
    productLot: '',
    dosage: '',
    dosageUnit: 'ml',
    nextDueDate: '',
    withdrawalUntil: '',
    observations: '',
    reason: '',
  });
  const [section, setSection] = useState<'retiros' | 'vacunacion' | 'registro' | 'historial'>('retiros');
  const [editing, setEditing] = useState<HealthEvent | null>(null);
  const [showAnnulModal, setShowAnnulModal] = useState(false);
  const [operationKey, setOperationKey] = useState(() => newOperationKey('sanidad'));
  const [filter, setFilter] = useState({
    animalCode: '',
    product: '',
    lotCode: '',
    from: '',
    to: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const hasActiveFilters = useMemo(
    () => Boolean(filter.animalCode || filter.product || filter.lotCode || filter.from || filter.to),
    [filter]
  );

  const clearFilters = () => {
    setFilter({ animalCode: '', product: '', lotCode: '', from: '', to: '' });
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter.animalCode) params.set('animalCode', filter.animalCode);
    if (filter.product) params.set('product', filter.product);
    if (filter.lotCode) params.set('lotCode', filter.lotCode);
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);

    const [ar, er, wr, ur] = await Promise.all([
      fetch('/api/animals?status=activo&limit=500'),
      fetch(`/api/health/events?${params}`),
      fetch(`/api/health/withdrawals?asOf=${farmToday()}`),
      fetch(`/api/health/upcoming?asOf=${farmToday()}`),
    ]);

    const [a, e, w, u] = (await Promise.all([ar.json(), er.json(), wr.json(), ur.json()])) as [
      { animals?: Animal[]; error?: string },
      { events?: HealthEvent[]; error?: string },
      { alerts?: Withdrawal[]; error?: string },
      { events?: Upcoming[]; error?: string }
    ];

    if (!ar.ok || !er.ok || !wr.ok || !ur.ok) {
      throw new Error(a.error || e.error || w.error || u.error || 'No se pudo cargar sanidad');
    }

    setAnimals(a.animals ?? []);
    setEvents(e.events ?? []);
    setAlerts(w.alerts ?? []);
    setUpcoming(u.events ?? []);
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : 'Error cargando sanidad'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const update = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));

  const startCorrection = (row: HealthEvent) => {
    setEditing(row);
    setSection('registro');
    setOperationKey(newOperationKey('sanidad-correccion'));
    setForm({
      eventType: row.eventType,
      effectiveDate: row.effectiveDate,
      product: row.product ?? '',
      productLot: row.productLot ?? '',
      dosage: String(row.dosage ?? ''),
      dosageUnit: row.dosageUnit ?? 'ml',
      nextDueDate: row.nextDueDate ?? '',
      withdrawalUntil: row.withdrawalUntil ?? '',
      observations: row.observations ?? '',
      reason: '',
    });
    setError('');
    setNotice('');
  };

  const save = async (annul = false) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const url = editing
        ? `/api/health/events/${editing.id}/${annul ? 'annul' : 'correction'}`
        : '/api/health/events';
      const res = await fetchOperation(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          dosage: Number(form.dosage),
          animalCodes: selected,
          operationKey,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'No se pudo guardar el evento');
      setNotice(
        annul
          ? 'Actuación anulada y registrada en auditoría.'
          : editing
          ? 'Actuación corregida y registrada en auditoría.'
          : 'Evento sanitario e historial de los animales guardados.'
      );
      setForm((old) => ({ ...old, product: '', productLot: '', dosage: '', observations: '', reason: '' }));
      setEditing(null);
      setOperationKey(newOperationKey('sanidad'));
      setSelected([]);
      await load();
      setSection('historial');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void save();
  };

  return (
    <main className="module-container">
      {/* Encabezado del Módulo */}
      <div className="module-heading">
        <div>
          <h1 className="title-module">
            <IconActivity size={22} className="text-primary" />
            <span>Sanidad y Control Fármaco</span>
          </h1>
          <p className="text-xs text-muted mt-1">
            Historial clínico, registro de tratamientos, dosificación de fármacos y control de retiros sanitarios.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => void load()}
          aria-label="Actualizar registros sanitarios"
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconRefreshCw size={14} />
            <span>Actualizar registros</span>
          </span>
        </button>
      </div>

      {/* Tablero Focal de Sanidad y Retiros */}
      <div className="grid-3 mb-4">
        <div className={`metric-card ${alerts.length > 0 ? 'border-l-4 border-warning' : ''}`}>
          <span className="kpi-label">
            <IconShield size={16} className={alerts.length > 0 ? 'text-warning' : 'text-success'} />
            <span>Retiros vigentes</span>
          </span>
          <span className="kpi-value tabular-nums">{alerts.length}</span>
          <span className={`kpi-detail ${alerts.length > 0 ? 'text-warning font-semibold' : 'text-success'}`}>
            {alerts.length > 0
              ? `${alerts.length} ${alerts.length === 1 ? 'animal restringido' : 'animales restringidos'}`
              : 'Inocuidad 100% · Sin restricciones'}
          </span>
        </div>

        <div className="metric-card">
          <span className="kpi-label">
            <IconCalendar size={16} className="text-primary" />
            <span>Actuaciones próximas</span>
          </span>
          <span className="kpi-value tabular-nums">{upcoming.length}</span>
          <span className="kpi-detail">
            {upcoming.length > 0 ? 'Dosis y tratamientos agendados' : 'Sin pendientes programados'}
          </span>
        </div>

        <div className="metric-card">
          <span className="kpi-label">
            <IconActivity size={16} className="text-body" />
            <span>Historial clínico</span>
          </span>
          <span className="kpi-value tabular-nums">{events.length}</span>
          <span className="kpi-detail">Actuaciones trazables registradas</span>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert" aria-live="assertive">{error}</div>}
      {notice && <div className="alert alert-success" role="status" aria-live="polite">{notice}</div>}

      <div className="admin-tabs mb-4" role="tablist" aria-label="Secciones del módulo de sanidad">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'retiros'}
          className={`btn btn-sm ${section === 'retiros' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('retiros')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconShield size={14} />
            <span>Retiros y Pendientes</span>
            {alerts.length > 0 && (
              <span className="badge-status badge-warning tabular-nums font-numeric ml-1">{alerts.length}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'vacunacion'}
          className={`btn btn-sm ${section === 'vacunacion' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('vacunacion')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCalendar size={14} />
            <span>Plan de Vacunación</span>
          </span>
        </button>
        {canWrite && (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'registro'}
            className={`btn btn-sm ${section === 'registro' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSection('registro')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconPlus size={14} />
              <span>{editing ? 'Editar actuación' : 'Registrar tratamiento'}</span>
            </span>
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={section === 'historial'}
          className={`btn btn-sm ${section === 'historial' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('historial')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconActivity size={14} />
            <span>Historial clínico</span>
            {events.length > 0 && (
              <span className="badge-status badge-outline tabular-nums font-numeric ml-1">{events.length}</span>
            )}
          </span>
        </button>
      </div>

      {section === 'vacunacion' && (
        <ModuloVacunas perfil={perfil} />
      )}

      {section === 'retiros' && (
        <>
          {/* Periodo de Retiro Vigente */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Periodo de retiro vigente</h2>
            <p className="text-xs text-muted mt-0.5">
              Los animales listados no pueden registrarse como vendidos ni faenados hasta la fecha indicada por inocuidad del fármaco.
            </p>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">Animal</th>
                <th className="text-left">Fármaco / Producto</th>
                <th className="text-left">Galpón</th>
                <th className="text-left">Fecha aplicación</th>
                <th className="text-right">Retiro hasta</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((row, index) => (
                <tr key={`${row.animalCode}-${row.eventDate}-${index}`}>
                  <td className="text-left">
                    <span className="arete-badge">{row.animalCode}</span>
                  </td>
                  <td className="text-left font-medium">{row.product ?? '—'}</td>
                  <td className="text-left">{row.barnName}</td>
                  <td className="text-left tabular-nums font-mono">{row.eventDate}</td>
                  <td className="text-right">
                    <span className="badge-status badge-warning tabular-nums font-mono">
                      <IconCalendar size={12} />
                      <span>{row.withdrawalUntil}</span>
                    </span>
                  </td>
                </tr>
              ))}
              {!alerts.length && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <div className="card empty-state-card m-4">
                      <div className="empty-icon-wrap">
                        <IconShield size={28} className="text-success" />
                      </div>
                      <p className="font-semibold text-base">Inocuidad alimentaria garantizada</p>
                      <p className="text-sm text-muted">
                        No hay retiros vigentes a la fecha. Ningún lote o animal presenta restricciones sanitarias para faenado o venta.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Próximas Actuaciones */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Próximas actuaciones sanitarias</h2>
            <p className="text-xs text-muted mt-0.5">
              Tratamientos, desparasitaciones y aplicaciones programadas pendientes de ejecución.
            </p>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">Fecha próxima</th>
                <th className="text-left">Animal</th>
                <th className="text-left">Fármaco y lote</th>
                <th className="text-left">Galpón / lote</th>
                <th className="text-right">Dosis</th>
                <th className="text-left">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row, index) => (
                <tr key={`${row.eventId}-${row.animalCode}-${index}`}>
                  <td className="text-left">
                    <span className="badge-status badge-outline tabular-nums font-mono">
                      <IconCalendar size={12} />
                      <span>{row.nextDueDate}</span>
                    </span>
                  </td>
                  <td className="text-left">
                    <span className="arete-badge">{row.animalCode}</span>
                  </td>
                  <td className="text-left">
                    <strong>{row.product}</strong>
                    {row.productLot ? <span className="text-xs text-muted tabular-nums font-mono">{` · Lote ${row.productLot}`}</span> : ''}
                  </td>
                  <td className="text-left">
                    {row.barnName}
                    {row.lotCode ? ` · ${row.lotCode}` : ''}
                  </td>
                  <td className="text-right tabular-nums font-mono font-medium">
                    {row.dosage} {row.dosageUnit}
                  </td>
                  <td className="text-left">{row.responsibleName}</td>
                </tr>
              ))}
              {!upcoming.length && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <div className="card empty-state-card m-4">
                      <div className="empty-icon-wrap">
                        <IconCalendar size={28} className="text-primary" />
                      </div>
                      <p className="font-semibold text-base">Actuaciones sanitarias al día</p>
                      <p className="text-sm text-muted">
                        No hay actuaciones programadas pendientes a la fecha en la granja.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )}

  {/* Formulario de Registro o Corrección Sanitaria */}
  {section === 'registro' && canWrite && (
    <section className="card" id="corregir-sanidad">
      <div className="card-header flex-wrap gap-2 justify-between">
        <div>
          <h2>{editing ? 'Corregir o anular actuación sanitaria' : 'Registrar tratamiento o actuación sanitaria'}</h2>
          <p className="text-xs text-muted mt-0.5">
            El profesional responsable queda registrado automáticamente en el historial.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setSection('retiros')}
          aria-label="Volver a retiros y pendientes"
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconArrowLeft size={14} />
            <span>Volver a retiros</span>
          </span>
        </button>
      </div>

          <form className="form-stack" onSubmit={submit}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="health-event-type">Tipo de evento</label>
                <select
                  id="health-event-type"
                  className="form-select"
                  value={form.eventType}
                  onChange={(e) => update('eventType', e.target.value)}
                >
                  {Object.entries(types)
                    .filter(([key]) => ['treatment', 'deworming', 'other'].includes(key))
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="health-effective-date">Fecha efectiva</label>
                <input
                  id="health-effective-date"
                  type="date"
                  className="form-input"
                  max={farmToday()}
                  required
                  value={form.effectiveDate}
                  onChange={(e) => update('effectiveDate', e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted">
              Para vacunas utilice{' '}
              <a href="#vacunas" className="text-primary font-semibold underline">
                Vacunación y calendario
              </a>
              .{' '}
              {perfil === 'veterinario' ? (
                'Para registrar una muerte, solicite al responsable o administrador que registre la salida desde la ficha del animal.'
              ) : (
                <>
                  Para bajas utilice la ficha del animal:{' '}
                  <a href="/animales" className="text-primary font-semibold underline">
                    Registrar una muerte
                  </a>
                  .
                </>
              )}
            </p>

            {editing ? (
              <p className="text-xs text-muted card-subtle p-2.5 rounded">
                La corrección o anulación se aplicará a todos los animales de esta actuación grupal. El registro anterior se conserva en auditoría.
              </p>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="health-animals">
                  Animales aplicables
                  <span className="text-xs text-muted font-normal ml-2">
                    (Mantén presionada la tecla Ctrl / Cmd para seleccionar varios)
                  </span>
                </label>
                <select
                  id="health-animals"
                  multiple
                  required
                  className="form-select min-h-[120px]"
                  size={Math.min(8, Math.max(3, animals.length))}
                  value={selected}
                  onChange={(e) =>
                    setSelected(Array.from(e.currentTarget.selectedOptions).map((option) => option.value))
                  }
                >
                  {animals.map((animal) => (
                    <option key={animal.code} value={animal.code}>
                      {animal.code}
                      {animal.alias ? ` · ${animal.alias}` : ''} — {animal.barnName} — {animal.lotCode ?? 'Sin lote'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="health-product">Producto / medicamento</label>
                <input
                  id="health-product"
                  className="form-input"
                  required
                  maxLength={160}
                  value={form.product}
                  onChange={(e) => update('product', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="health-product-lot">Lote del producto</label>
                <input
                  id="health-product-lot"
                  className="form-input"
                  maxLength={80}
                  value={form.productLot}
                  onChange={(e) => update('productLot', e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="health-dosage">Dosis por animal</label>
                <input
                  id="health-dosage"
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="form-input"
                  required
                  value={form.dosage}
                  onChange={(e) => update('dosage', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="health-dosage-unit">Unidad de dosis</label>
                <input
                  id="health-dosage-unit"
                  className="form-input"
                  required
                  maxLength={30}
                  value={form.dosageUnit}
                  onChange={(e) => update('dosageUnit', e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="health-next-due-date">Próxima aplicación (opcional)</label>
                <input
                  id="health-next-due-date"
                  type="date"
                  className="form-input"
                  min={form.effectiveDate}
                  value={form.nextDueDate}
                  onChange={(e) => update('nextDueDate', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="health-withdrawal-until">Fin del retiro (opcional)</label>
                <input
                  id="health-withdrawal-until"
                  type="date"
                  className="form-input"
                  min={form.effectiveDate}
                  value={form.withdrawalUntil}
                  onChange={(e) => update('withdrawalUntil', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="health-reason">Motivo</label>
              <input
                id="health-reason"
                className="form-input"
                required
                maxLength={500}
                value={form.reason}
                onChange={(e) => update('reason', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="health-observations">Observaciones</label>
              <textarea
                id="health-observations"
                className="form-textarea"
                rows={2}
                maxLength={500}
                value={form.observations}
                onChange={(e) => update('observations', e.target.value)}
              />
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || (!editing && !selected.length)}
                aria-label={busy ? 'Guardando…' : editing ? 'Guardar corrección de actuación sanitaria' : 'Registrar tratamiento sanitario'}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : editing ? 'Guardar corrección' : 'Registrar tratamiento sanitario'}</span>
                </span>
              </button>

              {editing && (
                <>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || !form.reason.trim()}
                    aria-label="Anular actuación sanitaria seleccionada"
                    onClick={() => setShowAnnulModal(true)}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconAlertTriangle size={15} />
                      <span>Anular actuación</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={busy}
                    aria-label="Cancelar corrección de actuación sanitaria"
                    onClick={() => {
                      setEditing(null);
                      setOperationKey(newOperationKey('sanidad'));
                    }}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconX size={15} />
                      <span>Cancelar</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Modal accesible para confirmar anulación de actuación sanitaria */}
      {showAnnulModal && editing && (
        <ModalDialog
          labelledBy="annul-health-dialog-title"
          onDismiss={() => setShowAnnulModal(false)}
          dismissDisabled={busy}
        >
          <h4 id="annul-health-dialog-title" className="text-lg font-bold mb-2 text-danger">
            Confirmar Anulación de Actuación Sanitaria
          </h4>
          <p className="text-xs text-muted mb-3">
            Está por anular el registro de <strong>{types[editing.eventType] ?? editing.eventType}</strong> (
            {editing.product ?? 'Sin producto'}) para el animal <strong className="font-numeric">{editing.animalCode}</strong>.
          </p>
          <p className="text-xs text-muted mb-4 p-2.5 rounded card-subtle">
            Motivo indicado: <em>"{form.reason}"</em>. El evento quedará marcado como anulado y se preservará en la auditoría clínica.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy}
              aria-label="Cancelar anulación"
              onClick={() => setShowAnnulModal(false)}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconX size={14} />
                <span>Cancelar</span>
              </span>
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              aria-label="Confirmar anulación de actuación sanitaria"
              onClick={async () => {
                setShowAnnulModal(false);
                await save(true);
              }}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconAlertTriangle size={14} />
                <span>{busy ? 'Anulando…' : 'Confirmar Anulación'}</span>
              </span>
            </button>
          </div>
        </ModalDialog>
      )}

      {section === 'registro' && !canWrite && (
        <div className="note-box">
          Este perfil puede consultar el historial sanitario. Solo el veterinario y el administrador pueden registrar actuaciones clínicas.
        </div>
      )}

      {/* Historial Clínico */}
      {section === 'historial' && (
        <section className="card">
          <div className="card-header flex-wrap gap-2 justify-between">
            <div>
              <h2>Historial clínico</h2>
              <p className="text-xs text-muted mt-0.5">
                Registro trazable de eventos sanitarios aplicados en la granja.
              </p>
            </div>
            <div className="inline-flex items-center gap-2">
              {canWrite && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setSection('registro')}
                  aria-label="Registrar nuevo tratamiento"
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Nuevo tratamiento</span>
                  </span>
                </button>
              )}
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={clearFilters}
                  aria-label="Limpiar filtros del historial clínico"
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconX size={14} />
                    <span>Limpiar filtros</span>
                  </span>
                </button>
              )}
            </div>
          </div>

        <div className="grid-3 mb-4">
          <div className="form-group">
            <label className="form-label" htmlFor="health-filter-animal">Animal</label>
            <input
              id="health-filter-animal"
              className="form-input"
              value={filter.animalCode}
              onChange={(e) => setFilter({ ...filter, animalCode: e.target.value })}
              placeholder="Código de arete"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="health-filter-product">Producto</label>
            <input
              id="health-filter-product"
              className="form-input"
              value={filter.product}
              onChange={(e) => setFilter({ ...filter, product: e.target.value })}
              placeholder="Nombre del medicamento"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="health-filter-lot">Lote animal</label>
            <input
              id="health-filter-lot"
              className="form-input"
              value={filter.lotCode}
              onChange={(e) => setFilter({ ...filter, lotCode: e.target.value })}
              placeholder="Lote"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="health-filter-from">Desde</label>
            <input
              id="health-filter-from"
              type="date"
              className="form-input"
              value={filter.from}
              onChange={(e) => setFilter({ ...filter, from: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="health-filter-to">Hasta</label>
            <input
              id="health-filter-to"
              type="date"
              className="form-input"
              value={filter.to}
              onChange={(e) => setFilter({ ...filter, to: e.target.value })}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">Fecha</th>
                <th className="text-left">Evento</th>
                <th className="text-left">Animal</th>
                <th className="text-left">Ubicación</th>
                <th className="text-left">Producto y lote</th>
                <th className="text-right">Dosis</th>
                <th className="text-left">Próxima</th>
                <th className="text-center">Retiro sanitario</th>
                <th className="text-left">Responsable</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row, index) => (
                <tr key={`${row.id}-${row.animalCode}-${index}`}>
                  <td className="text-left tabular-nums font-mono">{row.effectiveDate}</td>
                  <td className="text-left">
                    <span className="badge-status badge-outline text-xs">
                      {types[row.eventType] ?? row.eventType}
                    </span>
                  </td>
                  <td className="text-left">
                    <span className="arete-badge">{row.animalCode}</span>
                  </td>
                  <td className="text-left text-xs text-muted">
                    {row.barnName}
                    {row.locationCode ? ` · ${row.locationCode}` : ''}
                    {row.lotCode ? ` · ${row.lotCode}` : ''} · {row.stageCode}
                  </td>
                  <td className="text-left">
                    <strong>{row.product ?? row.causeCode}</strong>
                    {row.productLot ? <span className="text-xs text-muted tabular-nums font-mono">{` (${row.productLot})`}</span> : ''}
                  </td>
                  <td className="text-right tabular-nums font-mono font-medium">
                    {row.dosage === null ? '—' : `${row.dosage} ${row.dosageUnit}`}
                  </td>
                  <td className="text-left tabular-nums font-mono">{row.nextDueDate ?? '—'}</td>
                  <td className="text-center">
                    {row.withdrawalUntil ? (
                      <span className="badge-status badge-warning text-xs tabular-nums font-mono">{row.withdrawalUntil}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-left text-xs">{row.responsibleName}</td>
                  <td className="text-center">
                    {canWrite && ['treatment', 'deworming', 'other'].includes(row.eventType) && (
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        aria-label={`Corregir actuación sanitaria del animal ${row.animalCode}`}
                        onClick={() => {
                          startCorrection(row);
                          document.getElementById('corregir-sanidad')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconEdit size={12} />
                          <span>Corregir</span>
                        </span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={10} className="p-0">
                    <div className="card empty-state-card m-4">
                      <div className="empty-icon-wrap">
                        <IconActivity size={28} className="text-muted" />
                      </div>
                      <p className="font-semibold text-base">Sin registros en el historial clínico</p>
                      <p className="text-sm text-muted">
                        No se encontraron eventos sanitarios para los filtros seleccionados o el periodo indicado.
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
      </section>
    )}
  </main>
  );
}

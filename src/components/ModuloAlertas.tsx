import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconBell,
  IconCalendar,
  IconCheck,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconX,
} from './icons';
import { ModalDialog } from './ModalDialog';
import { farmToday, fetchOperation } from '../utils/operations';
import type { Perfil } from '../types';

type Barn = { id: number; name: string };
type Alert = {
  id: number;
  key: string;
  type: string;
  sourceType: string;
  sourceId: string;
  dueDate: string;
  bucket: string;
  title: string;
  details: Record<string, unknown>;
  eventLink: string;
  animalCode: string | null;
  barnName: string;
  status: string;
  priority: string;
  resolutionReason: string | null;
};
type Notification = {
  id: number;
  title: string;
  body: string;
  priority: string;
  actionUrl: string;
  createdAt: string;
  readAt: string | null;
  barnName: string | null;
};
type NotificationRecipient = {
  id: number;
  userId: number;
  userName: string;
  role: string;
  transition: string;
  priority: string;
  notifiedAt: string;
  readAt: string | null;
};

const groups = [
  ['vaccine:overdue', 'Vacunaciones vencidas'],
  ['vaccine:today', 'Vacunaciones para hoy'],
  ['vaccine:upcoming', 'Vacunas próximas (7 días)'],
  ['farrowing:overdue', 'Partos retrasados'],
  ['farrowing:today', 'Partos previstos hoy'],
  ['farrowing:upcoming', 'Partos próximos (7 días)'],
] as const;

const labels: Record<string, string> = {
  vaccine: 'Vacunación',
  farrowing: 'Parto de marrana',
  weaning: 'Destete de camada',
  treatment: 'Tratamiento veterinario',
  feeding: 'Alimentación y raciones',
  manual: 'Aviso de granja',
  low_weight: 'Alerta de bajo peso',
  sale_suggestion: 'Lote listo para venta',
  overdue: 'Vencido',
  today: 'Para hoy',
  upcoming: 'Próximos 7 días',
  future: 'Programado posterior',
  undated: 'Sin fecha límite',
  pending: 'Pendiente',
  attended: 'Atendido',
  resolved: 'Resuelto',
};

export function ModuloAlertas({ perfil }: { perfil: Perfil }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [barns, setBarns] = useState<Barn[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recipientHistory, setRecipientHistory] = useState<Record<number, NotificationRecipient[]>>({});
  const [rules, setRules] = useState<{ alertType: string; overdueDays: number; isActive: boolean; roles: string[] }[]>([]);
  const [ruleForm, setRuleForm] = useState({ alertType: 'farrowing', overdueDays: '1', isActive: true, roles: ['responsable', 'veterinario'] });
  const [filter, setFilter] = useState({ type: '', status: 'pending', bucket: '' });
  const [form, setForm] = useState({ title: '', dueDate: farmToday(), barnId: '', animalCode: '', reason: '' });
  const [section, setSection] = useState<'agenda' | 'notificaciones' | 'crear' | 'reglas'>('agenda');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [attendTarget, setAttendTarget] = useState<Alert | null>(null);
  const [attendReason, setAttendReason] = useState('');

  const criticalPendingCount = useMemo(() => {
    return alerts.filter(a => a.priority === 'critical' && a.status === 'pending').length;
  }, [alerts]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter.type) params.set('type', filter.type);
    if (filter.status) params.set('status', filter.status);
    if (filter.bucket) params.set('bucket', filter.bucket);
    const requests = [fetch(`/api/alerts?${params}`), fetch('/api/finance/barns'), fetch('/api/notifications')];
    if (perfil === 'administrador') requests.push(fetch('/api/alerts/rules'));
    const responses = await Promise.all(requests);
    const data = (await Promise.all(responses.map(response => response.json()))) as [
      { alerts?: Alert[]; counts?: Record<string, number>; error?: string },
      { barns?: Barn[]; error?: string },
      { notifications?: Notification[]; unreadCount?: number; error?: string },
      { rules?: typeof rules; error?: string }?,
    ];
    if (responses.some(response => !response.ok)) throw new Error(data.find(item => item?.error)?.error || 'No se pudo cargar la agenda');
    setAlerts(data[0].alerts ?? []);
    setCounts(data[0].counts ?? {});
    setBarns(data[1].barns ?? []);
    setNotifications(data[2].notifications ?? []);
    setUnreadCount(data[2].unreadCount ?? 0);
    if (data[3]?.rules) setRules(data[3].rules);
  }, [filter, perfil]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(reason => setError(reason instanceof Error ? reason.message : 'Error al cargar alertas'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetchOperation('/api/alerts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, barnId: form.barnId || null }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el aviso');
      setForm(old => ({ ...old, title: '', animalCode: '', reason: '' }));
      setNotice('Aviso operativo guardado en la agenda.');
      await load();
      setSection('agenda');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error al guardar el aviso');
    } finally {
      setBusy(false);
    }
  };

  const confirmAttend = async () => {
    if (!attendTarget || !attendReason.trim()) return;
    const alert = attendTarget;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetchOperation(`/api/alerts/${alert.id}/attend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: attendReason.trim(), linkedEventType: alert.sourceType, linkedEventId: alert.sourceId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el aviso');
      await load();
      setNotice('Aviso marcado como atendido; el evento operativo conserva su trazabilidad.');
      setAttendTarget(null);
      setAttendReason('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error al atender el aviso');
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (id: number) => {
    const response = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    if (!response.ok) {
      setError('No se pudo marcar como leída');
      return;
    }
    await load();
  };

  const loadRecipients = async (id: number) => {
    const response = await fetch(`/api/alerts/${id}/notifications`);
    const data = (await response.json()) as { notifications?: NotificationRecipient[]; error?: string };
    if (!response.ok) {
      setError(data.error || 'No se pudo consultar a quién se notificó');
      return;
    }
    setRecipientHistory(current => ({ ...current, [id]: data.notifications ?? [] }));
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/alerts/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ruleForm, overdueDays: Number(ruleForm.overdueDays) }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || 'No se pudo guardar la regla');
      return;
    }
    setNotice('Regla de escalamiento crítico actualizada.');
    await load();
  };

  const isAdmin = perfil === 'administrador';

  return (
    <main className="module-container">
      <div className="module-heading mb-4">
        <p className="text-xs text-muted">
          Agenda operativa de tareas sanitarias, partos programados y avisos de bioseguridad en granja.
        </p>
        <button
          className="btn btn-outline btn-sm"
          type="button"
          aria-label="Actualizar agenda de alertas y notificaciones"
          onClick={() => void load()}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconRefreshCw size={14} />
            <span>Actualizar</span>
          </span>
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert" aria-live="assertive">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={16} />
            <span>{error}</span>
          </span>
        </div>
      )}
      {notice && (
        <div className="alert alert-success" role="status" aria-live="polite">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={16} />
            <span>{notice}</span>
          </span>
        </div>
      )}

      {/* Pestañas SaaS para navegación limpia */}
      <div className="admin-tabs mb-4" role="tablist" aria-label="Secciones de alertas y pendientes">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'agenda'}
          aria-label={`Pestaña Agenda Operativa${criticalPendingCount > 0 ? `, ${criticalPendingCount} avisos críticos` : ''}`}
          className={`btn btn-sm ${section === 'agenda' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('agenda')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCalendar size={14} />
            <span>Agenda Operativa</span>
            {criticalPendingCount > 0 && (
              <span className="badge-status badge-danger tabular-nums ml-1">
                {criticalPendingCount} críticos
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'notificaciones'}
          aria-label={`Pestaña Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}`}
          className={`btn btn-sm ${section === 'notificaciones' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('notificaciones')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBell size={14} />
            <span>Notificaciones</span>
            {unreadCount > 0 && (
              <span className="badge-status badge-warning tabular-nums ml-1">
                {unreadCount}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'crear'}
          aria-label="Pestaña Crear Aviso operativo manual"
          className={`btn btn-sm ${section === 'crear' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('crear')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPlus size={14} />
            <span>Crear Aviso</span>
          </span>
        </button>
        {isAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'reglas'}
            aria-label="Pestaña Reglas de Escalamiento crítico"
            className={`btn btn-sm ${section === 'reglas' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSection('reglas')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconShield size={14} />
              <span>Reglas de Escalamiento</span>
            </span>
          </button>
        )}
      </div>

      {section === 'notificaciones' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>
                Notificaciones operativas{' '}
                <span className={`badge-status ${unreadCount > 0 ? 'badge-warning' : 'badge-outline'} tabular-nums ml-1`}>
                  {unreadCount} sin leer
                </span>
              </h2>
              <p className="text-muted">Leer una notificación no marca la tarea operativa como atendida.</p>
            </div>
          </div>
          {notifications.length === 0 ? (
            <div className="card empty-state-card">
              <div className="empty-icon-wrap">
                <IconBell size={26} className="text-muted" />
              </div>
              <p className="font-semibold text-base">Sin notificaciones pendientes</p>
              <p className="text-sm text-muted">Las notificaciones de tareas vencidas y avisos escalados aparecerán aquí.</p>
            </div>
          ) : (
            <ul className="notification-list">
              {notifications.map(item => (
                <li key={item.id} className={item.readAt ? '' : 'notification-unread'}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <strong>
                        {item.priority === 'critical' ? <span className="badge-status badge-danger mr-1">Crítica</span> : null}
                        {item.title}
                      </strong>
                      <p>{item.body}{item.barnName ? ` · ${item.barnName}` : ''}</p>
                      <small className="tabular-nums text-muted">{item.createdAt}</small>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={item.actionUrl}
                        className="btn btn-outline btn-sm"
                        aria-label={`Abrir actuación para notificación: ${item.title}`}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                          <span>Abrir actuación</span>
                          <IconArrowRight size={12} />
                        </span>
                      </a>
                      {!item.readAt && (
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          aria-label={`Marcar notificación como leída: ${item.title}`}
                          onClick={() => void markRead(item.id)}
                        >
                          <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                            <IconCheck size={14} />
                            <span>Marcar leída</span>
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && section === 'reglas' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Reglas de escalamiento crítico</h2>
              <p className="text-muted">El plazo se cuenta desde la fecha prevista vencida. Los avisos críticos mantienen su tarea pendiente.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={saveRule}>
            <div className="form-group">
              <label className="form-label">Tipo de alerta</label>
              <select className="form-select" value={ruleForm.alertType} onChange={e => setRuleForm({ ...ruleForm, alertType: e.target.value })}>
                {Object.entries(labels)
                  .filter(([key]) => ['vaccine', 'farrowing', 'weaning', 'treatment', 'feeding', 'manual', 'low_weight', 'sale_suggestion'].includes(key))
                  .map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Días vencidos antes de escalar</label>
              <input
                required
                type="number"
                min="0"
                max="3650"
                className="form-input tabular-nums"
                value={ruleForm.overdueDays}
                onChange={e => setRuleForm({ ...ruleForm, overdueDays: e.target.value })}
              />
            </div>
            <label className="checkbox-label form-span-2">
              <input type="checkbox" checked={ruleForm.isActive} onChange={e => setRuleForm({ ...ruleForm, isActive: e.target.checked })} />
              <span>Regla activa</span>
            </label>
            <fieldset className="form-span-2">
              <legend className="form-label font-bold mb-2">Notificar a roles</legend>
              <div className="checkbox-pill-grid">
                {[
                  ['responsable', 'Usuario responsable'],
                  ['operario', 'Operario de granja'],
                  ['veterinario', 'Médico veterinario'],
                  ['administrador', 'Administrador'],
                ].map(([role, label]) => (
                  <label key={role} className="checkbox-pill-label">
                    <input
                      type="checkbox"
                      checked={ruleForm.roles.includes(role)}
                      onChange={e =>
                        setRuleForm(current => ({
                          ...current,
                          roles: e.target.checked ? [...current.roles, role] : current.roles.filter(item => item !== role),
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-span-2 pt-2 border-t border-subtle">
              <button className="btn btn-primary" disabled={busy}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : 'Guardar regla de escalamiento'}</span>
                </span>
              </button>
            </div>
          </form>
          {rules.length > 0 && (
            <ul className="mt-3">
              {rules.map(rule => (
                <li key={rule.alertType} className="text-sm text-muted">
                  <strong>{labels[rule.alertType] ?? rule.alertType}</strong>: {rule.isActive ? `crítica tras ${rule.overdueDays} día(s)` : 'regla inactiva'} · {rule.roles.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === 'crear' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Crear aviso manual de granja</h2>
              <p className="text-muted">Los avisos manuales quedan registrados en el historial con autor, fecha y motivo.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={create}>
            <div className="form-group">
              <label className="form-label" htmlFor="manual-alert-title">Título o tarea</label>
              <input id="manual-alert-title" required maxLength={240} className="form-input" placeholder="ej. Revisar tolva de galpón de destete" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="manual-alert-due-date">Fecha prevista</label>
              <input id="manual-alert-due-date" required type="date" className="form-input tabular-nums" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="manual-alert-barn">Galpón</label>
              <select id="manual-alert-barn" className="form-select" value={form.barnId} onChange={e => setForm({ ...form, barnId: e.target.value })}>
                <option value="">{isAdmin ? 'Granja general' : 'Seleccionar galpón asignado'}</option>
                {barns.map(barn => (
                  <option value={barn.id} key={barn.id}>{barn.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="manual-alert-animal">Animal / Arete (opcional)</label>
              <input id="manual-alert-animal" className="form-input" placeholder="ej. MAR-012 o LEC-045" value={form.animalCode} onChange={e => setForm({ ...form, animalCode: e.target.value })} />
            </div>
            <div className="form-group form-span-2">
              <label className="form-label" htmlFor="manual-alert-reason">Motivo de atención</label>
              <input id="manual-alert-reason" required minLength={5} className="form-input" placeholder="ej. Observación reportada en inspección diaria" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
            </div>
            <div className="form-span-2 pt-2 border-t border-subtle">
              <button className="btn btn-primary" disabled={busy}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconPlus size={16} />
                  <span>{busy ? 'Guardando…' : 'Crear aviso de granja'}</span>
                </span>
              </button>
            </div>
          </form>
        </section>
      )}

      {section === 'agenda' && (
        <>
          {criticalPendingCount > 0 && (
            <div className="alert alert-danger mb-4 flex items-center justify-between flex-wrap gap-2" role="alert" aria-live="assertive">
              <span className="inline-flex items-center justify-center gap-2 leading-none font-bold">
                <IconAlertTriangle size={18} />
                <span>Atención prioritaria: {criticalPendingCount} {criticalPendingCount === 1 ? 'aviso crítico pendiente' : 'avisos críticos pendientes'} en la granja</span>
              </span>
              <span className="text-xs">Requiere intervención inmediata en galpón</span>
            </div>
          )}

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Vacunaciones y partos programados</h2>
                <p className="text-muted">Próximas incluye hoy + 1 hasta hoy + 7 días. Las fechas posteriores permanecen en la agenda general.</p>
              </div>
            </div>
            <div className="stats-grid">
              {groups.map(([key, title]) => (
                <button
                  className="metric-card"
                  type="button"
                  key={key}
                  aria-label={`Filtrar por ${title}: ${counts[key] ?? 0} pendientes`}
                  onClick={() => {
                    const [type, bucket] = key.split(':');
                    setFilter({ type, status: 'pending', bucket });
                  }}
                >
                  <span>{title}</span>
                  <strong className="tabular-nums">{counts[key] ?? 0}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Agenda operativa y avisos</h2>
                <p className="text-muted">Atender un aviso confirma la gestión pero preserva la integridad del evento sanitario o productivo.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSection('crear')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconPlus size={14} />
                  <span>Crear aviso manual</span>
                </span>
              </button>
            </div>
            <div className="filter-row">
              <div className="form-group">
                <label className="form-label text-xs">Tipo</label>
                <select className="form-select form-select-sm" value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value, bucket: '' })}>
                  <option value="">Todos los tipos</option>
                  {Object.entries(labels)
                    .filter(([key]) => ['vaccine', 'farrowing', 'weaning', 'treatment', 'feeding', 'manual', 'low_weight', 'sale_suggestion'].includes(key))
                    .map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label text-xs">Estado</label>
                <select className="form-select form-select-sm" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
                  <option value="pending">Pendientes</option>
                  <option value="attended">Atendidos</option>
                  <option value="resolved">Resueltos</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label text-xs">Fecha prevista</label>
                <select className="form-select form-select-sm" value={filter.bucket} onChange={e => setFilter({ ...filter, bucket: e.target.value })}>
                  <option value="">Todas las fechas</option>
                  <option value="overdue">Vencidos</option>
                  <option value="today">Hoy</option>
                  <option value="upcoming">Próximos 7 días</option>
                  <option value="future">Después de 7 días</option>
                  <option value="undated">Sin fecha límite</option>
                </select>
              </div>
            </div>

            {alerts.length > 0 ? (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-center">Prioridad</th>
                      <th className="text-left">Fecha prevista</th>
                      <th className="text-left">Plazo</th>
                      <th className="text-left">Tipo y tarea</th>
                      <th className="text-left">Animal / Marrana</th>
                      <th className="text-left">Galpón</th>
                      <th className="text-left">Detalle</th>
                      <th className="text-center">Estado</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(alert => (
                      <tr key={alert.key}>
                        <td className="text-center">
                          <span className={`badge-status ${alert.priority === 'critical' ? 'badge-danger' : 'badge-outline'}`}>
                            {alert.priority === 'critical' ? 'Crítica' : 'Normal'}
                          </span>
                        </td>
                        <td className="text-left tabular-nums">{alert.dueDate}</td>
                        <td className="text-left">
                          <span className={`badge-status ${alert.bucket === 'overdue' ? 'badge-danger' : alert.bucket === 'today' ? 'badge-warning' : 'badge-outline'}`}>
                            {labels[alert.bucket] ?? alert.bucket}
                          </span>
                        </td>
                        <td className="text-left">
                          <strong>{labels[alert.type] ?? alert.type}</strong>
                          <div className="text-xs text-muted">{alert.title}</div>
                        </td>
                        <td className="text-left font-bold">{alert.animalCode ?? '—'}</td>
                        <td className="text-left">{alert.barnName}</td>
                        <td className="text-left text-xs">
                          {Object.entries(alert.details)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(' · ') || '—'}
                          {alert.resolutionReason && <div className="text-muted mt-1">Resolución: {alert.resolutionReason}</div>}
                          <div className="mt-1">
                            <a href={alert.eventLink} className="text-primary font-semibold">
                              Ver evento original
                            </a>
                          </div>
                        </td>
                        <td className="text-center">
                          <span className={`badge-status ${alert.status === 'pending' ? 'badge-warning' : alert.status === 'attended' ? 'badge-info' : 'badge-success'}`}>
                            {labels[alert.status] ?? alert.status}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="inline-flex items-center justify-center gap-2 flex-wrap">
                            {alert.status === 'pending' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  setAttendTarget(alert);
                                }}
                              >
                                <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                                  <IconCheck size={14} />
                                  <span>Atender</span>
                                </span>
                              </button>
                            )}
                            {alert.priority === 'critical' && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                aria-label={`Ver destinatarios notificados para alerta #${alert.id}`}
                                onClick={() => void loadRecipients(alert.id)}
                              >
                                <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                                  <IconBell size={12} />
                                  <span>Destinatarios</span>
                                </span>
                              </button>
                            )}
                          </div>
                          {recipientHistory[alert.id]?.map(recipient => (
                            <div key={recipient.id} className="text-xs text-muted mt-1">
                              {recipient.userName} ({recipient.role}) · {recipient.notifiedAt}
                              {recipient.readAt ? ` · leída ${recipient.readAt}` : ''}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card empty-state-card mt-3">
                <div className="empty-icon-wrap">
                  <IconCheck size={28} className="text-success" />
                </div>
                <p className="font-semibold text-base">Agenda operativa al día</p>
                <p className="text-sm text-muted">
                  No hay tareas ni avisos pendientes para los filtros y fechas seleccionadas.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-3"
                  onClick={() => setSection('crear')}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Registrar nuevo aviso</span>
                  </span>
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {attendTarget && (
        <ModalDialog
          labelledBy="alert-attend-dialog-title"
          onDismiss={() => {
            setAttendTarget(null);
            setAttendReason('');
          }}
          dismissDisabled={busy}
        >
          <h4 id="alert-attend-dialog-title" className="text-lg font-bold mb-2">
            Marcar Aviso como Atendido
          </h4>
          <p className="text-sm text-muted mb-3">
            <strong>{attendTarget.title}</strong>
            {attendTarget.animalCode ? ` · Animal: ${attendTarget.animalCode}` : ''}
            {attendTarget.barnName ? ` · ${attendTarget.barnName}` : ''}
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              void confirmAttend();
            }}
          >
            <div className="form-group mb-4">
              <label className="form-label text-sm" htmlFor="alert-modal-reason">
                Motivo o detalle de atención en galpón:
              </label>
              <input
                id="alert-modal-reason"
                className="form-input"
                value={attendReason}
                onChange={e => setAttendReason(e.target.value)}
                placeholder="ej. Tarea verificada y ejecutada en galpón"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={() => {
                  setAttendTarget(null);
                  setAttendReason('');
                }}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconX size={14} />
                  <span>Cancelar</span>
                </span>
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !attendReason.trim()}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : 'Marcar como atendido'}</span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}
    </main>
  );
}

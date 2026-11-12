import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { ModuleTabs } from './ModuleTabs';
import { Pagination } from './Pagination';
import { DataState } from './DataState';
import { farmToday, fetchOperation } from '../utils/operations';
import { errorMessage, pluralize } from '../utils/format';
import {
  PageHeader,
  InlineAlert,
  StatusBadge,
  SectionCard,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardNote,
  DataCardActions,
  FormField,
} from './ui';
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
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(alerts.length / pageSize) - 1));
  const visibleAlerts = alerts.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
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
    setPage(0);
    setCounts(data[0].counts ?? {});
    setBarns(data[1].barns ?? []);
    setNotifications(data[2].notifications ?? []);
    setUnreadCount(data[2].unreadCount ?? 0);
    if (data[3]?.rules) setRules(data[3].rules);
  }, [filter, perfil]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(reason => setError(errorMessage(reason, 'Error al cargar alertas')));
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
      setError(errorMessage(reason, 'Error al guardar el aviso'));
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
      setError(errorMessage(reason, 'Error al atender el aviso'));
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
      <PageHeader
        title="Alertas y Pendientes"
        subtitle="Agenda operativa de tareas sanitarias, partos programados y avisos de bioseguridad en granja."
        actions={
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
        }
      />

      {error && !attendTarget && (
        <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>
      )}
      {notice && (
        <InlineAlert tone="success" onDismiss={() => setNotice('')} autoDismissMs={6000}>{notice}</InlineAlert>
      )}

      <ModuleTabs
        label="Secciones de alertas y pendientes"
        active={section}
        onChange={setSection}
        columns={2}
        tabs={[
          { id: 'agenda', label: 'Agenda Operativa', icon: <IconCalendar size={14} />, count: criticalPendingCount, ariaLabel: `Pestaña Agenda Operativa${criticalPendingCount > 0 ? `, ${criticalPendingCount} avisos críticos` : ''}` },
          { id: 'notificaciones', label: 'Notificaciones', icon: <IconBell size={14} />, count: unreadCount, ariaLabel: `Pestaña Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}` },
          { id: 'crear', label: 'Crear Aviso', icon: <IconPlus size={14} />, ariaLabel: 'Pestaña Crear Aviso operativo manual' },
          ...(isAdmin ? [{ id: 'reglas', label: 'Reglas de Escalamiento', icon: <IconShield size={14} />, ariaLabel: 'Pestaña Reglas de Escalamiento crítico' }] : []),
        ]}
      />

      {section === 'notificaciones' && (
        <SectionCard
          title="Notificaciones operativas"
          subtitle="Leer una notificación no marca la tarea operativa como atendida."
          actions={
            <StatusBadge tone={unreadCount > 0 ? 'warning' : 'outline'} className="tabular-nums">
              {unreadCount} sin leer
            </StatusBadge>
          }
        >
          {notifications.length === 0 ? (
            <DataState
              variant="empty"
              title="Sin notificaciones pendientes"
              description="Las notificaciones de tareas vencidas y avisos escalados aparecerán aquí."
              icon={<IconBell size={26} className="text-muted" />}
            />
          ) : (
            <DataCardList label="Notificaciones operativas">
              {notifications.map(item => (
                <DataCard key={item.id} state={item.readAt ? 'inactive' : 'active'}>
                  <DataCardHead
                    title={item.title}
                    badge={item.priority === 'critical' ? <StatusBadge tone="danger">Crítica</StatusBadge> : undefined}
                  />
                  <p>{item.body}{item.barnName ? ` · ${item.barnName}` : ''}</p>
                  <small className="tabular-nums text-muted">{item.createdAt}</small>
                  <DataCardActions>
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
                  </DataCardActions>
                </DataCard>
              ))}
            </DataCardList>
          )}
        </SectionCard>
      )}

      {isAdmin && section === 'reglas' && (
        <SectionCard
          title="Reglas de escalamiento crítico"
          subtitle="El plazo se cuenta desde la fecha prevista vencida. Los avisos críticos mantienen su tarea pendiente."
        >
          <form className="form-grid" onSubmit={saveRule}>
            <FormField label="Tipo de alerta">
              <select className="form-select" value={ruleForm.alertType} onChange={e => setRuleForm({ ...ruleForm, alertType: e.target.value })}>
                {Object.entries(labels)
                  .filter(([key]) => ['vaccine', 'farrowing', 'weaning', 'treatment', 'feeding', 'manual', 'low_weight', 'sale_suggestion'].includes(key))
                  .map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
              </select>
            </FormField>
            <FormField label="Días vencidos antes de escalar">
              <input
                required
                type="number"
                min="0"
                max="3650"
                className="form-input tabular-nums"
                value={ruleForm.overdueDays}
                onChange={e => setRuleForm({ ...ruleForm, overdueDays: e.target.value })}
              />
            </FormField>
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
            <div className="mt-3">
              <DataCardList label="Reglas de escalamiento" grid>
                {rules.map(rule => (
                  <DataCard key={rule.alertType} state={rule.isActive ? 'active' : 'inactive'}>
                    <DataCardHead
                      title={labels[rule.alertType] ?? rule.alertType}
                      badge={<StatusBadge tone={rule.isActive ? 'success' : 'outline'}>{rule.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Escalar tras', value: `${rule.overdueDays} día(s) vencidos` },
                      { label: 'Destinatarios', value: rule.roles.join(', ') },
                    ]} />
                    <DataCardActions>
                      <button type="button" className="btn btn-outline" onClick={() => setRuleForm({ ...rule, overdueDays: String(rule.overdueDays) })}><IconShield size={14} /><span>Editar regla</span></button>
                    </DataCardActions>
                  </DataCard>
                ))}
              </DataCardList>
            </div>
          )}
        </SectionCard>
      )}

      {section === 'crear' && (
        <SectionCard
          title="Crear aviso manual de granja"
          subtitle="Los avisos manuales quedan registrados en el historial con autor, fecha y motivo."
        >
          <form className="form-stack" onSubmit={create}>
            <div className="form-sections">
            <fieldset className="form-section">
              <legend>Tarea y fecha</legend>
              <div className="form-grid">
            <FormField label="Título o tarea" htmlFor="manual-alert-title">
              <input id="manual-alert-title" required maxLength={240} className="form-input" placeholder="ej. Revisar tolva de galpón de destete" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </FormField>
            <FormField label="Fecha prevista" htmlFor="manual-alert-due-date">
              <input id="manual-alert-due-date" required type="date" className="form-input tabular-nums" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </FormField>
              </div>
            </fieldset>
            <fieldset className="form-section">
              <legend>Destino y motivo</legend>
              <div className="form-grid">
            <FormField label="Galpón" htmlFor="manual-alert-barn">
              <select id="manual-alert-barn" className="form-select" value={form.barnId} onChange={e => setForm({ ...form, barnId: e.target.value })}>
                <option value="">{isAdmin ? 'Granja general' : 'Seleccionar galpón asignado'}</option>
                {barns.map(barn => (
                  <option value={barn.id} key={barn.id}>{barn.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Animal / Arete (opcional)" htmlFor="manual-alert-animal">
              <input id="manual-alert-animal" className="form-input" placeholder="ej. MAR-012 o LEC-045" value={form.animalCode} onChange={e => setForm({ ...form, animalCode: e.target.value })} />
            </FormField>
            <FormField label="Motivo de atención" htmlFor="manual-alert-reason" className="form-span-2">
              <input id="manual-alert-reason" required minLength={5} className="form-input" placeholder="ej. Observación reportada en inspección diaria" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
            </FormField>
              </div>
            </fieldset>
            </div>
            <div className="form-actions form-actions-sticky">
              <button className="btn btn-primary" disabled={busy}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconPlus size={16} />
                  <span>{busy ? 'Guardando…' : 'Crear aviso de granja'}</span>
                </span>
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {section === 'agenda' && (
        <>
          {criticalPendingCount > 0 && (
            <InlineAlert tone="error">
              <strong>Atención prioritaria: {pluralize(criticalPendingCount, 'aviso crítico pendiente', 'avisos críticos pendientes')} en la granja</strong>
              <span className="text-xs" style={{ display: 'block' }}>Requiere intervención inmediata en galpón</span>
            </InlineAlert>
          )}

          <SectionCard
            title="Vacunaciones y partos programados"
            subtitle="Próximas incluye hoy + 1 hasta hoy + 7 días. Las fechas posteriores permanecen en la agenda general."
          >
            <div className="report-metrics">
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
          </SectionCard>

          <SectionCard
            title="Agenda operativa y avisos"
            subtitle="Atender un aviso confirma la gestión pero preserva la integridad del evento sanitario o productivo."
            actions={
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
            }
          >
            <div className="filter-row">
              <FormField label="Tipo" labelClassName="text-xs">
                <select className="form-select form-select-sm" value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value, bucket: '' })}>
                  <option value="">Todos los tipos</option>
                  {Object.entries(labels)
                    .filter(([key]) => ['vaccine', 'farrowing', 'weaning', 'treatment', 'feeding', 'manual', 'low_weight', 'sale_suggestion'].includes(key))
                    .map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                </select>
              </FormField>
              <FormField label="Estado" labelClassName="text-xs">
                <select className="form-select form-select-sm" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
                  <option value="pending">Pendientes</option>
                  <option value="attended">Atendidos</option>
                  <option value="resolved">Resueltos</option>
                </select>
              </FormField>
              <FormField label="Fecha prevista" labelClassName="text-xs">
                <select className="form-select form-select-sm" value={filter.bucket} onChange={e => setFilter({ ...filter, bucket: e.target.value })}>
                  <option value="">Todas las fechas</option>
                  <option value="overdue">Vencidos</option>
                  <option value="today">Hoy</option>
                  <option value="upcoming">Próximos 7 días</option>
                  <option value="future">Después de 7 días</option>
                  <option value="undated">Sin fecha límite</option>
                </select>
              </FormField>
            </div>

            {alerts.length > 0 ? (
              <DataCardList label="Agenda operativa y avisos" grid>
                {visibleAlerts.map(alert => (
                  <DataCard key={alert.key} state={alert.status === 'pending' ? 'active' : 'inactive'}>
                    <DataCardHead
                      title={alert.title}
                      subtitle={`${labels[alert.type] ?? alert.type} · ${alert.barnName}`}
                      badge={
                        <StatusBadge tone={alert.priority === 'critical' ? 'danger' : 'outline'}>
                          {alert.priority === 'critical' ? 'Crítica' : 'Normal'}
                        </StatusBadge>
                      }
                    />
                    <DataCardMeta items={[
                      { label: 'Fecha prevista', value: alert.dueDate, className: 'font-mono tabular-nums' },
                      {
                        label: 'Plazo',
                        value: (
                          <StatusBadge tone={alert.bucket === 'overdue' ? 'danger' : alert.bucket === 'today' ? 'warning' : 'outline'}>
                            {labels[alert.bucket] ?? alert.bucket}
                          </StatusBadge>
                        ),
                      },
                      { label: 'Animal / Marrana', value: alert.animalCode ?? 'Sin animal' },
                      {
                        label: 'Estado',
                        value: (
                          <StatusBadge tone={alert.status === 'pending' ? 'warning' : alert.status === 'attended' ? 'info' : 'success'}>
                            {labels[alert.status] ?? alert.status}
                          </StatusBadge>
                        ),
                      },
                    ]} />
                    <DataCardNote>
                      {Object.entries(alert.details)
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(' · ') || '—'}
                    </DataCardNote>
                    {alert.resolutionReason && <DataCardNote>Resolución: {alert.resolutionReason}</DataCardNote>}
                    <DataCardActions>
                      <a href={alert.eventLink} className="btn btn-outline"><IconArrowRight size={14} /><span>Ver evento original</span></a>
                      {alert.status === 'pending' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => {
                            setError('');
                            setAttendReason('');
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
                    </DataCardActions>
                    {recipientHistory[alert.id]?.map(recipient => (
                      <div key={recipient.id} className="text-xs text-muted mt-1">
                        {recipient.userName} ({recipient.role}) · {recipient.notifiedAt}
                        {recipient.readAt ? ` · leída ${recipient.readAt}` : ''}
                      </div>
                    ))}
                  </DataCard>
                ))}
              </DataCardList>
            ) : (
              /* Sin DataState: su role="status" chocaría con el aviso de éxito del módulo (e2e usa getByRole('status')) */
              <div className="card empty-state-card mt-3">
                <div className="empty-icon-wrap" aria-hidden="true">
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
            <Pagination page={currentPage} pageSize={pageSize} total={alerts.length} loading={busy} onPage={setPage} navLabel="Paginación de la agenda" prevLabel="Página anterior de avisos" nextLabel="Página siguiente de avisos" unit="avisos" />
          </SectionCard>
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
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
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
            <FormField label="Motivo o detalle de atención en galpón:" htmlFor="alert-modal-reason" className="mb-4" labelClassName="text-sm">
              <input
                id="alert-modal-reason"
                className="form-input"
                value={attendReason}
                onChange={e => setAttendReason(e.target.value)}
                placeholder="ej. Tarea verificada y ejecutada en galpón"
                required
                autoFocus
              />
            </FormField>
            <div className="form-actions form-actions-sticky">
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

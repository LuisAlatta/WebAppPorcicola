import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconArrowRight,
  IconBarChart,
  IconCheck,
  IconDownload,
  IconPlus,
  IconRefreshCw,
  IconX,
} from './icons';
import type { Perfil } from '../types';
import { generarReportePdf } from '../utils/exportPdf';
import { generarReporteXlsx } from '../utils/exportXlsx';
import { fetchOperation } from '../utils/operations';
import { errorMessage, money } from '../utils/format';
import { InformesProductivos } from './InformesProductivos';
import { ModuleTabs } from './ModuleTabs';
import { DataState } from './DataState';
import {
  PageHeader,
  InlineAlert,
  KpiCard,
  StatusBadge,
  SectionCard,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardNote,
  DataCardActions,
  FilterChipRow,
  FilterChip,
  DataTable,
  FormField,
} from './ui';

type Barn = { id: number; name: string };
type Field = { key: string; label: string; dataType: 'text' | 'date' | 'number' | 'money' | 'percent'; unit?: string; filterable: boolean };
type Source = { id: string; label: string; grain: string; availableForBuilder: boolean; fields: Field[] };
type Def = { id: string; name: string; purpose: string; definition: Record<string, unknown> };
type Preview = {
  moneyTotals: Record<string, { income: number; expense: number; balance: number }>;
  definition: {
    source: string;
    name?: string;
    purpose?: string;
    from?: string;
    to?: string;
    barnId?: number | string;
    filters?: Record<string, string>;
    columns: string[];
  };
  asOf: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  groups: Record<string, { count: number; sum: number; average: number | null; income: number; expense: number; balance: number }>;
  totals: Record<string, number | null>;
  truncated: boolean;
};
type Dashboard = {
  asOf: string;
  period: { from: string | null; to: string | null };
  barnsIncluded: string | number;
  totalAnimals: number;
  identifiedAnimals: number;
  unidentifiedAnimals: number;
  animalsByType: { type: string; total: number }[];
  barnCount: number;
  pendingVaccines: number;
  upcomingFarrowings: number;
  sales: { month: string; currency: string; amountMinor: number }[];
  feedCosts: { month: string; currency: string; costMinor: number; count: number }[];
};

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const reportFilters: Record<string, string[]> = {
  animals: ['lot', 'stage', 'status', 'animalCode'],
  barns: ['barnId'],
  inventory: ['barnId', 'lot', 'stage'],
  movements: ['barnId', 'lot', 'movementType'],
  weights: ['barnId', 'lot', 'stage', 'animalCode'],
  reproduction: ['barnId', 'animalCode', 'eventType'],
  litters: ['barnId', 'lot', 'motherCode'],
  feeding: ['barnId', 'feed'],
  health: ['barnId', 'animalCode', 'eventType', 'product'],
  vaccines: ['barnId', 'lot', 'status', 'animalCode'],
  alerts: ['barnId', 'type', 'status'],
  trade: ['barnId', 'direction', 'animalCode'],
  supplies: ['barnId', 'supply', 'movementType'],
  finance: ['barnId', 'direction', 'category', 'currency'],
  cashflow: ['barnId', 'direction', 'category', 'currency'],
  economics: ['barnId', 'currency'],
  overview: ['barnId', 'currency'],
  staff: ['barnId', 'role', 'username'],
};

const presets: Record<Perfil, { source: string; name: string; purpose: string; columns: string[]; groupBy: string }> = {
  responsable: {
    source: 'finance',
    name: 'Ingresos y egresos por galpón',
    purpose: 'Comparar ingresos, egresos y balance mensual por galpón',
    columns: ['operationDate', 'direction', 'category', 'barn', 'currency', 'amount'],
    groupBy: 'barn',
  },
  operario: {
    source: 'animals',
    name: 'Animales por lote y último peso',
    purpose: 'Revisar los animales de cada lote y su peso más reciente',
    columns: ['animalCode', 'lot', 'stage', 'currentWeightKg', 'barn'],
    groupBy: 'lot',
  },
  veterinario: {
    source: 'vaccines',
    name: 'Vacunas pendientes por animal',
    purpose: 'Programar trabajo sanitario por fecha y galpón',
    columns: ['scheduledDate', 'animalCode', 'vaccine', 'barn', 'location', 'lot'],
    groupBy: 'scheduledDate',
  },
  administrador: {
    source: 'finance',
    name: 'Ingresos y egresos por galpón',
    purpose: 'Comparar ingresos, egresos y balance mensual',
    columns: ['operationDate', 'direction', 'category', 'barn', 'currency', 'amount'],
    groupBy: 'barn,month',
  },
};

export function ModuloReportes({ perfil }: { perfil: Perfil }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [barns, setBarns] = useState<Barn[]>([]);
  const [selectedBarn, setSelectedBarn] = useState('');
  const [saved, setSaved] = useState<Def[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  const [source, setSource] = useState('animals');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [columns, setColumns] = useState<string[]>(['animalCode', 'animalType', 'sex', 'status', 'barn']);
  const [groupBy, setGroupBy] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterKey, setFilterKey] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [section, setSection] = useState<'panel' | 'productivos' | 'crear' | 'guardados'>('panel');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeSource = sources.find(s => s.id === source);

  const load = useCallback(async () => {
    setError('');
    try {
      const [cat, defs, panel, barnResponse] = await Promise.all([
        fetch('/api/reports/catalog'),
        fetch('/api/reports/definitions'),
        fetch(`/api/reports/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        fetch('/api/finance/barns'),
      ]);
      const [c, d, p, b] = (await Promise.all([cat.json(), defs.json(), panel.json(), barnResponse.json()])) as [
        { sources: Source[]; error?: string },
        { definitions: Def[]; error?: string },
        { error?: string } & Dashboard,
        { barns: Barn[]; error?: string },
      ];
      if (!cat.ok || !defs.ok || !panel.ok || !barnResponse.ok) throw new Error(c.error || d.error || p.error || b.error || 'No se pudieron cargar los reportes');
      setSources(c.sources);
      setSaved(d.definitions);
      setDashboard(p);
      setBarns(b.barns);
      if (!c.sources.some(s => s.id === source && s.availableForBuilder)) {
        const first = c.sources.find(s => s.availableForBuilder);
        if (first) setSource(first.id);
      }
    } catch (e) {
      setError(errorMessage(e, 'Error cargando reportes'));
    }
  }, [from, to, source]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (definition?: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const chosen = definition ?? {
        source,
        name,
        purpose,
        from,
        to,
        columns,
        groupBy: groupBy || undefined,
        orderBy: orderBy || undefined,
        orderDirection,
        barnId: selectedBarn || undefined,
        filters,
      };
      const response = await fetch('/api/reports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chosen),
      });
      const data = (await response.json()) as Preview & { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo generar la vista previa');
      setPreview(data);
      setNotice(`Vista actualizada desde D1 · ${data.asOf}. ${data.truncated ? 'Se muestran hasta 500 filas.' : ''}`);
    } catch (e) {
      setError(errorMessage(e, 'Error generando reporte'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        source,
        name,
        purpose,
        from,
        to,
        columns,
        groupBy: groupBy || undefined,
        orderBy: orderBy || undefined,
        orderDirection,
        barnId: selectedBarn || undefined,
        filters,
      };
      const response = await fetchOperation(editing ? `/api/reports/definitions/${encodeURIComponent(editing)}` : '/api/reports/definitions', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      setNotice(editing ? 'Informe actualizado.' : 'Informe guardado para tu usuario.');
      setEditing(null);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Error al guardar'));
    } finally {
      setBusy(false);
    }
  };

  const currencyTotals = useMemo(() => {
    const rows = dashboard?.sales ?? [];
    return rows.map(item => ({
      ...item,
      value: money(item.amountMinor, item.currency),
    }));
  }, [dashboard]);

  const reportSourceHref = (row: Record<string, unknown>) => {
    const code = row.animalCode ?? row.motherCode;
    if (code) return `/animal/${encodeURIComponent(String(code))}`;
    const routes: Record<string, string> = {
      finance: '/finanzas',
      cashflow: '/finanzas',
      trade: '/finanzas',
      supplies: '/alimentacion',
      feeding: '/alimentacion',
      health: '/sanidad',
      vaccines: '/sanidad',
      alerts: '/alertas',
      inventory: '/inventario',
      movements: '/inventario',
      reproduction: '/reproduccion',
      litters: '/reproduccion',
      weights: '/animales',
      animals: '/animales',
      barns: '/administracion',
      staff: '/administracion',
    };
    return routes[source] ?? '/reportes';
  };

  const openSaved = async (id: string) => {
    const response = await fetch(`/api/reports/definitions/${encodeURIComponent(id)}`);
    const data = (await response.json()) as { definition: Record<string, unknown>; name: string; purpose: string; error?: string };
    if (!response.ok) {
      setError(data.error || 'No se pudo abrir el informe');
      return;
    }
    setEditing(id);
    setSource(String(data.definition.source));
    setName(data.name);
    setPurpose(data.purpose);
    setFrom(String(data.definition.from ?? ''));
    setTo(String(data.definition.to ?? ''));
    setColumns(data.definition.columns as string[]);
    setGroupBy(String(data.definition.groupBy ?? ''));
    const appliedFilters = data.definition.filters as Record<string, string> | undefined;
    setFilters(appliedFilters ?? {});
    setSelectedBarn(String(data.definition.barnId ?? ''));
    setFilterKey('');
    setFilterValue('');
    setSection('crear');
    void run(data.definition);
  };

  const addFilter = () => {
    if (filterKey && filterValue.trim()) {
      setFilters(old => ({ ...old, [filterKey]: filterValue.trim() }));
    }
    setFilterKey('');
    setFilterValue('');
  };

  const duplicate = async (id: string) => {
    setError('');
    try {
      const response = await fetchOperation(`/api/reports/definitions/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo duplicar');
      setNotice('Informe duplicado.');
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Error al duplicar'));
    }
  };

  const makePreset = () => {
    const p = presets[perfil];
    setSource(p.source);
    setName(p.name);
    setPurpose(p.purpose);
    setColumns(p.columns);
    setGroupBy(p.groupBy);
    setFilters({});
    setFilterKey('');
    setFilterValue('');
    setSection('crear');
    setTimeout(() => void run({ ...p, from, to }), 0);
  };

  const exportReport = async (format: 'pdf' | 'xlsx', share = false) => {
    if (!preview) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: { ...preview.definition, name: preview.definition.name ?? name, purpose: preview.definition.purpose ?? purpose } }),
      });
      const data = (await response.json()) as Preview & { error?: string; farmName?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo preparar el informe completo');
      const fileColumns = data.definition.columns.map(key => {
        const field = sources.find(item => item.id === data.definition.source)?.fields.find(item => item.key === key);
        return { key, label: field?.label ?? key, dataType: field?.dataType ?? 'text', unit: field?.unit };
      });
      const generatedAt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date());
      const options = {
        title: data.definition.name || 'Reporte de granja',
        purpose: data.definition.purpose || 'Informe de gestión porcina',
        generatedAt,
        from: data.definition.from,
        to: data.definition.to,
        asOf: data.asOf,
        filters: {
          ...data.definition.filters,
          Galpón: data.definition.barnId ? (barns.find(barn => String(barn.id) === String(data.definition.barnId))?.name ?? String(data.definition.barnId)) : 'Todos los asignados',
        },
        columns: fileColumns,
        rows: data.rows,
        totals: data.totals,
        moneyTotals: data.moneyTotals,
      };
      const bytes = format === 'pdf' ? await generarReportePdf({ ...options, farm: data.farmName ?? 'Granja' }) : generarReporteXlsx({ ...options, sheetName: options.title });
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const extension = format === 'pdf' ? 'pdf' : 'xlsx';
      const fileName = `${options.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'reporte'}.${extension}`;
      const file = new File([new Uint8Array(bytes).buffer as ArrayBuffer], fileName, { type: mime });
      if (share) {
        if (!navigator.canShare?.({ files: [file] }) || !navigator.share) throw new Error('El dispositivo no admite compartir este archivo. Usa Descargar PDF o Descargar Excel.');
        await navigator.share({ files: [file], title: options.title });
        setNotice(`Informe completo (${data.rows.length} filas) compartido.`);
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        setNotice(`Informe completo (${data.rows.length} filas) descargado.`);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(share ? 'No se pudo compartir el archivo. Usa Descargar PDF o Descargar Excel.' : errorMessage(e, 'Error al exportar'));
    } finally {
      setBusy(false);
    }
  };

  const isNumericColumn = (key: string) => {
    const field = activeSource?.fields.find(f => f.key === key);
    return field?.dataType === 'number' || field?.dataType === 'money' || field?.dataType === 'percent';
  };

  return (
    <main className="module-container">
      <PageHeader
        title="Reportes y Estadísticas"
        subtitle="Indicadores de producción porcina, balance económico y reportes exportables en soles (PEN S/)."
        actions={
          <button
            className="btn btn-outline btn-sm"
            aria-label="Actualizar datos y catálogos de reportes"
            onClick={() => void load()}
            type="button"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar datos</span>
            </span>
          </button>
        }
      />

      {error && <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>}
      {notice && <InlineAlert tone="success" onDismiss={() => setNotice('')} autoDismissMs={6000}>{notice}</InlineAlert>}

      <ModuleTabs
        label="Secciones de reportes"
        active={section}
        onChange={setSection}
        columns={2}
        tabs={[
          { id: 'panel', label: 'Panel general', ariaLabel: 'Pestaña Panel General de estadísticas e indicadores', icon: <IconBarChart size={14} /> },
          { id: 'productivos', label: 'Informes productivos (pesos y partos)', ariaLabel: 'Pestaña Informes Productivos: pesajes, partos y camadas', icon: <IconBarChart size={14} /> },
          { id: 'crear', label: 'Diseñar reporte', ariaLabel: 'Pestaña Diseñar Reporte: constructor personalizado de informes', icon: <IconPlus size={14} /> },
          { id: 'guardados', label: 'Informes guardados', count: saved.length, ariaLabel: `Pestaña Informes Guardados: ${saved.length} plantillas disponibles`, icon: <IconCheck size={14} /> },
        ]}
      />

      {section === 'productivos' && <InformesProductivos barns={barns} />}

      {section === 'panel' && (
        <>
          <section className="card">
            <div className="filter-row items-end">
              <FormField label="Desde" labelClassName="text-xs">
                <input className="form-input form-input-sm tabular-nums" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </FormField>
              <FormField label="Hasta" labelClassName="text-xs">
                <input className="form-input form-input-sm tabular-nums" type="date" value={to} onChange={e => setTo(e.target.value)} />
              </FormField>
              <button
                className="btn btn-primary"
                aria-label="Consultar periodo seleccionado en panel"
                onClick={() => void load()}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconRefreshCw size={14} />
                  <span>Consultar periodo</span>
                </span>
              </button>
            </div>
            <p className="text-muted mt-2 text-xs">
              Datos al {dashboard?.asOf ?? '—'} · Periodo {from || 'inicio'} a {to || 'hoy'} · Galpones: {dashboard?.barnsIncluded ?? '—'} · Moneda financiera: PEN (S/).
            </p>
          </section>

          {/* Se conserva .metric-card: los e2e localizan estos indicadores por esa clase */}
          <div className="report-metrics">
            {[
              ['Cabezas en inventario', dashboard?.totalAnimals],
              ['Animales identificados', dashboard?.identifiedAnimals],
              ['Pendientes de identificar', dashboard?.unidentifiedAnimals],
              ['Galpones de granja', dashboard?.barnCount],
              ['Vacunas pendientes al corte', dashboard?.pendingVaccines],
              ['Partos próximos (7 días)', dashboard?.upcomingFarrowings],
            ].map(([label, value]) => (
              <div className="metric-card" key={String(label)}>
                <span>{label}</span>
                <strong className="font-numeric tabular-nums">{value ?? '—'}</strong>
              </div>
            ))}
          </div>

          <SectionCard title="Población de animales por tipo">
            {dashboard && (dashboard.animalsByType.length ? (
              <DataCardList label="Población por tipo" grid>
                {dashboard.animalsByType.map(row => (
                  <DataCard key={row.type}>
                    <DataCardHead
                      title={row.type}
                      badge={<StatusBadge tone="primary" className="font-numeric tabular-nums">{row.total} animales</StatusBadge>}
                    />
                  </DataCard>
                ))}
              </DataCardList>
            ) : <DataState variant="empty" title="Sin población para el alcance seleccionado" />)}
            <div className="report-bars">
              {dashboard?.animalsByType.map(row => (
                <label key={row.type}>
                  <span>{row.type}</span>
                  <progress aria-label={`Población ${row.type}`} max={Math.max(1, ...(dashboard?.animalsByType.map(item => item.total) ?? []))} value={row.total} />
                  <strong className="tabular-nums">{row.total}</strong>
                </label>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Ventas por mes y moneda">
            {dashboard && (currencyTotals.length ? (
              <DataCardList label="Ventas por mes y moneda" grid>
                {currencyTotals.map((row, i) => (
                  <DataCard key={`${row.month}-${row.currency}-${i}`}>
                    <DataCardHead
                      title={<span className="font-numeric">{row.month}</span>}
                      badge={<StatusBadge tone="outline">{row.currency}</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Total ventas', value: row.value, className: 'font-mono tabular-nums' },
                    ]} />
                  </DataCard>
                ))}
              </DataCardList>
            ) : <DataState variant="empty" title="Sin ventas registradas en el periodo." />)}
            <div className="report-bars">
              {currencyTotals.map(row => {
                const max = Math.max(1, ...currencyTotals.filter(item => item.currency === row.currency).map(item => item.amountMinor));
                return (
                  <label key={`${row.month}-${row.currency}`}>
                    <span>{row.month} · {row.currency}</span>
                    <progress aria-label={`Ventas ${row.month} ${row.currency}`} max={max} value={row.amountMinor} />
                    <strong className="tabular-nums">{row.value}</strong>
                  </label>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Costo de raciones y alimentación">
            {dashboard && (dashboard.feedCosts.length ? (
              <DataCardList label="Costos de alimentación por mes y moneda" grid>
                {dashboard.feedCosts.map(row => (
                  <DataCard key={`${row.month}-${row.currency}`}>
                    <DataCardHead
                      title={<span className="font-numeric">{row.month}</span>}
                      badge={<StatusBadge tone="outline">{row.currency}</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Raciones entregadas', value: row.count, className: 'font-mono tabular-nums' },
                      { label: 'Costo total', value: money(row.costMinor, row.currency), className: 'font-mono tabular-nums' },
                    ]} />
                  </DataCard>
                ))}
              </DataCardList>
            ) : <DataState variant="empty" title="Sin entregas de alimento con costo en el periodo." />)}
            <div className="report-bars">
              {dashboard?.feedCosts.map(row => {
                const max = Math.max(1, ...(dashboard?.feedCosts.filter(item => item.currency === row.currency).map(item => item.costMinor) ?? []));
                return (
                  <label key={`${row.month}-${row.currency}`}>
                    <span>{row.month} · {row.currency}</span>
                    <progress aria-label={`Costo de alimentación ${row.month} ${row.currency}`} max={max} value={row.costMinor} />
                    <strong className="tabular-nums">{money(row.costMinor, row.currency)}</strong>
                  </label>
                );
              })}
            </div>
          </SectionCard>
        </>
      )}

      {section === 'crear' && (
        <>
          <SectionCard
            title="Diseñar reporte personalizado"
            subtitle={`${activeSource?.grain ?? ''}. La vista previa limita la respuesta a 500 filas; las descargas consultan el conjunto completo.`}
            actions={
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Cargar plantilla recomendada para mi perfil"
                onClick={makePreset}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconBarChart size={14} />
                  <span>Usar plantilla de mi perfil</span>
                </span>
              </button>
            }
          >
            <div className="form-sections">
            <fieldset className="form-section">
              <legend>Tipo y finalidad</legend>
            <div className="form-grid">
              <FormField label="Fuente de datos" htmlFor="report-source">
                <select
                  id="report-source"
                  className="form-select"
                  value={source}
                  onChange={e => {
                    const next = e.target.value;
                    setSource(next);
                    setColumns(sources.find(item => item.id === next)?.fields.slice(0, 5).map(f => f.key) ?? []);
                    setGroupBy('');
                    setFilters({});
                    setSelectedBarn('');
                    setFilterKey('');
                    setFilterValue('');
                  }}
                >
                  {sources.filter(s => s.availableForBuilder).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Nombre del reporte" htmlFor="report-name">
                <input id="report-name" className="form-input" maxLength={120} placeholder="ej. Control de peso por lote de destete" value={name} onChange={e => setName(e.target.value)} />
              </FormField>
              <FormField label="Finalidad u objetivo" htmlFor="report-purpose" className="form-span-2">
                <input id="report-purpose" className="form-input" maxLength={500} placeholder="ej. Evaluar ganancia media diaria antes del traslado a engorde" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </FormField>
            </div>
            </fieldset>
            <fieldset className="form-section">
              <legend>Alcance y organización</legend>
            <div className="form-grid">
              <FormField label="Galpón" htmlFor="report-barn">
                <select id="report-barn" className="form-select" value={selectedBarn} onChange={e => setSelectedBarn(e.target.value)}>
                  <option value="">Todos los asignados</option>
                  {barns.map(barn => (
                    <option key={barn.id} value={barn.id}>{barn.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Desde" htmlFor="report-from">
                <input id="report-from" className="form-input tabular-nums" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </FormField>
              <FormField label="Hasta" htmlFor="report-to">
                <input id="report-to" className="form-input tabular-nums" type="date" value={to} onChange={e => setTo(e.target.value)} />
              </FormField>
              <FormField label="Agrupar por" htmlFor="report-group-by">
                <select
                  id="report-group-by"
                  className="form-select"
                  multiple
                  size={4}
                  value={groupBy ? groupBy.split(',') : []}
                  onChange={e => setGroupBy(Array.from(e.target.selectedOptions).map(option => option.value).join(','))}
                >
                  <option value="">Sin agrupación (limpiar selección)</option>
                  {['finance', 'cashflow'].includes(source) && <option value="month">Mes</option>}
                  {activeSource?.fields.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <small className="text-muted text-xs mt-1 block">Ctrl o ⌘ permite elegir galpón y mes a la vez.</small>
              </FormField>
              <FormField label="Ordenar por" htmlFor="report-order-by">
                <select id="report-order-by" className="form-select" value={orderBy} onChange={e => setOrderBy(e.target.value)}>
                  <option value="">Orden predeterminado</option>
                  {activeSource?.fields.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Dirección" htmlFor="report-order-direction">
                <select id="report-order-direction" className="form-select" value={orderDirection} onChange={e => setOrderDirection(e.target.value as 'asc' | 'desc')}>
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </FormField>
              <FormField label="Filtrar por campo" htmlFor="report-filter-field">
                <select
                  id="report-filter-field"
                  className="form-select"
                  value={filterKey}
                  onChange={e => {
                    setFilterKey(e.target.value);
                    setFilterValue('');
                  }}
                >
                  <option value="">Sin filtro</option>
                  {activeSource?.fields.filter(f => reportFilters[source]?.includes(f.key)).map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </FormField>
              {filterKey && (
                <FormField label="Valor del filtro" htmlFor="report-filter-value">
                  <input id="report-filter-value" className="form-input" value={filterValue} onChange={e => setFilterValue(e.target.value)} placeholder="Valor exacto" />
                </FormField>
              )}
              <div className="form-span-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-label="Agregar filtro a la consulta"
                  disabled={!filterKey || !filterValue.trim()}
                  onClick={addFilter}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Agregar filtro</span>
                  </span>
                </button>
                {Object.keys(filters).length > 0 && (
                  <FilterChipRow>
                    {Object.entries(filters).map(([key, value]) => (
                      <FilterChip
                        key={key}
                        label={`${activeSource?.fields.find(field => field.key === key)?.label ?? key}: ${value}`}
                        removeLabel={`Quitar filtro ${key}`}
                        onRemove={() =>
                          setFilters(old => {
                            const next = { ...old };
                            delete next[key];
                            return next;
                          })
                        }
                      />
                    ))}
                  </FilterChipRow>
                )}
              </div>
            </div>
            </fieldset>
              <fieldset className="form-section">
                <legend className="form-label font-bold mb-2">Columnas visibles</legend>
                <div className="checkbox-pill-grid">
                  {activeSource?.fields.map(f => (
                    <label key={f.key} className="checkbox-pill-label">
                      <input
                        type="checkbox"
                        checked={columns.includes(f.key)}
                        onChange={e => setColumns(old => (e.target.checked ? [...old, f.key] : old.filter(k => k !== f.key)))}
                      />
                      <span>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="note-box">{activeSource?.label ?? 'Selecciona una fuente'} · {columns.length} columnas · {from || 'inicio'} a {to || 'hoy'} · {selectedBarn ? barns.find(barn => String(barn.id) === selectedBarn)?.name ?? selectedBarn : 'Todos los galpones asignados'}. La vista previa permite descargar PDF o Excel.</p>
              <div className="form-actions form-actions-sticky flex-wrap">
                <button
                  className="btn btn-primary"
                  aria-label="Generar vista previa interactiva del reporte"
                  disabled={busy || !columns.length}
                  onClick={() => void run()}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconRefreshCw size={14} className={busy ? 'spinner-icon' : ''} />
                    <span>{busy ? 'Consultando…' : 'Generar vista previa'}</span>
                  </span>
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busy || !name.trim() || !purpose.trim() || !columns.length}
                  onClick={() => void save()}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={14} />
                    <span>{editing ? 'Actualizar reporte' : 'Guardar reporte'}</span>
                  </span>
                </button>
                {editing && (
                  <button
                    className="btn btn-outline"
                    aria-label="Salir del modo edición de reporte"
                    onClick={() => setEditing(null)}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconX size={14} />
                      <span>Salir de edición</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          {!preview && (
            /* Sin DataState: su role="status" chocaría con el aviso de éxito del módulo (e2e usa getByRole('status')) */
            <div className="card empty-state-card mt-4">
              <div className="empty-icon-wrap" aria-hidden="true">
                <IconBarChart size={30} className="text-primary" />
              </div>
              <p className="font-semibold text-base">Generador y vista previa interactiva</p>
              <p className="text-sm text-muted">
                Configura los parámetros, columnas y filtros arriba y pulsa "Generar vista previa" para inspeccionar las métricas y filas antes de exportar a PDF o Excel.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                aria-label="Generar vista previa interactiva del reporte"
                disabled={busy || !columns.length}
                onClick={() => void run()}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconRefreshCw size={14} className={busy ? 'spinner-icon' : ''} />
                  <span>{busy ? 'Consultando…' : 'Generar vista previa'}</span>
                </span>
              </button>
            </div>
          )}

          {preview && (
            <SectionCard
              title={`Vista previa · ${preview.rowCount} filas`}
              subtitle={`Consultado al ${preview.asOf} · Periodo ${preview.definition.from ?? 'inicio'} a ${preview.definition.to ?? 'hoy'} · Galpón ${barns.find(barn => String(barn.id) === String(preview.definition.barnId))?.name ?? 'todos los asignados'}. ${preview.truncated ? 'La vista muestra hasta 500 filas; las descargas procesan el total.' : 'Resultado completo del alcance autorizado.'}`}
              actions={
                <div className="filter-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    aria-label="Actualizar consulta de vista previa"
                    disabled={busy}
                    onClick={() => void run()}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconRefreshCw size={14} className={busy ? 'spinner-icon' : ''} />
                      <span>Actualizar consulta</span>
                    </span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void exportReport('pdf')}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconDownload size={14} />
                      <span>Descargar PDF</span>
                    </span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void exportReport('xlsx')}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconDownload size={14} />
                      <span>Descargar Excel</span>
                    </span>
                  </button>
                  {typeof navigator.share === 'function' && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        aria-label="Compartir reporte completo en PDF"
                        disabled={busy}
                        onClick={() => void exportReport('pdf', true)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconDownload size={14} />
                          <span>Compartir PDF</span>
                        </span>
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        aria-label="Compartir reporte completo en Excel"
                        disabled={busy}
                        onClick={() => void exportReport('xlsx', true)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconDownload size={14} />
                          <span>Compartir Excel</span>
                        </span>
                      </button>
                    </>
                  )}
                </div>
              }
            >
              <div className="report-metrics">
                <KpiCard label="Registros" value={preview.totals.rows} />
                {preview.totals.weightKg !== null && (
                  <KpiCard label="Peso promedio" value={`${preview.totals.weightKg.toFixed(2)} kg`} />
                )}
                {preview.totals.sum !== null && preview.totals.sum !== undefined && (
                  <KpiCard label="Suma de la métrica" value={preview.totals.sum.toFixed(2)} />
                )}
                {Object.entries(preview.moneyTotals).map(([currency, totals]) => (
                  <KpiCard
                    key={currency}
                    label={`Balance · ${currency}`}
                    value={
                      <span className={totals.balance >= 0 ? 'text-success' : 'text-danger'}>
                        {totals.balance.toLocaleString('es-PE', { style: 'currency', currency })}
                      </span>
                    }
                    detail={`Ingresos ${totals.income.toFixed(2)} · Egresos ${totals.expense.toFixed(2)}`}
                  />
                ))}
              </div>

              {groupBy && (
                <DataTable className="mb-4" heading={<h3>Resumen por {groupBy.split(',').map(key => activeSource?.fields.find(f => f.key === key)?.label ?? (key === 'month' ? 'Mes' : key)).join(' + ')}</h3>}>
                    <thead>
                      <tr>
                        <th className="text-left">Grupo</th>
                        <th className="text-right">Registros</th>
                        <th className="text-right">Suma</th>
                        <th className="text-right">Promedio</th>
                        {['finance', 'cashflow'].includes(source) && (
                          <>
                            <th className="text-right">Ingresos</th>
                            <th className="text-right">Egresos</th>
                            <th className="text-right">Balance</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(preview.groups).map(([key, val]) => (
                        <tr key={key}>
                          <td className="text-left font-bold">{key}</td>
                          <td className="text-right tabular-nums font-mono">{val.count}</td>
                          <td className="text-right tabular-nums font-mono">{val.sum.toFixed(2)}</td>
                          <td className="text-right tabular-nums font-mono">{val.average?.toFixed(2) ?? '—'}</td>
                          {['finance', 'cashflow'].includes(source) && (
                            <>
                              <td className="text-right tabular-nums font-mono text-success">{val.income.toFixed(2)}</td>
                              <td className="text-right tabular-nums font-mono text-danger">{val.expense.toFixed(2)}</td>
                              <td className="text-right tabular-nums font-mono font-bold">{val.balance.toFixed(2)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                </DataTable>
              )}

              {preview.rows.length > 0 ? (
                <DataTable>
                    <thead>
                      <tr>
                        {columns.map(key => {
                          const isNum = isNumericColumn(key);
                          return (
                            <th key={key} className={isNum ? 'text-right' : 'text-left'}>
                              {activeSource?.fields.find(f => f.key === key)?.label ?? key}
                            </th>
                          );
                        })}
                        <th className="text-center">Origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i}>
                          {columns.map(key => {
                            const isNum = isNumericColumn(key);
                            const val = row[key];
                            return (
                              <td key={key} className={isNum ? 'text-right tabular-nums font-mono' : 'text-left'}>
                                {val === null || val === undefined ? '—' : String(val)}
                              </td>
                            );
                          })}
                          <td className="text-center">
                            <a
                              href={reportSourceHref(row)}
                              className="btn btn-outline btn-sm"
                              aria-label={`Abrir registro de origen para fila ${i + 1}`}
                            >
                              <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                                <span>Abrir origen</span>
                                <IconArrowRight size={12} />
                              </span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </DataTable>
              ) : (
                <div className="mt-3">
                  <DataState
                    variant="empty"
                    title="Sin resultados para esta consulta"
                    description={`No se encontraron registros en "${activeSource?.label ?? ''}" para los filtros y fechas seleccionadas.`}
                    icon={<IconBarChart size={28} className="text-muted" />}
                  />
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}

      {section === 'guardados' && (
        <SectionCard
          title="Informes guardados en tu cuenta"
          subtitle="Plantillas y configuraciones personalizadas de reportes para consulta frecuente."
          actions={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              aria-label="Diseñar nuevo reporte personalizado"
              onClick={() => setSection('crear')}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconPlus size={14} />
                <span>Diseñar nuevo reporte</span>
              </span>
            </button>
          }
        >
          {saved.length > 0 ? (
            <DataCardList label="Informes guardados" grid>
              {saved.map(item => (
                <DataCard key={item.id}>
                  <DataCardHead title={item.name} />
                  <DataCardNote>{item.purpose}</DataCardNote>
                  <DataCardMeta items={[
                    { label: 'Fuente', value: sources.find(source => source.id === item.definition.source)?.label ?? String(item.definition.source ?? 'Sin fuente') },
                    { label: 'Desde', value: String(item.definition.from ?? 'Inicio') },
                    { label: 'Hasta', value: String(item.definition.to ?? 'Hoy') },
                  ]} />
                  <DataCardActions>
                    <button
                      className="btn btn-secondary btn-sm"
                      aria-label={`Abrir y ejecutar informe ${item.name}`}
                      onClick={() => void openSaved(item.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconRefreshCw size={12} />
                        <span>Abrir y ejecutar</span>
                      </span>
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      aria-label={`Duplicar informe ${item.name}`}
                      onClick={() => void duplicate(item.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconPlus size={12} />
                        <span>Duplicar</span>
                      </span>
                    </button>
                  </DataCardActions>
                </DataCard>
              ))}
            </DataCardList>
          ) : (
            <div className="mt-3">
              <DataState
                variant="empty"
                title="Todavía no hay informes guardados"
                description="Diseña un informe a medida con filtros por galpón, agrupación y métricas, y guárdalo para ejecutarlo cuando lo requieras."
                icon={<IconBarChart size={28} className="text-muted" />}
                action={
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label="Diseñar mi primer reporte personalizado"
                    onClick={() => setSection('crear')}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Diseñar mi primer reporte</span>
                    </span>
                  </button>
                }
              />
            </div>
          )}
        </SectionCard>
      )}
    </main>
  );
}

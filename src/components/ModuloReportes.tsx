import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
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
import { InformesProductivos } from './InformesProductivos';

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
      setError(e instanceof Error ? e.message : 'Error cargando reportes');
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
      setError(e instanceof Error ? e.message : 'Error generando reporte');
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
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setBusy(false);
    }
  };

  const currencyTotals = useMemo(() => {
    const rows = dashboard?.sales ?? [];
    return rows.map(item => ({
      ...item,
      value: (item.amountMinor / 100).toLocaleString('es-PE', { style: 'currency', currency: item.currency }),
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
      setError(e instanceof Error ? e.message : 'Error al duplicar');
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
      setError(share ? 'No se pudo compartir el archivo. Usa Descargar PDF o Descargar Excel.' : e instanceof Error ? e.message : 'Error al exportar');
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
      <div className="module-heading">
        <div>
          <h1 className="title-module">
            <IconBarChart size={22} className="text-primary" />
            <span>Reportes y Estadísticas</span>
          </h1>
          <p className="text-xs text-muted mt-1">
            Indicadores de producción porcina, balance económico y reportes exportables en soles (PEN S/).
          </p>
        </div>
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

      <div className="admin-tabs mb-4" role="tablist" aria-label="Secciones de reportes">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'panel'}
          aria-label="Pestaña Panel General de estadísticas e indicadores"
          className={`btn btn-sm ${section === 'panel' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('panel')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBarChart size={14} />
            <span>Panel general</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'productivos'}
          aria-label="Pestaña Informes Productivos: pesajes, partos y camadas"
          className={`btn btn-sm ${section === 'productivos' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('productivos')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBarChart size={14} />
            <span>Informes productivos (pesos y partos)</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'crear'}
          aria-label="Pestaña Diseñar Reporte: constructor personalizado de informes"
          className={`btn btn-sm ${section === 'crear' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('crear')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPlus size={14} />
            <span>Diseñar reporte</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'guardados'}
          aria-label={`Pestaña Informes Guardados: ${saved.length} plantillas disponibles`}
          className={`btn btn-sm ${section === 'guardados' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('guardados')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={14} />
            <span>Informes guardados ({saved.length})</span>
          </span>
        </button>
      </div>

      {section === 'productivos' && <InformesProductivos barns={barns} />}

      {section === 'panel' && (
        <>
          <section className="card">
            <div className="filter-row items-end">
              <div className="form-group">
                <label className="form-label text-xs">Desde</label>
                <input className="form-input form-input-sm tabular-nums" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label text-xs">Hasta</label>
                <input className="form-input form-input-sm tabular-nums" type="date" value={to} onChange={e => setTo(e.target.value)} />
              </div>
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

          <div className="filter-row">
            {[
              ['Animales activos', dashboard?.totalAnimals],
              ['Galpones de granja', dashboard?.barnCount],
              ['Vacunas pendientes al corte', dashboard?.pendingVaccines],
              ['Partos próximos (7 días)', dashboard?.upcomingFarrowings],
            ].map(([label, value]) => (
              <div className="metric-card" key={String(label)}>
                <span>{label}</span>
                <strong className="tabular-nums">{value ?? '—'}</strong>
              </div>
            ))}
          </div>

          <section className="card">
            <h2>Población de animales por tipo</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Tipo de animal</th>
                    <th className="text-right">Total animales</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard?.animalsByType.map(row => (
                    <tr key={row.type}>
                      <td className="text-left">{row.type}</td>
                      <td className="text-right tabular-nums font-mono font-bold">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-bars">
              {dashboard?.animalsByType.map(row => (
                <label key={row.type}>
                  <span>{row.type}</span>
                  <progress max={Math.max(1, ...(dashboard?.animalsByType.map(item => item.total) ?? []))} value={row.total} />
                  <strong className="tabular-nums">{row.total}</strong>
                </label>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Ventas por mes y moneda</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Mes</th>
                    <th className="text-left">Moneda</th>
                    <th className="text-right">Total ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {currencyTotals.map((row, i) => (
                    <tr key={`${row.month}-${row.currency}-${i}`}>
                      <td className="text-left tabular-nums">{row.month}</td>
                      <td className="text-left">{row.currency === 'PEN' ? 'PEN (S/)' : row.currency}</td>
                      <td className="text-right tabular-nums font-mono font-bold">{row.value}</td>
                    </tr>
                  ))}
                  {!currencyTotals.length && (
                    <tr>
                      <td colSpan={3} className="text-center p-4 text-muted">
                        Sin ventas registradas en el periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="report-bars">
              {currencyTotals.map(row => {
                const max = Math.max(1, ...currencyTotals.filter(item => item.currency === row.currency).map(item => item.amountMinor));
                return (
                  <label key={`${row.month}-${row.currency}`}>
                    <span>{row.month} · {row.currency}</span>
                    <progress max={max} value={row.amountMinor} />
                    <strong className="tabular-nums">{row.value}</strong>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2>Costo de raciones y alimentación</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Mes</th>
                    <th className="text-left">Moneda</th>
                    <th className="text-right">Raciones entregadas</th>
                    <th className="text-right">Costo total</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard?.feedCosts.map(row => (
                    <tr key={`${row.month}-${row.currency}`}>
                      <td className="text-left tabular-nums">{row.month}</td>
                      <td className="text-left">{row.currency === 'PEN' ? 'PEN (S/)' : row.currency}</td>
                      <td className="text-right tabular-nums font-mono">{row.count}</td>
                      <td className="text-right tabular-nums font-mono font-bold">
                        {(row.costMinor / 100).toLocaleString('es-PE', { style: 'currency', currency: row.currency })}
                      </td>
                    </tr>
                  ))}
                  {!dashboard?.feedCosts.length && (
                    <tr>
                      <td colSpan={4} className="text-center p-4 text-muted">
                        Sin entregas de alimento con costo en el periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="report-bars">
              {dashboard?.feedCosts.map(row => {
                const max = Math.max(1, ...(dashboard?.feedCosts.filter(item => item.currency === row.currency).map(item => item.costMinor) ?? []));
                return (
                  <label key={`${row.month}-${row.currency}`}>
                    <span>{row.month} · {row.currency}</span>
                    <progress max={max} value={row.costMinor} />
                    <strong className="tabular-nums">{(row.costMinor / 100).toLocaleString('es-PE', { style: 'currency', currency: row.currency })}</strong>
                  </label>
                );
              })}
            </div>
          </section>
        </>
      )}

      {section === 'crear' && (
        <>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Diseñar reporte personalizado</h2>
                <p className="text-muted">
                  {activeSource?.grain}. La vista previa limita la respuesta a 500 filas; las descargas consultan el conjunto completo.
                </p>
              </div>
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
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="report-source">Fuente de datos</label>
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
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-name">Nombre del reporte</label>
                <input id="report-name" className="form-input" maxLength={120} placeholder="ej. Control de peso por lote de destete" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-group form-span-2">
                <label className="form-label" htmlFor="report-purpose">Finalidad u objetivo</label>
                <input id="report-purpose" className="form-input" maxLength={500} placeholder="ej. Evaluar ganancia media diaria antes del traslado a engorde" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-barn">Galpón</label>
                <select id="report-barn" className="form-select" value={selectedBarn} onChange={e => setSelectedBarn(e.target.value)}>
                  <option value="">Todos los asignados</option>
                  {barns.map(barn => (
                    <option key={barn.id} value={barn.id}>{barn.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-from">Desde</label>
                <input id="report-from" className="form-input tabular-nums" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-to">Hasta</label>
                <input id="report-to" className="form-input tabular-nums" type="date" value={to} onChange={e => setTo(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-group-by">Agrupar por</label>
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
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-order-by">Ordenar por</label>
                <select id="report-order-by" className="form-select" value={orderBy} onChange={e => setOrderBy(e.target.value)}>
                  <option value="">Orden predeterminado</option>
                  {activeSource?.fields.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-order-direction">Dirección</label>
                <select id="report-order-direction" className="form-select" value={orderDirection} onChange={e => setOrderDirection(e.target.value as 'asc' | 'desc')}>
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-filter-field">Filtrar por campo</label>
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
              </div>
              {filterKey && (
                <div className="form-group">
                  <label className="form-label" htmlFor="report-filter-value">Valor del filtro</label>
                  <input id="report-filter-value" className="form-input" value={filterValue} onChange={e => setFilterValue(e.target.value)} placeholder="Valor exacto" />
                </div>
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
                {Object.entries(filters).map(([key, value]) => (
                  <span className="badge-env ml-1" key={key}>
                    {activeSource?.fields.find(field => field.key === key)?.label ?? key}: {value}{' '}
                    <button
                      type="button"
                      className="inline-flex items-center ml-1 text-muted hover:text-danger"
                      aria-label={`Quitar filtro ${key}`}
                      onClick={() =>
                        setFilters(old => {
                          const next = { ...old };
                          delete next[key];
                          return next;
                        })
                      }
                    >
                      <IconX size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <fieldset className="form-span-2">
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
              <div className="form-span-2 flex flex-wrap gap-2 pt-2 border-t border-subtle">
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
                  aria-label={editing ? 'Actualizar plantilla de reporte guardada' : 'Guardar configuración de reporte'}
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
          </section>

          {!preview && (
            <div className="card empty-state-card mt-4">
              <div className="empty-icon-wrap">
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
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Vista previa · {preview.rowCount} filas</h2>
                  <p className="text-muted">
                    Consultado al {preview.asOf} · Periodo {preview.definition.from ?? 'inicio'} a {preview.definition.to ?? 'hoy'} · Galpón {barns.find(barn => String(barn.id) === String(preview.definition.barnId))?.name ?? 'todos los asignados'}.{' '}
                    {preview.truncated ? 'La vista muestra hasta 500 filas; las descargas procesan el total.' : 'Resultado completo del alcance autorizado.'}
                  </p>
                </div>
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
                    aria-label="Descargar reporte completo en formato PDF"
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
                    aria-label="Descargar reporte completo en formato Excel"
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
              </div>

              <div className="filter-row">
                <div className="metric-card">
                  <span>Registros</span>
                  <strong className="tabular-nums">{preview.totals.rows}</strong>
                </div>
                {preview.totals.weightKg !== null && (
                  <div className="metric-card">
                    <span>Peso promedio</span>
                    <strong className="tabular-nums">{preview.totals.weightKg.toFixed(2)} kg</strong>
                  </div>
                )}
                {preview.totals.sum !== null && preview.totals.sum !== undefined && (
                  <div className="metric-card">
                    <span>Suma de la métrica</span>
                    <strong className="tabular-nums">{preview.totals.sum.toFixed(2)}</strong>
                  </div>
                )}
                {Object.entries(preview.moneyTotals).map(([currency, totals]) => (
                  <div className="metric-card" key={currency}>
                    <span>Balance · {currency}</span>
                    <strong className={`tabular-nums ${totals.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                      {totals.balance.toLocaleString('es-PE', { style: 'currency', currency })}
                    </strong>
                    <small className="tabular-nums">Ingresos {totals.income.toFixed(2)} · Egresos {totals.expense.toFixed(2)}</small>
                  </div>
                ))}
              </div>

              {groupBy && (
                <div className="table-responsive mb-4">
                  <h3>Resumen por {groupBy.split(',').map(key => activeSource?.fields.find(f => f.key === key)?.label ?? (key === 'month' ? 'Mes' : key)).join(' + ')}</h3>
                  <table className="data-table">
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
                  </table>
                </div>
              )}

              {preview.rows.length > 0 ? (
                <div className="table-responsive">
                  <table className="data-table">
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
                  </table>
                </div>
              ) : (
                <div className="card empty-state-card mt-3">
                  <div className="empty-icon-wrap">
                    <IconBarChart size={28} className="text-muted" />
                  </div>
                  <p className="font-semibold text-base">Sin resultados para esta consulta</p>
                  <p className="text-sm text-muted">
                    No se encontraron registros en "{activeSource?.label}" para los filtros y fechas seleccionadas.
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {section === 'guardados' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Informes guardados en tu cuenta</h2>
              <p className="text-muted">Plantillas y configuraciones personalizadas de reportes para consulta frecuente.</p>
            </div>
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
          </div>

          {saved.length > 0 ? (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Nombre del reporte</th>
                    <th className="text-left">Finalidad y alcance</th>
                    <th className="text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map(item => (
                    <tr key={item.id}>
                      <td className="text-left font-bold">{item.name}</td>
                      <td className="text-left text-muted">{item.purpose}</td>
                      <td className="text-center">
                        <div className="inline-flex items-center justify-center gap-2">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card empty-state-card mt-3">
              <div className="empty-icon-wrap">
                <IconBarChart size={28} className="text-muted" />
              </div>
              <p className="font-semibold text-base">Todavía no hay informes guardados</p>
              <p className="text-sm text-muted">
                Diseña un informe a medida con filtros por galpón, agrupación y métricas, y guárdalo para ejecutarlo cuando lo requieras.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                aria-label="Diseñar mi primer reporte personalizado"
                onClick={() => setSection('crear')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconPlus size={14} />
                  <span>Diseñar mi primer reporte</span>
                </span>
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

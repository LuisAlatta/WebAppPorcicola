import React, { useEffect, useState } from 'react';
import { IconDownload, IconRefreshCw, IconBarChart, IconHeart } from './icons';
import { ModuleTabs } from './ModuleTabs';
import { DataState } from './DataState';
import { generarReportePdf, type ReportColumn } from '../utils/exportPdf';
import { generarReporteXlsx } from '../utils/exportXlsx';
import { errorMessage } from '../utils/format';
import {
  InlineAlert,
  KpiCard,
  SectionCard,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
} from './ui';

type Option = { code: string; name: string };
type Filters = { from: string; to: string; barnId: string; locationCode: string; lotCode: string; stageCode: string; animalCode: string; motherCode: string };
type WeightRow = { date: string; stageCode: string | null; observations: number; averageKg: number };
type BirthRow = {
  id: string;
  farrowingDate: string;
  motherCode: string;
  barnName: string;
  locationCode: string | null;
  lotCode: string | null;
  liveBirths: number;
  totalBorn: number;
  deaths: number;
  lactationDeaths: number;
  mortalityPct: number | null;
};
type WeightReport = { total: { observations: number; averageKg: number | null; minimumKg: number | null; maximumKg: number | null }; rows: WeightRow[] };
type BirthReport = {
  totals: {
    litters: number;
    liveBirths: number;
    totalBorn: number;
    deaths: number;
    lactationDeaths: number;
    averageMortalityPct: number | null;
    globalMortalityPct: number | null;
  };
  rows: BirthRow[];
};
type Result = { kind: 'weights'; data: WeightReport; filters: Filters } | { kind: 'births'; data: BirthReport; filters: Filters };

const emptyFilters: Filters = { from: '', to: '', barnId: '', locationCode: '', lotCode: '', stageCode: '', animalCode: '', motherCode: '' };

const decimal = (value: number | null | undefined, unit = '') =>
  value == null ? 'Sin datos' : `${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit}`;

const weightColumns: ReportColumn[] = [
  { key: 'date', label: 'Fecha', dataType: 'date' },
  { key: 'stageCode', label: 'Etapa', dataType: 'text' },
  { key: 'observations', label: 'Pesajes', dataType: 'number' },
  { key: 'averageKg', label: 'Peso promedio', dataType: 'number', unit: 'kg' },
];

const birthColumns: ReportColumn[] = [
  { key: 'farrowingDate', label: 'Fecha de parto', dataType: 'date' },
  { key: 'motherCode', label: 'Marrana (Madre)', dataType: 'text' },
  { key: 'barnName', label: 'Galpón', dataType: 'text' },
  { key: 'locationCode', label: 'Ubicación', dataType: 'text' },
  { key: 'lotCode', label: 'Lote', dataType: 'text' },
  { key: 'totalBorn', label: 'Total nacidos', dataType: 'number' },
  { key: 'liveBirths', label: 'Nacidos vivos', dataType: 'number' },
  { key: 'deaths', label: 'Nacidos muertos', dataType: 'number' },
  { key: 'lactationDeaths', label: 'Bajas en lactancia', dataType: 'number' },
  { key: 'mortalityPct', label: 'Mortalidad al nacer', dataType: 'percent' },
];

export function InformesProductivos({ barns }: { barns: { id: number; name: string }[] }) {
  const [kind, setKind] = useState<'weights' | 'births'>('weights');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [options, setOptions] = useState<{ locations: Option[]; lots: Option[]; stages: Option[] }>({ locations: [], lots: [], stages: [] });
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const describeFilters = (type: 'weights' | 'births', selected: Filters): Record<string, string> => {
    const described: Record<string, string> = {};
    if (selected.barnId) described['Galpón'] = barns.find(barn => String(barn.id) === selected.barnId)?.name ?? selected.barnId;
    if (selected.locationCode) described['Ubicación'] = options.locations.find(item => item.code === selected.locationCode)?.name ?? selected.locationCode;
    if (selected.lotCode) described['Lote'] = options.lots.find(item => item.code === selected.lotCode)?.name ?? selected.lotCode;
    if (type === 'weights' && selected.stageCode) described['Etapa'] = options.stages.find(item => item.code === selected.stageCode)?.name ?? selected.stageCode;
    if (type === 'weights' && selected.animalCode) described['Animal'] = selected.animalCode;
    if (type === 'births' && selected.motherCode) described['Madre'] = selected.motherCode;
    return described;
  };

  useEffect(() => {
    let active = true;
    void fetch('/api/animals?limit=1')
      .then(async response => {
        const data = (await response.json()) as { options?: { locations: Option[]; lots: Option[]; stages: Option[] }; error?: string };
        if (!response.ok || !data.options) throw new Error(data.error || 'No se pudieron cargar los filtros');
        if (active) setOptions(data.options);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'No se pudieron cargar los filtros'));
      });
    return () => {
      active = false;
    };
  }, []);

  const update = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }));

  const query = async (type: 'weights' | 'births', selected: Filters): Promise<Result> => {
    const keys: (keyof Filters)[] =
      type === 'weights'
        ? ['from', 'to', 'barnId', 'locationCode', 'lotCode', 'stageCode', 'animalCode']
        : ['from', 'to', 'barnId', 'locationCode', 'lotCode', 'motherCode'];
    const params = new URLSearchParams();
    for (const key of keys) {
      const value = selected[key].trim();
      if (value) params.set(key, value);
    }
    const response = await fetch(`/api/reports/${type}?${params.toString()}`);
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error || 'No se pudo consultar el informe');
    return type === 'weights' ? { kind: type, data: data as WeightReport, filters: { ...selected } } : { kind: type, data: data as BirthReport, filters: { ...selected } };
  };

  const consult = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      setResult(await query(kind, filters));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err, 'No se pudo consultar el informe'));
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: 'pdf' | 'xlsx') => {
    if (!result) return;
    setBusy(true);
    setError('');
    try {
      const fresh = await query(result.kind, result.filters);
      setResult(fresh);
      const title = fresh.kind === 'weights' ? 'Informe de pesos y ganancia' : 'Informe de partos y camadas';
      const columns = fresh.kind === 'weights' ? weightColumns : birthColumns;
      const rows = fresh.data.rows.map(row => ({ ...row })) as Record<string, unknown>[];
      const totals: Record<string, number | null> =
        fresh.kind === 'weights'
          ? { pesajes: fresh.data.total.observations, promedioKg: fresh.data.total.averageKg }
          : {
              camadas: fresh.data.totals.litters,
              nacidos: fresh.data.totals.totalBorn,
              nacidosMuertos: fresh.data.totals.deaths,
              bajasLactancia: fresh.data.totals.lactationDeaths,
              promedioMortalidad: fresh.data.totals.averageMortalityPct,
              mortalidadConjunta: fresh.data.totals.globalMortalityPct,
            };
      const now = new Date();
      const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(now);
      const applied = describeFilters(fresh.kind, fresh.filters);
      const base = {
        title,
        purpose: 'Informe productivo filtrado por galpón',
        generatedAt: new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(now),
        from: fresh.filters.from || undefined,
        to: fresh.filters.to || undefined,
        asOf,
        filters: applied,
        columns,
        rows,
        totals,
      };
      const bytes = format === 'pdf' ? await generarReportePdf({ ...base, farm: 'Granja' }) : generarReporteXlsx({ ...base, sheetName: title });
      const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${fresh.kind === 'weights' ? 'pesos' : 'partos-camadas'}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setResult(null);
      setError(errorMessage(err, 'No se pudo exportar el informe'));
    } finally {
      setBusy(false);
    }
  };

  const maxWeight = result?.kind === 'weights' ? result.data.rows.reduce((max, row) => Math.max(max, row.averageKg), 1) : 1;
  const maxBirths = result?.kind === 'births' ? result.data.rows.reduce((max, row) => Math.max(max, row.totalBorn), 1) : 1;

  return (
    <SectionCard
      title="Informes productivos de la granja"
      subtitle="Consulte registros de pesajes o partos y camadas con filtros por galpón y lote."
    >
      {kind === 'births' && (
        <p className="text-muted text-xs">
          El periodo selecciona la fecha de parto de la marrana; las bajas de lactancia se contabilizan hasta la fecha final indicada.
        </p>
      )}
      {error && <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>}
      <ModuleTabs
        label="Tipo de informe productivo"
        active={kind}
        onChange={value => { setKind(value); setResult(null); }}
        columns={2}
        tabs={[
          { id: 'weights', label: 'Pesajes y ganancia de peso', icon: <IconBarChart size={14} /> },
          { id: 'births', label: 'Partos, camadas y mortalidad', icon: <IconHeart size={14} /> },
        ]}
      />
      <form onSubmit={event => void consult(event)} className="form-stack">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="productive-report-from">Desde</label>
            <input id="productive-report-from" className="form-input tabular-nums" type="date" value={filters.from} onChange={event => update('from', event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="productive-report-to">Hasta</label>
            <input id="productive-report-to" className="form-input tabular-nums" type="date" value={filters.to} onChange={event => update('to', event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="productive-report-barn">Galpón productivo</label>
            <select id="productive-report-barn" className="form-select" value={filters.barnId} onChange={event => update('barnId', event.target.value)}>
              <option value="">Todos los galpones autorizados</option>
              {barns.map(barn => (
                <option key={barn.id} value={barn.id}>{barn.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="productive-report-location">Ubicación / Corral</label>
            <select id="productive-report-location" className="form-select" value={filters.locationCode} onChange={event => update('locationCode', event.target.value)}>
              <option value="">Todas las ubicaciones</option>
              {options.locations.map(option => (
                <option key={option.code} value={option.code}>{option.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="productive-report-lot">Lote porcino</label>
            <select id="productive-report-lot" className="form-select" value={filters.lotCode} onChange={event => update('lotCode', event.target.value)}>
              <option value="">Todos los lotes</option>
              {options.lots.map(option => (
                <option key={option.code} value={option.code}>{option.name}</option>
              ))}
            </select>
          </div>
          {kind === 'weights' ? (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="productive-report-stage">Etapa productiva</label>
                <select id="productive-report-stage" className="form-select" value={filters.stageCode} onChange={event => update('stageCode', event.target.value)}>
                  <option value="">Todas las etapas</option>
                  {options.stages.map(option => (
                    <option key={option.code} value={option.code}>{option.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="productive-report-animal">Arete / Código de animal</label>
                <input id="productive-report-animal" className="form-input" placeholder="ej. ENG-012" value={filters.animalCode} onChange={event => update('animalCode', event.target.value)} />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="productive-report-mother">Arete de la madre (Marrana)</label>
              <input id="productive-report-mother" className="form-input" placeholder="ej. MAR-005" value={filters.motherCode} onChange={event => update('motherCode', event.target.value)} />
            </div>
          )}
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          aria-label="Consultar informe productivo con los filtros seleccionados"
          disabled={busy}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconRefreshCw size={14} className={busy ? 'spinner-icon' : ''} />
            <span>{busy ? 'Consultando…' : 'Consultar informe productivo'}</span>
          </span>
        </button>
      </form>

      {result && (
        <>
          <p className="text-muted mt-4">
            Periodo consultado: {result.filters.from || 'inicio'} a {result.filters.to || 'hoy'} ·{' '}
            {Object.entries(describeFilters(result.kind, result.filters)).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Todos los galpones autorizados'}
          </p>
          <div className="filter-row mb-4">
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void download('pdf')}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconDownload size={14} />
                <span>Descargar PDF</span>
              </span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void download('xlsx')}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconDownload size={14} />
                <span>Descargar Excel</span>
              </span>
            </button>
          </div>

          {result.kind === 'weights' ? (
            <>
              <div className="report-metrics">
                <KpiCard label="Pesajes" value={result.data.total.observations} />
                <KpiCard label="Peso promedio" value={decimal(result.data.total.averageKg, ' kg')} />
                <KpiCard
                  label="Mínimo / máximo"
                  value={`${decimal(result.data.total.minimumKg, ' kg')} / ${decimal(result.data.total.maximumKg, ' kg')}`}
                />
              </div>

              {result.data.rows.length ? (
                <DataCardList label="Pesajes por fecha y etapa" grid>
                  {result.data.rows.map((row, index) => (
                    <DataCard key={`${row.date}-${row.stageCode}-${index}`}>
                      <DataCardHead
                        title={options.stages.find(stage => stage.code === row.stageCode)?.name ?? row.stageCode ?? 'Sin etapa'}
                        subtitle={row.date}
                      />
                      <DataCardMeta items={[
                        { label: 'Pesajes', value: row.observations, className: 'font-mono tabular-nums' },
                        { label: 'Peso promedio', value: decimal(row.averageKg, ' kg'), className: 'font-mono tabular-nums' },
                      ]} />
                    </DataCard>
                  ))}
                </DataCardList>
              ) : <DataState variant="empty" title="Sin pesajes para los filtros seleccionados." />}

              <h3 className="mt-4">Gráfico de pesos promedio</h3>
              <div className="report-bars">
                {result.data.rows.map((row, index) => (
                  <label key={`${row.date}-${index}`}>
                    <span>{row.date} · {row.stageCode ?? 'Sin etapa'}</span>
                    <progress aria-label={`Peso ${row.date} ${row.stageCode ?? ''}`} max={maxWeight} value={row.averageKg} />
                    <strong className="tabular-nums">{decimal(row.averageKg, ' kg')}</strong>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="report-metrics">
                <KpiCard label="Crías nacidas" value={result.data.totals.totalBorn} />
                <KpiCard label="Nacidos muertos" value={<span className="text-danger">{result.data.totals.deaths}</span>} />
                <KpiCard label="Bajas en lactancia" value={<span className="text-warning">{result.data.totals.lactationDeaths}</span>} />
                <KpiCard label="Promedio mortalidad / camada" value={decimal(result.data.totals.averageMortalityPct, ' %')} />
                <KpiCard label="Mortalidad global al nacer" value={decimal(result.data.totals.globalMortalityPct, ' %')} />
              </div>

              {result.data.rows.length ? (
                <DataCardList label="Partos y camadas" grid>
                  {result.data.rows.map(row => (
                    <DataCard key={row.id}>
                      <DataCardHead title={row.motherCode} subtitle={`${row.farrowingDate} · ${row.barnName}`} />
                      <DataCardMeta items={[
                        { label: 'Ubicación / Corral', value: row.locationCode ?? 'Sin asignar' },
                        { label: 'Lote porcino', value: row.lotCode ?? 'Sin lote' },
                        { label: 'Nacidos totales', value: row.totalBorn, className: 'font-mono tabular-nums' },
                        { label: 'Nacidos vivos', value: row.liveBirths, className: 'font-mono tabular-nums text-success' },
                        { label: 'Nacidos muertos', value: row.deaths, className: 'font-mono tabular-nums text-danger' },
                        { label: 'Bajas en lactancia', value: row.lactationDeaths, className: 'font-mono tabular-nums text-warning' },
                        { label: 'Mortalidad al nacer', value: decimal(row.mortalityPct, ' %'), className: 'font-mono tabular-nums' },
                      ]} />
                    </DataCard>
                  ))}
                </DataCardList>
              ) : <DataState variant="empty" title="Sin nacimientos para los filtros seleccionados." />}

              <h3 className="mt-4">Gráfico de nacimientos por camada</h3>
              <div className="report-bars">
                {result.data.rows.map(row => (
                  <div key={row.id} className="mb-3">
                    <strong>{row.farrowingDate} · Marrana {row.motherCode}</strong>
                    <label>
                      <span>Nacidos</span>
                      <progress aria-label={`Nacidos ${row.motherCode} ${row.farrowingDate}`} max={maxBirths} value={row.totalBorn} />
                      <strong className="tabular-nums">{row.totalBorn}</strong>
                    </label>
                    <label>
                      <span>Muertos al nacer</span>
                      <progress aria-label={`Muertos al nacer ${row.motherCode} ${row.farrowingDate}`} max={maxBirths} value={row.deaths} />
                      <strong className="tabular-nums">{row.deaths}</strong>
                    </label>
                    {row.mortalityPct !== null && (
                      <label>
                        <span>Mortalidad al nacer</span>
                        <progress aria-label={`Mortalidad ${row.motherCode} ${row.farrowingDate}`} max={100} value={row.mortalityPct} />
                        <strong className="tabular-nums">{decimal(row.mortalityPct, ' %')}</strong>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBox,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconClock,
  IconEye,
  IconFilter,
  IconList,
  IconPlus,
  IconRefreshCw,
  IconScale,
  IconSearch,
  IconWheat,
  IconX,
} from './icons';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import { DataState } from './DataState';
import { ModuleTabs } from './ModuleTabs';
import type { Perfil } from '../types';

type Warehouse = {
  id: number;
  code: string;
  name: string;
  location: string | null;
  barnId: number | null;
  barnName: string | null;
};

type Stock = {
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  barnId: number | null;
  feedCode: string;
  lotCode: string;
  availableKg: number;
  receivedKg: number;
  withdrawnKg: number;
  allocatedCostMinor: number;
};

type FeedOption = {
  code: string;
  name: string;
};

type Movement = {
  id: number;
  movementType: string;
  effectiveDate: string;
  warehouseCode: string;
  warehouseName: string;
  feedCode: string;
  lotCode: string;
  supplier: string | null;
  quantityKg: number;
  stockDeltaKg: number;
  costPerKg: number;
  totalCost: number;
  currencyCode: string;
  documentReference: string | null;
  reversesMovementId?: number | null;
  destinationBarn: string | null;
  animalCode: string | null;
  reason: string;
  actorName: string;
};

type ViewData = {
  inventory: Stock[];
  totals: {
    availableKg: number;
    receivedKg: number;
    withdrawnKg: number;
    allocatedCostMinor: number;
  };
  asOf: string;
};

type ProjectionRow = {
  stageCode: string;
  stageName: string;
  heads: number;
  feedCode: string | null;
  feedName: string | null;
  dailyKg: number | null;
  stageDays: number | null;
  stageNeedKg: number | null;
  monthlyNeedKg: number | null;
  availableKg: number;
  coveredDays: number | null;
  dailyShortageKg: number | null;
  stageShortageKg: number | null;
  monthlyShortageKg: number | null;
  requirements: string[];
};

type FeedSummary = {
  feedCode: string;
  feedName: string | null;
  heads: number;
  dailyKg: number | null;
  monthlyNeedKg: number | null;
  availableKg: number;
  coveredDays: number | null;
  monthlyShortageKg: number | null;
};

type TurnRow = {
  id: number;
  effectiveDate: string;
  shiftCode: string;
  barnName: string;
  stageCode: string;
  feedCode: string;
  lotCode: string;
  plannedKg: number;
  servedKg: number;
  consumedKg: number | null;
};

type ConversionRow = {
  barnId: number;
  barnName: string;
  stageCode: string;
  periodFrom: string;
  periodTo: string;
  measuredAnimals: number;
  populationHeads: number;
  comparableAnimals: number;
  coveragePercent: number;
  consumptionDays: number;
  requiredConsumptionDays: number;
  weightGainKg: number;
  consumedKg: number;
  feedConversionRatio: number | null;
  unavailableReason: string | null;
};

type FeedPlan = {
  id: number;
  groupKey: string;
  effectiveDate: string;
  shiftCode: string;
  barnId: number;
  barnName: string;
  stageCode: string;
  feedCode: string;
  plannedKg: number;
  servedKg: number;
  pendingKg: number;
};

type Section = 'raciones' | 'stock' | 'turnos' | 'registrar';

const labels: Record<string, string> = {
  opening: 'Saldo inicial',
  purchase: 'Compra',
  return_in: 'Devolución recibida',
  delivery: 'Consumo / entrega',
  waste: 'Merma',
  return_supplier: 'Devolución a proveedor',
};

const SHIFT_LABELS: Record<string, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
};

const MOVEMENT_TYPE_BADGES: Record<string, string> = {
  opening: 'badge-tag',
  purchase: 'badge-status badge-success',
  return_in: 'badge-status badge-success',
  delivery: 'badge-status badge-warning',
  waste: 'badge-status badge-danger',
  return_supplier: 'badge-status badge-danger',
};

function coverage(period: string, shortage: number | null): string {
  if (shortage === null) return `${period}: sin datos`;
  if (shortage === 0) return `${period}: suficiente`;
  return `${period}: faltan ${shortage} kg`;
}

export function ModuloAlimentacion({ perfil }: { perfil: Perfil }) {
  const readonly = perfil === 'veterinario';
  const [section, setSection] = useState<Section>('raciones');
  const [loading, setLoading] = useState<boolean>(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventory, setInventory] = useState<ViewData | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [projection, setProjection] = useState<ProjectionRow[]>([]);
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [conversion, setConversion] = useState<ConversionRow[]>([]);
  const [plans, setPlans] = useState<FeedPlan[]>([]);
  const [plan, setPlan] = useState({ effectiveDate: farmToday(), shiftCode: 'manana', barnId: '', stageCode: 'preinicio', feedCode: '', plannedKg: '', reason: '' });
  const [turnMode, setTurnMode] = useState<boolean>(false);
  const [turn, setTurn] = useState({
    shiftCode: 'manana',
    stageCode: 'preinicio',
    plannedKg: '',
    servedKg: '',
    consumedKg: '',
  });
  const [feedOptions, setFeedOptions] = useState<FeedOption[]>([]);
  const [barns, setBarns] = useState<{ id: number; name: string }[]>([]);
  const [date, setDate] = useState<string>(farmToday());
  const [planDate, setPlanDate] = useState<string>(farmToday());
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [kind, setKind] = useState<string>('purchase');
  const [form, setForm] = useState({
    effectiveDate: farmToday(),
    feedCode: '',
    lotCode: '',
    supplier: '',
    quantityKg: '',
    costPerKg: '',
    destinationBarnId: '',
    animalCode: '',
    documentReference: '',
    reversesMovementId: '',
    reason: '',
  });
  const [newWarehouse, setNewWarehouse] = useState({ code: '', name: '', location: '' });
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  // Filtros de vistas
  const [stockSearch, setStockSearch] = useState<string>('');
  const [stockWarehouseFilter, setStockWarehouseFilter] = useState<string>('');
  const [movementFilterType, setMovementFilterType] = useState<string>('');
  const [movementSearch, setMovementSearch] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [wr, ir, mr, cr, br, pr, plr] = await Promise.all([
        fetch('/api/feed/warehouses'),
        fetch(`/api/feed/inventory?asOf=${encodeURIComponent(date)}`),
        fetch('/api/feed/movements?limit=100'),
        fetch('/api/config'),
        fetch('/api/finance/barns'),
        fetch(`/api/feed/projection?asOf=${encodeURIComponent(date)}`),
        fetch(`/api/feed/plans?from=${encodeURIComponent(planDate)}&to=${encodeURIComponent(planDate)}`),
      ]);
      const [w, i, m, c, b, p, pl] = await Promise.all([
        wr.json(),
        ir.json(),
        mr.json(),
        cr.json(),
        br.json(),
        pr.json(),
        plr.json(),
      ]) as [
        { warehouses?: Warehouse[]; error?: string },
        { inventory?: Stock[]; totals?: ViewData['totals']; asOf: string; error?: string },
        { movements?: Movement[]; error?: string },
        { catalogs?: { key: string; items: { code: string; name: string }[] }[]; error?: string },
        { barns?: { id: number; name: string }[]; error?: string },
        { stages?: ProjectionRow[]; feeds?: FeedSummary[]; turns?: TurnRow[]; conversion?: ConversionRow[]; error?: string },
        { plans?: FeedPlan[]; error?: string },
      ];
      if (!wr.ok || !ir.ok || !mr.ok || !cr.ok || !br.ok || !pr.ok || !plr.ok) {
        throw new Error(w.error || i.error || m.error || c.error || b.error || p.error || pl.error || 'No se pudieron cargar los datos de alimentación');
      }
      setWarehouses(w.warehouses ?? []);
      setInventory({
        inventory: i.inventory ?? [],
        totals: i.totals ?? { availableKg: 0, receivedKg: 0, withdrawnKg: 0, allocatedCostMinor: 0 },
        asOf: i.asOf,
      });
      setMovements(m.movements ?? []);
      setProjection(p.stages ?? []);
      setFeeds(p.feeds ?? []);
      setTurns(p.turns ?? []);
      setConversion(p.conversion ?? []);
      setPlans(pl.plans ?? []);
      setPlan(old => ({ ...old, barnId: old.barnId || String(b.barns?.[0]?.id ?? ''), stageCode: old.feedCode ? old.stageCode : p.stages?.some(stage => stage.stageCode === old.stageCode) ? old.stageCode : p.stages?.[0]?.stageCode ?? '' }));
      const options = c.catalogs?.find((x) => x.key === 'alimento')?.items ?? [];
      setFeedOptions(options);
      setBarns(b.barns ?? []);
      setWarehouseId((old) => old || String(w.warehouses?.[0]?.id ?? ''));
      setForm((old) => ({
        ...old,
        feedCode: old.feedCode || options[0]?.code || '',
        destinationBarnId: old.destinationBarnId || String(b.barns?.[0]?.id ?? ''),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando alimentación');
    } finally {
      setLoading(false);
    }
  }, [date, planDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setField = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const stage = projection.find(item => item.stageCode === plan.stageCode);
      const feedCode = plan.feedCode || stage?.feedCode;
      if (!feedCode) throw new Error('Configure el alimento de la etapa antes de programar el turno');
      const response = await fetchOperation('/api/feed/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...plan, barnId: Number(plan.barnId), feedCode, plannedKg: Number(plan.plannedKg), operationKey: newOperationKey('plan-alimento') }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'No se pudo guardar la programación');
      setNotice(Number(plan.plannedKg) === 0 ? 'Programación cancelada con su motivo.' : 'Turno programado. El pendiente se completará con entregas reales.');
      setPlan(old => ({ ...old, feedCode: '', plannedKg: '', reason: '' }));
      if (plan.effectiveDate !== planDate) setPlanDate(plan.effectiveDate); else await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar la programación'); }
    finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const turnPayload = turnMode && kind === 'delivery'
        ? {
          turn: {
            ...turn,
            plannedKg: Number(turn.plannedKg),
            servedKg: Number(turn.servedKg),
            consumedKg: turn.consumedKg === '' ? null : Number(turn.consumedKg),
          },
        }
        : {};
      const res = await fetchOperation(turnMode && kind === 'delivery' ? '/api/feed/turns' : '/api/feed/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          movementType: kind,
          warehouseId: Number(warehouseId),
          quantityKg: turnMode && kind === 'delivery' ? Number(turn.servedKg) : Number(form.quantityKg),
          costPerKg: ['opening', 'purchase'].includes(kind) ? Number(form.costPerKg || 0) : undefined,
          destinationBarnId: kind === 'delivery' && form.destinationBarnId ? Number(form.destinationBarnId) : null,
          animalCode: kind === 'delivery' ? form.animalCode : null,
          reversesMovementId: form.reversesMovementId ? Number(form.reversesMovementId) : undefined,
          operationKey: newOperationKey(turnMode && kind === 'delivery' ? 'alimento-turno' : 'alimento'),
          ...turnPayload,
        }),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error || 'No se pudo guardar');
      setNotice(
        turnMode && kind === 'delivery'
          ? 'Turno y consumo registrados en una sola operación.'
          : kind === 'return_supplier'
            ? 'Compra devuelta; existencias y egreso revertidos en una operación.'
            : 'Movimiento registrado y auditado.',
      );
      setForm((old) => ({ ...old, quantityKg: '', reversesMovementId: '', reason: '' }));
      setTurn((old) => ({ ...old, plannedKg: '', servedKg: '', consumedKg: '' }));
      await load();
      if (turnMode && kind === 'delivery') {
        setSection('turnos');
      } else {
        setSection('stock');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const createWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetchOperation('/api/feed/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newWarehouse, operationKey: newOperationKey('almacen') }),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error || 'No se pudo crear el almacén');
      setNewWarehouse({ code: '', name: '', location: '' });
      setNotice('Almacén creado exitosamente.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const stockKg = inventory?.totals.availableKg ?? 0;

  // Filtros memoizados
  const filteredStock = useMemo(() => {
    if (!inventory) return [];
    return inventory.inventory.filter((row) => {
      const matchesWarehouse = !stockWarehouseFilter || String(row.warehouseId) === stockWarehouseFilter;
      const feedName = feedOptions.find((x) => x.code === row.feedCode)?.name ?? row.feedCode;
      const term = stockSearch.toLowerCase().trim();
      const matchesSearch = !term ||
        feedName.toLowerCase().includes(term) ||
        row.lotCode.toLowerCase().includes(term) ||
        row.warehouseName.toLowerCase().includes(term);
      return matchesWarehouse && matchesSearch;
    });
  }, [inventory, stockWarehouseFilter, stockSearch, feedOptions]);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matchesType = !movementFilterType || m.movementType === movementFilterType;
      const term = movementSearch.toLowerCase().trim();
      const matchesSearch = !term ||
        m.warehouseName.toLowerCase().includes(term) ||
        m.feedCode.toLowerCase().includes(term) ||
        m.lotCode.toLowerCase().includes(term) ||
        (m.supplier && m.supplier.toLowerCase().includes(term)) ||
        (m.destinationBarn && m.destinationBarn.toLowerCase().includes(term)) ||
        (m.actorName && m.actorName.toLowerCase().includes(term)) ||
        (m.documentReference && m.documentReference.toLowerCase().includes(term));
      return matchesType && matchesSearch;
    });
  }, [movements, movementFilterType, movementSearch]);

  return (
    <main className="module-container">
      {/* Encabezado del Módulo */}
      <div className="module-heading mb-4">
        <p className="text-xs text-muted">
          Existencias de insumos por almacén, proyección de raciones balanceadas, turnos diarios y conversión alimenticia (FCR).
        </p>
        <div className="inline-flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted inline-flex items-center gap-1" htmlFor="feed-date-corte">
            <IconCalendar size={14} />
            <span>Corte:</span>
          </label>
          <input
            id="feed-date-corte"
            type="date"
            className="form-input form-select-sm"
            max={farmToday()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Fecha de corte para cálculos de stock"
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={() => void load()}
            type="button"
            disabled={loading}
            aria-label="Actualizar existencias y raciones"
            title="Recargar datos de alimentación"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} className={loading ? 'spinner-icon' : ''} />
              <span>{loading ? 'Actualizando…' : 'Actualizar existencias'}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Avisos contextuales */}
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

      {readonly && (
        <div className="alert alert-warning" role="status" aria-live="polite">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconEye size={16} />
            <span>El perfil Veterinario puede consultar datos nutricionales y de stock, pero no registrar movimientos.</span>
          </span>
        </div>
      )}

      {/* KPIs Principales - Punto Focal con Jerarquía Clara */}
      <section className="stats-grid">
        <article className="stat-card stat-card-focal">
          <span className="inline-flex items-center gap-1.5 leading-none">
            <IconWheat size={14} className="text-primary" />
            <span>Existencia disponible</span>
          </span>
          <strong className="text-primary font-numeric tabular-nums">{stockKg.toLocaleString('es-PE')} kg</strong>
          <small className="text-xs text-muted">Stock físico al {date}</small>
        </article>

        <article className="stat-card">
          <span className="inline-flex items-center gap-1.5 leading-none">
            <IconPlus size={14} />
            <span>Recibido acumulado</span>
          </span>
          <strong className="font-numeric tabular-nums">{(inventory?.totals.receivedKg ?? 0).toLocaleString('es-PE')} kg</strong>
          <small className="text-xs text-muted">Total histórico de compras y entradas</small>
        </article>

        <article className="stat-card">
          <span className="inline-flex items-center gap-1.5 leading-none">
            <IconBuilding size={14} />
            <span>Entregado / consumido</span>
          </span>
          <strong className="font-numeric tabular-nums">{(inventory?.totals.withdrawnKg ?? 0).toLocaleString('es-PE')} kg</strong>
          <small className="text-xs text-muted">Raciones servidas a galpones</small>
        </article>

        <article className="stat-card">
          <span className="inline-flex items-center gap-1.5 leading-none">
            <IconScale size={14} />
            <span>Costo asignado</span>
          </span>
          <strong className="font-numeric tabular-nums">S/ {((inventory?.totals.allocatedCostMinor ?? 0) / 100).toFixed(2)}</strong>
          <small className="text-xs text-muted">Valorización de alimento consumido</small>
        </article>
      </section>

      <ModuleTabs
        label="Secciones de alimentación y nutrición"
        active={section}
        onChange={setSection}
        columns={2}
        tabs={[
          { id: 'raciones', label: 'Raciones y Cobertura', icon: <IconWheat size={14} />, ariaLabel: 'Ver raciones y cobertura estimada por etapa' },
          { id: 'stock', label: 'Kardex y Stock', icon: <IconBox size={14} />, ariaLabel: 'Ver kardex y existencias por almacén' },
          { id: 'turnos', label: 'Turnos y Conversión', icon: <IconClock size={14} />, ariaLabel: 'Ver turnos de comederos y conversión alimenticia' },
          { id: 'registrar', label: 'Registrar Insumo', icon: <IconPlus size={14} />, ariaLabel: 'Registrar nuevo movimiento de insumo o alimento' },
        ]}
      />

      {/* Estado de Carga General */}
      {loading && !inventory && (
        <div className="card empty-state-card">
          <div className="empty-icon-wrap">
            <IconRefreshCw size={26} className="text-primary spinner-icon" />
          </div>
          <p className="font-semibold text-base">Cargando datos de alimentación…</p>
          <p className="text-sm text-muted">Consultando raciones, coberturas y existencias al {date}.</p>
        </div>
      )}

      {/* SECCIÓN 1: Raciones y Cobertura */}
      {inventory && section === 'raciones' && (
        <div className="section-block">
          <section className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <div>
                <h2 className="section-title">Raciones y cobertura estimada por etapa</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Pronóstico informativo basado en cabezas y tabla nutricional. Cada etapa se compara con el stock disponible.
                </span>
              </div>
            </div>

            {projection.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin datos de ración para esta fecha"
                description={`No hay animales asignados a etapas con demanda nutricional al corte del ${date}.`}
                icon={<IconWheat size={26} className="text-primary" />}
                action={!readonly ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" aria-label="Ir a registrar movimiento de insumo" onClick={() => setSection('registrar')}><IconPlus size={16} /><span>Registrar movimiento</span></button> : undefined}
              />
            ) : (
              <ul className="data-card-list data-card-grid" aria-label="Raciones y cobertura por etapa">
                {projection.map((row) => (
                  <li key={row.stageCode}>
                    <article className="data-card">
                      <header className="data-card-head">
                        <div className="data-card-identity">
                          <span className="data-card-title">{row.stageName}</span>
                          <span className="data-card-subtitle">{row.heads} cabezas · {row.feedName ?? 'Sin alimento vinculado'}</span>
                        </div>
                        {row.coveredDays === null ? (
                          <span className="badge-status badge-outline">Sin cobertura</span>
                        ) : row.coveredDays >= 15 ? (
                          <span className="badge-status badge-success tabular-nums font-mono">{row.coveredDays} días</span>
                        ) : row.coveredDays >= 5 ? (
                          <span className="badge-status badge-warning tabular-nums font-mono">{row.coveredDays} días</span>
                        ) : (
                          <span className="badge-status badge-danger tabular-nums font-mono">{row.coveredDays} días</span>
                        )}
                      </header>
                      <dl className="data-card-meta">
                        <div><dt>Demanda diaria</dt><dd className="font-mono tabular-nums">{row.dailyKg === null ? <span className="text-muted">Sin dato</span> : `${row.dailyKg} kg`}</dd></div>
                        <div><dt>Necesidad etapa</dt><dd className="font-mono tabular-nums">{row.stageNeedKg === null ? <span className="text-muted">Sin dato</span> : `${row.stageNeedKg} kg`}</dd></div>
                        <div><dt>Necesidad mensual</dt><dd className="font-mono tabular-nums">{row.monthlyNeedKg === null ? <span className="text-muted">Sin dato</span> : `${row.monthlyNeedKg} kg`}</dd></div>
                        <div><dt>Disponible</dt><dd className="font-mono tabular-nums">{row.feedCode ? `${row.availableKg} kg` : <span className="text-muted">Sin ración</span>}</dd></div>
                      </dl>
                      {row.requirements.length > 0 && <p className="data-card-note">{row.requirements.join(' · ')}</p>}
                      <div className="data-card-note font-mono tabular-nums">
                        <span className="flex flex-col gap-0.5">
                          <span>{coverage('Día', row.dailyShortageKg)}</span>
                          <span>{coverage('Etapa', row.stageShortageKg)}</span>
                          <span>{coverage('Mes', row.monthlyShortageKg)}</span>
                        </span>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-header-clean mb-2">
              <div>
                <h2 className="section-title">Demanda conjunta por tipo de alimento</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Suma las etapas que comparten cada insumo antes de contrastar con el stock en almacén.
                </span>
              </div>
            </div>

            {projection.some((row) => row.heads > 0 && !row.feedCode) && (
              <div className="alert alert-warning mb-3">
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconAlertTriangle size={16} />
                  <span>Hay animales en etapas sin alimento vinculado; su requerimiento no está incluido en estos totales.</span>
                </span>
              </div>
            )}

            {feeds.length === 0 ? (
              <DataState
                variant="empty"
                title="No hay raciones vinculadas"
                description="Asigne tipos de alimento a las etapas en el catálogo para generar la demanda agregada."
                icon={<IconWheat size={26} className="text-primary" />}
              />
            ) : (
              <ul className="data-card-list data-card-grid" aria-label="Demanda conjunta por alimento">
                {feeds.map((row) => (
                  <li key={row.feedCode}>
                    <article className="data-card">
                      <header className="data-card-head">
                        <div className="data-card-identity">
                          <span className="data-card-title">{row.feedName ?? row.feedCode}</span>
                          <span className="data-card-subtitle">{row.heads} cabezas</span>
                        </div>
                        {row.coveredDays === null ? (
                          <span className="badge-status badge-outline">Sin cobertura</span>
                        ) : row.coveredDays >= 15 ? (
                          <span className="badge-status badge-success tabular-nums font-mono">{row.coveredDays} días</span>
                        ) : row.coveredDays >= 5 ? (
                          <span className="badge-status badge-warning tabular-nums font-mono">{row.coveredDays} días</span>
                        ) : (
                          <span className="badge-status badge-danger tabular-nums font-mono">{row.coveredDays} días</span>
                        )}
                      </header>
                      <dl className="data-card-meta">
                        <div><dt>Demanda diaria</dt><dd className="font-mono tabular-nums">{row.dailyKg === null ? <span className="text-muted">Sin dato</span> : `${row.dailyKg} kg`}</dd></div>
                        <div><dt>Necesidad mensual</dt><dd className="font-mono tabular-nums">{row.monthlyNeedKg === null ? <span className="text-muted">Sin dato</span> : `${row.monthlyNeedKg} kg`}</dd></div>
                        <div><dt>Disponible</dt><dd className="font-mono tabular-nums">{row.availableKg} kg</dd></div>
                        <div><dt>Faltante mensual</dt><dd className="font-mono tabular-nums">{row.monthlyShortageKg === null ? <span className="text-muted">Sin dato</span> : row.monthlyShortageKg === 0 ? <span className="text-success">Abastecido</span> : <span className="text-danger">{row.monthlyShortageKg} kg</span>}</dd></div>
                      </dl>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* SECCIÓN 2: Kardex y Stock de Almacenes */}
      {inventory && section === 'stock' && (
        <div className="section-block">
          <section className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <div>
                <h2 className="section-title">Existencias por lote en almacenes</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Balance físico disponible y egresos acumulados por insumo
                </span>
              </div>

              <div className="inline-flex items-center gap-2 flex-wrap">
                <div className="search-input-wrap" style={{ minWidth: 180, maxWidth: 240 }}>
                  <span className="search-icon">
                    <IconSearch size={14} />
                  </span>
                  <input
                    type="text"
                    className="form-input form-select-sm search-input"
                    placeholder="Buscar alimento o lote..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    aria-label="Buscar en stock por alimento o lote"
                  />
                </div>

                {warehouses.length > 0 && (
                  <div className="inline-flex items-center gap-1">
                    <label className="text-xs text-muted inline-flex items-center gap-1" htmlFor="stock-wh-filter">
                      <IconFilter size={14} />
                      <span>Almacén:</span>
                    </label>
                    <select
                      id="stock-wh-filter"
                      className="form-select form-select-sm"
                      value={stockWarehouseFilter}
                      onChange={(e) => setStockWarehouseFilter(e.target.value)}
                    >
                      <option value="">Todos los almacenes</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(stockSearch || stockWarehouseFilter) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label="Limpiar búsqueda de existencias"
                    onClick={() => {
                      setStockSearch('');
                      setStockWarehouseFilter('');
                    }}
                    title="Restablecer filtros de stock"
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconX size={12} />
                      <span>Limpiar</span>
                    </span>
                  </button>
                )}
              </div>
            </div>

            {inventory.inventory.length === 0 ? (
              <DataState
                variant="empty"
                title={`No hay existencias al ${date}`}
                description="No hay insumos registrados en los almacenes para la fecha de corte seleccionada."
                icon={<IconBox size={26} className="text-primary" />}
                action={!readonly ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" aria-label="Registrar compra o entrada de insumo" onClick={() => { setKind('purchase'); setSection('registrar'); }}><IconPlus size={16} /><span>Registrar compra / entrada</span></button> : undefined}
              />
            ) : filteredStock.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin existencias para los filtros aplicados"
                description={`No se encontraron lotes que coincidan con "${stockSearch}" en el almacén seleccionado.`}
                icon={<IconFilter size={26} className="text-primary" />}
                action={<button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" aria-label="Restablecer filtros de búsqueda de existencias" onClick={() => { setStockSearch(''); setStockWarehouseFilter(''); }}><IconRefreshCw size={16} /><span>Restablecer filtros</span></button>}
              />
            ) : (
              <ul className="data-card-list data-card-grid" aria-label="Existencias por lote">
                {filteredStock.map((row) => (
                  <li key={`${row.warehouseId}-${row.feedCode}-${row.lotCode}`}>
                    <article className="data-card">
                      <header className="data-card-head">
                        <div className="data-card-identity">
                          <span className="data-card-title">{feedOptions.find((x) => x.code === row.feedCode)?.name ?? row.feedCode}</span>
                          <span className="data-card-subtitle">{row.warehouseName} · lote {row.lotCode}</span>
                        </div>
                        <span className="badge-status badge-success tabular-nums font-mono">{row.availableKg.toLocaleString('es-PE')} kg</span>
                      </header>
                      <dl className="data-card-meta">
                        <div><dt>Disponible</dt><dd className="font-mono tabular-nums text-success">{row.availableKg.toLocaleString('es-PE')} kg</dd></div>
                        <div><dt>Retirado</dt><dd className="font-mono tabular-nums text-muted">{row.withdrawnKg.toLocaleString('es-PE')} kg</dd></div>
                      </dl>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <div>
                <h2 className="section-title">Movimientos recientes de insumos (Kardex)</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Trazabilidad cronológica de compras, raciones entregadas, mermas y devoluciones
                </span>
              </div>

              <div className="inline-flex items-center gap-2 flex-wrap">
                <div className="search-input-wrap" style={{ minWidth: 180, maxWidth: 240 }}>
                  <span className="search-icon">
                    <IconSearch size={14} />
                  </span>
                  <input
                    type="text"
                    className="form-input form-select-sm search-input"
                    placeholder="Buscar responsable, lote..."
                    value={movementSearch}
                    onChange={(e) => setMovementSearch(e.target.value)}
                    aria-label="Buscar en historial de movimientos"
                  />
                </div>

                <div className="inline-flex items-center gap-1">
                  <label className="text-xs text-muted inline-flex items-center gap-1" htmlFor="m-type-filter">
                    <IconFilter size={14} />
                    <span>Operación:</span>
                  </label>
                  <select
                    id="m-type-filter"
                    className="form-select form-select-sm"
                    value={movementFilterType}
                    onChange={(e) => setMovementFilterType(e.target.value)}
                  >
                    <option value="">Todas las operaciones</option>
                    {Object.entries(labels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {(movementSearch || movementFilterType) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label="Limpiar búsqueda de movimientos"
                    onClick={() => {
                      setMovementSearch('');
                      setMovementFilterType('');
                    }}
                    title="Restablecer filtros"
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconX size={12} />
                      <span>Limpiar</span>
                    </span>
                  </button>
                )}
              </div>
            </div>

            {movements.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin movimientos registrados"
                description="Aún no se han asentado operaciones de entrada o consumo de insumos."
                icon={<IconList size={26} className="text-primary" />}
                action={!readonly ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" aria-label="Registrar primer movimiento de insumo" onClick={() => setSection('registrar')}><IconPlus size={16} /><span>Registrar primer movimiento</span></button> : undefined}
              />
            ) : filteredMovements.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin movimientos para los filtros seleccionados"
                description="No se encontraron operaciones con los criterios aplicados."
                icon={<IconFilter size={26} className="text-primary" />}
                action={<button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" aria-label="Restablecer filtros del kardex de insumos" onClick={() => { setMovementSearch(''); setMovementFilterType(''); }}><IconRefreshCw size={16} /><span>Restablecer filtros</span></button>}
              />
            ) : (
              <ul className="data-card-list" aria-label="Kardex de insumos">
                {filteredMovements.map((m) => {
                  const isPositive = ['purchase', 'return_in', 'opening'].includes(m.movementType);
                  return (
                    <li key={m.id}>
                      <article className="data-card" data-state={isPositive ? 'active' : 'inactive'}>
                        <header className="data-card-head">
                          <div className="data-card-identity">
                            <span className="data-card-title font-mono tabular-nums">{m.effectiveDate}</span>
                            <span className="data-card-subtitle">{m.warehouseCode} · {m.feedCode} · lote {m.lotCode}</span>
                          </div>
                          <span className={MOVEMENT_TYPE_BADGES[m.movementType] ?? 'badge-tag'}>{labels[m.movementType] ?? m.movementType}</span>
                        </header>
                        <dl className="data-card-meta">
                          <div><dt>Cantidad</dt><dd className={`font-mono font-bold tabular-nums ${isPositive ? 'text-success' : 'text-danger'}`}>{isPositive ? '+' : '−'}{m.quantityKg} kg</dd></div>
                          <div><dt>Destino</dt><dd>{m.animalCode ?? m.destinationBarn ?? <span className="text-muted">Sin destino</span>}</dd></div>
                          <div><dt>Costo y documento</dt><dd className="font-mono tabular-nums">{[`${m.currencyCode} ${m.totalCost.toFixed(2)}`, m.documentReference].filter(Boolean).join(' · ')}</dd></div>
                          <div><dt>Responsable</dt><dd>{m.actorName}</dd></div>
                        </dl>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* SECCIÓN 3: Turnos y Conversión */}
      {inventory && section === 'turnos' && (
        <div className="section-block">
          <section className="card">
            <h2 className="section-title">Programar alimentación</h2>
            <p className="text-sm text-muted">Programar no retira alimento del almacén. Las entregas reales completan el pendiente, aunque procedan de distintos lotes.</p>
            {!readonly && <form className="form-stack" onSubmit={savePlan}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="plan-date">Fecha del turno programado</label>
                  <input id="plan-date" disabled={Boolean(plan.feedCode)} type="date" className="form-input" required value={plan.effectiveDate} onChange={event => setPlan({ ...plan, effectiveDate: event.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="plan-shift">Turno programado</label>
                  <select id="plan-shift" disabled={Boolean(plan.feedCode)} className="form-select" value={plan.shiftCode} onChange={event => setPlan({ ...plan, shiftCode: event.target.value })}>
                    {Object.entries(SHIFT_LABELS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="plan-barn">Galpón del turno programado</label>
                  <select id="plan-barn" disabled={Boolean(plan.feedCode)} className="form-select" required value={plan.barnId} onChange={event => setPlan({ ...plan, barnId: event.target.value })}>
                    {barns.map(barn => <option key={barn.id} value={barn.id}>{barn.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="plan-stage">Etapa del turno programado</label>
                  <select id="plan-stage" disabled={Boolean(plan.feedCode)} className="form-select" required value={plan.stageCode} onChange={event => setPlan({ ...plan, stageCode: event.target.value })}>
                    {plan.feedCode && !projection.some(stage => stage.stageCode === plan.stageCode) && <option value={plan.stageCode}>{plan.stageCode} · etapa original</option>}
                    {projection.map(stage => <option key={stage.stageCode} value={stage.stageCode}>{stage.stageName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="plan-feed">Alimento previsto</label>
                  <input id="plan-feed" className="form-input" readOnly value={plan.feedCode ? feedOptions.find(feed => feed.code === plan.feedCode)?.name ?? plan.feedCode : projection.find(stage => stage.stageCode === plan.stageCode)?.feedName ?? 'Configure el alimento de la etapa'} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="plan-kg">Cantidad prevista del turno (kg)</label>
                  <input id="plan-kg" className="form-input" type="number" min="0" step="0.001" required value={plan.plannedKg} onChange={event => setPlan({ ...plan, plannedKg: event.target.value })} />
                  <span className="text-xs text-muted">Para cancelar una programación, indique 0 y explique el motivo.</span>
                </div>
                <div className="form-group form-col-span-full">
                  <label className="form-label" htmlFor="plan-reason">Motivo de la programación</label>
                  <textarea id="plan-reason" className="form-textarea" required minLength={5} maxLength={500} rows={2} value={plan.reason} onChange={event => setPlan({ ...plan, reason: event.target.value })} />
                </div>
              </div>
              <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy || !plan.barnId}>{busy ? 'Guardando…' : 'Guardar programación'}</button>{plan.feedCode && <button type="button" className="btn btn-outline" onClick={() => setPlan(old => ({ ...old, feedCode: '', plannedKg: '', reason: '' }))}>Nueva programación</button>}</div>
            </form>}
            <h3 className="section-title mt-4">Programación del {planDate}</h3>
            <div className="form-group"><label className="form-label" htmlFor="plan-filter-date">Consultar programación por fecha</label><input id="plan-filter-date" type="date" className="form-input" value={planDate} onChange={event => { if (event.target.value) setPlanDate(event.target.value); }} /></div>
            {plans.length === 0 ? <DataState variant="empty" title="No hay turnos programados para esta fecha" description={`Sin programación registrada para el ${planDate}.`} icon={<IconCalendar size={26} className="text-primary" />} /> : <ul className="data-card-list data-card-grid" aria-label={`Programación del ${planDate}`}>
              {plans.map(item => <li key={item.groupKey}>
                <article className="data-card">
                  <header className="data-card-head">
                    <div className="data-card-identity">
                      <span className="data-card-title font-mono tabular-nums">{item.effectiveDate}</span>
                      <span className="data-card-subtitle">{item.barnName} · {projection.find(stage => stage.stageCode === item.stageCode)?.stageName ?? item.stageCode}</span>
                    </div>
                    <span className={item.pendingKg > 0 ? 'badge-status badge-warning' : 'badge-status badge-success'}>{item.plannedKg === 0 ? 'Cancelado' : `Pendiente: ${item.pendingKg} kg`}</span>
                  </header>
                  <dl className="data-card-meta">
                    <div><dt>Turno</dt><dd>{SHIFT_LABELS[item.shiftCode] ?? item.shiftCode}</dd></div>
                    <div><dt>Previsto</dt><dd className="font-mono tabular-nums">{item.plannedKg} kg</dd></div>
                    <div><dt>Servido</dt><dd className="font-mono tabular-nums">{item.servedKg} kg</dd></div>
                    <div><dt>Alimento</dt><dd>{feedOptions.find(feed => feed.code === item.feedCode)?.name ?? item.feedCode}</dd></div>
                  </dl>
                  {!readonly && <div className="data-card-actions">
                    <button className="btn btn-outline" type="button" aria-label={`Editar programación de ${item.barnName}, ${SHIFT_LABELS[item.shiftCode] ?? item.shiftCode}`} onClick={() => setPlan({ effectiveDate: item.effectiveDate, shiftCode: item.shiftCode, barnId: String(item.barnId), stageCode: item.stageCode, feedCode: item.feedCode, plannedKg: String(item.plannedKg), reason: '' })}><IconRefreshCw size={14} /><span>Editar</span></button>
                  </div>}
                </article>
              </li>)}
            </ul>}
          </section>
          <section className="card">
            <div className="card-header-clean mb-2">
              <div>
                <h2 className="section-title">Turnos de comederos servidos</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Control por turno de raciones previstas vs servidas y sobrantes medidos
                </span>
              </div>
              {!readonly && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label="Registrar nuevo turno de alimentación"
                  onClick={() => {
                    setKind('delivery');
                    setTurnMode(true);
                    setSection('registrar');
                  }}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Nuevo turno</span>
                  </span>
                </button>
              )}
            </div>

            {turns.length === 0 ? (
              <DataState
                variant="empty"
                title="Aún no hay turnos registrados"
                description="Registre turnos de alimentación para monitorear el consumo exacto de los lotes y alimentar el cálculo de FCR."
                icon={<IconClock size={26} className="text-primary" />}
                action={!readonly ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" aria-label="Registrar turno de alimentación" onClick={() => { setKind('delivery'); setTurnMode(true); setSection('registrar'); }}><IconPlus size={16} /><span>Registrar turno ahora</span></button> : undefined}
              />
            ) : (
              <ul className="data-card-list data-card-grid" aria-label="Turnos servidos">
                {turns.map((row) => (
                  <li key={row.id}>
                    <article className="data-card">
                      <header className="data-card-head">
                        <div className="data-card-identity">
                          <span className="data-card-title font-mono tabular-nums">{row.effectiveDate}</span>
                          <span className="data-card-subtitle">{row.barnName} · {row.stageCode}</span>
                        </div>
                        <span className={row.shiftCode === 'manana' ? 'badge-tag' : row.shiftCode === 'tarde' ? 'badge-info' : 'badge-outline'}>
                          {SHIFT_LABELS[row.shiftCode] ?? row.shiftCode}
                        </span>
                      </header>
                      <dl className="data-card-meta">
                        <div><dt>Previsto</dt><dd className="font-mono tabular-nums">{row.plannedKg} kg</dd></div>
                        <div><dt>Servido</dt><dd className="font-mono tabular-nums text-primary">{row.servedKg} kg</dd></div>
                        <div><dt>Consumido medido</dt><dd className="font-mono tabular-nums">{row.consumedKg === null ? <span className="text-muted">Sin medición</span> : <span className="text-success">{row.consumedKg} kg</span>}</dd></div>
                      </dl>
                      <p className="data-card-note font-mono">{row.feedCode} · lote {row.lotCode}</p>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-header-clean mb-2">
              <div>
                <h2 className="section-title">Conversión alimenticia (FCR) · Últimos 30 días</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Índice kg alimento / kg peso ganado. Requiere cubrir toda la población estable, pesajes en ambos extremos del periodo y consumo medido cada día.
                </span>
              </div>
            </div>

            {conversion.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin cálculos de conversión en los últimos 30 días"
                description="Registre consumo real cada día y pesajes de todas las cabezas en ambos extremos del periodo, con historial continuo en el mismo galpón y etapa."
                icon={<IconScale size={26} className="text-primary" />}
              />
            ) : (
              <ul className="data-card-list data-card-grid" aria-label="Conversión alimenticia por galpón">
                {conversion.map((row) => (
                  <li key={`${row.barnId}-${row.stageCode}`}>
                    <article className="data-card">
                      <header className="data-card-head">
                        <div className="data-card-identity">
                          <span className="data-card-title">{row.barnName}</span>
                          <span className="data-card-subtitle">{row.stageCode} · {row.periodFrom} – {row.periodTo}</span>
                        </div>
                        {row.feedConversionRatio === null ? (
                          <span className="badge-status badge-outline">No disponible</span>
                        ) : (
                          <span className="badge-status badge-primary tabular-nums font-mono">{row.feedConversionRatio} kg/kg</span>
                        )}
                      </header>
                      <dl className="data-card-meta">
                        <div><dt>Animales comparables</dt><dd className="font-mono tabular-nums">{row.comparableAnimals} / {row.populationHeads} · {row.coveragePercent}%</dd></div>
                        <div><dt>Consumo medido</dt><dd className="font-mono tabular-nums">{row.consumedKg} kg · {row.consumptionDays} / {row.requiredConsumptionDays} días</dd></div>
                        <div><dt>Ganancia neta</dt><dd className="font-mono tabular-nums">{row.weightGainKg} kg</dd></div>
                      </dl>
                      {row.feedConversionRatio === null && row.unavailableReason && <p className="data-card-note">{row.unavailableReason}</p>}
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* SECCIÓN 4: Registrar Operación */}
      {section === 'registrar' && (
        <div className="section-block">
          {!readonly ? (
            <section className="card">
              <div className="card-header-clean mb-2">
                <div>
                  <h2 className="section-title">Registrar movimiento de insumos</h2>
                  <span className="text-xs text-muted block mt-0.5">
                    Libro inmutable de almacén con registro de lote, costos y turnos de entrega
                  </span>
                </div>
              </div>

              <form className="form-stack" onSubmit={submit}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="feed-kind">Tipo de movimiento</label>
                    <select
                      id="feed-kind"
                      className="form-select"
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      {Object.entries(labels).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="feed-eff-date">Fecha efectiva</label>
                    <input
                      id="feed-eff-date"
                      type="date"
                      className="form-input"
                      max={farmToday()}
                      required
                      value={form.effectiveDate}
                      onChange={(e) => setField('effectiveDate', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="feed-warehouse">Almacén</label>
                    <select
                      id="feed-warehouse"
                      className="form-select"
                      required
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}{w.barnName ? ` · ${w.barnName}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="feed-type-code">Tipo de alimento</label>
                    <select
                      id="feed-type-code"
                      className="form-select"
                      required
                      value={form.feedCode}
                      onChange={(e) => setField('feedCode', e.target.value)}
                    >
                      {feedOptions.map((x) => (
                        <option key={x.code} value={x.code}>{x.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="feed-lot-code">Lote del insumo</label>
                    <input
                      id="feed-lot-code"
                      className="form-input"
                      required
                      maxLength={80}
                      placeholder="Ej. LOT-2026-04"
                      value={form.lotCode}
                      onChange={(e) => setField('lotCode', e.target.value)}
                    />
                  </div>

                  {kind === 'return_supplier' && (
                    <div className="form-group form-col-span-full">
                      <label className="form-label" htmlFor="feed-reverse-id">Compra original a devolver</label>
                      <select
                        id="feed-reverse-id"
                        className="form-select"
                        required
                        value={form.reversesMovementId}
                        onChange={(e) => {
                          const original = movements.find((item) => item.id === Number(e.target.value));
                          setForm((old) => ({
                            ...old,
                            reversesMovementId: e.target.value,
                            feedCode: original?.feedCode ?? old.feedCode,
                            lotCode: original?.lotCode ?? old.lotCode,
                            quantityKg: original ? String(original.quantityKg) : old.quantityKg,
                            costPerKg: original ? String(original.costPerKg) : old.costPerKg,
                            supplier: original?.supplier ?? old.supplier,
                            documentReference: original?.documentReference ?? old.documentReference,
                          }));
                        }}
                      >
                        <option value="">Seleccione la compra que se devuelve</option>
                        {movements
                          .filter((item) => item.movementType === 'purchase' && !movements.some((other) => other.reversesMovementId === item.id))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.effectiveDate} · {item.warehouseCode} · {item.feedCode} · {item.lotCode} · {item.quantityKg} kg · {item.currencyCode} {item.totalCost.toFixed(2)}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {['purchase', 'return_in', 'return_supplier'].includes(kind) && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-supplier">Proveedor</label>
                        <input
                          id="feed-supplier"
                          className="form-input"
                          required={kind === 'purchase'}
                          placeholder="Nombre o razón social"
                          value={form.supplier}
                          onChange={(e) => setField('supplier', e.target.value)}
                        />
                      </div>

                      {kind !== 'return_in' && (
                        <div className="form-group">
                          <label className="form-label" htmlFor="feed-doc">Documento de compra</label>
                          <input
                            id="feed-doc"
                            className="form-input"
                            maxLength={100}
                            placeholder="Ej. Factura F001-1234"
                            value={form.documentReference}
                            onChange={(e) => setField('documentReference', e.target.value)}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {!(kind === 'delivery' && turnMode) && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="feed-qty">Cantidad (kg)</label>
                      <input
                        id="feed-qty"
                        type="number"
                        min="0.001"
                        step="0.001"
                        className="form-input"
                        required
                        placeholder="0.000"
                        value={form.quantityKg}
                        onChange={(e) => setField('quantityKg', e.target.value)}
                      />
                    </div>
                  )}

                  {['opening', 'purchase'].includes(kind) ? <div className="form-group">
                    <label className="form-label" htmlFor="feed-cost">Costo por kg (S/)</label>
                    <input
                      id="feed-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input"
                      required
                      placeholder="0.00"
                      value={form.costPerKg}
                      onChange={(e) => setField('costPerKg', e.target.value)}
                    />
                  </div> : <p className="form-col-span-full text-sm text-muted">
                    {kind === 'return_supplier'
                      ? 'La devolución toma el importe de la compra original.'
                      : 'El costo se calcula con el promedio ponderado del saldo del almacén para este alimento y lote. Los reintegros conservan ese valor.'}
                    {' '}Registre los movimientos en orden de fecha para conservar los costos ya asignados.
                  </p>}

                  {kind === 'delivery' && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-dest-barn">Galpón destino</label>
                        <select
                          id="feed-dest-barn"
                          className="form-select"
                          required
                          value={form.destinationBarnId}
                          onChange={(e) => setField('destinationBarnId', e.target.value)}
                        >
                          {barns.map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-animal-code">Animal específico (opcional)</label>
                        <input
                          id="feed-animal-code"
                          className="form-input"
                          maxLength={40}
                          value={form.animalCode}
                          onChange={(e) => setField('animalCode', e.target.value)}
                          placeholder="Código individual si aplica"
                        />
                      </div>

                      <div className="form-group form-col-span-full">
                        <label className="checkbox-label" htmlFor="feed-turn-mode">
                          <input
                            id="feed-turn-mode"
                            type="checkbox"
                            checked={turnMode}
                            onChange={(e) => setTurnMode(e.target.checked)}
                          />
                          <span>Registrar como turno de alimentación con cantidades previstas y servidas</span>
                        </label>
                      </div>
                    </>
                  )}

                  {kind === 'delivery' && turnMode && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-shift">Turno</label>
                        <select
                          id="feed-shift"
                          className="form-select"
                          value={turn.shiftCode}
                          onChange={(e) => setTurn({ ...turn, shiftCode: e.target.value })}
                        >
                          <option value="manana">Mañana</option>
                          <option value="tarde">Tarde</option>
                          <option value="noche">Noche</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-stage">Etapa</label>
                        <select
                          id="feed-stage"
                          className="form-select"
                          value={turn.stageCode}
                          onChange={(e) => {
                            const stage = projection.find((item) => item.stageCode === e.target.value);
                            setTurn({ ...turn, stageCode: e.target.value });
                            if (stage?.feedCode) setField('feedCode', stage.feedCode);
                          }}
                        >
                          {projection.map((x) => (
                            <option key={x.stageCode} value={x.stageCode}>{x.stageName}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-planned">Previsto (kg)</label>
                        <input
                          id="feed-planned"
                          type="number"
                          min="0"
                          step="0.001"
                          className="form-input"
                          required
                          placeholder="0.000"
                          value={turn.plannedKg}
                          onChange={(e) => setTurn({ ...turn, plannedKg: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-served">Servido real (kg)</label>
                        <input
                          id="feed-served"
                          type="number"
                          min="0.001"
                          step="0.001"
                          className="form-input"
                          required
                          placeholder="0.000"
                          value={turn.servedKg}
                          onChange={(e) => setTurn({ ...turn, servedKg: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="feed-consumed">Consumido real medido (kg, opcional)</label>
                        <input
                          id="feed-consumed"
                          type="number"
                          min="0"
                          step="0.001"
                          className="form-input"
                          placeholder="0.000 si se midió sobrante"
                          value={turn.consumedKg}
                          onChange={(e) => setTurn({ ...turn, consumedKg: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  <div className="form-group form-col-span-full">
                    <label className="form-label" htmlFor="feed-reason">Motivo u observaciones</label>
                    <textarea
                      id="feed-reason"
                      className="form-textarea"
                      required
                      maxLength={500}
                      rows={2}
                      placeholder="Detalle de la operación o justificación de egreso / merma"
                      value={form.reason}
                      onChange={(e) => setField('reason', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !warehouseId}
                    aria-label={busy ? 'Guardando…' : turnMode && kind === 'delivery' ? 'Registrar turno y consumo de alimento' : 'Registrar movimiento de insumo'}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconCheck size={16} />
                      <span>{busy ? 'Guardando…' : turnMode && kind === 'delivery' ? 'Registrar turno y consumo' : 'Registrar movimiento de insumo'}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    aria-label="Limpiar campos del formulario de insumos"
                    onClick={() => {
                      setForm({
                        effectiveDate: farmToday(),
                        feedCode: feedOptions[0]?.code ?? '',
                        lotCode: '',
                        supplier: '',
                        quantityKg: '',
                        costPerKg: '',
                        destinationBarnId: String(barns[0]?.id ?? ''),
                        animalCode: '',
                        documentReference: '',
                        reversesMovementId: '',
                        reason: '',
                      });
                      setTurn({
                        shiftCode: 'manana',
                        stageCode: 'preinicio',
                        plannedKg: '',
                        servedKg: '',
                        consumedKg: '',
                      });
                    }}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconRefreshCw size={14} />
                      <span>Limpiar campos</span>
                    </span>
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <div className="card empty-state-card">
              <div className="empty-icon-wrap">
                <IconEye size={26} className="text-muted" />
              </div>
              <p className="font-semibold text-base">Modo solo lectura</p>
              <p className="text-sm text-muted">
                El perfil Veterinario solo puede consultar raciones y existencias. Un administrador u operario registra movimientos.
              </p>
            </div>
          )}

          {perfil === 'administrador' && (
            <section className="card mt-4">
              <div className="card-header-clean mb-2">
                <div>
                  <h2 className="section-title">Administrar almacenes</h2>
                  <span className="text-xs text-muted block mt-0.5">
                    Habilitar bodegas o tolvas de acopio de concentrado
                  </span>
                </div>
              </div>

              <form className="form-stack" onSubmit={createWarehouse}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="wh-code">Código</label>
                    <input
                      id="wh-code"
                      className="form-input"
                      required
                      placeholder="Ej. ALM-02"
                      value={newWarehouse.code}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, code: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="wh-name">Nombre</label>
                    <input
                      id="wh-name"
                      className="form-input"
                      required
                      placeholder="Ej. Tolva Principal Cerdos"
                      value={newWarehouse.name}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="wh-loc">Ubicación</label>
                    <input
                      id="wh-loc"
                      className="form-input"
                      placeholder="Ej. Galpón de Gestación"
                      value={newWarehouse.location}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-secondary"
                    disabled={busy}
                    aria-label={busy ? 'Creando almacén…' : 'Registrar nuevo almacén o silo'}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>{busy ? 'Creando…' : 'Registrar almacén / silo'}</span>
                    </span>
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

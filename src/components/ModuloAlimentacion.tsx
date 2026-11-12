import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  IconWheat,
  IconX,
} from './icons';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import { errorMessage } from '../utils/format';
import { DataState } from './DataState';
import { ModuleTabs } from './ModuleTabs';
import {
  PageHeader,
  InlineAlert,
  KpiCard,
  StatusBadge,
  type BadgeTone,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardNote,
  DataCardActions,
  SectionCard,
  SearchField,
  FormField,
} from './ui';
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

const MOVEMENT_TYPE_BADGES: Record<string, BadgeTone> = {
  opening: 'outline',
  purchase: 'success',
  return_in: 'success',
  delivery: 'warning',
  waste: 'danger',
  return_supplier: 'danger',
};

function coverage(period: string, shortage: number | null): string {
  if (shortage === null) return `${period}: sin datos`;
  if (shortage === 0) return `${period}: suficiente`;
  return `${period}: faltan ${shortage} kg`;
}

function coverageBadge(coveredDays: number | null) {
  if (coveredDays === null) return <StatusBadge tone="outline">Sin cobertura</StatusBadge>;
  return (
    <StatusBadge
      tone={coveredDays >= 15 ? 'success' : coveredDays >= 5 ? 'warning' : 'danger'}
      className="tabular-nums font-mono"
    >
      {coveredDays} días
    </StatusBadge>
  );
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
      setError(errorMessage(e, 'Error cargando alimentación'));
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
    } catch (error) { setError(errorMessage(error, 'No se pudo guardar la programación')); }
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
      setError(errorMessage(e, 'No se pudo guardar'));
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
      setError(errorMessage(e, 'No se pudo crear'));
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
      <PageHeader
        title="Alimentación y Nutrición"
        subtitle="Existencias de insumos por almacén, proyección de raciones balanceadas, turnos diarios y conversión alimenticia (FCR)."
        cutoff={{ label: 'Corte:', value: date, onChange: setDate, max: farmToday() }}
        actions={
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
        }
      />

      {/* Avisos contextuales */}
      {error && <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>}

      {notice && <InlineAlert tone="success" onDismiss={() => setNotice('')}>{notice}</InlineAlert>}

      {readonly && (
        <InlineAlert tone="warning">
          El perfil Veterinario puede consultar datos nutricionales y de stock, pero no registrar movimientos.
        </InlineAlert>
      )}

      {/* KPIs Principales - Punto Focal con Jerarquía Clara */}
      <section className="stats-grid">
        <KpiCard
          label="Existencia disponible"
          value={`${stockKg.toLocaleString('es-PE')} kg`}
          detail={`Stock físico al ${date}`}
          icon={<IconWheat size={14} className="text-primary" />}
          focal
        />
        <KpiCard
          label="Recibido acumulado"
          value={`${(inventory?.totals.receivedKg ?? 0).toLocaleString('es-PE')} kg`}
          detail="Total histórico de compras y entradas"
          icon={<IconPlus size={14} />}
        />
        <KpiCard
          label="Entregado / consumido"
          value={`${(inventory?.totals.withdrawnKg ?? 0).toLocaleString('es-PE')} kg`}
          detail="Raciones servidas a galpones"
          icon={<IconBuilding size={14} />}
        />
        <KpiCard
          label="Costo asignado"
          value={`S/ ${((inventory?.totals.allocatedCostMinor ?? 0) / 100).toFixed(2)}`}
          detail="Valorización de alimento consumido"
          icon={<IconScale size={14} />}
        />
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
        <DataState
          variant="loading"
          title="Cargando datos de alimentación…"
          description={`Consultando raciones, coberturas y existencias al ${date}.`}
        />
      )}

      {/* SECCIÓN 1: Raciones y Cobertura */}
      {inventory && section === 'raciones' && (
        <div className="section-block">
          <SectionCard
            title="Raciones y cobertura estimada por etapa"
            subtitle="Pronóstico informativo basado en cabezas y tabla nutricional. Cada etapa se compara con el stock disponible."
          >
            {projection.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin datos de ración para esta fecha"
                description={`No hay animales asignados a etapas con demanda nutricional al corte del ${date}.`}
                icon={<IconWheat size={26} className="text-primary" />}
                action={!readonly ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" aria-label="Ir a registrar movimiento de insumo" onClick={() => setSection('registrar')}><IconPlus size={16} /><span>Registrar movimiento</span></button> : undefined}
              />
            ) : (
              <DataCardList label="Raciones y cobertura por etapa" grid>
                {projection.map((row) => (
                  <DataCard key={row.stageCode}>
                    <DataCardHead
                      title={row.stageName}
                      subtitle={`${row.heads} cabezas · ${row.feedName ?? 'Sin alimento vinculado'}`}
                      badge={coverageBadge(row.coveredDays)}
                    />
                    <DataCardMeta items={[
                      { label: 'Demanda diaria', value: row.dailyKg === null ? <span className="text-muted">Sin dato</span> : `${row.dailyKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Necesidad etapa', value: row.stageNeedKg === null ? <span className="text-muted">Sin dato</span> : `${row.stageNeedKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Necesidad mensual', value: row.monthlyNeedKg === null ? <span className="text-muted">Sin dato</span> : `${row.monthlyNeedKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Disponible', value: row.feedCode ? `${row.availableKg} kg` : <span className="text-muted">Sin ración</span>, className: 'font-mono tabular-nums' },
                    ]} />
                    {row.requirements.length > 0 && <DataCardNote>{row.requirements.join(' · ')}</DataCardNote>}
                    <div className="data-card-note font-mono tabular-nums">
                      <span className="flex flex-col gap-0.5">
                        <span>{coverage('Día', row.dailyShortageKg)}</span>
                        <span>{coverage('Etapa', row.stageShortageKg)}</span>
                        <span>{coverage('Mes', row.monthlyShortageKg)}</span>
                      </span>
                    </div>
                  </DataCard>
                ))}
              </DataCardList>
            )}
          </SectionCard>

          <SectionCard
            title="Demanda conjunta por tipo de alimento"
            subtitle="Suma las etapas que comparten cada insumo antes de contrastar con el stock en almacén."
          >
            {projection.some((row) => row.heads > 0 && !row.feedCode) && (
              <div className="mb-3">
                <InlineAlert tone="warning">
                  Hay animales en etapas sin alimento vinculado; su requerimiento no está incluido en estos totales.
                </InlineAlert>
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
              <DataCardList label="Demanda conjunta por alimento" grid>
                {feeds.map((row) => (
                  <DataCard key={row.feedCode}>
                    <DataCardHead
                      title={row.feedName ?? row.feedCode}
                      subtitle={`${row.heads} cabezas`}
                      badge={coverageBadge(row.coveredDays)}
                    />
                    <DataCardMeta items={[
                      { label: 'Demanda diaria', value: row.dailyKg === null ? <span className="text-muted">Sin dato</span> : `${row.dailyKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Necesidad mensual', value: row.monthlyNeedKg === null ? <span className="text-muted">Sin dato</span> : `${row.monthlyNeedKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Disponible', value: `${row.availableKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Faltante mensual', value: row.monthlyShortageKg === null ? <span className="text-muted">Sin dato</span> : row.monthlyShortageKg === 0 ? <span className="text-success">Abastecido</span> : <span className="text-danger">{row.monthlyShortageKg} kg</span>, className: 'font-mono tabular-nums' },
                    ]} />
                  </DataCard>
                ))}
              </DataCardList>
            )}
          </SectionCard>
        </div>
      )}

      {/* SECCIÓN 2: Kardex y Stock de Almacenes */}
      {inventory && section === 'stock' && (
        <div className="section-block">
          <SectionCard
            title="Existencias por lote en almacenes"
            subtitle="Balance físico disponible y egresos acumulados por insumo"
            actions={
              <>
                <SearchField
                  value={stockSearch}
                  onChange={setStockSearch}
                  placeholder="Buscar alimento o lote..."
                  label="Buscar en stock por alimento o lote"
                />

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
              </>
            }
          >

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
              <DataCardList label="Existencias por lote" grid>
                {filteredStock.map((row) => (
                  <DataCard key={`${row.warehouseId}-${row.feedCode}-${row.lotCode}`}>
                    <DataCardHead
                      title={feedOptions.find((x) => x.code === row.feedCode)?.name ?? row.feedCode}
                      subtitle={`${row.warehouseName} · lote ${row.lotCode}`}
                      badge={<StatusBadge tone="success" className="tabular-nums font-mono">{row.availableKg.toLocaleString('es-PE')} kg</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Disponible', value: `${row.availableKg.toLocaleString('es-PE')} kg`, className: 'font-mono tabular-nums text-success' },
                      { label: 'Retirado', value: `${row.withdrawnKg.toLocaleString('es-PE')} kg`, className: 'font-mono tabular-nums text-muted' },
                    ]} />
                  </DataCard>
                ))}
              </DataCardList>
            )}
          </SectionCard>

          <SectionCard
            title="Movimientos recientes de insumos (Kardex)"
            subtitle="Trazabilidad cronológica de compras, raciones entregadas, mermas y devoluciones"
            actions={
              <>
                <SearchField
                  value={movementSearch}
                  onChange={setMovementSearch}
                  placeholder="Buscar responsable, lote..."
                  label="Buscar en historial de movimientos"
                />

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
              </>
            }
          >

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
              <DataCardList label="Kardex de insumos">
                {filteredMovements.map((m) => {
                  const isPositive = ['purchase', 'return_in', 'opening'].includes(m.movementType);
                  return (
                    <DataCard key={m.id} state={isPositive ? 'active' : 'inactive'}>
                      <DataCardHead
                        title={<span className="font-mono tabular-nums">{m.effectiveDate}</span>}
                        subtitle={`${m.warehouseCode} · ${m.feedCode} · lote ${m.lotCode}`}
                        badge={<StatusBadge tone={MOVEMENT_TYPE_BADGES[m.movementType] ?? 'outline'}>{labels[m.movementType] ?? m.movementType}</StatusBadge>}
                      />
                      <DataCardMeta items={[
                        { label: 'Cantidad', value: `${isPositive ? '+' : '−'}${m.quantityKg} kg`, className: `font-mono font-bold tabular-nums ${isPositive ? 'text-success' : 'text-danger'}` },
                        { label: 'Destino', value: m.animalCode ?? m.destinationBarn ?? <span className="text-muted">Sin destino</span> },
                        { label: 'Costo y documento', value: [`${m.currencyCode} ${m.totalCost.toFixed(2)}`, m.documentReference].filter(Boolean).join(' · '), className: 'font-mono tabular-nums' },
                        { label: 'Responsable', value: m.actorName },
                      ]} />
                    </DataCard>
                  );
                })}
              </DataCardList>
            )}
          </SectionCard>
        </div>
      )}

      {/* SECCIÓN 3: Turnos y Conversión */}
      {inventory && section === 'turnos' && (
        <div className="section-block">
          <SectionCard
            title="Programar alimentación"
            subtitle="Programar no retira alimento del almacén. Las entregas reales completan el pendiente, aunque procedan de distintos lotes."
          >
            {!readonly && <form className="form-stack" onSubmit={savePlan}>
              <div className="form-grid">
                <FormField label="Fecha del turno programado" htmlFor="plan-date">
                  <input id="plan-date" disabled={Boolean(plan.feedCode)} type="date" className="form-input" required value={plan.effectiveDate} onChange={event => setPlan({ ...plan, effectiveDate: event.target.value })} />
                </FormField>
                <FormField label="Turno programado" htmlFor="plan-shift">
                  <select id="plan-shift" disabled={Boolean(plan.feedCode)} className="form-select" value={plan.shiftCode} onChange={event => setPlan({ ...plan, shiftCode: event.target.value })}>
                    {Object.entries(SHIFT_LABELS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </FormField>
                <FormField label="Galpón del turno programado" htmlFor="plan-barn">
                  <select id="plan-barn" disabled={Boolean(plan.feedCode)} className="form-select" required value={plan.barnId} onChange={event => setPlan({ ...plan, barnId: event.target.value })}>
                    {barns.map(barn => <option key={barn.id} value={barn.id}>{barn.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Etapa del turno programado" htmlFor="plan-stage">
                  <select id="plan-stage" disabled={Boolean(plan.feedCode)} className="form-select" required value={plan.stageCode} onChange={event => setPlan({ ...plan, stageCode: event.target.value })}>
                    {plan.feedCode && !projection.some(stage => stage.stageCode === plan.stageCode) && <option value={plan.stageCode}>{plan.stageCode} · etapa original</option>}
                    {projection.map(stage => <option key={stage.stageCode} value={stage.stageCode}>{stage.stageName}</option>)}
                  </select>
                </FormField>
                <FormField label="Alimento previsto" htmlFor="plan-feed">
                  <input id="plan-feed" className="form-input" readOnly value={plan.feedCode ? feedOptions.find(feed => feed.code === plan.feedCode)?.name ?? plan.feedCode : projection.find(stage => stage.stageCode === plan.stageCode)?.feedName ?? 'Configure el alimento de la etapa'} />
                </FormField>
                <FormField label="Cantidad prevista del turno (kg)" htmlFor="plan-kg">
                  <input id="plan-kg" className="form-input" type="number" min="0" step="0.001" required value={plan.plannedKg} onChange={event => setPlan({ ...plan, plannedKg: event.target.value })} />
                  <span className="text-xs text-muted">Para cancelar una programación, indique 0 y explique el motivo.</span>
                </FormField>
                <FormField label="Motivo de la programación" htmlFor="plan-reason" className="form-col-span-full">
                  <textarea id="plan-reason" className="form-textarea" required minLength={5} maxLength={500} rows={2} value={plan.reason} onChange={event => setPlan({ ...plan, reason: event.target.value })} />
                </FormField>
              </div>
              <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy || !plan.barnId}>{busy ? 'Guardando…' : 'Guardar programación'}</button>{plan.feedCode && <button type="button" className="btn btn-outline" onClick={() => setPlan(old => ({ ...old, feedCode: '', plannedKg: '', reason: '' }))}>Nueva programación</button>}</div>
            </form>}
            <h3 className="section-title mt-4">Programación del {planDate}</h3>
            <FormField label="Consultar programación por fecha" htmlFor="plan-filter-date"><input id="plan-filter-date" type="date" className="form-input" value={planDate} onChange={event => { if (event.target.value) setPlanDate(event.target.value); }} /></FormField>
            {plans.length === 0 ? <DataState variant="empty" title="No hay turnos programados para esta fecha" description={`Sin programación registrada para el ${planDate}.`} icon={<IconCalendar size={26} className="text-primary" />} /> : <DataCardList label={`Programación del ${planDate}`} grid>
              {plans.map(item => <DataCard key={item.groupKey}>
                <DataCardHead
                  title={<span className="font-mono tabular-nums">{item.effectiveDate}</span>}
                  subtitle={`${item.barnName} · ${projection.find(stage => stage.stageCode === item.stageCode)?.stageName ?? item.stageCode}`}
                  badge={<StatusBadge tone={item.pendingKg > 0 ? 'warning' : 'success'}>{item.plannedKg === 0 ? 'Cancelado' : `Pendiente: ${item.pendingKg} kg`}</StatusBadge>}
                />
                <DataCardMeta items={[
                  { label: 'Turno', value: SHIFT_LABELS[item.shiftCode] ?? item.shiftCode },
                  { label: 'Previsto', value: `${item.plannedKg} kg`, className: 'font-mono tabular-nums' },
                  { label: 'Servido', value: `${item.servedKg} kg`, className: 'font-mono tabular-nums' },
                  { label: 'Alimento', value: feedOptions.find(feed => feed.code === item.feedCode)?.name ?? item.feedCode },
                ]} />
                {!readonly && <DataCardActions>
                  <button className="btn btn-outline" type="button" aria-label={`Editar programación de ${item.barnName}, ${SHIFT_LABELS[item.shiftCode] ?? item.shiftCode}`} onClick={() => setPlan({ effectiveDate: item.effectiveDate, shiftCode: item.shiftCode, barnId: String(item.barnId), stageCode: item.stageCode, feedCode: item.feedCode, plannedKg: String(item.plannedKg), reason: '' })}><IconRefreshCw size={14} /><span>Editar</span></button>
                </DataCardActions>}
              </DataCard>)}
            </DataCardList>}
          </SectionCard>
          <SectionCard
            title="Turnos de comederos servidos"
            subtitle="Control por turno de raciones previstas vs servidas y sobrantes medidos"
            actions={!readonly ? (
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
            ) : undefined}
          >

            {turns.length === 0 ? (
              <DataState
                variant="empty"
                title="Aún no hay turnos registrados"
                description="Registre turnos de alimentación para monitorear el consumo exacto de los lotes y alimentar el cálculo de FCR."
                icon={<IconClock size={26} className="text-primary" />}
                action={!readonly ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" aria-label="Registrar turno de alimentación" onClick={() => { setKind('delivery'); setTurnMode(true); setSection('registrar'); }}><IconPlus size={16} /><span>Registrar turno ahora</span></button> : undefined}
              />
            ) : (
              <DataCardList label="Turnos servidos" grid>
                {turns.map((row) => (
                  <DataCard key={row.id}>
                    <DataCardHead
                      title={<span className="font-mono tabular-nums">{row.effectiveDate}</span>}
                      subtitle={`${row.barnName} · ${row.stageCode}`}
                      badge={<StatusBadge tone={row.shiftCode === 'tarde' ? 'info' : 'outline'}>{SHIFT_LABELS[row.shiftCode] ?? row.shiftCode}</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Previsto', value: `${row.plannedKg} kg`, className: 'font-mono tabular-nums' },
                      { label: 'Servido', value: `${row.servedKg} kg`, className: 'font-mono tabular-nums text-primary' },
                      { label: 'Consumido medido', value: row.consumedKg === null ? <span className="text-muted">Sin medición</span> : <span className="text-success">{row.consumedKg} kg</span>, className: 'font-mono tabular-nums' },
                    ]} />
                    <p className="data-card-note font-mono">{row.feedCode} · lote {row.lotCode}</p>
                  </DataCard>
                ))}
              </DataCardList>
            )}
          </SectionCard>

          <SectionCard
            title="Conversión alimenticia (FCR) · Últimos 30 días"
            subtitle="Índice kg alimento / kg peso ganado. Requiere cubrir toda la población estable, pesajes en ambos extremos del periodo y consumo medido cada día."
          >

            {conversion.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin cálculos de conversión en los últimos 30 días"
                description="Registre consumo real cada día y pesajes de todas las cabezas en ambos extremos del periodo, con historial continuo en el mismo galpón y etapa."
                icon={<IconScale size={26} className="text-primary" />}
              />
            ) : (
              <DataCardList label="Conversión alimenticia por galpón" grid>
                {conversion.map((row) => (
                  <DataCard key={`${row.barnId}-${row.stageCode}`}>
                    <DataCardHead
                      title={row.barnName}
                      subtitle={`${row.stageCode} · ${row.periodFrom} – ${row.periodTo}`}
                      badge={row.feedConversionRatio === null ? (
                        <StatusBadge tone="outline">No disponible</StatusBadge>
                      ) : (
                        <StatusBadge tone="primary" className="tabular-nums font-mono">{row.feedConversionRatio} kg/kg</StatusBadge>
                      )}
                    />
                    <DataCardMeta items={[
                      { label: 'Animales comparables', value: `${row.comparableAnimals} / ${row.populationHeads} · ${row.coveragePercent}%`, className: 'font-mono tabular-nums' },
                      { label: 'Consumo medido', value: `${row.consumedKg} kg · ${row.consumptionDays} / ${row.requiredConsumptionDays} días`, className: 'font-mono tabular-nums' },
                      { label: 'Ganancia neta', value: `${row.weightGainKg} kg`, className: 'font-mono tabular-nums' },
                    ]} />
                    {row.feedConversionRatio === null && row.unavailableReason && <DataCardNote>{row.unavailableReason}</DataCardNote>}
                  </DataCard>
                ))}
              </DataCardList>
            )}
          </SectionCard>
        </div>
      )}

      {/* SECCIÓN 4: Registrar Operación */}
      {section === 'registrar' && (
        <div className="section-block">
          {!readonly ? (
            <SectionCard
              title="Registrar movimiento de insumos"
              subtitle="Libro inmutable de almacén con registro de lote, costos y turnos de entrega"
            >

              <form className="form-stack" onSubmit={submit}>
                <div className="form-grid">
                  <FormField label="Tipo de movimiento" htmlFor="feed-kind">
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
                  </FormField>

                  <FormField label="Fecha efectiva" htmlFor="feed-eff-date">
                    <input
                      id="feed-eff-date"
                      type="date"
                      className="form-input"
                      max={farmToday()}
                      required
                      value={form.effectiveDate}
                      onChange={(e) => setField('effectiveDate', e.target.value)}
                    />
                  </FormField>

                  <FormField label="Almacén" htmlFor="feed-warehouse">
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
                  </FormField>

                  <FormField label="Tipo de alimento" htmlFor="feed-type-code">
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
                  </FormField>

                  <FormField label="Lote del insumo" htmlFor="feed-lot-code">
                    <input
                      id="feed-lot-code"
                      className="form-input"
                      required
                      maxLength={80}
                      placeholder="Ej. LOT-2026-04"
                      value={form.lotCode}
                      onChange={(e) => setField('lotCode', e.target.value)}
                    />
                  </FormField>

                  {kind === 'return_supplier' && (
                    <FormField label="Compra original a devolver" htmlFor="feed-reverse-id" className="form-col-span-full">
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
                    </FormField>
                  )}

                  {['purchase', 'return_in', 'return_supplier'].includes(kind) && (
                    <>
                      <FormField label="Proveedor" htmlFor="feed-supplier">
                        <input
                          id="feed-supplier"
                          className="form-input"
                          required={kind === 'purchase'}
                          placeholder="Nombre o razón social"
                          value={form.supplier}
                          onChange={(e) => setField('supplier', e.target.value)}
                        />
                      </FormField>

                      {kind !== 'return_in' && (
                        <FormField label="Documento de compra" htmlFor="feed-doc">
                          <input
                            id="feed-doc"
                            className="form-input"
                            maxLength={100}
                            placeholder="Ej. Factura F001-1234"
                            value={form.documentReference}
                            onChange={(e) => setField('documentReference', e.target.value)}
                          />
                        </FormField>
                      )}
                    </>
                  )}

                  {!(kind === 'delivery' && turnMode) && (
                    <FormField label="Cantidad (kg)" htmlFor="feed-qty">
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
                    </FormField>
                  )}

                  {['opening', 'purchase'].includes(kind) ? <FormField label="Costo por kg (S/)" htmlFor="feed-cost">
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
                  </FormField> : <p className="form-col-span-full text-sm text-muted">
                    {kind === 'return_supplier'
                      ? 'La devolución toma el importe de la compra original.'
                      : 'El costo se calcula con el promedio ponderado del saldo del almacén para este alimento y lote. Los reintegros conservan ese valor.'}
                    {' '}Registre los movimientos en orden de fecha para conservar los costos ya asignados.
                  </p>}

                  {kind === 'delivery' && (
                    <>
                      <FormField label="Galpón destino" htmlFor="feed-dest-barn">
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
                      </FormField>

                      <FormField label="Animal específico (opcional)" htmlFor="feed-animal-code">
                        <input
                          id="feed-animal-code"
                          className="form-input"
                          maxLength={40}
                          value={form.animalCode}
                          onChange={(e) => setField('animalCode', e.target.value)}
                          placeholder="Código individual si aplica"
                        />
                      </FormField>

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
                      <FormField label="Turno" htmlFor="feed-shift">
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
                      </FormField>

                      <FormField label="Etapa" htmlFor="feed-stage">
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
                      </FormField>

                      <FormField label="Previsto (kg)" htmlFor="feed-planned">
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
                      </FormField>

                      <FormField label="Servido real (kg)" htmlFor="feed-served">
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
                      </FormField>

                      <FormField label="Consumido real medido (kg, opcional)" htmlFor="feed-consumed">
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
                      </FormField>
                    </>
                  )}

                  <FormField label="Motivo u observaciones" htmlFor="feed-reason" className="form-col-span-full">
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
                  </FormField>
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
            </SectionCard>
          ) : (
            <DataState
              variant="empty"
              title="Modo solo lectura"
              description="El perfil Veterinario solo puede consultar raciones y existencias. Un administrador u operario registra movimientos."
              icon={<IconEye size={26} className="text-muted" />}
            />
          )}

          {perfil === 'administrador' && (
            <SectionCard
              className="mt-4"
              title="Administrar almacenes"
              subtitle="Habilitar bodegas o tolvas de acopio de concentrado"
            >

              <form className="form-stack" onSubmit={createWarehouse}>
                <div className="form-grid">
                  <FormField label="Código" htmlFor="wh-code">
                    <input
                      id="wh-code"
                      className="form-input"
                      required
                      placeholder="Ej. ALM-02"
                      value={newWarehouse.code}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, code: e.target.value })}
                    />
                  </FormField>

                  <FormField label="Nombre" htmlFor="wh-name">
                    <input
                      id="wh-name"
                      className="form-input"
                      required
                      placeholder="Ej. Tolva Principal Cerdos"
                      value={newWarehouse.name}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                    />
                  </FormField>

                  <FormField label="Ubicación" htmlFor="wh-loc">
                    <input
                      id="wh-loc"
                      className="form-input"
                      placeholder="Ej. Galpón de Gestación"
                      value={newWarehouse.location}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })}
                    />
                  </FormField>
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
            </SectionCard>
          )}
        </div>
      )}
    </main>
  );
}

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
  weightGainKg: number;
  consumedKg: number;
  feedConversionRatio: number | null;
  unavailableReason: string | null;
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
      const [wr, ir, mr, cr, br, pr] = await Promise.all([
        fetch('/api/feed/warehouses'),
        fetch(`/api/feed/inventory?asOf=${encodeURIComponent(date)}`),
        fetch('/api/feed/movements?limit=100'),
        fetch('/api/config'),
        fetch('/api/finance/barns'),
        fetch(`/api/feed/projection?asOf=${encodeURIComponent(date)}`),
      ]);
      const [w, i, m, c, b, p] = await Promise.all([
        wr.json(),
        ir.json(),
        mr.json(),
        cr.json(),
        br.json(),
        pr.json(),
      ]) as [
        { warehouses?: Warehouse[]; error?: string },
        { inventory?: Stock[]; totals?: ViewData['totals']; asOf: string; error?: string },
        { movements?: Movement[]; error?: string },
        { catalogs?: { key: string; items: { code: string; name: string }[] }[]; error?: string },
        { barns?: { id: number; name: string }[]; error?: string },
        { stages?: ProjectionRow[]; feeds?: FeedSummary[]; turns?: TurnRow[]; conversion?: ConversionRow[]; error?: string },
      ];
      if (!wr.ok || !ir.ok || !mr.ok || !cr.ok || !br.ok || !pr.ok) {
        throw new Error(w.error || i.error || m.error || c.error || b.error || p.error || 'No se pudieron cargar los datos de alimentación');
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
  }, [date]);

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
          destinationBarnId: form.destinationBarnId ? Number(form.destinationBarnId) : null,
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

      {/* Pestañas de Navegación Interna SaaS */}
      <div className="admin-tabs" role="tablist" aria-label="Secciones de alimentación y nutrición">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'raciones'}
          aria-label="Ver raciones y cobertura estimada por etapa"
          className={`btn btn-sm ${section === 'raciones' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('raciones')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconWheat size={14} />
            <span>Raciones y Cobertura</span>
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={section === 'stock'}
          aria-label="Ver kardex y existencias por almacén"
          className={`btn btn-sm ${section === 'stock' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('stock')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBox size={14} />
            <span>Kardex y Stock</span>
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={section === 'turnos'}
          aria-label="Ver turnos de comederos y conversión alimenticia"
          className={`btn btn-sm ${section === 'turnos' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('turnos')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClock size={14} />
            <span>Turnos y Conversión</span>
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={section === 'registrar'}
          aria-label="Registrar nuevo movimiento de insumo o alimento"
          className={`btn btn-sm ${section === 'registrar' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('registrar')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPlus size={14} />
            <span>Registrar Insumo</span>
          </span>
        </button>
      </div>

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
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconWheat size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">Sin datos de ración para esta fecha</p>
                <p className="text-sm text-muted">
                  No hay animales asignados a etapas con demanda nutricional al corte del {date}.
                </p>
                {!readonly && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label="Ir a registrar movimiento de insumo"
                    onClick={() => setSection('registrar')}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Registrar movimiento</span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Etapa</th>
                      <th className="text-right">Cabezas</th>
                      <th className="text-left">Alimento</th>
                      <th className="text-right">Demanda diaria</th>
                      <th className="text-right">Necesidad etapa</th>
                      <th className="text-right">Necesidad mensual</th>
                      <th className="text-right">Disponible</th>
                      <th className="text-center">Cobertura</th>
                      <th className="text-left">Comparación por período</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((row) => (
                      <tr key={row.stageCode}>
                        <td className="text-left font-semibold">{row.stageName}</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono text-primary">{row.heads}</td>
                        <td className="text-left">
                          {row.feedName ?? <span className="text-muted">Sin alimento vinculado</span>}
                          {row.requirements.length > 0 && (
                            <small className="block text-muted mt-0.5">{row.requirements.join(' · ')}</small>
                          )}
                        </td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.dailyKg === null ? <span className="text-muted">—</span> : `${row.dailyKg} kg`}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.stageNeedKg === null ? <span className="text-muted">—</span> : `${row.stageNeedKg} kg`}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.monthlyNeedKg === null ? <span className="text-muted">—</span> : `${row.monthlyNeedKg} kg`}</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono">{row.feedCode ? `${row.availableKg} kg` : <span className="text-muted">Sin ración</span>}</td>
                        <td className="text-center">
                          {row.coveredDays === null ? (
                            <span className="text-muted">—</span>
                          ) : row.coveredDays >= 15 ? (
                            <span className="badge-status badge-success tabular-nums font-mono">{row.coveredDays} días</span>
                          ) : row.coveredDays >= 5 ? (
                            <span className="badge-status badge-warning tabular-nums font-mono">{row.coveredDays} días</span>
                          ) : (
                            <span className="badge-status badge-danger tabular-nums font-mono">{row.coveredDays} días</span>
                          )}
                        </td>
                        <td className="text-left text-xs font-numeric tabular-nums font-mono">
                          <div className="flex flex-col gap-0.5">
                            <span>{coverage('Día', row.dailyShortageKg)}</span>
                            <span>{coverage('Etapa', row.stageShortageKg)}</span>
                            <span>{coverage('Mes', row.monthlyShortageKg)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconWheat size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">No hay raciones vinculadas</p>
                <p className="text-sm text-muted">
                  Asigne tipos de alimento a las etapas en el catálogo para generar la demanda agregada.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Alimento</th>
                      <th className="text-right">Cabezas</th>
                      <th className="text-right">Demanda diaria</th>
                      <th className="text-right">Necesidad mensual</th>
                      <th className="text-right">Disponible</th>
                      <th className="text-center">Cobertura</th>
                      <th className="text-right">Faltante mensual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeds.map((row) => (
                      <tr key={row.feedCode}>
                        <td className="text-left font-semibold">{row.feedName ?? row.feedCode}</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono text-primary">{row.heads}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.dailyKg === null ? <span className="text-muted">Sin datos</span> : `${row.dailyKg} kg`}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.monthlyNeedKg === null ? <span className="text-muted">Sin datos</span> : `${row.monthlyNeedKg} kg`}</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono">{row.availableKg} kg</td>
                        <td className="text-center">
                          {row.coveredDays === null ? (
                            <span className="text-muted">—</span>
                          ) : row.coveredDays >= 15 ? (
                            <span className="badge-status badge-success tabular-nums font-mono">{row.coveredDays} días</span>
                          ) : row.coveredDays >= 5 ? (
                            <span className="badge-status badge-warning tabular-nums font-mono">{row.coveredDays} días</span>
                          ) : (
                            <span className="badge-status badge-danger tabular-nums font-mono">{row.coveredDays} días</span>
                          )}
                        </td>
                        <td className="text-right">
                          {row.monthlyShortageKg === null ? (
                            <span className="text-muted">Sin datos</span>
                          ) : row.monthlyShortageKg === 0 ? (
                            <span className="badge-status badge-success">Abastecido</span>
                          ) : (
                            <span className="badge-status badge-danger font-numeric tabular-nums font-mono">{row.monthlyShortageKg} kg</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconBox size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">No hay existencias al {date}</p>
                <p className="text-sm text-muted">
                  No hay insumos registrados en los almacenes para la fecha de corte seleccionada.
                </p>
                {!readonly && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label="Registrar compra o entrada de insumo"
                    onClick={() => {
                      setKind('purchase');
                      setSection('registrar');
                    }}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Registrar compra / entrada</span>
                    </span>
                  </button>
                )}
              </div>
            ) : filteredStock.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconFilter size={24} className="text-muted" />
                </div>
                <p className="font-semibold text-base">Sin existencias para los filtros aplicados</p>
                <p className="text-sm text-muted">
                  No se encontraron lotes que coincidan con &quot;{stockSearch}&quot; en el almacén seleccionado.
                </p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label="Restablecer filtros de búsqueda de existencias"
                  onClick={() => {
                    setStockSearch('');
                    setStockWarehouseFilter('');
                  }}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconRefreshCw size={14} />
                    <span>Restablecer filtros</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Almacén</th>
                      <th className="text-left">Alimento</th>
                      <th className="text-left">Lote</th>
                      <th className="text-right">Disponible</th>
                      <th className="text-right">Retirado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.map((row) => (
                      <tr key={`${row.warehouseId}-${row.feedCode}-${row.lotCode}`}>
                        <td className="text-left font-semibold">{row.warehouseName}</td>
                        <td className="text-left">{feedOptions.find((x) => x.code === row.feedCode)?.name ?? row.feedCode}</td>
                        <td className="text-left font-numeric tabular-nums font-mono">{row.lotCode}</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono text-success">{row.availableKg.toLocaleString('es-PE')} kg</td>
                        <td className="text-right text-muted font-numeric tabular-nums font-mono">{row.withdrawnKg.toLocaleString('es-PE')} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconList size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">Sin movimientos registrados</p>
                <p className="text-sm text-muted">
                  Aún no se han asentado operaciones de entrada o consumo de insumos.
                </p>
                {!readonly && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label="Registrar primer movimiento de insumo"
                    onClick={() => setSection('registrar')}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Registrar primer movimiento</span>
                    </span>
                  </button>
                )}
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconFilter size={24} className="text-muted" />
                </div>
                <p className="font-semibold text-base">Sin movimientos para los filtros seleccionados</p>
                <p className="text-sm text-muted">
                  No se encontraron operaciones con los criterios aplicados.
                </p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label="Restablecer filtros del kardex de insumos"
                  onClick={() => {
                    setMovementSearch('');
                    setMovementFilterType('');
                  }}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconRefreshCw size={14} />
                    <span>Restablecer filtros</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Fecha</th>
                      <th className="text-left">Movimiento</th>
                      <th className="text-left">Almacén / Lote</th>
                      <th className="text-right">Cantidad</th>
                      <th className="text-left">Destino</th>
                      <th className="text-right">Costo / Documento</th>
                      <th className="text-left">Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.map((m) => {
                      const isPositive = ['purchase', 'return_in', 'opening'].includes(m.movementType);
                      return (
                        <tr key={m.id}>
                          <td className="text-left font-numeric tabular-nums font-mono">{m.effectiveDate}</td>
                          <td className="text-left">
                            <span className={MOVEMENT_TYPE_BADGES[m.movementType] ?? 'badge-tag'}>
                              {labels[m.movementType] ?? m.movementType}
                            </span>
                          </td>
                          <td className="text-left font-numeric tabular-nums font-mono">{m.warehouseCode} · {m.feedCode} · {m.lotCode}</td>
                          <td className={`text-right font-semibold font-numeric tabular-nums font-mono ${isPositive ? 'text-success' : 'text-danger'}`}>
                            {isPositive ? '+' : '−'}{m.quantityKg} kg
                          </td>
                          <td className="text-left">{m.animalCode ?? m.destinationBarn ?? <span className="text-muted">—</span>}</td>
                          <td className="text-right font-numeric tabular-nums font-mono">
                            {m.currencyCode} {m.totalCost.toFixed(2)}
                            {m.documentReference ? ` · ${m.documentReference}` : ''}
                          </td>
                          <td className="text-left text-xs text-muted">{m.actorName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECCIÓN 3: Turnos y Conversión */}
      {inventory && section === 'turnos' && (
        <div className="section-block">
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
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconClock size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">Aún no hay turnos registrados</p>
                <p className="text-sm text-muted">
                  Registre turnos de alimentación para monitorear el consumo exacto de los lotes y alimentar el cálculo de FCR.
                </p>
                {!readonly && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label="Registrar turno de alimentación"
                    onClick={() => {
                      setKind('delivery');
                      setTurnMode(true);
                      setSection('registrar');
                    }}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Registrar turno ahora</span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Fecha / Turno</th>
                      <th className="text-left">Galpón</th>
                      <th className="text-left">Etapa</th>
                      <th className="text-left">Alimento / Lote</th>
                      <th className="text-right">Previsto</th>
                      <th className="text-right">Servido</th>
                      <th className="text-right">Consumido medido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turns.map((row) => (
                      <tr key={row.id}>
                        <td className="text-left">
                          <span className="font-semibold font-numeric tabular-nums font-mono">{row.effectiveDate}</span>
                          {' · '}
                          <span className={row.shiftCode === 'manana' ? 'badge-tag' : row.shiftCode === 'tarde' ? 'badge-info' : 'badge-outline'}>
                            {SHIFT_LABELS[row.shiftCode] ?? row.shiftCode}
                          </span>
                        </td>
                        <td className="text-left font-semibold">{row.barnName}</td>
                        <td className="text-left">{row.stageCode}</td>
                        <td className="text-left font-numeric tabular-nums font-mono">{row.feedCode} · {row.lotCode}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.plannedKg} kg</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono text-primary">{row.servedKg} kg</td>
                        <td className="text-right">
                          {row.consumedKg === null ? (
                            <span className="text-muted">Sin medición</span>
                          ) : (
                            <span className="font-semibold font-numeric tabular-nums font-mono text-success">{row.consumedKg} kg</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header-clean mb-2">
              <div>
                <h2 className="section-title">Conversión alimenticia (FCR) · Últimos 30 días</h2>
                <span className="text-xs text-muted block mt-0.5">
                  Índice kg alimento / kg peso ganado. Requiere consumo medido y dos pesajes del mismo grupo.
                </span>
              </div>
            </div>

            {conversion.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconScale size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">Sin cálculos de conversión en los últimos 30 días</p>
                <p className="text-sm text-muted">
                  Se necesitan turnos con consumo real medido y al menos dos pesajes comparables en el mismo galpón y etapa.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Galpón / Etapa</th>
                      <th className="text-left">Periodo</th>
                      <th className="text-right">Animales comparables</th>
                      <th className="text-right">Consumo medido</th>
                      <th className="text-right">Ganancia neta</th>
                      <th className="text-right">Conversión (FCR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversion.map((row) => (
                      <tr key={`${row.barnId}-${row.stageCode}`}>
                        <td className="text-left font-semibold">{row.barnName} · {row.stageCode}</td>
                        <td className="text-left font-numeric tabular-nums font-mono">{row.periodFrom} – {row.periodTo}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.measuredAnimals}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.consumedKg} kg</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{row.weightGainKg} kg</td>
                        <td className="text-right">
                          {row.feedConversionRatio === null ? (
                            <span className="text-muted">{row.unavailableReason ?? 'No disponible'}</span>
                          ) : (
                            <span className="badge-status badge-primary font-bold font-numeric tabular-nums font-mono">
                              {row.feedConversionRatio} kg/kg
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconEye,
  IconFilter,
  IconList,
  IconPig,
  IconPlus,
  IconRefreshCw,
  IconScale,
  IconSearch,
  IconX,
} from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import type { Perfil } from '../types';

type MovementType =
  | 'initial'
  | 'purchase'
  | 'birth'
  | 'sale'
  | 'death'
  | 'adjustment';

type Sex = 'macho' | 'hembra' | 'pendiente';

interface SexCounts {
  macho: number;
  hembra: number;
  pendiente: number;
  total: number;
}

interface StageSummary {
  stageCode: string;
  stageName: string;
  initial: number;
  entriesExternal: number;
  entries: number;
  exits: number;
  deaths: number;
  available: number;
  entriesBySex: SexCounts;
  exitsBySex: SexCounts;
  deathsBySex: SexCounts;
  mortalityPct: number | null;
  mortalityDenominator: number;
}

interface InventoryBalance {
  barnId: number;
  barnCode: string;
  barnName: string;
  locationCode: string | null;
  locationName: string | null;
  lotCode: string | null;
  lotName: string | null;
  stageCode: string;
  stageName: string;
  sex: Sex;
  heads: number;
  identified: number;
  unidentified: number;
}

interface InventoryMovement {
  id: number;
  movementType: string;
  movementLabel: string;
  effectiveDate: string;
  barnId: number;
  barnName: string;
  locationName: string | null;
  lotName: string | null;
  stageName: string;
  sex: Sex;
  quantity: number;
  causeCode: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
}

interface Snapshot {
  asOf: string;
  from: string;
  balances: InventoryBalance[];
  summary: { byStage: StageSummary[]; total: StageSummary };
  movements: InventoryMovement[];
  options: {
    barns: { id: number; code: string; name: string }[];
    stages: { code: string; name: string }[];
    locations: { code: string; name: string; locationType: string }[];
    lots: { code: string; name: string }[];
    sexes: { code: string; name: string }[];
    deathCauses: { code: string; name: string }[];
    saleCauses: { code: string; name: string }[];
  };
}

interface FormState {
  movementType: MovementType;
  effectiveDate: string;
  barnId: string;
  locationCode: string;
  lotCode: string;
  stageCode: string;
  sex: Sex;
  quantity: string;
  causeCode: string;
  notes: string;
  reason: string;
}

type Section = 'existencias' | 'registrar' | 'movimientos' | 'traslado';

const MOVEMENT_LABELS: Record<MovementType, string> = {
  initial: 'Saldo inicial',
  purchase: 'Compra',
  birth: 'Nacimiento',
  sale: 'Venta / salida',
  death: 'Muerte',
  adjustment: 'Ajuste',
};

const MOVEMENT_HINTS: Record<MovementType, string> = {
  initial: 'Existencias con las que arranca el galpón en la fecha indicada.',
  purchase: 'Animales que ingresan comprados o recibidos de fuera de la granja.',
  birth: 'Lechones nacidos vivos; pueden quedar pendientes de sexado.',
  sale: 'Animales que salen de la granja por venta o descarte.',
  death: 'Bajas por muerte; la causa es obligatoria.',
  adjustment: 'Corrección positiva o negativa por conteo físico o error de carga.',
};

const SEX_LABELS: Record<Sex, string> = {
  macho: 'Machos',
  hembra: 'Hembras',
  pendiente: 'Pendiente de sexado',
};

const TYPE_BADGE: Record<string, string> = {
  initial: 'badge-tag',
  purchase: 'badge-status badge-success',
  birth: 'badge-status badge-success',
  sale: 'badge-status badge-warning',
  death: 'badge-status badge-danger',
  transfer_in: 'badge-status badge-success',
  transfer_out: 'badge-status badge-warning',
  adjustment: 'badge-tag',
};

function initialForm(perfil: Perfil): FormState {
  return {
    movementType: 'initial',
    effectiveDate: farmToday(),
    barnId: '',
    locationCode: '',
    lotCode: '',
    stageCode: '',
    sex: 'macho',
    quantity: '',
    causeCode: '',
    notes: '',
    reason: perfil === 'veterinario' ? '' : '',
  };
}

function isNegativeMovement(movement: InventoryMovement): boolean {
  return ['sale', 'death', 'transfer_out'].includes(movement.movementType)
    || (movement.movementType === 'adjustment' && movement.quantity < 0);
}

function formatSigned(movement: InventoryMovement): string {
  const negative = isNegativeMovement(movement);
  return `${negative ? '−' : '+'}${Math.abs(movement.quantity)}`;
}

function Metric({
  label,
  value,
  detail,
  icon,
  focal = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  focal?: boolean;
}) {
  return (
    <div className={`kpi-card ${focal ? 'kpi-focal' : ''}`}>
      <span className="kpi-label inline-flex items-center gap-1.5 leading-none">
        {icon}
        <span>{label}</span>
      </span>
      <span className={`kpi-value ${focal ? 'text-primary' : ''}`}>{value}</span>
      <span className="kpi-detail">{detail}</span>
    </div>
  );
}

export function ModuloInventario({ perfil }: { perfil: Perfil }) {
  const soloLectura = perfil === 'veterinario';
  const [asOf, setAsOf] = useState<string>(farmToday());
  const [section, setSection] = useState<Section>('existencias');
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(perfil));
  const [operationKey, setOperationKey] = useState<string>(() => newOperationKey('inv'));
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [balanceSearch, setBalanceSearch] = useState<string>('');
  const [movementSearch, setMovementSearch] = useState<string>('');
  const [transferDestination, setTransferDestination] = useState<string>('');
  const [transferCoordinates, setTransferCoordinates] = useState({ sourceLocationCode: '', sourceLotCode: '', destinationLocationCode: '', destinationLotCode: '' });
  const [transferStage, setTransferStage] = useState('');
  const [inventoryOperationMode, setInventoryOperationMode] = useState<'transfer' | 'reconcile'>('transfer');
  const [correctionForm, setCorrectionForm] = useState({ movementId: '', correctedQuantity: '', reason: '' });
  const [correctionPreview, setCorrectionPreview] = useState<{ allowed: boolean; originalQuantity: number; correctedQuantity: number; incompatibleMovements: { id: number; date: string; type: string; quantity: number; balanceAfter: number }[] } | null>(null);

  const loadSnapshot = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory?asOf=${encodeURIComponent(date)}`);
      const body = await res.json() as { ok?: boolean; error?: string } & Snapshot;
      if (!res.ok) {
        setError(body.error ?? 'No se pudo cargar el inventario');
        setData(null);
        return;
      }
      setData(body);
      setForm((prev) => ({
        ...prev,
        barnId: prev.barnId || (body.options.barns[0] ? String(body.options.barns[0].id) : ''),
        stageCode: prev.stageCode || (body.options.stages[0] ? body.options.stages[0].code : ''),
      }));
    } catch {
      setError('No se pudo conectar con el servidor. Reintente cuando vuelva la conexión.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSnapshot(asOf);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [asOf, loadSnapshot]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 6000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const options = data?.options;
  const totals = data?.summary.total;

  const balances = useMemo(() => {
    if (!data) return [];
    return [...data.balances].sort((a, b) => {
      const byBarn = a.barnName.localeCompare(b.barnName);
      if (byBarn !== 0) return byBarn;
      const byStage = a.stageName.localeCompare(b.stageName);
      if (byStage !== 0) return byStage;
      return a.sex.localeCompare(b.sex);
    });
  }, [data]);

  const movements = useMemo(() => {
    if (!data) return [];
    if (!filterType) return data.movements;
    return data.movements.filter((movement) => movement.movementType === filterType);
  }, [data, filterType]);

  const filteredBalances = useMemo(() => {
    if (!balanceSearch.trim()) return balances;
    const term = balanceSearch.toLowerCase().trim();
    return balances.filter(
      (b) =>
        b.barnName.toLowerCase().includes(term) ||
        b.stageName.toLowerCase().includes(term) ||
        (b.lotName && b.lotName.toLowerCase().includes(term)) ||
        (b.locationName && b.locationName.toLowerCase().includes(term)) ||
        (b.sex && b.sex.toLowerCase().includes(term))
    );
  }, [balances, balanceSearch]);

  const filteredMovements = useMemo(() => {
    if (!movementSearch.trim()) return movements;
    const term = movementSearch.toLowerCase().trim();
    return movements.filter(
      (m) =>
        m.barnName.toLowerCase().includes(term) ||
        m.stageName.toLowerCase().includes(term) ||
        m.movementLabel.toLowerCase().includes(term) ||
        (m.lotName && m.lotName.toLowerCase().includes(term)) ||
        (m.locationName && m.locationName.toLowerCase().includes(term)) ||
        (m.createdByName && m.createdByName.toLowerCase().includes(term)) ||
        (m.causeCode && m.causeCode.toLowerCase().includes(term)) ||
        (m.notes && m.notes.toLowerCase().includes(term))
    );
  }, [movements, movementSearch]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'movementType' && value !== 'sale' && value !== 'death') {
        next.causeCode = '';
      }
      return next;
    });
  };

  const requiresCause = form.movementType === 'death' || form.movementType === 'sale';

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (soloLectura || !form.barnId || !transferDestination || !form.stageCode || !form.quantity || !form.reason.trim()) {
      setFormError('Complete galpón de origen y destino, etapa, cantidad y motivo.');
      return;
    }
    setSaving(true); setFormError(null); setSuccess(null);
    try {
      const res = await fetch('/api/inventory/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceBarnId: Number(form.barnId), destinationBarnId: Number(transferDestination),
          effectiveDate: form.effectiveDate, stageCode: form.stageCode, destinationStageCode: transferStage || form.stageCode, sex: form.sex, quantity: Number(form.quantity),
          ...Object.fromEntries(Object.entries(transferCoordinates).map(([key, value]) => [key, value || null])), reason: form.reason,
          operationKey }) });
      const body = await res.json() as { error?: string; replayed?: boolean; warning?: string | null };
      if (!res.ok) { setFormError(body.error ?? 'No se pudo registrar el traslado.'); return; }
      setSuccess([body.replayed ? 'Traslado confirmado sin duplicarlo.' : 'Traslado registrado: salida y recepción quedaron vinculadas.', body.warning].filter(Boolean).join(' '));
      setOperationKey(newOperationKey('traslado'));
      setForm((prev) => ({ ...prev, quantity: '', reason: '' }));
      await loadSnapshot(asOf);
    } catch { setFormError('No se pudo confirmar el traslado.'); }
    finally { setSaving(false); }
  };

  const submitReconciliation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (soloLectura || !form.barnId || !form.stageCode || !form.quantity || Number(form.quantity) < 0 || !form.reason.trim()) {
      setFormError('Complete galpón, etapa, conteo físico y motivo.');
      return;
    }
    setSaving(true); setFormError(null); setSuccess(null);
    try {
      const res = await fetch('/api/inventory/reconciliations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barnId: Number(form.barnId), effectiveDate: form.effectiveDate, stageCode: form.stageCode,
          sex: form.sex, locationCode: form.locationCode || null, lotCode: form.lotCode || null,
          countedHeads: Number(form.quantity), reason: form.reason, operationKey }) });
      const body = await res.json() as { error?: string; expectedHeads?: number; countedHeads?: number; variance?: number };
      if (!res.ok) { setFormError(body.error ?? 'No se pudo conciliar el inventario.'); return; }
      setSuccess(`Conteo guardado. Libro: ${body.expectedHeads}; físico: ${body.countedHeads}; ajuste: ${body.variance}.`);
      setOperationKey(newOperationKey('conteo'));
      setForm((prev) => ({ ...prev, quantity: '', reason: '' }));
      await loadSnapshot(asOf);
    } catch { setFormError('No se pudo confirmar la conciliación.'); }
    finally { setSaving(false); }
  };

  const previewCorrection = async () => {
    setFormError(null); setCorrectionPreview(null);
    if (!correctionForm.movementId || !correctionForm.correctedQuantity) { setFormError('Indique el ID del movimiento y la cantidad corregida.'); return; }
    setSaving(true);
    try {
      const query = new URLSearchParams({ movementId: correctionForm.movementId, correctedQuantity: correctionForm.correctedQuantity });
      const res = await fetch(`/api/inventory/corrections/preview?${query}`);
      const body = await res.json() as { error?: string; preview?: typeof correctionPreview };
      if (!res.ok || !body.preview) { setFormError(body.error ?? 'No se pudo previsualizar la corrección.'); return; }
      setCorrectionPreview(body.preview);
    } catch { setFormError('No se pudo consultar el impacto de la corrección.'); }
    finally { setSaving(false); }
  };

  const submitCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correctionPreview?.allowed || !correctionForm.reason.trim()) { setFormError('Previsualice una corrección compatible y escriba el motivo.'); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/inventory/corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movementId: Number(correctionForm.movementId), correctedQuantity: Number(correctionForm.correctedQuantity), reason: correctionForm.reason, operationKey }) });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) { setFormError(body.error ?? 'No se pudo corregir el movimiento.'); return; }
      setSuccess(body.replayed ? 'Corrección confirmada sin duplicarla.' : 'Corrección guardada; el original permanece en el historial.');
      setOperationKey(newOperationKey('inv-correction'));
      setCorrectionForm({ movementId: '', correctedQuantity: '', reason: '' }); setCorrectionPreview(null);
      await loadSnapshot(asOf);
    } catch { setFormError('No se pudo confirmar la corrección. Reintente con la misma clave.'); }
    finally { setSaving(false); }
  };

  const causeOptions = form.movementType === 'death'
    ? options?.deathCauses ?? []
    : form.movementType === 'sale'
      ? options?.saleCauses ?? []
      : [];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (soloLectura) return;
    setFormError(null);
    setSuccess(null);

    if (!form.barnId) {
      setFormError('Seleccione un galpón.');
      return;
    }
    if (!form.stageCode) {
      setFormError('Seleccione una etapa.');
      return;
    }
    if (!form.quantity.trim() || Number(form.quantity) === 0) {
      setFormError('Indique una cantidad distinta de cero.');
      return;
    }
    if (form.movementType === 'death' && !form.causeCode) {
      setFormError('La causa de muerte es obligatoria.');
      return;
    }
    if (!form.reason.trim()) {
      setFormError('Escriba el motivo del movimiento.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movementType: form.movementType,
          effectiveDate: form.effectiveDate,
          barnId: Number(form.barnId),
          locationCode: form.locationCode || null,
          lotCode: form.lotCode || null,
          stageCode: form.stageCode,
          sex: form.sex,
          quantity: Number(form.quantity),
          causeCode: form.causeCode || null,
          notes: form.notes.trim() ? form.notes.trim() : null,
          operationKey,
          reason: form.reason.trim(),
        }),
      });
      const body = await res.json() as { error?: string; replayed?: boolean; movement?: InventoryMovement };
      if (!res.ok) {
        setFormError(body.error ?? 'No se pudo registrar el movimiento.');
        return;
      }

      const label = body.movement?.movementLabel ?? MOVEMENT_LABELS[form.movementType];
      setSuccess(
        body.replayed
          ? `Reintento confirmado: el movimiento de ${label.toLowerCase()} ya estaba registrado y no se duplicó.`
          : `Movimiento registrado: ${label} de ${Math.abs(Number(form.quantity))} cabezas el ${form.effectiveDate}.`,
      );
      setOperationKey(newOperationKey('inv'));
      setForm((prev) => ({
        ...prev,
        quantity: '',
        notes: '',
        reason: '',
        causeCode: '',
      }));
      await loadSnapshot(asOf);
      setSection('movimientos');
    } catch {
      setFormError('No se pudo confirmar el guardado. Reintente con el mismo formulario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="module-heading mb-4">
        <p className="text-xs text-muted">
          Existencias por fecha de corte, entradas, salidas, bajas y saldos por galpón.
        </p>
        <div className="inline-flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted inline-flex items-center gap-1">
            <IconCalendar size={14} />
            <span>Corte:</span>
          </label>
          <input
            type="date"
            className="form-input form-select-sm"
            value={asOf}
            max={farmToday()}
            onChange={(event) => setAsOf(event.target.value)}
            aria-label="Fecha de corte del inventario"
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void loadSnapshot(asOf)}
            disabled={loading}
            aria-label="Actualizar inventario a la fecha de corte"
            title="Recargar inventario"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar existencias</span>
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-4" role="alert" aria-live="assertive">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={16} />
            <span>{error}</span>
          </span>
        </div>
      )}

      {success && (
        <div className="alert alert-success mb-4" role="status" aria-live="polite">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={16} />
            <span>{success}</span>
          </span>
        </div>
      )}

      {soloLectura && (
        <div className="alert alert-warning mb-4" role="status" aria-live="polite">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconEye size={16} />
            <span>El perfil Veterinario puede consultar inventario, pero no registrar movimientos.</span>
          </span>
        </div>
      )}

      <div className="admin-tabs mb-4" role="tablist" aria-label="Secciones de inventario de animales">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'existencias'}
          aria-label="Ver existencias y saldos por etapa"
          className={`btn btn-sm ${section === 'existencias' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('existencias')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconScale size={14} />
            <span>Existencias</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'registrar'}
          aria-label="Registrar nuevo movimiento de inventario"
          className={`btn btn-sm ${section === 'registrar' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('registrar')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPlus size={14} />
            <span>Registrar movimiento</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'movimientos'}
          aria-label="Ver historial y kardex de movimientos"
          className={`btn btn-sm ${section === 'movimientos' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('movimientos')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconList size={14} />
            <span>Movimientos</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'traslado'}
          aria-label="Gestionar traslado entre galpones y conciliación física"
          className={`btn btn-sm ${section === 'traslado' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('traslado')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconRefreshCw size={14} />
            <span>Traslado y conteo</span>
          </span>
        </button>
      </div>

      {loading && !data && (
        <div className="card empty-state-card">
          <div className="empty-icon-wrap">
            <IconRefreshCw size={26} className="text-primary spinner-icon" />
          </div>
          <p className="font-semibold text-base">Cargando inventario de animales…</p>
          <p className="text-sm text-muted">Consultando existencias, movimientos y resumen por etapa al {asOf}.</p>
        </div>
      )}

      {error && !data && !loading && (
        <div className="card empty-state-card">
          <div className="empty-icon-wrap" style={{ background: 'var(--color-danger-bg)' }}>
            <IconAlertCircle size={26} className="text-danger" />
          </div>
          <p className="font-semibold text-base text-danger">No se pudo cargar el inventario</p>
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            className="btn btn-outline btn-sm mt-2"
            onClick={() => void loadSnapshot(asOf)}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Reintentar carga</span>
            </span>
          </button>
        </div>
      )}

      {data && section === 'existencias' && (
        <div className="section-block">
          <div className="grid-3">
            <Metric
              label="Cabezas disponibles"
              value={String(totals?.available ?? 0)}
              detail={`Corte al ${data.asOf}`}
              icon={<IconPig size={14} />}
              focal={true}
            />
            <Metric
              label="Entradas acumuladas"
              value={String(totals?.entries ?? 0)}
              detail={`Iniciales: ${totals?.initial ?? 0} · externas: ${totals?.entriesExternal ?? 0}`}
              icon={<IconPlus size={14} />}
            />
            <Metric
              label="Salidas acumuladas"
              value={String(totals?.exits ?? 0)}
              detail={`Muertes: ${totals?.deaths ?? 0}`}
              icon={<IconBuilding size={14} />}
            />
            <Metric
              label="Mortalidad"
              value={totals?.mortalityPct === null || totals?.mortalityPct === undefined
                ? 'Sin datos'
                : `${totals.mortalityPct}%`}
              detail={totals && totals.mortalityDenominator > 0
                ? `${totals.deaths} de ${totals.mortalityDenominator} entradas`
                : 'Aún no hay entradas en el período'}
              icon={<IconAlertCircle size={14} />}
            />
            <Metric
              label="Grupos con existencia"
              value={String(balances.length)}
              detail="Combinaciones galpón, ubicación, lote, etapa y sexo"
              icon={<IconClipboard size={14} />}
            />
            <Metric
              label="Movimientos recientes"
              value={String(data.movements.length)}
              detail="Últimos movimientos hasta la fecha de corte"
              icon={<IconList size={14} />}
            />
          </div>

          <div className="card">
            <div className="card-header-clean mb-2">
              <span className="section-title">Resumen por etapa</span>
              <span className="text-xs text-muted">
                Mortalidad = muertes sobre entradas del período
              </span>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Etapa</th>
                    <th className="text-right">Inicial</th>
                    <th className="text-right">Entradas externas</th>
                    <th className="text-right">Entradas</th>
                    <th className="text-right">Salidas</th>
                    <th className="text-right">Muertes</th>
                    <th className="text-right">Disponibles</th>
                    <th className="text-right">Mortalidad</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.byStage.map((stage) => (
                    <tr key={stage.stageCode}>
                      <td className="text-left font-semibold">{stage.stageName}</td>
                      <td className="text-right tabular-nums font-mono">{stage.initial}</td>
                      <td className="text-right tabular-nums font-mono">{stage.entriesExternal}</td>
                      <td className="text-right tabular-nums font-mono">{stage.entries}</td>
                      <td className="text-right tabular-nums font-mono">{stage.exits}</td>
                      <td className="text-right tabular-nums font-mono text-danger">{stage.deaths}</td>
                      <td className="text-right font-semibold tabular-nums font-mono text-primary">{stage.available}</td>
                      <td className="text-right tabular-nums font-mono">
                        {stage.mortalityPct === null
                          ? <span className="text-muted">Sin datos</span>
                          : `${stage.mortalityPct}%`}
                      </td>
                    </tr>
                  ))}
                  <tr className="table-row-total">
                    <td className="text-left font-bold">{data.summary.total.stageName}</td>
                    <td className="text-right font-bold tabular-nums font-mono">{data.summary.total.initial}</td>
                    <td className="text-right font-bold tabular-nums font-mono">{data.summary.total.entriesExternal}</td>
                    <td className="text-right font-bold tabular-nums font-mono">{data.summary.total.entries}</td>
                    <td className="text-right font-bold tabular-nums font-mono">{data.summary.total.exits}</td>
                    <td className="text-right font-bold tabular-nums font-mono text-danger">{data.summary.total.deaths}</td>
                    <td className="text-right font-bold tabular-nums font-mono text-primary">{data.summary.total.available}</td>
                    <td className="text-right font-bold tabular-nums font-mono">
                      {data.summary.total.mortalityPct === null
                        ? 'Sin datos'
                        : `${data.summary.total.mortalityPct}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <div>
                <span className="section-title">Saldos por grupo</span>
                <span className="text-xs text-muted block mt-0.5">
                  Identificadas y sin identificar se separan desde T09
                </span>
              </div>
              {balances.length > 0 && (
                <div className="inline-flex items-center gap-2">
                  <div className="search-input-wrap" style={{ minWidth: 200, maxWidth: 280 }}>
                    <span className="search-icon">
                      <IconSearch size={14} />
                    </span>
                    <input
                      type="text"
                      className="form-input form-select-sm search-input"
                      placeholder="Filtrar galpón, etapa, lote..."
                      value={balanceSearch}
                      onChange={(event) => setBalanceSearch(event.target.value)}
                      aria-label="Filtrar saldos de grupos"
                    />
                  </div>
                  {balanceSearch && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setBalanceSearch('')}
                      aria-label="Limpiar búsqueda de saldos"
                      title="Limpiar búsqueda"
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconX size={12} />
                        <span>Limpiar</span>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {balances.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconPig size={26} className="text-primary" />
                </div>
                <p className="font-semibold text-base">Sin existencias al {data.asOf}</p>
                <p className="text-sm text-muted">
                  Registre el saldo inicial o una compra para empezar a reconstruir el inventario.
                </p>
                {!soloLectura && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label="Registrar primer movimiento de inventario"
                    onClick={() => setSection('registrar')}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Registrar movimiento</span>
                    </span>
                  </button>
                )}
              </div>
            ) : filteredBalances.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconFilter size={24} className="text-muted" />
                </div>
                <p className="font-semibold text-base">Sin coincidencias para &quot;{balanceSearch}&quot;</p>
                <p className="text-sm text-muted">
                  No se encontraron galpones, etapas o lotes que coincidan con el término buscado.
                </p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label="Restablecer filtro de búsqueda de saldos"
                  onClick={() => setBalanceSearch('')}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconRefreshCw size={14} />
                    <span>Restablecer filtro</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Galpón</th>
                      <th className="text-left">Ubicación</th>
                      <th className="text-left">Lote</th>
                      <th className="text-left">Etapa</th>
                      <th className="text-left">Sexo</th>
                      <th className="text-right">Cabezas</th>
                      <th className="text-right">Identificadas</th>
                      <th className="text-right">Sin identificar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBalances.map((balance, index) => (
                      <tr key={`${balance.barnId}-${balance.locationCode ?? 'sin-u'}-${balance.lotCode ?? 'sin-l'}-${balance.stageCode}-${balance.sex}-${index}`}>
                        <td className="text-left font-semibold">{balance.barnName}</td>
                        <td className="text-left">{balance.locationName ?? <span className="text-muted">Sin asignar</span>}</td>
                        <td className="text-left">{balance.lotName ?? <span className="text-muted">Sin lote</span>}</td>
                        <td className="text-left">{balance.stageName}</td>
                        <td className="text-left">{SEX_LABELS[balance.sex] ?? balance.sex}</td>
                        <td className="text-right font-semibold font-numeric tabular-nums font-mono text-primary">{balance.heads}</td>
                        <td className="text-right font-numeric tabular-nums font-mono">{balance.identified}</td>
                        <td className="text-right font-numeric tabular-nums font-mono text-muted">{balance.unidentified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header-clean mb-2">
              <span className="section-title">Desglose por sexo</span>
              <span className="text-xs text-muted">Entradas, salidas y muertes del período</span>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Etapa</th>
                    <th className="text-right">Machos</th>
                    <th className="text-right">Hembras</th>
                    <th className="text-right">Pendientes</th>
                    <th className="text-right">Total entradas</th>
                    <th className="text-right">Total salidas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.byStage.map((stage) => (
                    <tr key={`sex-${stage.stageCode}`}>
                      <td className="text-left font-semibold">{stage.stageName}</td>
                      <td className="text-right tabular-nums font-mono">{stage.entriesBySex.macho}</td>
                      <td className="text-right tabular-nums font-mono">{stage.entriesBySex.hembra}</td>
                      <td className="text-right tabular-nums font-mono text-muted">{stage.entriesBySex.pendiente}</td>
                      <td className="text-right font-semibold tabular-nums font-mono text-success">{stage.entriesBySex.total}</td>
                      <td className="text-right font-semibold tabular-nums font-mono text-danger">{stage.exitsBySex.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data && section === 'registrar' && (
        <div className="card">
          <div className="card-header-clean mb-2">
            <span className="section-title">Nuevo movimiento de inventario</span>
            <span className="text-xs text-muted">
              Libro inmutable con fecha efectiva y motivo obligatorio
            </span>
          </div>

          {soloLectura ? (
            <div className="note-box text-sm">
              El perfil Veterinario solo consulta. Un administrador, responsable u operario registra los movimientos.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="form-stack">
              {formError && (
                <div className="alert alert-error" role="alert" aria-live="assertive">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{formError}</span>
                  </span>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="inv-type">Tipo de movimiento</label>
                  <select
                    id="inv-type"
                    className="form-select"
                    value={form.movementType}
                    onChange={(event) => setField('movementType', event.target.value as MovementType)}
                  >
                    {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((type) => (
                      <option key={type} value={type}>{MOVEMENT_LABELS[type]}</option>
                    ))}
                  </select>
                  <p className="form-helper">{MOVEMENT_HINTS[form.movementType]}</p>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-date">Fecha del movimiento</label>
                  <input
                    id="inv-date"
                    type="date"
                    className="form-input"
                    value={form.effectiveDate}
                    max={farmToday()}
                    onChange={(event) => setField('effectiveDate', event.target.value)}
                    required
                  />
                  <p className="form-helper">Acepta correcciones retroactivas si no dejan saldo negativo.</p>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-barn">Galpón</label>
                  <select
                    id="inv-barn"
                    className="form-select"
                    value={form.barnId}
                    onChange={(event) => setField('barnId', event.target.value)}
                    required
                  >
                    <option value="">Seleccione un galpón</option>
                    {(options?.barns ?? []).map((barn) => (
                      <option key={barn.id} value={barn.id}>{barn.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-stage">Etapa</label>
                  <select
                    id="inv-stage"
                    className="form-select"
                    value={form.stageCode}
                    onChange={(event) => setField('stageCode', event.target.value)}
                    required
                  >
                    <option value="">Seleccione una etapa</option>
                    {(options?.stages ?? []).map((stage) => (
                      <option key={stage.code} value={stage.code}>{stage.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-location">Ubicación</label>
                  <select
                    id="inv-location"
                    className="form-select"
                    value={form.locationCode}
                    onChange={(event) => setField('locationCode', event.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {(options?.locations ?? []).map((location) => (
                      <option key={location.code} value={location.code}>{location.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-lot">Lote</label>
                  <select
                    id="inv-lot"
                    className="form-select"
                    value={form.lotCode}
                    onChange={(event) => setField('lotCode', event.target.value)}
                  >
                    <option value="">Sin lote</option>
                    {(options?.lots ?? []).map((lot) => (
                      <option key={lot.code} value={lot.code}>{lot.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-sex">Sexo</label>
                  <select
                    id="inv-sex"
                    className="form-select"
                    value={form.sex}
                    onChange={(event) => setField('sex', event.target.value as Sex)}
                  >
                    <option value="macho">Machos</option>
                    <option value="hembra">Hembras</option>
                    <option value="pendiente">Pendiente de sexado</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inv-quantity">
                    Cantidad {form.movementType === 'adjustment' ? '(use negativo para restar)' : ''}
                  </label>
                  <input
                    id="inv-quantity"
                    type="number"
                    step="1"
                    className="form-input"
                    value={form.quantity}
                    onChange={(event) => setField('quantity', event.target.value)}
                    placeholder="Cabezas"
                    required
                  />
                </div>

                {requiresCause && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="inv-cause">
                      {form.movementType === 'death' ? 'Causa de muerte' : 'Causa de salida'}
                    </label>
                    <select
                      id="inv-cause"
                      className="form-select"
                      value={form.causeCode}
                      onChange={(event) => setField('causeCode', event.target.value)}
                      required={form.movementType === 'death'}
                    >
                      <option value="">
                        {form.movementType === 'death' ? 'Seleccione una causa' : 'Sin causa específica'}
                      </option>
                      {causeOptions.map((cause) => (
                        <option key={cause.code} value={cause.code}>{cause.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group form-col-span-full">
                  <label className="form-label" htmlFor="inv-notes">Notas</label>
                  <textarea
                    id="inv-notes"
                    className="form-textarea"
                    rows={2}
                    value={form.notes}
                    onChange={(event) => setField('notes', event.target.value)}
                    placeholder="Detalle opcional: proveedor, corral, observaciones sanitarias"
                  />
                </div>

                <div className="form-group form-col-span-full">
                  <label className="form-label" htmlFor="inv-reason">Motivo del registro</label>
                  <input
                    id="inv-reason"
                    type="text"
                    className="form-input"
                    value={form.reason}
                    onChange={(event) => setField('reason', event.target.value)}
                    placeholder="Ej. Cierre de conteo físico del galpón A"
                    required
                  />
                  <p className="form-helper">Queda en la auditoría con su usuario y la fecha efectiva.</p>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  aria-label={saving ? 'Guardando movimiento…' : 'Registrar movimiento de inventario'}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={16} />
                    <span>{saving ? 'Guardando…' : 'Registrar movimiento'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Limpiar campos del formulario de movimiento"
                  onClick={() => {
                    setForm(initialForm(perfil));
                    setOperationKey(newOperationKey('inv'));
                    setFormError(null);
                  }}
                  disabled={saving}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconRefreshCw size={16} />
                    <span>Limpiar</span>
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {data && section === 'traslado' && (
        <div className="card">
          <div className="card-header-clean mb-2">
            <span className="section-title">Traslado y conciliación física</span>
            <span className="text-xs text-muted">El traslado afecta ambos galpones en una sola operación; el conteo registra y audita la diferencia.</span>
          </div>
          {soloLectura ? <div className="note-box text-sm">El perfil Veterinario puede consultar, pero no registrar cambios de inventario.</div> : (
            <form onSubmit={inventoryOperationMode === 'transfer' ? submitTransfer : submitReconciliation} className="form-stack">
              {formError && (
                <div className="alert alert-error" role="alert" aria-live="assertive">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{formError}</span>
                  </span>
                </div>
              )}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="t10-mode">Operación</label>
                  <select
                    id="t10-mode"
                    className="form-select"
                    value={inventoryOperationMode}
                    onChange={(event) => setInventoryOperationMode(event.target.value as 'transfer' | 'reconcile')}
                  >
                    <option value="transfer">Trasladar entre galpones</option>
                    <option value="reconcile">Conciliar conteo físico</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="t10-date">Fecha efectiva</label>
                  <input
                    id="t10-date"
                    type="date"
                    className="form-input"
                    max={farmToday()}
                    value={form.effectiveDate}
                    onChange={(event) => setField('effectiveDate', event.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="t10-source">Galpón</label>
                  <select
                    id="t10-source"
                    className="form-select"
                    value={form.barnId}
                    onChange={(event) => setField('barnId', event.target.value)}
                    required
                  >
                    {options?.barns.map((barn) => (
                      <option key={barn.id} value={barn.id}>{barn.name}</option>
                    ))}
                  </select>
                </div>

                {inventoryOperationMode === 'transfer' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="t10-dest">Galpón destino</label>
                    <select
                      id="t10-dest"
                      className="form-select"
                      value={transferDestination}
                      onChange={(event) => setTransferDestination(event.target.value)}
                      required
                    >
                      <option value="">Seleccione destino</option>
                      {options?.barns.map((barn) => (
                        <option key={barn.id} value={barn.id}>{barn.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="t10-stage">Etapa</label>
                  <select
                    id="t10-stage"
                    className="form-select"
                    value={form.stageCode}
                    onChange={(event) => setField('stageCode', event.target.value)}
                    required
                  >
                    {options?.stages.map((stage) => (
                      <option key={stage.code} value={stage.code}>{stage.name}</option>
                    ))}
                  </select>
                </div>

                {inventoryOperationMode === 'transfer' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="t10-destination-stage">Etapa de destino</label>
                    <select
                      id="t10-destination-stage"
                      className="form-select"
                      value={transferStage || form.stageCode}
                      onChange={(event) => setTransferStage(event.target.value)}
                    >
                      {options?.stages.map((stage) => (
                        <option key={stage.code} value={stage.code}>{stage.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="t10-sex">Sexo</label>
                  <select
                    id="t10-sex"
                    className="form-select"
                    value={form.sex}
                    onChange={(event) => setField('sex', event.target.value as Sex)}
                  >
                    {Object.entries(SEX_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="t10-quantity">
                    {inventoryOperationMode === 'transfer' ? 'Cabezas a trasladar' : 'Cabezas contadas'}
                  </label>
                  <input
                    id="t10-quantity"
                    type="number"
                    min={inventoryOperationMode === 'transfer' ? 1 : 0}
                    step="1"
                    className="form-input"
                    value={form.quantity}
                    onChange={(event) => setField('quantity', event.target.value)}
                    required
                  />
                </div>

                {inventoryOperationMode === 'transfer' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="t10-source-location">Ubicación de origen</label>
                      <select
                        id="t10-source-location"
                        className="form-select"
                        value={transferCoordinates.sourceLocationCode}
                        onChange={(event) => setTransferCoordinates((prev) => ({ ...prev, sourceLocationCode: event.target.value }))}
                      >
                        <option value="">Sin asignar</option>
                        {options?.locations.map((location) => (
                          <option key={location.code} value={location.code}>{location.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="t10-dest-location">Ubicación de destino</label>
                      <select
                        id="t10-dest-location"
                        className="form-select"
                        value={transferCoordinates.destinationLocationCode}
                        onChange={(event) => setTransferCoordinates((prev) => ({ ...prev, destinationLocationCode: event.target.value }))}
                      >
                        <option value="">Sin asignar</option>
                        {options?.locations.map((location) => (
                          <option key={location.code} value={location.code}>{location.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="t10-source-lot">Lote de origen</label>
                      <select
                        id="t10-source-lot"
                        className="form-select"
                        value={transferCoordinates.sourceLotCode}
                        onChange={(event) => setTransferCoordinates((prev) => ({ ...prev, sourceLotCode: event.target.value }))}
                      >
                        <option value="">Sin lote</option>
                        {options?.lots.map((lot) => (
                          <option key={lot.code} value={lot.code}>{lot.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="t10-dest-lot">Lote de destino</label>
                      <select
                        id="t10-dest-lot"
                        className="form-select"
                        value={transferCoordinates.destinationLotCode}
                        onChange={(event) => setTransferCoordinates((prev) => ({ ...prev, destinationLotCode: event.target.value }))}
                      >
                        <option value="">Sin lote</option>
                        {options?.lots.map((lot) => (
                          <option key={lot.code} value={lot.code}>{lot.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="t10-location">Ubicación</label>
                      <select
                        id="t10-location"
                        className="form-select"
                        value={form.locationCode}
                        onChange={(event) => setField('locationCode', event.target.value)}
                      >
                        <option value="">Sin asignar</option>
                        {options?.locations.map((location) => (
                          <option key={location.code} value={location.code}>{location.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="t10-lot">Lote</label>
                      <select
                        id="t10-lot"
                        className="form-select"
                        value={form.lotCode}
                        onChange={(event) => setField('lotCode', event.target.value)}
                      >
                        <option value="">Sin lote</option>
                        {options?.lots.map((lot) => (
                          <option key={lot.code} value={lot.code}>{lot.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="form-group form-col-span-full">
                  <label className="form-label" htmlFor="t10-reason">Motivo y aprobación</label>
                  <input
                    id="t10-reason"
                    className="form-input"
                    value={form.reason}
                    onChange={(event) => setField('reason', event.target.value)}
                    required
                    maxLength={300}
                    placeholder="Detalle la justificación del traslado o conteo físico"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  aria-label={saving ? 'Guardando operación…' : inventoryOperationMode === 'transfer' ? 'Registrar traslado entre galpones' : 'Registrar conciliación de conteo físico'}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={16} />
                    <span>{saving ? 'Guardando…' : inventoryOperationMode === 'transfer' ? 'Registrar traslado de animales' : 'Registrar conciliación física'}</span>
                  </span>
                </button>
              </div>
              {success && (
                <div className="alert alert-success" role="status" aria-live="polite">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={16} />
                    <span>{success}</span>
                  </span>
                </div>
              )}
            </form>
          )}
          {!soloLectura && <div className="card mt-4">
            <div className="card-header-clean mb-2"><span className="section-title">Corregir un movimiento</span><span className="text-xs text-muted">El original se conserva; revise los movimientos posteriores antes de confirmar.</span></div>
            <form className="form-stack" onSubmit={(event) => void submitCorrection(event)}>
              {formError && (
                <div className="alert alert-error" role="alert" aria-live="assertive">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{formError}</span>
                  </span>
                </div>
              )}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="t10-correction-id">ID del movimiento</label>
                  <input
                    id="t10-correction-id"
                    type="number"
                    min="1"
                    step="1"
                    className="form-input"
                    value={correctionForm.movementId}
                    onChange={(event) => {
                      setCorrectionForm((prev) => ({ ...prev, movementId: event.target.value }));
                      setCorrectionPreview(null);
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="t10-correction-quantity">Cantidad correcta</label>
                  <input
                    id="t10-correction-quantity"
                    type="number"
                    step="1"
                    className="form-input"
                    value={correctionForm.correctedQuantity}
                    onChange={(event) => {
                      setCorrectionForm((prev) => ({ ...prev, correctedQuantity: event.target.value }));
                      setCorrectionPreview(null);
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="t10-correction-reason">Motivo</label>
                  <input
                    id="t10-correction-reason"
                    className="form-input"
                    value={correctionForm.reason}
                    onChange={(event) => setCorrectionForm((prev) => ({ ...prev, reason: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void previewCorrection()}
                  disabled={saving}
                  aria-label="Previsualizar impacto de la corrección de movimiento"
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconEye size={14} />
                    <span>Previsualizar impacto</span>
                  </span>
                </button>
              </div>
              {correctionPreview && (
                <div className={correctionPreview.allowed ? 'alert alert-success' : 'alert alert-error'} role="status" aria-live="polite">
                  <p className="inline-flex items-center gap-1.5 flex-wrap">
                    {correctionPreview.allowed ? (
                      <>
                        <span>Compatible: {correctionPreview.originalQuantity}</span>
                        <IconArrowRight size={14} className="inline text-muted" />
                        <span>{correctionPreview.correctedQuantity}.</span>
                      </>
                    ) : (
                      'No se puede aplicar: estos movimientos posteriores quedarían incompatibles.'
                    )}
                  </p>
                  {correctionPreview.incompatibleMovements.map((item, index) => <p key={`${item.id}-${index}`}>#{item.id} · {item.type} · {item.date} · {item.quantity} cabezas · saldo resultante {item.balanceAfter}</p>)}
                </div>
              )}
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={saving || !correctionPreview?.allowed}
                  aria-label={saving ? 'Guardando corrección…' : 'Confirmar corrección de movimiento'}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={14} />
                    <span>{saving ? 'Guardando…' : 'Confirmar corrección'}</span>
                  </span>
                </button>
              </div>
            </form>
          </div>}
        </div>
      )}

      {data && section === 'movimientos' && (
        <div className="card">
          <div className="card-header-clean mb-2 flex-wrap gap-2">
            <div>
              <span className="section-title">Kardex de movimientos</span>
              <span className="text-xs text-muted block mt-0.5">
                Historial inmutable de entradas, salidas, muertes y traslados
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
                  placeholder="Buscar en movimientos..."
                  value={movementSearch}
                  onChange={(event) => setMovementSearch(event.target.value)}
                  aria-label="Buscar en historial de movimientos"
                />
              </div>

              <div className="inline-flex items-center gap-1">
                <label className="text-xs text-muted inline-flex items-center gap-1" htmlFor="inv-filter">
                  <IconFilter size={14} />
                  <span>Tipo:</span>
                </label>
                <select
                  id="inv-filter"
                  className="form-select form-select-sm"
                  value={filterType}
                  onChange={(event) => setFilterType(event.target.value)}
                >
                  <option value="">Todos</option>
                  {Object.entries(MOVEMENT_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                  <option value="transfer_in">Traslado recibido</option>
                  <option value="transfer_out">Traslado enviado</option>
                </select>
              </div>

              {(filterType || movementSearch) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label="Restablecer filtros del kardex"
                  onClick={() => {
                    setFilterType('');
                    setMovementSearch('');
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
                No hay movimientos de inventario registrados a la fecha de corte ({data.asOf}).
              </p>
              {!soloLectura && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  aria-label="Ir a registrar movimiento de inventario"
                  onClick={() => setSection('registrar')}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Registrar movimiento</span>
                  </span>
                </button>
              )}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-icon-wrap">
                <IconFilter size={24} className="text-muted" />
              </div>
              <p className="font-semibold text-base">Sin resultados para los filtros aplicados</p>
              <p className="text-sm text-muted">
                No se encontraron movimientos que coincidan con la búsqueda o el tipo seleccionado.
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label="Restablecer filtros de búsqueda de movimientos"
                onClick={() => {
                  setFilterType('');
                  setMovementSearch('');
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
                    <th className="text-left">Tipo</th>
                    <th className="text-left">Galpón</th>
                    <th className="text-left">Ubicación / lote</th>
                    <th className="text-left">Etapa / sexo</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-left">Causa</th>
                    <th className="text-left">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="text-left font-numeric tabular-nums font-mono">{movement.effectiveDate}</td>
                      <td className="text-left">
                        <span className={TYPE_BADGE[movement.movementType] ?? 'badge-tag'}>
                          {movement.movementLabel}
                        </span>
                      </td>
                      <td className="text-left font-semibold">{movement.barnName}</td>
                      <td className="text-left">
                        {movement.locationName ?? 'Sin ubicación'}
                        {movement.lotName ? ` · ${movement.lotName}` : ''}
                      </td>
                      <td className="text-left">
                        {movement.stageName} · {SEX_LABELS[movement.sex] ?? movement.sex}
                      </td>
                      <td className={`text-right font-semibold font-numeric tabular-nums font-mono ${isNegativeMovement(movement) ? 'text-danger' : 'text-success'}`}>
                        {formatSigned(movement)}
                      </td>
                      <td className="text-left">{movement.causeCode ?? <span className="text-muted">—</span>}</td>
                      <td className="text-left text-xs text-muted">{movement.createdByName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="card-footer-note">
            Se muestran {filteredMovements.length} de {data.movements.length} movimientos hasta la fecha de corte ({data.asOf}).
          </p>
        </div>
      )}
    </div>
  );
}

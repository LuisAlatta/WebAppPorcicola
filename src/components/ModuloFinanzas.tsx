import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconBuilding,
  IconCheck,
  IconCoins,
  IconDownload,
  IconPlus,
  IconRefreshCw,
  IconTrash,
  IconX,
} from './icons';
import { ModalDialog } from './ModalDialog';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import type { Perfil } from '../types';
import { generarReportePdf } from '../utils/exportPdf';
import { generarReporteXlsx } from '../utils/exportXlsx';

type Barn = { id: number; name: string };
type Allocation = { barnId: string; amount: string; animalCode: string; lotCode: string; supplyCode: string; quantity: string };
type Entry = {
  id: number;
  allocationId: number;
  direction: 'income' | 'expense';
  category: string;
  concept: string;
  operationDate: string;
  amountMinor: number;
  settledMinor: number;
  outstandingMinor: number;
  entryTotalMinor: number | null;
  currencyCode: string;
  counterparty: string | null;
  reference: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversalOfId: number | null;
  reversedAt: string | null;
  responsibleName: string;
  barnName: string;
  animalCode: string | null;
  lotCode: string | null;
  supplyCode: string | null;
  quantity: number | null;
};
type CashRow = {
  id: number;
  financialEntryId: number;
  settlementDate: string;
  amountMinor: number;
  paymentMethod: string;
  direction: 'income' | 'expense';
  category: string;
  concept: string;
  currencyCode: string;
  counterparty: string | null;
  barnName: string;
  responsibleName: string;
};
type CashBalance = {
  currencyCode: string;
  openingMinor: number;
  receiptsMinor: number;
  paymentsMinor: number;
  closingMinor: number;
  openingBalanceIsCalculated: boolean;
};

const emptyAllocation = (): Allocation => ({ barnId: '', amount: '', animalCode: '', lotCode: '', supplyCode: '', quantity: '' });

const money = (minor: number, currency: string) => {
  const formatted = (minor / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'PEN') return `S/ ${formatted}`;
  if (currency === 'USD') return `$ ${formatted}`;
  return `${currency} ${formatted}`;
};

export function ModuloFinanzas({ perfil }: { perfil: Perfil }) {
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  const canWrite = perfil === 'administrador' || perfil === 'responsable';
  const isAdmin = perfil === 'administrador';

  const [section, setSection] = useState<'libro' | 'caja' | 'registrar'>('libro');
  const [loading, setLoading] = useState<boolean>(true);
  const [barns, setBarns] = useState<Barn[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cashRows, setCashRows] = useState<CashRow[]>([]);
  const [cashTotals, setCashTotals] = useState<{ direction: string; currencyCode: string; amountMinor: number }[]>([]);
  const [cashBalances, setCashBalances] = useState<CashBalance[]>([]);
  const [totals, setTotals] = useState<{ direction: string; currencyCode: string; amountMinor: number }[]>([]);
  const [filter, setFilter] = useState({ from: '', to: '', direction: '', currencyCode: '', category: '', barnId: '' });
  const [form, setForm] = useState({
    direction: 'expense',
    category: 'Alimento balanceado',
    concept: '',
    operationDate: farmToday(),
    amount: '',
    currencyCode: 'PEN',
    counterparty: '',
    reference: '',
    reason: '',
    notes: '',
  });
  const [openingForm, setOpeningForm] = useState({ date: farmToday(), currencyCode: 'PEN', amount: '', reason: '' });
  const [allocations, setAllocations] = useState<Allocation[]>([emptyAllocation()]);
  const [settlementTarget, setSettlementTarget] = useState<Entry | null>(null);
  const [settlementForm, setSettlementForm] = useState({ amount: '', date: farmToday(), method: 'transferencia', reference: '', reason: '' });
  const [reversalTarget, setReversalTarget] = useState<Entry | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalOperationKey, setReversalOperationKey] = useState(() => newOperationKey('finance-reversal'));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter)) {
        if (value) params.set(key, value);
      }
      const [er, br, cr] = await Promise.all([
        fetch(`/api/finance/entries?${params}`),
        fetch('/api/finance/barns'),
        fetch(`/api/finance/cashflow?${params}`),
      ]);
      const [e, b, c] = (await Promise.all([er.json(), br.json(), cr.json()])) as [
        { entries?: Entry[]; totals?: { direction: string; currencyCode: string; amountMinor: number }[]; error?: string },
        { barns?: Barn[]; error?: string },
        { entries?: CashRow[]; totals?: { direction: string; currencyCode: string; amountMinor: number }[]; cashBalances?: CashBalance[]; error?: string },
      ];
      if (!er.ok || !br.ok || !cr.ok) throw new Error(e.error || b.error || c.error || 'No se pudo cargar finanzas');
      setEntries(e.entries ?? []);
      setTotals(e.totals ?? []);
      setBarns(b.barns ?? []);
      setCashRows(c.entries ?? []);
      setCashTotals(c.totals ?? []);
      setCashBalances(c.cashBalances ?? []);
      setError('');
    } catch (err) {
      setEntries([]);
      setTotals([]);
      setCashRows([]);
      setCashTotals([]);
      setCashBalances([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(err => setError(err instanceof Error ? err.message : 'Error cargando finanzas'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalMinor = useMemo(() => {
    const match = form.amount.match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);
    return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : 0;
  }, [form.amount]);

  const allocatedMinor = useMemo(() => {
    return allocations.reduce((total, line) => {
      const value = line.amount || (allocations.length === 1 ? form.amount : '');
      const match = value.match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);
      return total + (match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : 0);
    }, 0);
  }, [allocations, form.amount]);

  const updateAllocation = (index: number, key: keyof Allocation, value: string) => {
    setAllocations(old => old.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  };

  const exportFinance = async (source: 'finance' | 'cashflow', format: 'pdf' | 'xlsx', share = false) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const columns =
        source === 'finance'
          ? [
              { key: 'operationDate', label: 'Fecha de operación', dataType: 'date' as const },
              { key: 'direction', label: 'Ingreso/egreso', dataType: 'text' as const },
              { key: 'category', label: 'Categoría', dataType: 'text' as const },
              { key: 'barn', label: 'Galpón', dataType: 'text' as const },
              { key: 'currency', label: 'Moneda', dataType: 'text' as const },
              { key: 'amount', label: 'Importe', dataType: 'money' as const },
            ]
          : [
              { key: 'settlementDate', label: 'Fecha de caja', dataType: 'date' as const },
              { key: 'direction', label: 'Ingreso/egreso', dataType: 'text' as const },
              { key: 'category', label: 'Categoría', dataType: 'text' as const },
              { key: 'barn', label: 'Galpón', dataType: 'text' as const },
              { key: 'currency', label: 'Moneda', dataType: 'text' as const },
              { key: 'amount', label: 'Importe', dataType: 'money' as const },
            ];
      const filters = Object.fromEntries(
        [['direction', filter.direction], ['category', filter.category], ['currency', filter.currencyCode]].filter(([, value]) => Boolean(value))
      ) as Record<string, string>;
      const definition = {
        source,
        name: source === 'finance' ? 'Libro de ingresos y egresos' : 'Flujo de caja',
        purpose: source === 'finance' ? 'Operaciones financieras por fecha, moneda y galpón' : 'Cobros y pagos efectivos por fecha, moneda y galpón',
        from: filter.from || undefined,
        to: filter.to || undefined,
        barnId: filter.barnId || undefined,
        columns: columns.map(column => column.key),
        filters,
      };
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
      });
      const data = (await response.json()) as {
        definition: typeof definition;
        asOf: string;
        rows: Record<string, unknown>[];
        totals: Record<string, number | null>;
        moneyTotals: Record<string, { income: number; expense: number; balance: number }>;
        farmName?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'No se pudo preparar el informe financiero');
      const options = {
        title: definition.name,
        purpose: definition.purpose,
        generatedAt: new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date()),
        from: definition.from,
        to: definition.to,
        asOf: data.asOf,
        filters: { ...filters, Galpón: filter.barnId ? (barns.find(barn => String(barn.id) === filter.barnId)?.name ?? `#${filter.barnId}`) : 'Todos los asignados' },
        columns,
        rows: data.rows,
        totals: data.totals,
        moneyTotals: data.moneyTotals,
      };
      const bytes = format === 'pdf' ? await generarReportePdf({ ...options, farm: data.farmName ?? 'Granja' }) : generarReporteXlsx({ ...options, sheetName: definition.name });
      const extension = format === 'pdf' ? 'pdf' : 'xlsx';
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const file = new File([new Uint8Array(bytes).buffer as ArrayBuffer], `${source === 'finance' ? 'finanzas' : 'caja'}-${farmToday()}.${extension}`, { type: mime });
      if (share) {
        if (!navigator.canShare?.({ files: [file] }) || !navigator.share) throw new Error('Este dispositivo no puede compartir este archivo. Usa Exportar para descargarlo.');
        await navigator.share({ files: [file], title: definition.name });
        setNotice(`Informe completo de ${data.rows.length} filas compartido.`);
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        setNotice(`Informe completo de ${data.rows.length} filas descargado.`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Error exportando finanzas');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const lines = allocations.map(line => ({
        barnId: line.barnId || null,
        amountMinor: undefined,
        amount: line.amount || (allocations.length === 1 ? form.amount : ''),
        animalCode: line.animalCode || undefined,
        lotCode: line.lotCode || undefined,
        supplyCode: line.supplyCode || undefined,
        quantity: line.quantity || undefined,
      }));
      const response = await fetchOperation('/api/finance/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, allocations: lines, reason: form.reason, operationKey: newOperationKey('finance-entry') }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la operación');
      setNotice('Operación financiera registrada con su distribución y auditoría.');
      setForm(old => ({ ...old, concept: '', amount: '', counterparty: '', reference: '', reason: '' }));
      setAllocations([emptyAllocation()]);
      await load();
      setSection('libro');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando operación');
    } finally {
      setBusy(false);
    }
  };

  const confirmReverse = async () => {
    if (!reversalTarget || !reversalReason.trim()) return;
    const entry = reversalTarget;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetchOperation(`/api/finance/entries/${entry.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveDate: farmToday(), reason: reversalReason.trim(), operationKey: reversalOperationKey }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo anular la operación');
      await load();
      setNotice(`Operación #${entry.id} anulada con un asiento compensatorio auditable.`);
      setReversalTarget(null);
      setReversalReason('');
      setReversalOperationKey(newOperationKey('finance-reversal'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error anulando operación');
    } finally {
      setBusy(false);
    }
  };

  const settle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settlementTarget) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetchOperation(`/api/finance/entries/${settlementTarget.id}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlementDate: settlementForm.date,
          amount: settlementForm.amount,
          paymentMethod: settlementForm.method,
          reference: settlementForm.reference || undefined,
          reason: settlementForm.reason,
          operationKey: newOperationKey('finance-settlement'),
          allocations: [{ allocationId: settlementTarget.allocationId, amount: settlementForm.amount }],
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el abono');
      setSettlementTarget(null);
      setSettlementForm({ amount: '', date: farmToday(), method: 'transferencia', reference: '', reason: '' });
      setNotice(settlementTarget.direction === 'income' ? 'Cobro registrado con fecha efectiva.' : 'Pago registrado con fecha efectiva.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando abono');
    } finally {
      setBusy(false);
    }
  };

  const saveOpening = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetchOperation('/api/finance/cash/opening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveDate: openingForm.date,
          currencyCode: openingForm.currencyCode,
          amount: openingForm.amount,
          reason: openingForm.reason,
          operationKey: newOperationKey('finance-opening'),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo fijar el saldo inicial');
      setNotice('Saldo inicial de caja guardado con auditoría.');
      setOpeningForm(old => ({ ...old, amount: '', reason: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando saldo inicial');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="module-container">
      <datalist id="porcine-finance-categories">
        <option value="Alimento balanceado" />
        <option value="Medicamentos y vacunas" />
        <option value="Venta de cerdos de engorde" />
        <option value="Venta de lechones destetados" />
        <option value="Venta de marranas / verracos de descarte" />
        <option value="Inseminación artificial y pajillas" />
        <option value="Desinfección y bioseguridad" />
        <option value="Mantenimiento de galpones y corrales" />
        <option value="Jornales y personal de granja" />
        <option value="Flete y transporte de animales" />
        <option value="Servicios veterinarios y análisis" />
        <option value="Otros ingresos operativos" />
        <option value="Otros egresos de granja" />
      </datalist>

      <div className="module-heading mb-4">
        <p className="text-xs text-muted">
          Libro de ingresos, egresos y flujo de caja con distribución por galpón en soles peruanos (PEN S/).
        </p>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label="Actualizar datos financieros y saldos de caja"
          onClick={() => void load().catch(err => setError(err instanceof Error ? err.message : 'No se pudo actualizar finanzas'))}
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

      {/* Navegación por pestañas SaaS */}
      <div className="admin-tabs" role="tablist" aria-label="Secciones del módulo financiero">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'libro'}
          aria-label="Pestaña Libro Financiero: ingresos, egresos y saldos pendientes"
          className={`btn btn-sm ${section === 'libro' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('libro')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCoins size={14} />
            <span>Libro Financiero</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'caja'}
          aria-label="Pestaña Flujo de Caja: cobros y pagos efectivos"
          className={`btn btn-sm ${section === 'caja' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('caja')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBuilding size={14} />
            <span>Flujo de Caja</span>
          </span>
        </button>
        {canWrite && (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'registrar'}
            aria-label="Pestaña Registrar Operación: nuevo ingreso o gasto distribuido"
            className={`btn btn-sm ${section === 'registrar' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSection('registrar')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconPlus size={14} />
              <span>Registrar Operación</span>
            </span>
          </button>
        )}
      </div>

      {loading && !entries.length && (
        <div className="card empty-state-card">
          <div className="empty-icon-wrap">
            <IconRefreshCw size={26} className="text-primary spinner-icon" />
          </div>
          <p className="font-semibold text-base">Cargando libro financiero y flujo de caja…</p>
          <p className="text-sm text-muted">Consultando asientos contables y saldos en granja.</p>
        </div>
      )}

      {section === 'registrar' && (
        canWrite ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Registrar operación financiera</h2>
              <p className="text-muted">La suma distribuida entre galpones debe coincidir con el importe total.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Movimiento</label>
              <select className="form-select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
                <option value="expense">Egreso / Gasto operativo</option>
                <option value="income">Ingreso / Venta</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <input
                required
                maxLength={80}
                list="porcine-finance-categories"
                placeholder="ej. Alimento balanceado"
                className="form-input"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div className="form-group form-span-2">
              <label className="form-label">Concepto descriptivo</label>
              <input
                required
                maxLength={240}
                placeholder="ej. Compra de 50 sacos de alimento inicio para lechones"
                className="form-input"
                value={form.concept}
                onChange={e => setForm({ ...form, concept: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de operación</label>
              <input
                required
                type="date"
                max={farmToday()}
                className="form-input tabular-nums"
                value={form.operationDate}
                onChange={e => setForm({ ...form, operationDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Importe total</label>
              <input
                required
                inputMode="decimal"
                placeholder="0.00"
                className="form-input font-numeric tabular-nums font-bold"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select className="form-select" value={form.currencyCode} onChange={e => setForm({ ...form, currencyCode: e.target.value })}>
                <option value="PEN">PEN · Sol peruano (S/)</option>
                <option value="USD">USD · Dólar estadounidense ($)</option>
                <option value="EUR">EUR · Euro (€)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Contraparte (cliente / proveedor)</label>
              <input
                maxLength={160}
                placeholder="ej. Molinera del Sur S.A.C."
                className="form-input"
                value={form.counterparty}
                onChange={e => setForm({ ...form, counterparty: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Comprobante / Referencia</label>
              <input
                maxLength={100}
                placeholder="ej. Factura F001-00234 o Recibo 452"
                className="form-input"
                value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Motivo para auditoría</label>
              <input
                required
                maxLength={500}
                placeholder="ej. Abastecimiento programado de galpón de destete"
                className="form-input"
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
              />
            </div>

            <div className="form-span-2">
              <div className="module-heading mb-2">
                <div>
                  <h3 className="text-base font-bold">Distribución por galpón</h3>
                  <p className="text-xs text-muted">Asigna montos e insumos a cada galpón involucrado.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-label="Agregar otra asignación por galpón"
                  onClick={() => setAllocations(old => [...old, emptyAllocation()])}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Agregar galpón</span>
                  </span>
                </button>
              </div>
              {allocations.map((line, index) => (
                <div className="allocation-card mb-3" key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-muted uppercase tracking-wider">
                      Asignación {allocations.length > 1 ? `#${index + 1}` : 'Principal'}
                    </span>
                    {allocations.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm text-danger"
                        aria-label={`Quitar asignación de galpón ${index + 1}`}
                        onClick={() => setAllocations(old => old.filter((_, i) => i !== index))}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconTrash size={14} />
                          <span>Quitar galpón</span>
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Galpón de destino</label>
                      <select
                        className="form-select"
                        value={line.barnId}
                        onChange={e => updateAllocation(index, 'barnId', e.target.value)}
                        required={!isAdmin}
                      >
                        <option value="">{isAdmin ? 'Granja general (sin galpón fijo)' : 'Seleccionar galpón'}</option>
                        {barns.map(barn => (
                          <option key={barn.id} value={barn.id}>{barn.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Importe distribuido ({form.currencyCode === 'PEN' ? 'S/' : form.currencyCode})</label>
                      <input
                        required={allocations.length > 1}
                        inputMode="decimal"
                        placeholder={allocations.length === 1 ? form.amount : '0.00'}
                        value={line.amount}
                        onChange={e => updateAllocation(index, 'amount', e.target.value)}
                        className="form-input font-numeric tabular-nums"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Animal / Arete (opcional)</label>
                      <input
                        placeholder="ej. MAR-012"
                        className="form-input"
                        value={line.animalCode}
                        onChange={e => updateAllocation(index, 'animalCode', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Lote porcino (opcional)</label>
                      <input
                        placeholder="ej. LOT-2025-01"
                        className="form-input"
                        value={line.lotCode}
                        onChange={e => updateAllocation(index, 'lotCode', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Insumo / Vacuna (opcional)</label>
                      <input
                        placeholder="ej. VAC-001"
                        className="form-input"
                        value={line.supplyCode}
                        onChange={e => updateAllocation(index, 'supplyCode', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cantidad (kg / dosis / un)</label>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="0.000"
                        value={line.quantity}
                        onChange={e => updateAllocation(index, 'quantity', e.target.value)}
                        className="form-input font-numeric tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-group form-span-2">
              <label className="form-label">Notas adicionales (opcional)</label>
              <textarea
                maxLength={1000}
                placeholder="Observaciones de entrega, peso de lote o detalles de recepción..."
                className="form-textarea"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="form-span-2 flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-subtle">
              <p className={totalMinor === allocatedMinor ? 'text-muted tabular-nums m-0' : 'text-danger font-bold tabular-nums m-0'}>
                Distribuido: {money(allocatedMinor, form.currencyCode)} de {money(totalMinor, form.currencyCode)}
              </p>
              <button className="btn btn-primary" disabled={busy || !totalMinor || totalMinor !== allocatedMinor}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : 'Registrar operación'}</span>
                </span>
              </button>
            </div>
          </form>
        </section>
        ) : (
          <div className="card empty-state-card">
            <div className="empty-icon-wrap">
              <IconCoins size={26} className="text-muted" />
            </div>
            <p className="font-semibold text-base">Modo de consulta</p>
            <p className="text-sm text-muted">
              Este perfil puede consultar las finanzas de los galpones asignados. Solo el Usuario responsable y el Administrador registran operaciones.
            </p>
          </div>
        )
      )}

      {section === 'libro' && settlementTarget && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{settlementTarget.direction === 'income' ? 'Registrar cobro' : 'Registrar pago'} · Operación #{settlementTarget.id}</h2>
              <p className="text-muted">
                Saldo pendiente en {settlementTarget.barnName}: <strong className="tabular-nums">{money(settlementTarget.outstandingMinor, settlementTarget.currencyCode)}</strong>
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label="Cerrar panel de registro de cobro o pago"
              onClick={() => setSettlementTarget(null)}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconX size={14} />
                <span>Cerrar</span>
              </span>
            </button>
          </div>
          <form className="form-grid" onSubmit={settle}>
            <div className="form-group">
              <label className="form-label">Fecha efectiva</label>
              <input
                required
                type="date"
                min={settlementTarget.operationDate}
                max={farmToday()}
                className="form-input tabular-nums"
                value={settlementForm.date}
                onChange={e => setSettlementForm({ ...settlementForm, date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Importe ({settlementTarget.currencyCode === 'PEN' ? 'S/' : settlementTarget.currencyCode})</label>
              <input
                required
                inputMode="decimal"
                max={(settlementTarget.outstandingMinor / 100).toFixed(2)}
                className="form-input font-numeric tabular-nums font-bold"
                value={settlementForm.amount}
                onChange={e => setSettlementForm({ ...settlementForm, amount: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Medio de pago</label>
              <select className="form-select" value={settlementForm.method} onChange={e => setSettlementForm({ ...settlementForm, method: e.target.value })}>
                <option value="transferencia">Transferencia bancaria</option>
                <option value="efectivo">Efectivo en caja</option>
                <option value="tarjeta">Tarjeta de débito/crédito</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro medio</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Número de operación / Referencia</label>
              <input
                className="form-input"
                value={settlementForm.reference}
                maxLength={100}
                placeholder="ej. OP-839201 BCP"
                onChange={e => setSettlementForm({ ...settlementForm, reference: e.target.value })}
              />
            </div>
            <div className="form-group form-span-2">
              <label className="form-label">Motivo para auditoría</label>
              <input
                required
                minLength={5}
                className="form-input"
                placeholder="ej. Abono de cliente por venta de cerdos en pie"
                value={settlementForm.reason}
                onChange={e => setSettlementForm({ ...settlementForm, reason: e.target.value })}
              />
            </div>
            <div className="form-span-2 flex items-center justify-end gap-2 pt-2 border-t border-subtle">
              <button type="button" className="btn btn-outline" onClick={() => setSettlementTarget(null)}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconX size={14} />
                  <span>Cancelar</span>
                </span>
              </button>
              <button className="btn btn-primary" disabled={busy}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : settlementTarget.direction === 'income' ? 'Registrar cobro' : 'Registrar pago'}</span>
                </span>
              </button>
            </div>
          </form>
        </section>
      )}

      {section === 'libro' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Libro financiero de la granja</h2>
              <p className="text-muted">
                La fecha de operación determina ingresos y gastos; la fecha del cobro o pago determina caja. Cada fila muestra su saldo pendiente.
              </p>
            </div>
            <div className="filter-row">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Exportar libro financiero en formato PDF"
                disabled={busy}
                onClick={() => void exportFinance('finance', 'pdf')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconDownload size={14} />
                  <span>Exportar PDF</span>
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Exportar libro financiero en formato Excel"
                disabled={busy}
                onClick={() => void exportFinance('finance', 'xlsx')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconDownload size={14} />
                  <span>Exportar Excel</span>
                </span>
              </button>
              {canShareFiles && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label="Compartir libro financiero en formato PDF"
                    disabled={busy}
                    onClick={() => void exportFinance('finance', 'pdf', true)}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconDownload size={14} />
                      <span>Compartir PDF</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label="Compartir libro financiero en formato Excel"
                    disabled={busy}
                    onClick={() => void exportFinance('finance', 'xlsx', true)}
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
            <div className="form-group">
              <label className="form-label text-xs">Desde</label>
              <input className="form-input form-input-sm tabular-nums" type="date" value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label text-xs">Hasta</label>
              <input className="form-input form-input-sm tabular-nums" type="date" value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label text-xs">Tipo</label>
              <select className="form-select form-select-sm" value={filter.direction} onChange={e => setFilter({ ...filter, direction: e.target.value })}>
                <option value="">Todos los movimientos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Egresos</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label text-xs">Moneda</label>
              <select className="form-select form-select-sm" value={filter.currencyCode} onChange={e => setFilter({ ...filter, currencyCode: e.target.value })}>
                <option value="">Todas</option>
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label text-xs">Galpón</label>
              <select className="form-select form-select-sm" value={filter.barnId} onChange={e => setFilter({ ...filter, barnId: e.target.value })}>
                <option value="">Todos los asignados</option>
                {barns.map(barn => (
                  <option value={barn.id} key={barn.id}>{barn.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label text-xs">Categoría</label>
              <input
                className="form-input form-input-sm"
                placeholder="Filtrar categoría..."
                value={filter.category}
                onChange={e => setFilter({ ...filter, category: e.target.value })}
              />
            </div>
          </div>

          {totals.length > 0 && (
            <div className="filter-row">
              {totals.map(item => (
                <div className="metric-card" key={`${item.direction}-${item.currencyCode}`}>
                  <span>{item.direction === 'income' ? 'Operaciones de ingreso' : 'Operaciones de egreso'} · {item.currencyCode}</span>
                  <strong className={`tabular-nums ${item.direction === 'income' ? 'text-success' : 'text-danger'}`}>
                    {money(item.amountMinor, item.currencyCode)}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {entries.length > 0 ? (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Fecha operación</th>
                    <th className="text-left">Tipo</th>
                    <th className="text-left">Categoría y concepto</th>
                    <th className="text-left">Galpón</th>
                    <th className="text-right">Importe</th>
                    <th className="text-right">Cobrado / Pagado</th>
                    <th className="text-right">Pendiente</th>
                    <th className="text-left">Contraparte</th>
                    <th className="text-left">Origen</th>
                    <th className="text-left">Responsable</th>
                    <th className="text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row, index) => (
                    <tr key={`${row.id}-${row.allocationId}`}>
                      <td className="text-left tabular-nums">{row.operationDate}</td>
                      <td className="text-left">
                        <span className={`badge-status ${row.direction === 'income' ? 'badge-success' : 'badge-warning'}`}>
                          {row.direction === 'income' ? 'Ingreso' : 'Egreso'}
                        </span>
                        {row.reversedAt && <span className="badge-status badge-danger ml-1">Anulada</span>}
                      </td>
                      <td className="text-left">
                        <strong>{row.category}</strong>
                        <div className="text-xs text-muted">{row.concept}</div>
                      </td>
                      <td className="text-left">{row.barnName}</td>
                      <td className="text-right tabular-nums font-mono font-bold">{money(row.amountMinor, row.currencyCode)}</td>
                      <td className="text-right tabular-nums font-mono text-muted">{money(row.settledMinor, row.currencyCode)}</td>
                      <td className="text-right tabular-nums font-mono">
                        <span className={row.outstandingMinor > 0 ? 'text-danger font-bold' : 'text-muted'}>
                          {money(row.outstandingMinor, row.currencyCode)}
                        </span>
                      </td>
                      <td className="text-left text-xs">
                        {row.counterparty ?? '—'}
                        {row.reference ? <div className="text-muted">Ref: {row.reference}</div> : null}
                      </td>
                      <td className="text-left text-xs">
                        {row.sourceType ? `${row.sourceType} #${row.sourceId}` : 'Manual'}
                        {row.reversalOfId ? <div className="text-danger">Reversa #{row.reversalOfId}</div> : null}
                      </td>
                      <td className="text-left text-xs">{row.responsibleName}</td>
                      <td className="text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          {canWrite && row.outstandingMinor > 0 && !row.reversedAt && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-label={`${row.direction === 'income' ? 'Registrar cobro' : 'Registrar pago'} de operación #${row.id}`}
                              disabled={busy}
                              onClick={() => {
                                setSettlementTarget(row);
                                setSettlementForm({
                                  ...settlementForm,
                                  amount: (row.outstandingMinor / 100).toFixed(2),
                                  date: farmToday(),
                                });
                              }}
                            >
                              <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                                <IconCoins size={12} />
                                <span>{row.direction === 'income' ? 'Cobrar' : 'Pagar'}</span>
                              </span>
                            </button>
                          )}
                          {canWrite && !row.sourceType && !row.reversedAt && entries.findIndex(item => item.id === row.id) === index && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm text-danger"
                              aria-label={`Anular operación #${row.id}`}
                              disabled={busy}
                              onClick={() => {
                                setReversalTarget(row);
                                setReversalReason('');
                                setReversalOperationKey(newOperationKey('finance-reversal'));
                              }}
                            >
                              <span className="inline-flex items-center justify-center gap-2 leading-none text-xs">
                                <IconTrash size={12} />
                                <span>Anular</span>
                              </span>
                            </button>
                          )}
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
                <IconCoins size={28} className="text-muted" />
              </div>
              <p className="font-semibold text-base">Sin operaciones financieras en este rango</p>
              <p className="text-sm text-muted">No se encontraron movimientos contables para los filtros seleccionados.</p>
              {canWrite && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-2"
                  aria-label="Registrar nueva operación financiera"
                  onClick={() => setSection('registrar')}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={14} />
                    <span>Registrar operación</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {reversalTarget && (
        <ModalDialog
          labelledBy="finance-reversal-dialog-title"
          onDismiss={() => {
            setReversalTarget(null);
            setReversalReason('');
          }}
          dismissDisabled={busy}
        >
          <h4 id="finance-reversal-dialog-title" className="text-lg font-bold mb-2 text-danger">
            Anular Operación Financiera
          </h4>
          <p className="text-sm text-muted mb-3">
            Se creará un contra-asiento compensatorio auditable que anula la operación <strong>#{reversalTarget.id}</strong> ({reversalTarget.direction === 'income' ? 'Ingreso' : 'Egreso'} · {reversalTarget.category} · {money(reversalTarget.amountMinor, reversalTarget.currencyCode)}).
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              void confirmReverse();
            }}
          >
            <div className="form-group mb-4">
              <label className="form-label text-sm" htmlFor="fin-reversal-reason">
                Motivo de anulación:
              </label>
              <input
                id="fin-reversal-reason"
                className="form-input"
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="ej. Error en importe / operación duplicada"
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
                  setReversalTarget(null);
                  setReversalReason('');
                }}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconX size={14} />
                  <span>Cancelar</span>
                </span>
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={busy || !reversalReason.trim()}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconTrash size={14} />
                  <span>{busy ? 'Anulando…' : 'Confirmar anulación'}</span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}

      {section === 'caja' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Flujo de caja</h2>
              <p className="text-muted">
                Movimientos efectivos por fecha de cobro o pago, incluidos cobros de operaciones anuladas y devoluciones efectivamente pagadas.
              </p>
            </div>
            <div className="filter-row">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Exportar flujo de caja en formato PDF"
                disabled={busy}
                onClick={() => void exportFinance('cashflow', 'pdf')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconDownload size={14} />
                  <span>Exportar PDF</span>
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Exportar flujo de caja en formato Excel"
                disabled={busy}
                onClick={() => void exportFinance('cashflow', 'xlsx')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconDownload size={14} />
                  <span>Exportar Excel</span>
                </span>
              </button>
              {canShareFiles && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label="Compartir flujo de caja en formato PDF"
                    disabled={busy}
                    onClick={() => void exportFinance('cashflow', 'pdf', true)}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconDownload size={14} />
                      <span>Compartir PDF</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label="Compartir flujo de caja en formato Excel"
                    disabled={busy}
                    onClick={() => void exportFinance('cashflow', 'xlsx', true)}
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

          {isAdmin && (
            <form className="form-grid mb-4" onSubmit={saveOpening}>
              <div className="form-group">
                <label className="form-label">Fecha de apertura</label>
                <input required type="date" max={farmToday()} className="form-input tabular-nums" value={openingForm.date} onChange={e => setOpeningForm({ ...openingForm, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Moneda</label>
                <select className="form-select" value={openingForm.currencyCode} onChange={e => setOpeningForm({ ...openingForm, currencyCode: e.target.value })}>
                  <option value="PEN">PEN · Sol peruano (S/)</option>
                  <option value="USD">USD · Dólar estadounidense ($)</option>
                  <option value="EUR">EUR · Euro (€)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto inicial en caja</label>
                <input required inputMode="decimal" placeholder="0.00" className="form-input font-numeric tabular-nums font-bold" value={openingForm.amount} onChange={e => setOpeningForm({ ...openingForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Motivo para auditoría</label>
                <input required minLength={5} placeholder="ej. Apertura de caja chica de granja" className="form-input" value={openingForm.reason} onChange={e => setOpeningForm({ ...openingForm, reason: e.target.value })} />
              </div>
              <div className="form-span-2">
                <button className="btn btn-secondary" disabled={busy}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={16} />
                    <span>Fijar saldo inicial de caja</span>
                  </span>
                </button>
              </div>
            </form>
          )}

          <div className="filter-row">
            {cashBalances.map(item => (
              <div className="metric-card" key={`saldo-${item.currencyCode}`}>
                <span>{filter.direction || filter.category ? 'Balance inicial filtrado' : 'Saldo inicial'} · {item.currencyCode}{item.openingBalanceIsCalculated ? ' (derivado)' : ' (registrado)'}</span>
                <strong className="tabular-nums">{money(item.openingMinor, item.currencyCode)}</strong>
                <small className="tabular-nums">Cobros {money(item.receiptsMinor, item.currencyCode)} · Pagos {money(item.paymentsMinor, item.currencyCode)} · Final {money(item.closingMinor, item.currencyCode)}</small>
              </div>
            ))}
            {cashTotals.map(item => (
              <div className="metric-card" key={`cash-${item.direction}-${item.currencyCode}`}>
                <span>{item.direction === 'income' ? 'Cobros del periodo' : 'Pagos del periodo'} · {item.currencyCode}</span>
                <strong className={`tabular-nums ${item.direction === 'income' ? 'text-success' : 'text-danger'}`}>
                  {money(item.amountMinor, item.currencyCode)}
                </strong>
              </div>
            ))}
          </div>

          {cashRows.length > 0 ? (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Fecha de caja</th>
                    <th className="text-left">Movimiento</th>
                    <th className="text-left">Categoría y concepto</th>
                    <th className="text-left">Galpón</th>
                    <th className="text-left">Medio de pago</th>
                    <th className="text-right">Importe efectivo</th>
                    <th className="text-left">Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {cashRows.map((row, index) => (
                    <tr key={`${row.id}-${index}`}>
                      <td className="text-left tabular-nums">{row.settlementDate}</td>
                      <td className="text-left">
                        <span className={`badge-status ${row.direction === 'income' ? 'badge-success' : 'badge-warning'}`}>
                          {row.direction === 'income' ? 'Cobro' : 'Pago'}
                        </span>
                      </td>
                      <td className="text-left">
                        <strong>{row.category}</strong> · {row.concept}
                        <div className="text-xs text-muted">Operación #{row.financialEntryId}{row.counterparty ? ` · ${row.counterparty}` : ''}</div>
                      </td>
                      <td className="text-left">{row.barnName}</td>
                      <td className="text-left text-xs capitalize">{row.paymentMethod}</td>
                      <td className="text-right tabular-nums font-mono font-bold">{money(row.amountMinor, row.currencyCode)}</td>
                      <td className="text-left text-xs">{row.responsibleName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card empty-state-card mt-3">
              <div className="empty-icon-wrap">
                <IconBuilding size={28} className="text-muted" />
              </div>
              <p className="font-semibold text-base">Sin movimientos de caja en este periodo</p>
              <p className="text-sm text-muted">No se han registrado cobros ni pagos efectivos en el rango seleccionado.</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-2"
                aria-label="Ir a consultar el libro contable de operaciones"
                onClick={() => setSection('libro')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCoins size={14} />
                  <span>Consultar libro contable</span>
                </span>
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

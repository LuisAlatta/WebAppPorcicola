import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBuilding,
  IconCheck,
  IconCoins,
  IconDownload,
  IconEye,
  IconPlus,
  IconRefreshCw,
  IconTrash,
  IconX,
} from './icons';
import { ModalDialog } from './ModalDialog';
import { ModuleTabs } from './ModuleTabs';
import { DataState } from './DataState';
import {
  PageHeader,
  InlineAlert,
  KpiCard,
  StatusBadge,
  SectionCard,
  FormField,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardNote,
  DataCardActions,
} from './ui';
import { farmToday, newOperationKey, fetchOperation } from '../utils/operations';
import { errorMessage, money, pluralize } from '../utils/format';
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

export function ModuloFinanzas({ perfil }: { perfil: Perfil }) {
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  const canWrite = perfil === 'administrador' || perfil === 'responsable';
  const isAdmin = perfil === 'administrador';

  const [section, setSection] = useState<'libro' | 'caja' | 'registrar'>('libro');
  const [loading, setLoading] = useState<boolean>(true);
  const [barns, setBarns] = useState<Barn[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [detailTarget, setDetailTarget] = useState<Entry | null>(null);
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
      void load().catch(err => setError(errorMessage(err, 'Error cargando finanzas')));
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
        setNotice(`Informe completo de ${pluralize(data.rows.length, 'fila', 'filas')} compartido.`);
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        setNotice(`Informe completo de ${pluralize(data.rows.length, 'fila', 'filas')} descargado.`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(errorMessage(err, 'Error exportando finanzas'));
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
      setError(errorMessage(err, 'Error guardando operación'));
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
      setError(errorMessage(err, 'Error anulando operación'));
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
      setError(errorMessage(err, 'Error registrando abono'));
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
      setError(errorMessage(err, 'Error guardando saldo inicial'));
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

      <PageHeader
        title="Finanzas"
        subtitle="Libro de ingresos, egresos y flujo de caja con distribución por galpón en soles peruanos (PEN S/)."
        actions={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-label="Actualizar datos financieros y saldos de caja"
            onClick={() => void load().catch(err => setError(errorMessage(err, 'No se pudo actualizar finanzas')))}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar datos</span>
            </span>
          </button>
        }
      />

      {error && !settlementTarget && !reversalTarget && (
        <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>
      )}
      {notice && (
        <InlineAlert tone="success" autoDismissMs={6000} onDismiss={() => setNotice('')}>{notice}</InlineAlert>
      )}

      <ModuleTabs
        label="Secciones del módulo financiero"
        active={section}
        onChange={setSection}
        columns={3}
        tabs={[
          { id: 'libro', label: 'Libro Financiero', ariaLabel: 'Pestaña Libro Financiero: ingresos, egresos y saldos pendientes', icon: <IconCoins size={14} /> },
          { id: 'caja', label: 'Flujo de Caja', ariaLabel: 'Pestaña Flujo de Caja: cobros y pagos efectivos', icon: <IconBuilding size={14} /> },
          ...(canWrite ? [{ id: 'registrar', label: 'Registrar Operación', ariaLabel: 'Pestaña Registrar Operación: nuevo ingreso o gasto distribuido', icon: <IconPlus size={14} /> }] : []),
        ]}
      />

      {loading && !entries.length && (
        <DataState variant="loading" title="Cargando libro financiero y flujo de caja…" description="Consultando asientos contables y saldos en granja." />
      )}

      {section === 'registrar' && (
        canWrite ? (
        <SectionCard
          title="Registrar operación financiera"
          subtitle="La suma distribuida entre galpones debe coincidir con el importe total."
        >
          <form className="form-stack" onSubmit={submit}>
            <div className="form-sections">
            <fieldset className="form-section">
              <legend>Operación e importe</legend>
              <div className="form-grid">
            <FormField label="Movimiento">
              <select className="form-select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
                <option value="expense">Egreso / Gasto operativo</option>
                <option value="income">Ingreso / Venta</option>
              </select>
            </FormField>
            <FormField label="Categoría">
              <input
                required
                maxLength={80}
                list="porcine-finance-categories"
                placeholder="ej. Alimento balanceado"
                className="form-input"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
              />
            </FormField>
            <FormField label="Concepto descriptivo" className="form-span-2">
              <input
                required
                maxLength={240}
                placeholder="ej. Compra de 50 sacos de alimento inicio para lechones"
                className="form-input"
                value={form.concept}
                onChange={e => setForm({ ...form, concept: e.target.value })}
              />
            </FormField>
            <FormField label="Fecha de operación">
              <input
                required
                type="date"
                max={farmToday()}
                className="form-input tabular-nums"
                value={form.operationDate}
                onChange={e => setForm({ ...form, operationDate: e.target.value })}
              />
            </FormField>
            <FormField label="Importe total">
              <input
                required
                inputMode="decimal"
                placeholder="0.00"
                className="form-input font-numeric tabular-nums font-bold"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </FormField>
            <FormField label="Moneda">
              <select className="form-select" value={form.currencyCode} onChange={e => setForm({ ...form, currencyCode: e.target.value })}>
                <option value="PEN">PEN · Sol peruano (S/)</option>
                <option value="USD">USD · Dólar estadounidense ($)</option>
                <option value="EUR">EUR · Euro (€)</option>
              </select>
            </FormField>
              </div>
            </fieldset>
            <fieldset className="form-section">
              <legend>Comprobante y auditoría</legend>
              <div className="form-grid">
            <FormField label="Contraparte (cliente / proveedor)">
              <input
                maxLength={160}
                placeholder="ej. Molinera del Sur S.A.C."
                className="form-input"
                value={form.counterparty}
                onChange={e => setForm({ ...form, counterparty: e.target.value })}
              />
            </FormField>
            <FormField label="Comprobante / Referencia">
              <input
                maxLength={100}
                placeholder="ej. Factura F001-00234 o Recibo 452"
                className="form-input"
                value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })}
              />
            </FormField>
            <FormField label="Motivo para auditoría">
              <input
                required
                maxLength={500}
                placeholder="ej. Abastecimiento programado de galpón de destete"
                className="form-input"
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
              />
            </FormField>

              </div>
            </fieldset>
            <fieldset className="form-section">
              <legend>Distribución por galpón</legend>
            <div>
              <div className="module-heading mb-2">
                <div>
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
                    <FormField label="Galpón de destino">
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
                    </FormField>
                    <FormField label={<>Importe distribuido ({form.currencyCode === 'PEN' ? 'S/' : form.currencyCode})</>}>
                      <input
                        required={allocations.length > 1}
                        inputMode="decimal"
                        placeholder={allocations.length === 1 ? form.amount : '0.00'}
                        value={line.amount}
                        onChange={e => updateAllocation(index, 'amount', e.target.value)}
                        className="form-input font-numeric tabular-nums"
                      />
                    </FormField>
                    <FormField label="Animal / Arete (opcional)">
                      <input
                        placeholder="ej. MAR-012"
                        className="form-input"
                        value={line.animalCode}
                        onChange={e => updateAllocation(index, 'animalCode', e.target.value)}
                      />
                    </FormField>
                    <FormField label="Lote porcino (opcional)">
                      <input
                        placeholder="ej. LOT-2025-01"
                        className="form-input"
                        value={line.lotCode}
                        onChange={e => updateAllocation(index, 'lotCode', e.target.value)}
                      />
                    </FormField>
                    <FormField label="Insumo / Vacuna (opcional)">
                      <input
                        placeholder="ej. VAC-001"
                        className="form-input"
                        value={line.supplyCode}
                        onChange={e => updateAllocation(index, 'supplyCode', e.target.value)}
                      />
                    </FormField>
                    <FormField label="Cantidad (kg / dosis / un)">
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="0.000"
                        value={line.quantity}
                        onChange={e => updateAllocation(index, 'quantity', e.target.value)}
                        className="form-input font-numeric tabular-nums"
                      />
                    </FormField>
                  </div>
                </div>
              ))}
            </div>

            <FormField label="Notas adicionales (opcional)" className="form-span-2">
              <textarea
                maxLength={1000}
                placeholder="Observaciones de entrega, peso de lote o detalles de recepción..."
                className="form-textarea"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>

            </fieldset>
            </div>
            <div className="form-actions form-actions-sticky flex-wrap">
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
        </SectionCard>
        ) : (
          <DataState
            variant="empty"
            title="Modo de consulta"
            description="Este perfil puede consultar las finanzas de los galpones asignados. Solo el Usuario responsable y el Administrador registran operaciones."
            icon={<IconCoins size={26} className="text-muted" />}
          />
        )
      )}

      {section === 'libro' && settlementTarget && (
        <ModalDialog labelledBy="finance-settlement-title" onDismiss={() => setSettlementTarget(null)} dismissDisabled={busy}>
          <div className="card-header">
            <div>
              <h2 id="finance-settlement-title">{settlementTarget.direction === 'income' ? 'Registrar cobro' : 'Registrar pago'} · Operación #{settlementTarget.id}</h2>
              <p className="text-muted">
                Saldo pendiente en {settlementTarget.barnName}: <strong className="tabular-nums">{money(settlementTarget.outstandingMinor, settlementTarget.currencyCode)}</strong>
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label="Cerrar panel de registro de cobro o pago"
              disabled={busy}
              onClick={() => setSettlementTarget(null)}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconX size={14} />
                <span>Cerrar</span>
              </span>
            </button>
          </div>
          <p className="data-card-note mb-3">{settlementTarget.category} · {settlementTarget.concept}</p>
          {error && <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>}
          <form className="form-grid" onSubmit={settle}>
            <FormField label="Fecha efectiva">
              <input
                required
                type="date"
                min={settlementTarget.operationDate}
                max={farmToday()}
                className="form-input tabular-nums"
                value={settlementForm.date}
                onChange={e => setSettlementForm({ ...settlementForm, date: e.target.value })}
              />
            </FormField>
            <FormField label={<>Importe ({settlementTarget.currencyCode === 'PEN' ? 'S/' : settlementTarget.currencyCode})</>}>
              <input
                required
                inputMode="decimal"
                max={(settlementTarget.outstandingMinor / 100).toFixed(2)}
                className="form-input font-numeric tabular-nums font-bold"
                value={settlementForm.amount}
                onChange={e => setSettlementForm({ ...settlementForm, amount: e.target.value })}
              />
            </FormField>
            <FormField label="Medio de pago">
              <select className="form-select" value={settlementForm.method} onChange={e => setSettlementForm({ ...settlementForm, method: e.target.value })}>
                <option value="transferencia">Transferencia bancaria</option>
                <option value="efectivo">Efectivo en caja</option>
                <option value="tarjeta">Tarjeta de débito/crédito</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro medio</option>
              </select>
            </FormField>
            <FormField label="Número de operación / Referencia">
              <input
                className="form-input"
                value={settlementForm.reference}
                maxLength={100}
                placeholder="ej. OP-839201 BCP"
                onChange={e => setSettlementForm({ ...settlementForm, reference: e.target.value })}
              />
            </FormField>
            <FormField label="Motivo para auditoría" className="form-span-2">
              <input
                required
                minLength={5}
                className="form-input"
                placeholder="ej. Abono de cliente por venta de cerdos en pie"
                value={settlementForm.reason}
                onChange={e => setSettlementForm({ ...settlementForm, reason: e.target.value })}
              />
            </FormField>
            <div className="form-span-2 form-actions form-actions-sticky">
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setSettlementTarget(null)}>
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
        </ModalDialog>
      )}

      {section === 'libro' && (
        <SectionCard
          title="Libro financiero de la granja"
          subtitle="La fecha de operación determina ingresos y gastos; la fecha del cobro o pago determina caja. Cada fila muestra su saldo pendiente."
          actions={
            <>
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
            </>
          }
        >

          <div className="filter-row">
            <FormField label="Desde" labelClassName="text-xs">
              <input className="form-input form-input-sm tabular-nums" type="date" value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })} />
            </FormField>
            <FormField label="Hasta" labelClassName="text-xs">
              <input className="form-input form-input-sm tabular-nums" type="date" value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })} />
            </FormField>
            <FormField label="Tipo" labelClassName="text-xs">
              <select className="form-select form-select-sm" value={filter.direction} onChange={e => setFilter({ ...filter, direction: e.target.value })}>
                <option value="">Todos los movimientos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Egresos</option>
              </select>
            </FormField>
            <FormField label="Moneda" labelClassName="text-xs">
              <select className="form-select form-select-sm" value={filter.currencyCode} onChange={e => setFilter({ ...filter, currencyCode: e.target.value })}>
                <option value="">Todas</option>
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </FormField>
            <FormField label="Galpón" labelClassName="text-xs">
              <select className="form-select form-select-sm" value={filter.barnId} onChange={e => setFilter({ ...filter, barnId: e.target.value })}>
                <option value="">Todos los asignados</option>
                {barns.map(barn => (
                  <option value={barn.id} key={barn.id}>{barn.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Categoría" labelClassName="text-xs">
              <input
                className="form-input form-input-sm"
                placeholder="Filtrar categoría..."
                value={filter.category}
                onChange={e => setFilter({ ...filter, category: e.target.value })}
              />
            </FormField>
          </div>

          {totals.length > 0 && (
            <div className="data-card-list data-card-grid mb-3">
              {totals.map(item => (
                <KpiCard
                  key={`${item.direction}-${item.currencyCode}`}
                  label={`${item.direction === 'income' ? 'Operaciones de ingreso' : 'Operaciones de egreso'} · ${item.currencyCode}`}
                  value={
                    <span className={item.direction === 'income' ? 'text-success' : 'text-danger'}>
                      {money(item.amountMinor, item.currencyCode)}
                    </span>
                  }
                />
              ))}
            </div>
          )}

          {entries.length > 0 ? (
            <DataCardList label="Movimientos del libro financiero" grid>
              {entries.map((row, index) => (
                <DataCard key={`${row.id}-${row.allocationId}`} state={row.reversedAt ? 'inactive' : 'active'}>
                  <DataCardHead
                    title={row.category}
                    subtitle={`Operación #${row.id} · ${row.operationDate} · ${row.barnName}`}
                    badge={
                      <div className="flex flex-col gap-1">
                        <StatusBadge tone={row.direction === 'income' ? 'success' : 'warning'}>
                          {row.direction === 'income' ? 'Ingreso' : 'Egreso'}
                        </StatusBadge>
                        {row.reversedAt && <StatusBadge tone="danger">Anulada</StatusBadge>}
                        {row.reversalOfId && <StatusBadge>Reversa #{row.reversalOfId}</StatusBadge>}
                      </div>
                    }
                  />
                  <DataCardNote>{row.concept}</DataCardNote>
                  <DataCardMeta items={[
                    { label: `Importe · ${row.currencyCode}`, value: money(row.amountMinor, row.currencyCode), className: 'font-mono tabular-nums' },
                    { label: 'Cobrado / Pagado', value: money(row.settledMinor, row.currencyCode), className: 'font-mono tabular-nums' },
                    { label: 'Pendiente', value: money(row.outstandingMinor, row.currencyCode), className: `font-mono tabular-nums ${row.outstandingMinor > 0 ? 'text-danger' : ''}` },
                    { label: 'Contraparte', value: row.counterparty ?? 'Sin registrar' },
                    { label: 'Origen', value: row.sourceType ? `${row.sourceType} #${row.sourceId}` : 'Manual' },
                    { label: 'Responsable', value: row.responsibleName },
                  ]} />
                  <DataCardActions>
                    <button type="button" className="btn btn-outline" aria-label={`Ver operación #${row.id} en ${row.barnName}`} onClick={() => setDetailTarget(row)}><IconEye size={14} /><span>Ver</span></button>
                    {canWrite && row.outstandingMinor > 0 && !row.reversedAt && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        aria-label={`${row.direction === 'income' ? 'Registrar cobro' : 'Registrar pago'} de operación #${row.id}`}
                        disabled={busy}
                        onClick={() => {
                          setError('');
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
                          setError('');
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
                  </DataCardActions>
                </DataCard>
              ))}
            </DataCardList>
          ) : !loading && !error ? (
            <div className="mt-3">
              <DataState
                variant="empty"
                title="Sin operaciones financieras en este rango"
                description="No se encontraron movimientos contables para los filtros seleccionados."
                icon={<IconCoins size={28} className="text-muted" />}
                action={canWrite && (
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
              />
            </div>
          ) : null}
        </SectionCard>
      )}

      {detailTarget && (
        <ModalDialog labelledBy="finance-detail-title" onDismiss={() => setDetailTarget(null)}>
          <h2 id="finance-detail-title" className="text-lg font-bold mb-3">Operación #{detailTarget.id}</h2>
          <p className="data-card-note mb-3">{detailTarget.concept}</p>
          <dl className="detail-grid">
            <div className="detail-item"><dt>Tipo</dt><dd>{detailTarget.direction === 'income' ? 'Ingreso' : 'Egreso'}</dd></div>
            <div className="detail-item"><dt>Estado</dt><dd>{detailTarget.reversedAt ? 'Anulada' : detailTarget.reversalOfId ? 'Reversión' : 'Vigente'}</dd></div>
            <div className="detail-item"><dt>Categoría</dt><dd>{detailTarget.category}</dd></div>
            <div className="detail-item"><dt>Fecha</dt><dd>{detailTarget.operationDate}</dd></div>
            <div className="detail-item"><dt>Galpón</dt><dd>{detailTarget.barnName}</dd></div>
            <div className="detail-item"><dt>Importe de esta asignación · {detailTarget.currencyCode}</dt><dd>{money(detailTarget.amountMinor, detailTarget.currencyCode)}</dd></div>
            <div className="detail-item"><dt>Contraparte</dt><dd>{detailTarget.counterparty ?? 'Sin registrar'}</dd></div>
            <div className="detail-item"><dt>Referencia</dt><dd>{detailTarget.reference ?? 'Sin registrar'}</dd></div>
            <div className="detail-item"><dt>Animal</dt><dd>{detailTarget.animalCode ?? 'Sin asignar'}</dd></div>
            <div className="detail-item"><dt>Lote</dt><dd>{detailTarget.lotCode ?? 'Sin asignar'}</dd></div>
            <div className="detail-item"><dt>Insumo</dt><dd>{detailTarget.supplyCode ?? 'Sin asignar'}</dd></div>
            <div className="detail-item"><dt>Cantidad</dt><dd>{detailTarget.quantity ?? 'Sin registrar'}</dd></div>
            <div className="detail-item"><dt>Responsable</dt><dd>{detailTarget.responsibleName}</dd></div>
          </dl>
          <div className="form-actions mt-3"><button type="button" className="btn btn-outline" onClick={() => setDetailTarget(null)}><IconX size={14} /><span>Cerrar</span></button></div>
        </ModalDialog>
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
            Se creará un contra-asiento compensatorio auditable que anula la operación <strong>#{reversalTarget.id}</strong> ({reversalTarget.direction === 'income' ? 'Ingreso' : 'Egreso'} · {reversalTarget.category} · {money(reversalTarget.entryTotalMinor ?? reversalTarget.amountMinor, reversalTarget.currencyCode)}).
          </p>
          <p className="note-box mb-3">La reversión afecta a todas las asignaciones de la operación. No elimina su historial ni devuelve automáticamente los cobros o pagos ya registrados.</p>
          {error && <InlineAlert tone="error" onDismiss={() => setError('')}>{error}</InlineAlert>}
          <form
            onSubmit={e => {
              e.preventDefault();
              void confirmReverse();
            }}
          >
            <FormField label="Motivo de anulación:" htmlFor="fin-reversal-reason" className="mb-4" labelClassName="text-sm">
              <input
                id="fin-reversal-reason"
                className="form-input"
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="ej. Error en importe / operación duplicada"
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
        <SectionCard
          title="Flujo de caja"
          subtitle="Movimientos efectivos por fecha de cobro o pago, incluidos cobros de operaciones anuladas y devoluciones efectivamente pagadas."
          actions={
            <>
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
            </>
          }
        >

          {isAdmin && (
            <form className="form-grid mb-4" onSubmit={saveOpening}>
              <FormField label="Fecha de apertura">
                <input required type="date" max={farmToday()} className="form-input tabular-nums" value={openingForm.date} onChange={e => setOpeningForm({ ...openingForm, date: e.target.value })} />
              </FormField>
              <FormField label="Moneda">
                <select className="form-select" value={openingForm.currencyCode} onChange={e => setOpeningForm({ ...openingForm, currencyCode: e.target.value })}>
                  <option value="PEN">PEN · Sol peruano (S/)</option>
                  <option value="USD">USD · Dólar estadounidense ($)</option>
                  <option value="EUR">EUR · Euro (€)</option>
                </select>
              </FormField>
              <FormField label="Monto inicial en caja">
                <input required inputMode="decimal" placeholder="0.00" className="form-input font-numeric tabular-nums font-bold" value={openingForm.amount} onChange={e => setOpeningForm({ ...openingForm, amount: e.target.value })} />
              </FormField>
              <FormField label="Motivo para auditoría">
                <input required minLength={5} placeholder="ej. Apertura de caja chica de granja" className="form-input" value={openingForm.reason} onChange={e => setOpeningForm({ ...openingForm, reason: e.target.value })} />
              </FormField>
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

          <DataCardList label="Saldos por moneda" grid className="mb-3">
            {cashBalances.map(item => (
              <DataCard key={`saldo-${item.currencyCode}`}>
                <DataCardHead
                  title={`Caja · ${item.currencyCode}`}
                  badge={<StatusBadge>{item.openingBalanceIsCalculated ? 'Derivado' : 'Registrado'}</StatusBadge>}
                />
                <DataCardMeta items={[
                  { label: filter.direction || filter.category ? 'Balance inicial filtrado' : 'Saldo inicial', value: money(item.openingMinor, item.currencyCode), className: 'font-mono tabular-nums' },
                  { label: 'Entradas', value: money(item.receiptsMinor, item.currencyCode), className: 'font-mono tabular-nums text-success' },
                  { label: 'Salidas', value: money(item.paymentsMinor, item.currencyCode), className: 'font-mono tabular-nums text-danger' },
                ]} />
                <DataCardNote>Saldo final <strong className="font-mono tabular-nums">{money(item.closingMinor, item.currencyCode)}</strong></DataCardNote>
              </DataCard>
            ))}
            {cashTotals.map(item => (
              <li key={`cash-${item.direction}-${item.currencyCode}`}>
                <KpiCard
                  label={`${item.direction === 'income' ? 'Cobros del periodo' : 'Pagos del periodo'} · ${item.currencyCode}`}
                  value={
                    <span className={item.direction === 'income' ? 'text-success' : 'text-danger'}>
                      {money(item.amountMinor, item.currencyCode)}
                    </span>
                  }
                />
              </li>
            ))}
          </DataCardList>

          {cashRows.length > 0 ? (
            <DataCardList label="Movimientos efectivos de caja">
              {cashRows.map((row, index) => (
                <DataCard key={`${row.id}-${index}`}>
                  <DataCardHead
                    title={row.category}
                    subtitle={`${row.settlementDate} · Operación #${row.financialEntryId} · ${row.barnName}`}
                    badge={
                      <StatusBadge tone={row.direction === 'income' ? 'success' : 'warning'}>
                        {row.direction === 'income' ? 'Cobro' : 'Pago'}
                      </StatusBadge>
                    }
                  />
                  <DataCardNote>{row.concept}</DataCardNote>
                  <DataCardMeta items={[
                    { label: `Importe efectivo · ${row.currencyCode}`, value: money(row.amountMinor, row.currencyCode), className: 'font-mono tabular-nums' },
                    { label: 'Medio de pago', value: row.paymentMethod, className: 'capitalize' },
                    { label: 'Contraparte', value: row.counterparty ?? 'Sin registrar' },
                    { label: 'Registrado por', value: row.responsibleName },
                  ]} />
                </DataCard>
              ))}
            </DataCardList>
          ) : !loading && !error ? (
            <div className="mt-3">
              <DataState
                variant="empty"
                title="Sin movimientos de caja en este periodo"
                description="No se han registrado cobros ni pagos efectivos en el rango seleccionado."
                icon={<IconBuilding size={28} className="text-muted" />}
                action={
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
                }
              />
            </div>
          ) : null}
        </SectionCard>
      )}
    </main>
  );
}

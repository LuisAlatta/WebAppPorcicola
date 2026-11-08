import React, { useCallback, useEffect, useState } from 'react';
import { IconCalendar, IconCheck, IconPig, IconPlus, IconRefreshCw } from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import type { Perfil } from '../types';

interface AnimalOption { code: string; alias: string | null; barnName: string; breed: string | null }
interface Service { id: number; serviceNumber: number; serviceDate: string; serviceType: string; sireCode: string | null; sireBreed: string | null; materialSource: string; externalSource: string | null; observations: string | null }
interface ReproductionEvent { id: number; eventType: string; eventDate: string; physiologicalStatus: string | null; reason: string | null; observations: string | null }
interface Cycle { id: string; femaleCode: string; femaleAlias: string | null; cycleNumber: number; cycleStatus: string; reproductiveStatus: string;
  serviceAnchorDate: string | null; gestationDays: number; probableFarrowingDate: string; dueDateSource: string; dueDateReason: string | null;
  daysRemaining: number; dueLabel: string; barnId: number; barnName: string; locationCode: string | null; lotCode: string | null; femaleBreed: string | null; aptitude: string | null;
  lastFarrowingDate: string | null; observations: string | null; antecedent: boolean; services: Service[]; events: ReproductionEvent[] }
interface FormState { femaleCode: string; serviceDate: string; serviceType: string; sireCode: string; sireBreed: string; materialSource: 'internal' | 'external'; externalSource: string;
  dueDate: string; dueDateReason: string; lastFarrowingDate: string; aptitude: string; observations: string }

const initialForm = (): FormState => ({ femaleCode: '', serviceDate: farmToday(), serviceType: 'inseminacion_artificial', sireCode: '', sireBreed: '',
  materialSource: 'internal', externalSource: '', dueDate: '', dueDateReason: '', lastFarrowingDate: '', aptitude: '', observations: '' });
const serviceLabels: Record<string, string> = { monta_natural: 'Monta natural', inseminacion_artificial: 'Inseminación artificial', transferencia_embriones: 'Transferencia de embriones' };
const statusLabels: Record<string, string> = { empty: 'Vacía', possible_pregnancy: 'Posible preñez', gestation: 'Gestación', abortion: 'Aborto' };

export function ModuloReproduccion({ perfil }: { perfil: Perfil }) {
  const soloLectura = perfil === 'operario';
  const [females, setFemales] = useState<AnimalOption[]>([]);
  const [sires, setSires] = useState<AnimalOption[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isAntecedent, setIsAntecedent] = useState(false);
  const [operationKey, setOperationKey] = useState(() => newOperationKey('rep-ciclo'));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [repeatCycle, setRepeatCycle] = useState<string | null>(null);
  const [manualCycle, setManualCycle] = useState<string | null>(null);
  const [repeatKeys, setRepeatKeys] = useState<Record<string, string>>({});
  const [eventKeys, setEventKeys] = useState<Record<string, string>>({});
  const [manualKeys, setManualKeys] = useState<Record<string, string>>({});
  const [closureForm, setClosureForm] = useState<{ cycleId: string; eventType: 'abortion' | 'closed'; reason: string } | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams(); if (from) params.set('from', from); if (to) params.set('to', to); if (status !== 'all') params.set('status', status);
    const [cycleRes, femaleRes, sireRes] = await Promise.all([
      fetch(`/api/reproduction/cycles?${params.toString()}`), fetch('/api/animals?sex=hembra&status=activo&limit=500'), fetch('/api/animals?type=verraco&status=activo&limit=500'),
    ]);
    const cycleBody = await cycleRes.json() as { error?: string; cycles?: Cycle[] };
    const femaleBody = await femaleRes.json() as { animals?: AnimalOption[] };
    const sireBody = await sireRes.json() as { animals?: AnimalOption[] };
    if (!cycleRes.ok) throw new Error(cycleBody.error ?? 'No se pudieron cargar los ciclos.');
    return { cycles: cycleBody.cycles ?? [], females: femaleBody.animals ?? [], sires: sireBody.animals ?? [] };
  }, [from, to, status]);

  const load = useCallback(async () => {
    const data = await fetchData();
    setCycles(data.cycles); setFemales(data.females); setSires(data.sires);
  }, [fetchData]);

  useEffect(() => {
    let active = true;
    void fetchData().then((data) => {
      if (!active) return;
      setCycles(data.cycles); setFemales(data.females); setSires(data.sires);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Error cargando reproducción.');
    });
    return () => { active = false; };
  }, [fetchData]);

  const submitCycle = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setNotice(null); setBusy(true);
    try {
      const path = isAntecedent ? '/api/reproduction/antecedents' : '/api/reproduction/cycles';
      const payload = { ...form, serviceDate: form.serviceDate, dueDate: form.dueDate || undefined, lastFarrowingDate: form.lastFarrowingDate || undefined,
        operationKey, ...(isAntecedent ? { gestationDays: undefined } : {}) };
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) { setError(body.error ?? 'No se pudo guardar el ciclo.'); return; }
      setNotice(body.replayed ? 'Operación ya registrada; se recuperó el ciclo guardado.' : isAntecedent ? 'Antecedente gestante registrado sin crear servicios ficticios.' : 'Ciclo reproductivo abierto.');
      setForm(initialForm()); setOperationKey(newOperationKey('rep-ciclo')); await load();
    } catch { setError('No se pudo confirmar el registro. Puede reintentar con el mismo formulario.'); }
    finally { setBusy(false); }
  };

  const recordEvent = async (cycle: Cycle, eventType: string, physiologicalStatus?: string, suppliedReason = '') => {
    const eventDate = farmToday();
    const reason = suppliedReason.trim();
    if ((eventType === 'abortion' || eventType === 'closed') && !reason) return;
    const keyId = `${cycle.id}:${eventType}:${eventDate}`;
    const operationKey = eventKeys[keyId] ?? newOperationKey('rep-event');
    setEventKeys((previous) => ({ ...previous, [keyId]: operationKey }));
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, eventDate, physiologicalStatus, reason, operationKey }) });
      const body = await res.json() as { error?: string };
      if (!res.ok) { setError(body.error ?? 'No se pudo registrar el evento.'); return; }
      setEventKeys((previous) => ({ ...previous, [keyId]: newOperationKey('rep-event') }));
      if (eventType === 'abortion' || eventType === 'closed') setClosureForm(null);
      setNotice(eventType === 'abortion' ? 'Aborto registrado; el ciclo se retiró de pendientes.' : 'Evento reproductivo registrado.'); await load();
    } catch { setError('No se pudo confirmar el evento.'); }
    finally { setBusy(false); }
  };

  const addRepeatService = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const operationKey = repeatKeys[cycle.id] ?? newOperationKey('rep-servicio');
    setRepeatKeys((previous) => ({ ...previous, [cycle.id]: operationKey }));
    try {
      const payload = { serviceDate: data.get('serviceDate'), serviceType: data.get('serviceType'), materialSource: data.get('materialSource'),
        sireCode: data.get('sireCode'), externalSource: data.get('externalSource'), observations: data.get('observations'), operationKey };
      const res = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json() as { error?: string };
      if (!res.ok) { setError(body.error ?? 'No se pudo agregar el servicio.'); return; }
      setRepeatKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-servicio') }));
      setRepeatCycle(null); setNotice('Nuevo servicio agregado al mismo ciclo; el anterior permanece en el historial.'); await load();
    } catch { setError('No se pudo confirmar el nuevo servicio.'); }
    finally { setBusy(false); }
  };

  const saveManualDue = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const operationKey = manualKeys[cycle.id] ?? newOperationKey('rep-fecha');
    setManualKeys((previous) => ({ ...previous, [cycle.id]: operationKey }));
    try {
      const res = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: data.get('dueDate'), dueDateReason: data.get('dueDateReason'), observations: cycle.observations, operationKey }) });
      const body = await res.json() as { error?: string };
      if (!res.ok) { setError(body.error ?? 'No se pudo cambiar la fecha probable.'); return; }
      setManualKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-fecha') }));
      setManualCycle(null); setNotice('Fecha manual guardada con su motivo y vigencia.'); await load();
    } catch { setError('No se pudo confirmar el cambio.'); }
    finally { setBusy(false); }
  };

  return <section className="reproduction-page">
    <header className="reproduction-header"><div><h1 className="font-bold text-xl inline-flex items-center gap-2"><IconPig size={22} />Reproducción</h1>
      <p className="text-sm text-muted">Ciclos, servicios, palpaciones y fechas probables. El cálculo usa la duración vigente de la etapa Gestación.</p></div>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}><IconRefreshCw size={14} /> Actualizar</button></header>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!soloLectura && <div className="card mb-4"><div className="card-header-clean mb-3"><span className="section-title">{isAntecedent ? 'Ingreso gestante / antecedente' : 'Registrar servicio'}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setIsAntecedent(!isAntecedent); setForm(initialForm()); }}><IconPlus size={14} />{isAntecedent ? 'Registrar servicio' : 'Registrar antecedente'}</button></div>
      <form onSubmit={submitCycle} className="form-stack"><div className="grid-3">
        <div className="form-group"><label className="form-label">Hembra</label><select className="form-select" required value={form.femaleCode} onChange={(e) => setForm((prev) => ({ ...prev, femaleCode: e.target.value }))}><option value="">Seleccione</option>{females.map((animal) => <option key={animal.code} value={animal.code}>{animal.code}{animal.alias ? ` · ${animal.alias}` : ''} · {animal.barnName}</option>)}</select></div>
        <div className="form-group"><label className="form-label">{isAntecedent ? 'Fecha de ingreso/antecedente' : 'Fecha del servicio'}</label><input type="date" className="form-input" required max={farmToday()} value={form.serviceDate} onChange={(e) => setForm((prev) => ({ ...prev, serviceDate: e.target.value }))} /></div>
        {!isAntecedent && <div className="form-group"><label className="form-label">Tipo de servicio</label><select className="form-select" value={form.serviceType} onChange={(e) => setForm((prev) => ({ ...prev, serviceType: e.target.value }))}>{Object.entries(serviceLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>}
      </div>
      {!isAntecedent && <div className="grid-3"><div className="form-group"><label className="form-label">Origen del material</label><select className="form-select" value={form.materialSource} onChange={(e) => setForm((prev) => ({ ...prev, materialSource: e.target.value as FormState['materialSource'] }))}><option value="internal">Verraco de la granja</option><option value="external">Material externo</option></select></div>
        {form.materialSource === 'internal' ? <div className="form-group"><label className="form-label">Verraco</label><select className="form-select" required value={form.sireCode} onChange={(e) => setForm((prev) => ({ ...prev, sireCode: e.target.value }))}><option value="">Seleccione</option>{sires.map((animal) => <option key={animal.code} value={animal.code}>{animal.code}{animal.alias ? ` · ${animal.alias}` : ''}</option>)}</select></div> : <div className="form-group"><label className="form-label">Procedencia externa</label><input className="form-input" required value={form.externalSource} onChange={(e) => setForm((prev) => ({ ...prev, externalSource: e.target.value }))} maxLength={160} /></div>}
        <div className="form-group"><label className="form-label">Raza del padre/material</label><input className="form-input" value={form.sireBreed} onChange={(e) => setForm((prev) => ({ ...prev, sireBreed: e.target.value }))} maxLength={80} /></div></div>}
      <div className="grid-3"><div className="form-group"><label className="form-label">{isAntecedent ? 'Fecha probable de parto' : 'Fecha probable manual (opcional)'}</label><input type="date" className="form-input" required={isAntecedent} value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} /></div>
        {form.dueDate && <div className="form-group"><label className="form-label">Motivo de fecha manual</label><input className="form-input" required value={form.dueDateReason} onChange={(e) => setForm((prev) => ({ ...prev, dueDateReason: e.target.value }))} maxLength={300} /></div>}
        <div className="form-group"><label className="form-label">Último parto conocido</label><input type="date" className="form-input" value={form.lastFarrowingDate} onChange={(e) => setForm((prev) => ({ ...prev, lastFarrowingDate: e.target.value }))} /></div></div>
      <div className="form-group"><label className="form-label">Observaciones / antecedentes</label><textarea className="form-input" rows={2} value={form.observations} onChange={(e) => setForm((prev) => ({ ...prev, observations: e.target.value }))} maxLength={1000} /></div>
      <button type="submit" className="btn btn-primary" disabled={busy}><IconCheck size={16} />{isAntecedent ? 'Guardar antecedente' : 'Abrir ciclo y registrar servicio'}</button></form>
    </div>}
    <div className="card"><div className="card-header-clean mb-3"><span className="section-title">Ciclos reproductivos</span><span className="text-xs text-muted">Rango inclusivo por fecha del último servicio (antecedente: fecha probable)</span></div>
      <div className="grid-3 mb-3"><div className="form-group"><label className="form-label">Desde</label><input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div className="form-group"><label className="form-label">Hasta</label><input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} /></div><div className="form-group"><label className="form-label">Estado</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="pending">Pendientes</option><option value="all">Todos</option><option value="aborted">Abortados</option><option value="farrowed">Paridos</option><option value="closed">Cerrados</option></select></div></div>
      {!cycles.length ? <p className="text-sm text-muted">No hay ciclos en este rango.</p> : cycles.map((cycle) => <article className="reproduction-cycle" key={cycle.id}>
        <div className="flex flex-wrap justify-between gap-2"><div><strong>{cycle.femaleCode}{cycle.femaleAlias ? ` · ${cycle.femaleAlias}` : ''}</strong><div className="text-sm text-muted">Ciclo #{cycle.cycleNumber} · {cycle.barnName} · {cycle.locationCode ?? 'Ubicación sin asignar'} · {cycle.lotCode ?? 'Sin lote'} · {cycle.femaleBreed ?? 'Raza sin registrar'}{cycle.aptitude ? ` · ${cycle.aptitude}` : ''}</div></div>
          <div className="reproduction-due"><strong>{cycle.dueLabel}</strong><div className="text-sm">Probable: {cycle.probableFarrowingDate} · {cycle.daysRemaining} días · {cycle.dueDateSource === 'manual' ? 'manual' : `${cycle.gestationDays} días configurados`}</div>{cycle.dueDateReason && <div className="text-xs text-muted">{cycle.dueDateReason}</div>}</div></div>
        <div className="mt-2 text-sm">Estado: {statusLabels[cycle.reproductiveStatus] ?? cycle.reproductiveStatus} · {cycle.antecedent ? 'Antecedente (sin servicios inventados)' : `${cycle.services.length} servicio(s)`}{cycle.lastFarrowingDate ? ` · Último parto ${cycle.lastFarrowingDate}` : ''}</div>
        {cycle.services.map((service) => <div key={service.id} className="text-xs text-muted mt-1">{service.serviceDate} · #{service.serviceNumber} {serviceLabels[service.serviceType] ?? service.serviceType} · Padre/material {service.sireCode ?? service.externalSource ?? '—'}{service.sireBreed ? ` (${service.sireBreed})` : ''}</div>)}
        {cycle.events.map((entry) => <div key={entry.id} className="text-xs text-muted mt-1">{entry.eventDate} · {entry.eventType}{entry.physiologicalStatus ? ` · ${statusLabels[entry.physiologicalStatus] ?? entry.physiologicalStatus}` : ''}{entry.reason ? ` · ${entry.reason}` : ''}</div>)}
        {cycle.observations && <p className="text-sm mt-2">{cycle.observations}</p>}
        {!soloLectura && cycle.cycleStatus === 'open' && <div className="form-actions mt-3 flex-wrap">
          <label className="text-xs">Palpación <select className="form-select form-select-sm inline-block ml-1" defaultValue="" onChange={(e) => { if (e.target.value) void recordEvent(cycle, 'palpation', e.target.value); e.currentTarget.value = ''; }}><option value="">Registrar estado</option>{Object.entries(statusLabels).filter(([key]) => key !== 'abortion').map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void recordEvent(cycle, 'pregnancy_confirmed', 'gestation')}>Confirmar gestación</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setRepeatCycle(repeatCycle === cycle.id ? null : cycle.id)}>Agregar repetición/servicio</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setManualCycle(manualCycle === cycle.id ? null : cycle.id)}><IconCalendar size={14} /> Fecha probable manual</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setClosureForm({ cycleId: cycle.id, eventType: 'abortion', reason: '' })}>Registrar aborto</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setClosureForm({ cycleId: cycle.id, eventType: 'closed', reason: '' })}>Cerrar ciclo</button>
        </div>}
        {closureForm?.cycleId === cycle.id && <form className="form-stack mt-3" onSubmit={(event) => { event.preventDefault(); void recordEvent(cycle, closureForm.eventType, undefined, closureForm.reason); }}><div className="form-group"><label className="form-label">{closureForm.eventType === 'abortion' ? 'Motivo del aborto' : 'Motivo del cierre'}</label><input className="form-input" required minLength={5} maxLength={300} value={closureForm.reason} onChange={(event) => setClosureForm((previous) => previous ? { ...previous, reason: event.target.value } : previous)} /></div><div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{closureForm.eventType === 'abortion' ? 'Guardar aborto y cerrar ciclo' : 'Guardar cierre'}</button><button type="button" className="btn btn-outline btn-sm" onClick={() => setClosureForm(null)}>Cancelar</button></div></form>}
        {repeatCycle === cycle.id && <form className="form-stack mt-3" onSubmit={(e) => void addRepeatService(e, cycle)}><div className="grid-3"><div className="form-group"><label className="form-label">Fecha</label><input name="serviceDate" type="date" className="form-input" min={cycle.serviceAnchorDate ?? undefined} max={farmToday()} required /></div><div className="form-group"><label className="form-label">Tipo</label><select name="serviceType" className="form-select"><option value="inseminacion_artificial">Inseminación artificial</option><option value="monta_natural">Monta natural</option><option value="transferencia_embriones">Transferencia de embriones</option></select></div><div className="form-group"><label className="form-label">Origen</label><select name="materialSource" className="form-select"><option value="internal">Verraco interno</option><option value="external">Material externo</option></select></div></div><div className="grid-3"><div className="form-group"><label className="form-label">Código del verraco</label><select name="sireCode" className="form-select"><option value="">Seleccione si aplica</option>{sires.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></div><div className="form-group"><label className="form-label">Material externo</label><input name="externalSource" className="form-input" /></div><div className="form-group"><label className="form-label">Observaciones</label><input name="observations" className="form-input" /></div></div><button className="btn btn-primary btn-sm" disabled={busy}>Guardar nuevo servicio</button></form>}
        {manualCycle === cycle.id && <form className="form-stack mt-3" onSubmit={(e) => void saveManualDue(e, cycle)}><div className="form-grid"><div className="form-group"><label className="form-label">Fecha probable</label><input name="dueDate" type="date" min={cycle.serviceAnchorDate ?? undefined} className="form-input" defaultValue={cycle.probableFarrowingDate} required /></div><div className="form-group"><label className="form-label">Motivo</label><input name="dueDateReason" className="form-input" required minLength={5} /></div></div><button className="btn btn-primary btn-sm" disabled={busy}>Guardar fecha manual</button></form>}
      </article>)}
    </div>
  </section>;
}

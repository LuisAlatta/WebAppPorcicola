import React, { useCallback, useEffect, useState } from 'react';
import { IconCalendar, IconCheck, IconHeart, IconPlus, IconRefreshCw } from './icons';
import { farmToday, fetchOperation, newOperationKey } from '../utils/operations';
import type { Perfil } from '../types';

interface AnimalOption { code: string; alias: string | null; barnName: string; breed: string | null }
interface Service { id: number; serviceNumber: number; serviceDate: string; serviceType: string; sireCode: string | null; sireBreed: string | null; materialSource: string; externalSource: string | null; observations: string | null }
interface ReproductionEvent { id: number; eventType: string; eventDate: string; physiologicalStatus: string | null; reason: string | null; observations: string | null }
interface WeaningPlan { referenceWeaningDate: string; heatIntervalDays: number; firstRepeatIntervalDays: number; secondRepeatIntervalDays: number;
  expectedHeatDate: string; expectedFirstRepeatDate: string; expectedSecondRepeatDate: string; actualHeatDate: string | null; actualFirstRepeatDate: string | null; actualSecondRepeatDate: string | null }
type BirthCountKey='maleAlive'|'femaleAlive'|'unsexedAlive'|'maleStillborn'|'femaleStillborn'|'unsexedStillborn';
const birthCountFields:{key:BirthCountKey;label:string}[]=[{key:'maleAlive',label:'Machos vivos al nacer'},{key:'femaleAlive',label:'Hembras vivas al nacer'},{key:'unsexedAlive',label:'Sin sexar vivos al nacer'},{key:'maleStillborn',label:'Machos nacidos muertos'},{key:'femaleStillborn',label:'Hembras nacidas muertas'},{key:'unsexedStillborn',label:'Sin sexar nacidos muertos'}];
interface Litter { id: string; farrowingDate?: string; liveCount: number; maleAlive: number; femaleAlive: number; unsexedAlive: number; stillbornCount: number; averageWeightKg: number | null; expectedWeaningDate: string | null; actualWeaningDate: string | null; identifiedAnimals?: {code:string;sex:string}[];historicalOnly?:boolean;birthCounts?:Record<BirthCountKey,number> }
interface Cycle { id: string; femaleCode: string; femaleAlias: string | null; cycleNumber: number; cycleStatus: string; reproductiveStatus: string;
  serviceAnchorDate: string | null; gestationDays: number; probableFarrowingDate: string; dueDateSource: string; dueDateReason: string | null;
  daysRemaining: number; dueLabel: string; barnId: number; barnName: string; locationCode: string | null; lotCode: string | null; femaleBreed: string | null; aptitude: string | null;
  lastFarrowingDate: string | null; previousWeaningDate?: string | null; previousWeaningPending?: boolean; observations: string | null; antecedent: boolean; services: Service[]; events: ReproductionEvent[]; litter: Litter | null; weaningPlan: WeaningPlan | null }
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
  const [farrowingCycle, setFarrowingCycle] = useState<string | null>(null);
  const [farrowingKeys, setFarrowingKeys] = useState<Record<string, string>>({});
  const [postweaningCycle, setPostweaningCycle] = useState<string | null>(null);
  const [postweaningKeys, setPostweaningKeys] = useState<Record<string,string>>({});
  const [litterEventCycle, setLitterEventCycle] = useState<string | null>(null);
  const [litterEventKeys, setLitterEventKeys] = useState<Record<string,string>>({});
  const [dateCorrection, setDateCorrection] = useState<{cycleId:string;litterId:string;expectedCurrentDate:string;farrowingDate:string;reason:string;operationKey:string}|null>(null);
  const [countCorrection,setCountCorrection]=useState<{cycleId:string;litterId:string;expectedCounts:number[];values:Record<BirthCountKey,string>;reason:string;operationKey:string}|null>(null);

  const openCountCorrection=(cycle:Cycle)=>{
    if(!cycle.litter?.birthCounts)return;
    const counts=cycle.litter.birthCounts;
    setError(null);setNotice(null);
    setCountCorrection({cycleId:cycle.id,litterId:cycle.litter.id,expectedCounts:birthCountFields.map(field=>counts[field.key]),values:Object.fromEntries(birthCountFields.map(field=>[field.key,String(counts[field.key])])) as Record<BirthCountKey,string>,reason:'',operationKey:newOperationKey('camada-cantidades')});
  };

  const openDateCorrection = (cycle:Cycle) => {
    const currentDate=cycle.litter?.farrowingDate??cycle.lastFarrowingDate;
    if(!cycle.litter||!currentDate)return;
    setError(null);setNotice(null);
    setDateCorrection({cycleId:cycle.id,litterId:cycle.litter.id,expectedCurrentDate:currentDate,farrowingDate:currentDate,reason:'',operationKey:newOperationKey('camada-fecha')});
  };

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

  const saveFarrowing = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const operationKey = farrowingKeys[cycle.id] ?? newOperationKey('rep-parto');
    setFarrowingKeys((previous) => ({ ...previous, [cycle.id]: operationKey }));
    try {
      const response = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/farrowing`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farrowingDate: data.get('farrowingDate'), parityNumber: data.get('parityNumber') || undefined,
          maleAlive: data.get('maleAlive'), femaleAlive: data.get('femaleAlive'), unsexedAlive: data.get('unsexedAlive'),
          maleStillborn: data.get('maleStillborn'), femaleStillborn: data.get('femaleStillborn'), unsexedStillborn: data.get('unsexedStillborn'),
          averageWeightKg: data.get('averageWeightKg') || undefined, observations: data.get('observations'), reason: data.get('reason'), operationKey }) });
      const body = await response.json() as { error?: string; liveCount?: number; expectedWeaningDate?: string; historicalOnly?: boolean };
      if (!response.ok) { setError(body.error ?? 'No se pudo registrar el parto.'); return; }
      setFarrowingKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-parto') }));
      setFarrowingCycle(null); setNotice(`${body.liveCount ?? 0} nacidos vivos registrados${body.historicalOnly ? ' como antecedente histórico' : ' en inventario'}${body.expectedWeaningDate ? ` · destete previsto ${body.expectedWeaningDate}` : ''}.`); await load();
    } catch { setError('No se pudo confirmar el parto. Reintente con la misma operación.'); }
    finally { setBusy(false); }
  };

  const savePostweaningPlan = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const operationKey = postweaningKeys[cycle.id] ?? newOperationKey('rep-postdestete');
    setPostweaningKeys((previous) => ({ ...previous, [cycle.id]: operationKey }));
    try {
      const response = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/postweaning`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceWeaningDate:data.get('referenceWeaningDate'), heatIntervalDays:data.get('heatIntervalDays'), firstRepeatIntervalDays:data.get('firstRepeatIntervalDays'),
          secondRepeatIntervalDays:data.get('secondRepeatIntervalDays'), actualHeatDate:data.get('actualHeatDate') || undefined, actualFirstRepeatDate:data.get('actualFirstRepeatDate') || undefined,
          actualSecondRepeatDate:data.get('actualSecondRepeatDate') || undefined, reason:'Plan postdestete confirmado', operationKey }) });
      const body = await response.json() as { error?:string };
      if (!response.ok) { setError(body.error ?? 'No se pudo guardar el plan de celo.'); return; }
      setPostweaningKeys((previous)=>({...previous,[cycle.id]:newOperationKey('rep-postdestete')})); setPostweaningCycle(null);
      setNotice('Intervalos y fechas de celo/repetición guardados en este ciclo.'); await load();
    } catch { setError('No se pudo confirmar el plan postdestete.'); }
    finally { setBusy(false); }
  };

  const saveLitterEvent = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const eventType = String(data.get('eventType'));
    const keyId = `${cycle.litter?.id}:${eventType}`;
    const operationKey = litterEventKeys[keyId] ?? newOperationKey('camada-evento');
    setLitterEventKeys((previous)=>({...previous,[keyId]:operationKey}));
    try {
      const response = await fetch(`/api/reproduction/litters/${encodeURIComponent(cycle.litter!.id)}/events`, { method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventType,effectiveDate:data.get('effectiveDate'),sex:data.get('sex'),quantity:data.get('quantity'),destinationLitterId:data.get('destinationLitterId') || undefined,
          destinationStageCode:data.get('destinationStageCode') || undefined,destinationBarnId:data.get('destinationBarnId') || undefined,weightKg:data.get('weightKg') || undefined,animalCodes:data.getAll('animalCodes'),
          cause:data.get('cause') || undefined,reason:data.get('reason'),operationKey}) });
      const body=await response.json() as {error?:string};
      if(!response.ok){setError(body.error??'No se pudo guardar el evento de camada.');return;}
      setLitterEventKeys((previous)=>({...previous,[keyId]:newOperationKey('camada-evento')})); setLitterEventCycle(null);
      setNotice(eventType==='weaning'?'Destete parcial registrado sin aumentar el total de cabezas.':eventType==='death'?'Baja durante lactancia registrada.':'Adopción registrada entre camadas.'); await load();
    } catch {setError('No se pudo confirmar el evento de camada.');}
    finally {setBusy(false);}
  };

  const saveLitterDate = async (event:React.FormEvent) => {
    event.preventDefault();if(!dateCorrection||soloLectura)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const {litterId,farrowingDate,expectedCurrentDate,reason,operationKey}=dateCorrection;
      const response=await fetchOperation(`/api/reproduction/litters/${encodeURIComponent(litterId)}/date-correction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({farrowingDate,expectedCurrentDate,reason,operationKey})});
      const body=await response.json() as {error?:string;replayed?:boolean};
      if(!response.ok){setError(body.error??'No se pudo corregir la fecha real del parto.');return;}
      setDateCorrection(null);setNotice(body.replayed?'La corrección ya estaba registrada; se recuperó el resultado.':'Fecha real del parto corregida. Se actualizaron las vacunas pendientes vinculadas; las aplicaciones permanecen en el historial.');
      try{await load();}catch{setError('La corrección fue guardada, pero no se pudo actualizar la lista. Pulse Actualizar para consultar el resultado.');}
    }catch(err){setError(err instanceof Error?err.message:'No se pudo confirmar la corrección. Conserve el formulario y reintente.');}
    finally{setBusy(false);}
  };

  const saveLitterCounts=async(event:React.FormEvent)=>{
    event.preventDefault();if(!countCorrection||soloLectura)return;setBusy(true);setError(null);setNotice(null);
    try{
      const values=Object.fromEntries(birthCountFields.map(field=>[field.key,Number(countCorrection.values[field.key])]));
      const response=await fetchOperation(`/api/reproduction/litters/${encodeURIComponent(countCorrection.litterId)}/correction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,expectedCounts:countCorrection.expectedCounts,reason:countCorrection.reason,operationKey:countCorrection.operationKey})});
      const body=await response.json() as {error?:string;replayed?:boolean};if(!response.ok){setError(body.error??'No se pudieron corregir las cantidades.');return;}
      setCountCorrection(null);setNotice(body.replayed?'La corrección de cantidades ya estaba registrada.':'Las cantidades de nacimiento corregidas quedaron guardadas.');
      try{await load();}catch{setError('La corrección fue guardada, pero no se pudo actualizar la lista. Pulse Actualizar.');}
    }catch(err){setError(err instanceof Error?err.message:'No se pudo confirmar la corrección. Conserve el formulario y reintente.');}finally{setBusy(false);}
  };

  return <section className="reproduction-page">
    <div className="module-heading">
      <div>
        <div className="eyebrow">Gestión reproductiva</div>
        <h1 className="title-module">
          <IconHeart size={22} className="text-primary" />
          <span>Reproducción</span>
        </h1>
        <p className="text-xs text-muted mt-1">
          Ciclos reproductivos, servicios, palpaciones y fechas probables de parto.
        </p>
      </div>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
        <span className="inline-flex items-center justify-center gap-2 leading-none">
          <IconRefreshCw size={14} />
          <span>Actualizar</span>
        </span>
      </button>
    </div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!soloLectura && <div className="card mb-4"><div className="card-header-clean mb-3"><span className="section-title">{isAntecedent ? 'Ingreso gestante / antecedente' : 'Registrar servicio'}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setIsAntecedent(!isAntecedent); setForm(initialForm()); }}>
        <span className="inline-flex items-center justify-center gap-2 leading-none">
          <IconPlus size={14} />
          <span>{isAntecedent ? 'Registrar servicio' : 'Registrar antecedente'}</span>
        </span>
      </button></div>
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
      <button type="submit" className="btn btn-primary" disabled={busy}>
        <span className="inline-flex items-center justify-center gap-2 leading-none">
          <IconCheck size={16} />
          <span>{busy ? 'Guardando…' : isAntecedent ? 'Guardar antecedente' : 'Abrir ciclo y registrar servicio'}</span>
        </span>
      </button></form>
    </div>}
    <div className="card"><div className="card-header-clean mb-3"><span className="section-title">Ciclos reproductivos</span><span className="text-xs text-muted">Rango inclusivo por fecha del último servicio (antecedente: fecha probable)</span></div>
      <div className="grid-3 mb-3"><div className="form-group"><label className="form-label">Desde</label><input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div className="form-group"><label className="form-label">Hasta</label><input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} /></div><div className="form-group"><label className="form-label">Estado</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="pending">Pendientes</option><option value="all">Todos</option><option value="aborted">Abortados</option><option value="farrowed">Paridos</option><option value="closed">Cerrados</option></select></div></div>
      {!cycles.length ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <IconHeart size={26} className="text-primary" />
          </div>
          <p className="font-semibold">Sin ciclos reproductivos para los filtros seleccionados</p>
          <p className="text-sm text-muted">
            Ajusta las fechas o el estado, o registra un nuevo servicio reproductivo.
          </p>
        </div>
      ) : cycles.map((cycle) => <article className="reproduction-cycle" key={cycle.id}>
        <div className="flex flex-wrap justify-between gap-2"><div><strong>{cycle.femaleCode}{cycle.femaleAlias ? ` · ${cycle.femaleAlias}` : ''}</strong><div className="text-sm text-muted">Ciclo #{cycle.cycleNumber} · {cycle.barnName} · {cycle.locationCode ?? 'Ubicación sin asignar'} · {cycle.lotCode ?? 'Sin lote'} · {cycle.femaleBreed ?? 'Raza sin registrar'}{cycle.aptitude ? ` · ${cycle.aptitude}` : ''}</div></div>
          <div className="reproduction-due"><strong>{cycle.dueLabel}</strong><div className="text-sm">Probable: {cycle.probableFarrowingDate} · {cycle.daysRemaining} días · {cycle.dueDateSource === 'manual' ? 'manual' : `${cycle.gestationDays} días configurados`}</div>{cycle.dueDateReason && <div className="text-xs text-muted">{cycle.dueDateReason}</div>}</div></div>
        <div className="mt-2 text-sm">Estado: {statusLabels[cycle.reproductiveStatus] ?? cycle.reproductiveStatus} · {cycle.antecedent ? 'Antecedente (sin servicios inventados)' : `${cycle.services.length} servicio(s)`}{cycle.lastFarrowingDate ? ` · Último parto ${cycle.lastFarrowingDate}` : ''}</div>
        {cycle.services.map((service) => <div key={service.id} className="text-xs text-muted mt-1">{service.serviceDate} · #{service.serviceNumber} {serviceLabels[service.serviceType] ?? service.serviceType} · Padre/material {service.sireCode ?? service.externalSource ?? '—'}{service.sireBreed ? ` (${service.sireBreed})` : ''}</div>)}
        {cycle.events.map((entry) => <div key={entry.id} className="text-xs text-muted mt-1">{entry.eventDate} · {entry.eventType}{entry.physiologicalStatus ? ` · ${statusLabels[entry.physiologicalStatus] ?? entry.physiologicalStatus}` : ''}{entry.reason ? ` · ${entry.reason}` : ''}</div>)}
        {cycle.observations && <p className="text-sm mt-2">{cycle.observations}</p>}
        {cycle.litter && <div className="card mt-3"><strong>Camada · {cycle.litter.id.slice(0,8)}</strong><p className="text-sm">Fecha real del parto: {cycle.litter.farrowingDate??cycle.lastFarrowingDate??'sin registrar'}. Pendientes: {cycle.litter.femaleAlive} hembras · {cycle.litter.maleAlive} machos · {cycle.litter.unsexedAlive} sin sexar · {cycle.litter.femaleAlive+cycle.litter.maleAlive+cycle.litter.unsexedAlive} total. Destete previsto: {cycle.litter.expectedWeaningDate ?? 'sin parámetro'}{cycle.litter.actualWeaningDate ? ` · destete real: ${cycle.litter.actualWeaningDate}` : ''}.</p>
          {!soloLectura && <div className="form-actions"><button type="button" className="btn btn-outline btn-sm" onClick={()=>setLitterEventCycle(litterEventCycle===cycle.id?null:cycle.id)}>Registrar baja, adopción o destete</button><button type="button" className="btn btn-outline btn-sm" disabled={busy||!(cycle.litter.farrowingDate??cycle.lastFarrowingDate)} onClick={()=>openDateCorrection(cycle)}>Corregir fecha real del parto</button>{cycle.litter.birthCounts&&!cycle.litter.historicalOnly&&<button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={()=>openCountCorrection(cycle)}>Corregir cantidades de nacimiento</button>}</div>}
          {!soloLectura&&dateCorrection?.cycleId===cycle.id&&<form className="form-stack mt-3" aria-label="Corrección de fecha real del parto" onSubmit={(event)=>void saveLitterDate(event)}>
            <p className="text-sm">Fecha vigente al abrir: <strong>{dateCorrection.expectedCurrentDate}</strong>. Indique el motivo de la corrección para conservarlo en el historial.</p>
            <label className="form-label" htmlFor={`litter-date-${cycle.litter.id}`}>Nueva fecha real del parto</label><input id={`litter-date-${cycle.litter.id}`} type="date" className="form-input" required max={farmToday()} value={dateCorrection.farrowingDate} onChange={(event)=>setDateCorrection(previous=>previous?{...previous,farrowingDate:event.target.value}:previous)}/>
            <label className="form-label" htmlFor={`litter-date-reason-${cycle.litter.id}`}>Motivo de la corrección de fecha</label><textarea id={`litter-date-reason-${cycle.litter.id}`} className="form-input" required minLength={5} maxLength={300} value={dateCorrection.reason} onChange={(event)=>setDateCorrection(previous=>previous?{...previous,reason:event.target.value}:previous)}/>
            <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy||dateCorrection.farrowingDate===dateCorrection.expectedCurrentDate}>{busy?'Guardando corrección…':'Guardar corrección de fecha'}</button><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={()=>setDateCorrection(null)}>Cancelar corrección</button></div>
          </form>}
          {!soloLectura&&countCorrection?.cycleId===cycle.id&&<form className="form-stack mt-3" aria-label="Corrección de cantidades de nacimiento" onSubmit={event=>void saveLitterCounts(event)}>
            <p className="text-sm">Corrija los nacimientos originales. Las bajas y destetes posteriores se conservarán y se comprobarán antes de guardar.</p><div className="form-grid">{birthCountFields.map(field=><label key={field.key} className="form-group">{field.label}<input type="number" min="0" step="1" required className="form-input" value={countCorrection.values[field.key]} onChange={event=>setCountCorrection(previous=>previous?{...previous,values:{...previous.values,[field.key]:event.target.value}}:previous)}/></label>)}</div>
            <label className="form-group">Motivo de corrección de cantidades<textarea className="form-input" required minLength={5} maxLength={300} value={countCorrection.reason} onChange={event=>setCountCorrection(previous=>previous?{...previous,reason:event.target.value}:previous)}/></label>
            <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy}>Guardar cantidades corregidas</button><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={()=>setCountCorrection(null)}>Cancelar</button></div>
          </form>}
        </div>}
        {cycle.weaningPlan && <p className="text-sm mt-2">Destete anterior {cycle.weaningPlan.referenceWeaningDate} · +{cycle.weaningPlan.heatIntervalDays} días: celo {cycle.weaningPlan.expectedHeatDate} · +{cycle.weaningPlan.firstRepeatIntervalDays}: repetición {cycle.weaningPlan.expectedFirstRepeatDate} · +{cycle.weaningPlan.secondRepeatIntervalDays}: segunda {cycle.weaningPlan.expectedSecondRepeatDate}</p>}
        {cycle.weaningPlan&&cycle.previousWeaningDate&&cycle.weaningPlan.referenceWeaningDate!==cycle.previousWeaningDate&&<p className="alert alert-warning">El destete real cambió a {cycle.previousWeaningDate}; revise y actualice este plan.</p>}
        {cycle.weaningPlan&&cycle.previousWeaningPending&&<p className="alert alert-warning">El destete de la camada anterior volvió a quedar pendiente; revise este plan cuando se complete.</p>}
        {!soloLectura && <div className="mt-2"><button type="button" className="btn btn-outline btn-sm" onClick={()=>setPostweaningCycle(postweaningCycle===cycle.id?null:cycle.id)}>{cycle.weaningPlan?'Editar plan postdestete':'Configurar celo y repeticiones'}</button></div>}
        {postweaningCycle===cycle.id && <form className="form-stack mt-3" onSubmit={(event)=>void savePostweaningPlan(event,cycle)}>
          <div className="grid-2"><div className="form-group"><label className="form-label">Fecha real del destete anterior</label><input name="referenceWeaningDate" type="date" max={cycle.serviceAnchorDate ?? farmToday()} defaultValue={cycle.previousWeaningDate ?? cycle.weaningPlan?.referenceWeaningDate ?? ''} className="form-input" required />{cycle.previousWeaningDate&&<small>Fecha registrada en la camada anterior: {cycle.previousWeaningDate}</small>}</div>
            <div className="form-group"><label className="form-label">Intervalo a celo (días)</label><input name="heatIntervalDays" type="number" min="1" max="120" defaultValue={cycle.weaningPlan?.heatIntervalDays ?? 5} className="form-input" required /></div></div>
          <div className="grid-3">{[['firstRepeatIntervalDays','Intervalo primera repetición',cycle.weaningPlan?.firstRepeatIntervalDays ?? 10],['secondRepeatIntervalDays','Intervalo segunda repetición',cycle.weaningPlan?.secondRepeatIntervalDays ?? 20]].map(([name,label,value])=><div className="form-group" key={String(name)}><label className="form-label">{String(label)}</label><input name={String(name)} type="number" min="1" max="120" defaultValue={Number(value)} className="form-input" required /></div>)}</div>
          <div className="grid-3">{[['actualHeatDate','Celo observado',cycle.weaningPlan?.actualHeatDate],['actualFirstRepeatDate','Primera repetición observada',cycle.weaningPlan?.actualFirstRepeatDate],['actualSecondRepeatDate','Segunda repetición observada',cycle.weaningPlan?.actualSecondRepeatDate]].map(([name,label,value])=><div className="form-group" key={String(name)}><label className="form-label">{String(label)}</label><input name={String(name)} type="date" defaultValue={String(value ?? '')} className="form-input" /></div>)}</div>
          <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy}>Recalcular y guardar fechas</button></div>
        </form>}
        {litterEventCycle===cycle.id && cycle.litter && <form className="form-stack mt-3" onSubmit={(event)=>void saveLitterEvent(event,cycle)}>
          <div className="grid-3"><div className="form-group"><label className="form-label">Evento</label><select name="eventType" className="form-select"><option value="weaning">Destete parcial</option><option value="death">Baja en lactancia</option><option value="adoption">Adopción hacia otra camada</option></select></div>
            <div className="form-group"><label className="form-label">Fecha</label><input name="effectiveDate" type="date" min={cycle.litter.expectedWeaningDate ? undefined : undefined} max={farmToday()} className="form-input" required /></div>
            <div className="form-group"><label className="form-label">Sexo</label><select name="sex" className="form-select"><option value="hembra">Hembra · quedan {cycle.litter.femaleAlive}</option><option value="macho">Macho · quedan {cycle.litter.maleAlive}</option><option value="pendiente">Sin sexar · quedan {cycle.litter.unsexedAlive}</option></select></div></div>
          <div className="grid-3"><div className="form-group"><label className="form-label">Cantidad</label><input name="quantity" type="number" min="1" step="1" className="form-input" required /></div><div className="form-group"><label className="form-label">Peso promedio al destete (kg)</label><input name="weightKg" type="number" min="0.01" step="0.01" className="form-input" /></div><div className="form-group"><label className="form-label">Causa de baja (si aplica)</label><input name="cause" className="form-input" /></div></div>
          {!!cycle.litter.identifiedAnimals?.length && <fieldset className="form-group"><legend className="form-label">Fichas identificadas incluidas en el destete</legend><p className="text-sm">Seleccione las crías identificadas que forman parte de la cantidad indicada y corresponden al sexo elegido.</p>{cycle.litter.identifiedAnimals.map(animal=><label key={animal.code} className="text-sm"><input type="checkbox" name="animalCodes" value={animal.code} /> {animal.code} · {animal.sex} </label>)}</fieldset>}
          <div className="grid-3"><div className="form-group"><label className="form-label">Etapa destino (destete)</label><input name="destinationStageCode" className="form-input" defaultValue="inicio" /></div><div className="form-group"><label className="form-label">Galpón destino</label><input name="destinationBarnId" type="number" min="1" className="form-input" defaultValue={cycle.barnId} /></div><div className="form-group"><label className="form-label">Camada destino (adopción)</label><select name="destinationLitterId" className="form-select"><option value="">Seleccione</option>{cycles.filter((target)=>target.litter&&target.id!==cycle.id).map((target)=><option key={target.litter!.id} value={target.litter!.id}>{target.femaleCode} · {target.litter!.id.slice(0,8)}</option>)}</select></div></div>
          <div className="form-group"><label className="form-label">Motivo</label><input name="reason" className="form-input" required minLength={5} /></div>
          <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy}>Guardar evento de camada</button><button type="button" className="btn btn-outline btn-sm" onClick={()=>setLitterEventCycle(null)}>Cancelar</button></div>
        </form>}
        {!soloLectura && cycle.cycleStatus === 'open' && <div className="form-actions mt-3 flex-wrap">
          <label className="text-xs">Palpación <select className="form-select form-select-sm inline-block ml-1" defaultValue="" onChange={(e) => { if (e.target.value) void recordEvent(cycle, 'palpation', e.target.value); e.currentTarget.value = ''; }}><option value="">Registrar estado</option>{Object.entries(statusLabels).filter(([key]) => key !== 'abortion').map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void recordEvent(cycle, 'pregnancy_confirmed', 'gestation')}>Confirmar gestación</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setRepeatCycle(repeatCycle === cycle.id ? null : cycle.id)}>Agregar repetición/servicio</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setManualCycle(manualCycle === cycle.id ? null : cycle.id)}>
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconCalendar size={14} />
              <span>Fecha probable manual</span>
            </span>
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setClosureForm({ cycleId: cycle.id, eventType: 'abortion', reason: '' })}>Registrar aborto</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setClosureForm({ cycleId: cycle.id, eventType: 'closed', reason: '' })}>Cerrar ciclo</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setFarrowingCycle(farrowingCycle === cycle.id ? null : cycle.id)}>Registrar parto y camada</button>
        </div>}
        {farrowingCycle === cycle.id && <form className="form-stack mt-3" onSubmit={(event) => void saveFarrowing(event, cycle)}>
          <div className="grid-3"><div className="form-group"><label className="form-label">Fecha del parto</label><input name="farrowingDate" type="date" max={farmToday()} className="form-input" defaultValue={cycle.probableFarrowingDate} required /></div>
            <div className="form-group"><label className="form-label">Número de parto (opcional)</label><input name="parityNumber" type="number" min="1" step="1" className="form-input" /></div>
            <div className="form-group"><label className="form-label">Peso promedio vivo (kg)</label><input name="averageWeightKg" type="number" min="0.01" max="10" step="0.01" className="form-input" /></div></div>
          <div className="grid-3">{[['maleAlive','Machos vivos'],['femaleAlive','Hembras vivas'],['unsexedAlive','Vivos sin sexar'],['maleStillborn','Machos nacidos muertos'],['femaleStillborn','Hembras nacidas muertas'],['unsexedStillborn','Muertos sin sexar']].map(([name,label]) => <div className="form-group" key={name}><label className="form-label">{label}</label><input name={name} type="number" min="0" step="1" defaultValue="0" className="form-input" required /></div>)}</div>
          <div className="grid-2"><div className="form-group"><label className="form-label">Motivo / referencia</label><input name="reason" className="form-input" required minLength={5} maxLength={300} /></div><div className="form-group"><label className="form-label">Observaciones</label><input name="observations" className="form-input" maxLength={1000} /></div></div>
          <div className="text-xs text-muted">Solo los nacidos vivos ingresan al inventario. El destete previsto usa la duración vigente de Lactancia.</div>
          <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy}>Guardar parto y cerrar ciclo</button><button type="button" className="btn btn-outline btn-sm" onClick={() => setFarrowingCycle(null)}>Cancelar</button></div>
        </form>}
        {closureForm?.cycleId === cycle.id && <form className="form-stack mt-3" onSubmit={(event) => { event.preventDefault(); void recordEvent(cycle, closureForm.eventType, undefined, closureForm.reason); }}><div className="form-group"><label className="form-label">{closureForm.eventType === 'abortion' ? 'Motivo del aborto' : 'Motivo del cierre'}</label><input className="form-input" required minLength={5} maxLength={300} value={closureForm.reason} onChange={(event) => setClosureForm((previous) => previous ? { ...previous, reason: event.target.value } : previous)} /></div><div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{closureForm.eventType === 'abortion' ? 'Guardar aborto y cerrar ciclo' : 'Guardar cierre'}</button><button type="button" className="btn btn-outline btn-sm" onClick={() => setClosureForm(null)}>Cancelar</button></div></form>}
        {repeatCycle === cycle.id && <form className="form-stack mt-3" onSubmit={(e) => void addRepeatService(e, cycle)}><div className="grid-3"><div className="form-group"><label className="form-label">Fecha</label><input name="serviceDate" type="date" className="form-input" min={cycle.serviceAnchorDate ?? undefined} max={farmToday()} required /></div><div className="form-group"><label className="form-label">Tipo</label><select name="serviceType" className="form-select"><option value="inseminacion_artificial">Inseminación artificial</option><option value="monta_natural">Monta natural</option><option value="transferencia_embriones">Transferencia de embriones</option></select></div><div className="form-group"><label className="form-label">Origen</label><select name="materialSource" className="form-select"><option value="internal">Verraco interno</option><option value="external">Material externo</option></select></div></div><div className="grid-3"><div className="form-group"><label className="form-label">Código del verraco</label><select name="sireCode" className="form-select"><option value="">Seleccione si aplica</option>{sires.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></div><div className="form-group"><label className="form-label">Material externo</label><input name="externalSource" className="form-input" /></div><div className="form-group"><label className="form-label">Observaciones</label><input name="observations" className="form-input" /></div></div><button className="btn btn-primary btn-sm" disabled={busy}>Guardar nuevo servicio</button></form>}
        {manualCycle === cycle.id && <form className="form-stack mt-3" onSubmit={(e) => void saveManualDue(e, cycle)}><div className="form-grid"><div className="form-group"><label className="form-label">Fecha probable</label><input name="dueDate" type="date" min={cycle.serviceAnchorDate ?? undefined} className="form-input" defaultValue={cycle.probableFarrowingDate} required /></div><div className="form-group"><label className="form-label">Motivo</label><input name="dueDateReason" className="form-input" required minLength={5} /></div></div><button className="btn btn-primary btn-sm" disabled={busy}>Guardar fecha manual</button></form>}
      </article>)}
    </div>
  </section>;
}

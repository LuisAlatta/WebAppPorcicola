import React,{useCallback,useEffect,useState} from 'react';
import {farmToday,newOperationKey,fetchOperation} from '../utils/operations';
import { ModalDialog } from './ModalDialog';
import type {Perfil} from '../types';

type Rule={id:number;ruleKey:string;version:number;vaccineName:string;targetCategory:string;baseEvent:string;offsetDays:number;targetAgeDays:number|null;recurrenceDays:number|null;referenceDate:string|null;isActive:boolean;isCurrent:boolean};
type Schedule={id:number;animalCode:string;animalType:string;targetCategory:string;vaccineName:string;scheduledDate:string;status:string;isManual:boolean;appliedDate:string|null;barnName:string;observations:string|null};
const categoryLabels:Record<string,string>={cerda_primeriza:'Cerda primeriza',cerda_multipara:'Cerda multípara',verraco:'Verraco',lechon:'Lechón',reemplazo:'Reemplazo'};
const baseLabels:Record<string,string>={birth:'Nacimiento',age:'Edad',farrowing:'Parto',semiannual:'Fecha de referencia recurrente'};
export function ModuloVacunas({perfil}:{perfil:Perfil}){
 const canWrite=perfil==='administrador'||perfil==='veterinario';const isAdmin=perfil==='administrador';const [rules,setRules]=useState<Rule[]>([]);const [rows,setRows]=useState<Schedule[]>([]);const [animals,setAnimals]=useState<{code:string}[]>([]);const [filter,setFilter]=useState({from:'',to:'',status:'pending',animalType:''});const [editKey,setEditKey]=useState<string|null>(null);const [form,setForm]=useState({vaccineName:'',targetCategory:'reemplazo',baseEvent:'birth',offsetDays:'0',targetAgeDays:'60',recurrenceDays:'180',referenceDate:'',isActive:true,reason:'Alta de regla de prueba'});const [manual,setManual]=useState({animalCode:'',vaccineName:'',scheduledDate:farmToday(),reason:''});
 const [applyTarget,setApplyTarget]=useState<Schedule|null>(null);
 const [applyForm,setApplyForm]=useState({dosage:'2',dosageUnit:'ml',appliedDate:farmToday(),productLot:'',withdrawalUntil:'',observations:''});
 const [applyOperationKey,setApplyOperationKey]=useState(()=>newOperationKey('vaccine-apply'));
 const [scheduleTarget,setScheduleTarget]=useState<{row:Schedule;cancel:boolean}|null>(null);
 const [scheduleChangeForm,setScheduleChangeForm]=useState({date:'',reason:''});
 const [scheduleOperationKey,setScheduleOperationKey]=useState(()=>newOperationKey('vaccine-reschedule'));
 const [deactivateTarget,setDeactivateTarget]=useState<Rule|null>(null);
 const [deactivateReason,setDeactivateReason]=useState('');
 const [deactivateOperationKey,setDeactivateOperationKey]=useState(()=>newOperationKey('vaccine-rule-off'));
 const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const params=new URLSearchParams({status:filter.status});if(filter.from)params.set('from',filter.from);if(filter.to)params.set('to',filter.to);if(filter.animalType)params.set('animalType',filter.animalType);const [rr,sr,ar]=await Promise.all([fetch('/api/vaccines/rules'),fetch(`/api/vaccines/schedules?${params}`),fetch('/api/animals?status=activo&limit=500')]);const [r,s,a]=await Promise.all([rr.json(),sr.json(),ar.json()]) as [{rules?:Rule[];error?:string},{schedules?:Schedule[];error?:string},{animals?:{code:string}[]}];if(!rr.ok||!sr.ok||!ar.ok)throw new Error(r.error||s.error||'No se pudo cargar vacunas');setRules(r.rules??[]);setRows(s.schedules??[]);setAnimals(a.animals??[]);},[filter]);
 useEffect(()=>{const timer=window.setTimeout(()=>{void load().catch(err=>setError(err instanceof Error?err.message:'Error cargando vacunas'));},0);return()=>window.clearTimeout(timer);},[load]);
 const send=async(path:string,body:unknown,success:string)=>{setBusy(true);setError('');setNotice('');try{const response=await fetchOperation(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json() as {error?:string;created?:number;eligible?:number;conflictDetected?:boolean};if(!response.ok)throw new Error(data.error||'No se pudo completar la operación');await load();setNotice(`${success}${data.eligible!==undefined?` Elegibles: ${data.eligible}; programadas o actualizadas: ${data.created}.`:''}`);return data;}catch(err){setError(err instanceof Error?err.message:'Error');return null;}finally{setBusy(false)}};
 const saveRule=async(event:React.FormEvent)=>{event.preventDefault();if(!isAdmin)return;setBusy(true);setError('');setNotice('');try{const response=await fetchOperation(editKey?`/api/vaccines/rules/${encodeURIComponent(editKey)}`:'/api/vaccines/rules',{method:editKey?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,offsetDays:Number(form.offsetDays),targetAgeDays:Number(form.targetAgeDays),recurrenceDays:Number(form.recurrenceDays),operationKey:newOperationKey('vaccine-rule')})});const data=await response.json() as {error?:string;eligible?:number;created?:number};if(!response.ok)throw new Error(data.error||'No se pudo guardar la regla');setNotice(`Regla guardada. Animales elegibles: ${data.eligible??0}; vacunas generadas: ${data.created??0}.`);setEditKey(null);setForm(old=>({...old,vaccineName:''}));await load();}catch(err){setError(err instanceof Error?err.message:'No se pudo guardar la regla');}finally{setBusy(false);}};
 const confirmApply=async(event:React.FormEvent)=>{event.preventDefault();if(!applyTarget)return;const result=await send(`/api/vaccines/schedules/${applyTarget.id}/apply`,{appliedDate:applyForm.appliedDate,dosage:Number(applyForm.dosage),dosageUnit:applyForm.dosageUnit,productLot:applyForm.productLot||undefined,withdrawalUntil:applyForm.withdrawalUntil||undefined,observations:applyForm.observations||undefined,reason:'Aplicación de vacuna',operationKey:applyOperationKey},'Vacuna aplicada e incorporada al historial sanitario.');if(!result)return;setApplyTarget(null);setApplyForm({dosage:'2',dosageUnit:'ml',appliedDate:farmToday(),productLot:'',withdrawalUntil:'',observations:''});setApplyOperationKey(newOperationKey('vaccine-apply'));};
 const confirmChangeSchedule=async(event:React.FormEvent)=>{event.preventDefault();if(!scheduleTarget||!canWrite)return;const {row,cancel}=scheduleTarget;setBusy(true);setError('');setNotice('');try{const response=await fetchOperation(`/api/vaccines/schedules/${row.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduledDate:cancel?undefined:scheduleChangeForm.date,cancel,reason:scheduleChangeForm.reason,operationKey:scheduleOperationKey})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'No se pudo actualizar la vacuna');await load();setNotice(cancel?'Vacuna cancelada; su aviso se cerró.':'Vacuna reprogramada; su aviso conserva una sola ocurrencia.');setScheduleTarget(null);setScheduleChangeForm({date:'',reason:''});setScheduleOperationKey(newOperationKey(cancel?'vaccine-cancel':'vaccine-reschedule'));}catch(err){setError(err instanceof Error?err.message:'Error');}finally{setBusy(false);}};
 const confirmDeactivate=async(event:React.FormEvent)=>{event.preventDefault();if(!deactivateTarget)return;const result=await send(`/api/vaccines/rules/${encodeURIComponent(deactivateTarget.ruleKey)}/deactivate`,{reason:deactivateReason,operationKey:deactivateOperationKey},'Regla desactivada.');if(!result)return;setDeactivateTarget(null);setDeactivateReason('');setDeactivateOperationKey(newOperationKey('vaccine-rule-off'));};
 return <section className="card" id="vacunas"><div className="card-header"><div><h2>Vacunación y calendario</h2><p className="text-muted">Reglas versionadas, agenda por animal y registro de dosis aplicada.</p></div><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void send('/api/vaccines/generate',{},'Agenda regenerada.')}>Generar vacunas</button></div>
 {error&&<div className="alert alert-danger" role="alert">{error}</div>}{notice&&<div className="alert alert-success" role="status">{notice}</div>}
 <div className="filter-row"><label>Fecha programada desde<input type="date" value={filter.from} onChange={e=>setFilter({...filter,from:e.target.value})}/></label><label>Fecha programada hasta<input type="date" value={filter.to} onChange={e=>setFilter({...filter,to:e.target.value})}/></label><label>Tipo de animal<select value={filter.animalType} onChange={e=>setFilter({...filter,animalType:e.target.value})}><option value="">Todos</option><option value="cerda">Cerda</option><option value="verraco">Verraco</option><option value="lechon">Lechón</option><option value="reemplazo">Reemplazo</option></select></label><label>Estado<select value={filter.status} onChange={e=>setFilter({...filter,status:e.target.value})}><option value="pending">Pendientes</option><option value="applied">Aplicadas</option><option value="cancelled">Canceladas</option><option value="">Todos</option></select></label></div>
 <div className="table-responsive"><table className="data-table"><thead><tr><th>Fecha</th><th>Animal</th><th>Categoría</th><th>Vacuna</th><th>Galpón</th><th>Origen</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.scheduledDate}{row.appliedDate?` · aplicada ${row.appliedDate}`:''}</td><td>{row.animalCode}</td><td>{categoryLabels[row.targetCategory]??row.targetCategory}</td><td>{row.vaccineName}</td><td>{row.barnName}</td><td>{row.isManual?'Manual':'Regla automática'}</td><td>{row.status==='pending'?'Pendiente':row.status==='applied'?'Aplicada':'Cancelada'}</td><td>{row.status==='pending'&&canWrite&&<div className="inline-flex items-center gap-1.5 flex-wrap"><button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={()=>{setApplyTarget(row);setApplyForm({dosage:'2',dosageUnit:'ml',appliedDate:farmToday(),productLot:'',withdrawalUntil:'',observations:''});setApplyOperationKey(newOperationKey('vaccine-apply'));}}>Registrar aplicación</button> <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={()=>{setScheduleTarget({row,cancel:false});setScheduleChangeForm({date:row.scheduledDate,reason:''});setScheduleOperationKey(newOperationKey('vaccine-reschedule'));}}>Reprogramar</button> <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={()=>{setScheduleTarget({row,cancel:true});setScheduleChangeForm({date:'',reason:''});setScheduleOperationKey(newOperationKey('vaccine-cancel'));}}>Cancelar</button></div>}</td></tr>)}{!rows.length&&<tr><td colSpan={8} className="text-center p-4 text-muted">No hay vacunas para estos filtros.</td></tr>}</tbody></table></div>
 {canWrite&&<form className="form-grid mt-4" onSubmit={async e=>{e.preventDefault();const result=await send('/api/vaccines/schedules/manual',{...manual,operationKey:newOperationKey('vaccine-manual')},'Vacuna programada.');if(result?.conflictDetected)setNotice('Ya existe esa vacuna para el animal en esa fecha.');}}><h3 className="form-span-2">Programación manual</h3><label>Animal<select required value={manual.animalCode} onChange={e=>setManual({...manual,animalCode:e.target.value})}><option value="">Seleccionar</option>{animals.map(a=><option key={a.code}>{a.code}</option>)}</select></label><label>Vacuna<input required value={manual.vaccineName} onChange={e=>setManual({...manual,vaccineName:e.target.value})}/></label><label>Fecha programada<input required type="date" value={manual.scheduledDate} onChange={e=>setManual({...manual,scheduledDate:e.target.value})}/></label><label>Motivo<input required value={manual.reason} onChange={e=>setManual({...manual,reason:e.target.value})}/></label><div className="form-span-2"><button className="btn btn-secondary" disabled={busy}>{busy ? 'Programando…' : 'Programar vacuna'}</button></div></form>}
 {isAdmin&&<><div className="table-responsive mt-4"><h3>Reglas de vacunación</h3><table className="data-table"><thead><tr><th>Vacuna</th><th>Categoría</th><th>Base</th><th>Ajuste</th><th>Versión</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rules.filter(rule=>rule.isCurrent).map(rule=><tr key={rule.id}><td>{rule.vaccineName}</td><td>{categoryLabels[rule.targetCategory]??rule.targetCategory}</td><td>{baseLabels[rule.baseEvent]??rule.baseEvent}</td><td>{rule.offsetDays} días</td><td>{rule.version}</td><td>{rule.isActive?'Activa':'Inactiva'}</td><td><button type="button" className="btn btn-secondary btn-sm" onClick={()=>{setEditKey(rule.ruleKey);setForm({vaccineName:rule.vaccineName,targetCategory:rule.targetCategory,baseEvent:rule.baseEvent,offsetDays:String(rule.offsetDays),targetAgeDays:String(rule.targetAgeDays??60),recurrenceDays:String(rule.recurrenceDays??180),referenceDate:rule.referenceDate??'',isActive:rule.isActive,reason:'Actualización de regla'});}}>Editar</button>{rule.isActive&&<button type="button" className="btn btn-secondary btn-sm ml-1" onClick={()=>{setDeactivateTarget(rule);setDeactivateReason('');setDeactivateOperationKey(newOperationKey('vaccine-rule-off'));}}>Desactivar</button>}</td></tr>)}{!rules.some(rule=>rule.isCurrent)&&<tr><td colSpan={7} className="text-center p-4 text-muted">No hay reglas configuradas.</td></tr>}</tbody></table></div><form className="form-grid mt-4" onSubmit={saveRule}><h3 className="form-span-2">{editKey?'Editar regla de vacunación':'Nueva regla'}</h3><label>Vacuna<input required maxLength={120} value={form.vaccineName} onChange={e=>setForm({...form,vaccineName:e.target.value})}/></label><label>Categoría<select value={form.targetCategory} onChange={e=>setForm({...form,targetCategory:e.target.value})}>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Evento base<select value={form.baseEvent} onChange={e=>setForm({...form,baseEvent:e.target.value})}>{Object.entries(baseLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Ajuste en días<input type="number" value={form.offsetDays} onChange={e=>setForm({...form,offsetDays:e.target.value})}/></label>{form.baseEvent==='age'&&<label>Edad objetivo en días<input required type="number" min="0" value={form.targetAgeDays} onChange={e=>setForm({...form,targetAgeDays:e.target.value})}/></label>}{form.baseEvent==='semiannual'&&<><label>Fecha de referencia<input required type="date" value={form.referenceDate} onChange={e=>setForm({...form,referenceDate:e.target.value})}/></label><label>Intervalo en días<input required type="number" min="1" value={form.recurrenceDays} onChange={e=>setForm({...form,recurrenceDays:e.target.value})}/></label></>}<label>Motivo<input required value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label><label className="form-span-2 checkbox-label"><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/> <span>Regla activa</span></label><div className="form-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editKey ? 'Guardar nueva versión' : 'Crear regla y generar agenda'}</button>{editKey&&<button className="btn btn-secondary" type="button" onClick={()=>setEditKey(null)}>Cancelar edición</button>}</div></form></>}
 {!canWrite&&<p className="note-box">Perfil de consulta: la programación y aplicación corresponde al veterinario o administrador.</p>}

 {applyTarget && (
   <ModalDialog labelledBy="vaccine-apply-dialog-title" onDismiss={() => setApplyTarget(null)} dismissDisabled={busy}>
       <h4 id="vaccine-apply-dialog-title" className="text-lg font-bold mb-2">Registrar Aplicación de Vacuna</h4>
       <p className="text-sm text-muted mb-3">
         Animal <strong>{applyTarget.animalCode}</strong> · Vacuna <strong>{applyTarget.vaccineName}</strong> · {applyTarget.barnName}
       </p>
       <form onSubmit={confirmApply}>
         <div className="form-grid mb-4">
           <div className="form-group">
             <label className="form-label text-sm" htmlFor="apply-dosage">Dosis aplicada:</label>
             <input id="apply-dosage" type="number" step="0.001" min="0.001" className="form-input" value={applyForm.dosage} onChange={(e) => setApplyForm({ ...applyForm, dosage: e.target.value })} required />
           </div>
           <div className="form-group"><label className="form-label text-sm" htmlFor="apply-unit">Unidad de dosis</label><input id="apply-unit" className="form-input" maxLength={30} value={applyForm.dosageUnit} onChange={(e)=>setApplyForm({...applyForm,dosageUnit:e.target.value})} required /></div>
           <div className="form-group">
             <label className="form-label text-sm" htmlFor="apply-date">Fecha aplicada:</label>
             <input id="apply-date" type="date" max={farmToday()} className="form-input" value={applyForm.appliedDate} onChange={(e) => setApplyForm({ ...applyForm, appliedDate: e.target.value })} required />
           </div>
           <div className="form-group">
             <label className="form-label text-sm" htmlFor="apply-lot">Lote producto (opcional):</label>
             <input id="apply-lot" className="form-input" value={applyForm.productLot} onChange={(e) => setApplyForm({ ...applyForm, productLot: e.target.value })} />
           </div>
           <div className="form-group">
             <label className="form-label text-sm" htmlFor="apply-withdrawal">Retiro hasta (opcional):</label>
             <input id="apply-withdrawal" type="date" min={applyForm.appliedDate} className="form-input" value={applyForm.withdrawalUntil} onChange={(e) => setApplyForm({ ...applyForm, withdrawalUntil: e.target.value })} />
           </div>
           <div className="form-group form-span-2">
             <label className="form-label text-sm" htmlFor="apply-obs">Observaciones (opcional):</label>
             <input id="apply-obs" className="form-input" value={applyForm.observations} onChange={(e) => setApplyForm({ ...applyForm, observations: e.target.value })} />
           </div>
         </div>
         <div className="flex justify-end gap-2">
           <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setApplyTarget(null)}>Cancelar</button>
           <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar Aplicación'}</button>
         </div>
       </form>
   </ModalDialog>
 )}

 {scheduleTarget && (
   <ModalDialog labelledBy="vaccine-schedule-dialog-title" onDismiss={() => setScheduleTarget(null)} dismissDisabled={busy}>
       <h4 id="vaccine-schedule-dialog-title" className="text-lg font-bold mb-2">
         {scheduleTarget.cancel ? 'Cancelar Vacuna Programada' : 'Reprogramar Vacuna'}
       </h4>
       <p className="text-sm text-muted mb-3">
         Animal <strong>{scheduleTarget.row.animalCode}</strong> · Vacuna <strong>{scheduleTarget.row.vaccineName}</strong> (Fecha actual: {scheduleTarget.row.scheduledDate})
       </p>
       <form onSubmit={confirmChangeSchedule}>
         <div className="form-stack mb-4">
           {!scheduleTarget.cancel && (
             <div className="form-group">
               <label className="form-label text-sm" htmlFor="sched-new-date">Nueva fecha programada:</label>
               <input id="sched-new-date" type="date" className="form-input" value={scheduleChangeForm.date} onChange={(e) => setScheduleChangeForm({ ...scheduleChangeForm, date: e.target.value })} required />
             </div>
           )}
           <div className="form-group">
             <label className="form-label text-sm" htmlFor="sched-reason">
               {scheduleTarget.cancel ? 'Motivo de cancelación:' : 'Motivo de reprogramación:'}
             </label>
             <input id="sched-reason" className="form-input" value={scheduleChangeForm.reason} onChange={(e) => setScheduleChangeForm({ ...scheduleChangeForm, reason: e.target.value })} placeholder="ej. Ajuste por condición del animal" required autoFocus />
           </div>
         </div>
         <div className="flex justify-end gap-2">
           <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setScheduleTarget(null)}>Cancelar</button>
           <button type="submit" className={scheduleTarget.cancel ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy || !scheduleChangeForm.reason.trim() || (!scheduleTarget.cancel && !scheduleChangeForm.date)}>
             {busy ? 'Guardando…' : scheduleTarget.cancel ? 'Confirmar Cancelación' : 'Guardar Nueva Fecha'}
           </button>
         </div>
       </form>
   </ModalDialog>
 )}

 {deactivateTarget && (
   <ModalDialog labelledBy="vaccine-deactivate-dialog-title" onDismiss={() => { setDeactivateTarget(null); setDeactivateReason(''); }} dismissDisabled={busy}>
       <h4 id="vaccine-deactivate-dialog-title" className="text-lg font-bold mb-2 text-danger">Desactivar Regla de Vacunación</h4>
       <p className="text-sm text-muted mb-3">
         Regla: <strong>{deactivateTarget.vaccineName}</strong> ({categoryLabels[deactivateTarget.targetCategory] ?? deactivateTarget.targetCategory}).
       </p>
       <form onSubmit={confirmDeactivate}>
         <div className="form-group mb-4">
           <label className="form-label text-sm" htmlFor="deact-rule-reason">Motivo de desactivación:</label>
           <input id="deact-rule-reason" className="form-input" value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} placeholder="ej. Cambio de esquema sanitario" required autoFocus />
         </div>
         <div className="flex justify-end gap-2">
           <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setDeactivateTarget(null)}>Cancelar</button>
           <button type="submit" className="btn btn-danger" disabled={busy || !deactivateReason.trim()}>
             {busy ? 'Guardando…' : 'Desactivar Regla'}
           </button>
         </div>
       </form>
   </ModalDialog>
 )}
 </section>;
}

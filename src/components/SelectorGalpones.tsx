import { useEffect, useState } from 'react';
import { IconBuilding, IconSettings, IconArrowRight, IconArrowLeft, IconCheck } from './icons';
import { errorMessage, pluralize } from '../utils/format';
import type { Perfil } from '../types';
import { ModuloAdministracion } from './ModuloAdministracion';

export function SelectorGalpones({ perfil, selected, onContinue }: { perfil: Perfil; selected: number[]; onContinue: (ids: number[], names: string[]) => void }) {
  const [managing, setManaging] = useState(false);
  const [barns, setBarns] = useState<{ id: number; name: string }[]>([]);
  const [ids, setIds] = useState(selected);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (managing) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/barns');
        const data = await response.json() as { barns?: { id: number; name: string }[]; error?: string };
        if (!response.ok || !data.barns) throw new Error(data.error ?? 'No se pudieron cargar los galpones');
        if (!cancelled) { setBarns(data.barns); setIds(current => current.filter(id => data.barns!.some(barn => barn.id === id))); }
      } catch (err) { if (!cancelled) setError(errorMessage(err, 'No se pudieron cargar los galpones')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [managing]);
  const closeManagement = () => { setLoading(true); setError(''); setManaging(false); };
  return <section className="module-container barn-selector">
    <div className="barn-selector-header">
      <div><h1>Galpones</h1><p>{managing ? 'Organiza tus instalaciones y su equipo.' : 'Elige dónde quieres trabajar. Puedes seleccionar varios.'}</p></div>
      {perfil === 'administrador' && <button type="button" className="btn btn-outline barn-manage-button" data-action={managing ? 'back' : undefined} onClick={() => managing ? closeManagement() : setManaging(true)}>{managing ? <IconArrowLeft size={18} /> : <IconSettings size={18} />}<span>{managing ? 'Volver a seleccionar galpones' : 'Administrar galpones'}</span></button>}
    </div>
    {managing && perfil === 'administrador' ? <ModuloAdministracion perfil={perfil} barnsOnly onNavigate={closeManagement} /> : <>
    {loading && <div role="status" className="barn-selector-loading"><p>Cargando galpones…</p><div className="barn-selection-grid" aria-hidden="true">{[0, 1, 2, 3].map(index => <div className="barn-option-skeleton" key={index} />)}</div></div>}
    {error && <div className="barn-selector-message" role="alert"><p>{error}</p><button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>Volver a intentar</button></div>}
    {!loading && !error && !barns.length && <div className="barn-selector-message" role="status"><IconBuilding size={28} /><p>{perfil === 'administrador' ? 'No hay galpones disponibles. Usa Administrar galpones para crear o activar uno.' : 'No tienes galpones disponibles. Consulta con el administrador.'}</p></div>}
    {!loading && !error && barns.length > 0 && <>
      <div className="barn-selection-summary"><span>Galpones disponibles</span><span>{barns.length}</span></div>
      <div className="barn-selection-grid">
        {barns.map(barn => {
          const checked = ids.includes(barn.id);
          return <label key={barn.id} className="barn-selection-option" data-selected={checked}>
            <span className="barn-option-heading"><IconBuilding size={24} /><input type="checkbox" aria-label={barn.name} checked={checked} onChange={event => setIds(current => event.target.checked ? [...current, barn.id] : current.filter(id => id !== barn.id))} /></span>
            <span className="barn-option-name">{barn.name}</span>
            <span className="barn-option-state" aria-hidden="true">{checked ? <><IconCheck size={14} />Seleccionado</> : 'Seleccionar'}</span>
          </label>;
        })}
      </div>
    </>}
    <div className="barn-selection-footer">
    <p role="status" aria-live="polite">{loading ? 'Preparando la selección' : !ids.length ? 'Selecciona al menos un galpón para continuar' : pluralize(ids.length, 'galpón seleccionado', 'galpones seleccionados')}</p>
    <button type="button" className="btn btn-primary barn-continue-button" disabled={loading || !!error || !ids.length}
      onClick={() => onContinue(ids, barns.filter(barn => ids.includes(barn.id)).map(barn => barn.name))}>
      <span>Siguiente</span><IconArrowRight size={16} />
    </button>
    </div>
    </>}
  </section>;
}

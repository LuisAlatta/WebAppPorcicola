import { useEffect, useState } from 'react';
import { IconBox, IconArrowRight } from './icons';

export function SelectorGalpones({ selected, onContinue }: { selected: number[]; onContinue: (ids: number[], names: string[]) => void }) {
  const [barns, setBarns] = useState<{ id: number; name: string }[]>([]);
  const [ids, setIds] = useState(selected);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/barns');
        const data = await response.json() as { barns?: { id: number; name: string }[]; error?: string };
        if (!response.ok || !data.barns) throw new Error(data.error ?? 'No se pudieron cargar los galpones');
        if (!cancelled) { setBarns(data.barns); setIds(current => current.filter(id => data.barns!.some(barn => barn.id === id))); }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los galpones'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return <section className="module-container">
    <h1>Galpones</h1>
    <p>Selecciona uno o varios galpones para revisar sus módulos.</p>
    {loading && <p role="status">Cargando galpones…</p>}
    {error && <div className="alert alert-danger" role="alert">{error}<button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>Volver a intentar</button></div>}
    {!loading && !error && !barns.length && <p role="status">No tienes galpones disponibles. Consulta con el administrador.</p>}
    <div className="barn-selection-grid">
      {barns.map(barn => <label key={barn.id} className="card barn-selection-option">
        <input type="checkbox" checked={ids.includes(barn.id)} onChange={event => setIds(current => event.target.checked ? [...current, barn.id] : current.filter(id => id !== barn.id))} />
        <IconBox size={24} /><span>{barn.name}</span>
      </label>)}
    </div>
    <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" disabled={loading || !!error || !ids.length}
      onClick={() => onContinue(ids, barns.filter(barn => ids.includes(barn.id)).map(barn => barn.name))}>
      <span>Siguiente</span><IconArrowRight size={16} />
    </button>
  </section>;
}

import { useEffect, useId, useRef, useState } from 'react';

type Option = { id: number; code: string; alias?: string | null; barnName?: string };
type Props = {
  label: string;
  searchLabel: string;
  value: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  useIdValue?: boolean;
  sex?: string;
  activeOnly?: boolean;
  required?: boolean;
  emptyLabel?: string;
};

/** Consulta páginas cortas; las selecciones previas permanecen al buscar otro animal. */
export function AnimalPicker({ label, searchLabel, value, onChange, multiple, useIdValue, sex, activeOnly, required, emptyLabel = 'Seleccionar animal' }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const selected = useRef(value);
  useEffect(() => { selected.current = value; }, [value]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError('');
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (query.trim()) params.set('q', query.trim());
      if (sex) params.set('sex', sex);
      if (activeOnly) { params.set('status', 'activo'); params.set('active', '1'); }
      void fetch(`/api/animals?${params}`, { signal: controller.signal }).then(async response => {
        const data = await response.json() as { animals?: Option[]; total?: number; error?: string };
        if (!response.ok || !Array.isArray(data.animals)) throw new Error(data.error || 'No se pudieron consultar los animales');
        if (cancelled) return;
        setOptions(previous => {
          const retained = previous.filter(item => selected.current.includes(useIdValue ? String(item.id) : item.code));
          return [...new Map([...retained, ...data.animals!].map(item => [item.code, item])).values()];
        });
        setTotal(data.total ?? data.animals.length);
      }).catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Error al buscar animales');
      }).finally(() => { if (!cancelled) setBusy(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [query, sex, activeOnly, useIdValue]);
  return <>
    <label className="form-label" htmlFor={`${id}-search`}>{searchLabel}</label>
    <input id={`${id}-search`} className="form-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Código, alias o arete" />
    <label className="form-label" htmlFor={id}>{label}</label>
    <select id={id} className="form-select" multiple={multiple} required={required} value={multiple ? value : value[0] ?? ''} onChange={event => onChange(Array.from(event.currentTarget.selectedOptions).map(option => option.value).filter(Boolean))}>
      {!multiple && <option value="">{emptyLabel}</option>}
      {value.filter(key => !options.some(item => (useIdValue ? String(item.id) : item.code) === key)).map(key => <option key={`selected-${key}`} value={key}>{key} · seleccionado</option>)}
      {options.map(item => <option key={item.code} value={useIdValue ? String(item.id) : item.code}>{item.code}{item.alias ? ` · ${item.alias}` : ''}{item.barnName ? ` · ${item.barnName}` : ''}</option>)}
    </select>
    <small>{busy ? 'Buscando animales…' : `${total} coincidencias${total > 50 ? ' · refine la búsqueda para ver otras fichas' : ''}`}</small>
    {error && <p role="alert">{error}</p>}
  </>;
}

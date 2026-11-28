import { useEffect, useId, useRef, useState } from 'react';
import { IconAlertCircle, IconRefreshCw, IconSearch, IconX } from './icons';
import { FormField } from './ui/FormField';

type Option = { id: number; code: string; alias?: string | null; barnName?: string };
type Props = {
  label: string;
  searchLabel: string;
  value: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  useIdValue?: boolean;
  preferIdRef?: boolean;
  barnId?: string | number;
  sex?: string;
  activeOnly?: boolean;
  allBarns?: boolean;
  required?: boolean;
  emptyLabel?: string;
};

/** Consulta páginas cortas; las selecciones previas permanecen al buscar otro animal. */
export function AnimalPicker({ label, searchLabel, value, onChange, multiple, useIdValue, preferIdRef, barnId, sex, activeOnly, allBarns, required, emptyLabel = 'Seleccionar animal' }: Props) {
  const id = useId();
  const limit = allBarns ? 500 : 50;
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const [retry, setRetry] = useState(0);
  const selected = useRef(value);
  useEffect(() => { selected.current = value; }, [value]);
  const codeCounts = new Map<string, number>();
  for (const item of options) codeCounts.set(item.code, (codeCounts.get(item.code) ?? 0) + 1);
  const optionValueOf = (item: Option) => {
    if (useIdValue) return String(item.id);
    if (item.id !== undefined && (preferIdRef || (codeCounts.get(item.code) ?? 0) > 1 || value.includes(`id:${item.id}`))) {
      return `id:${item.id}`;
    }
    return item.code;
  };
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError('');
      const params = new URLSearchParams({ limit: String(limit), offset: '0' });
      if (query.trim()) params.set('q', query.trim());
      if (sex) params.set('sex', sex);
      if (barnId && !allBarns) params.set('barnId', String(barnId));
      if (activeOnly && !allBarns) { params.set('status', 'activo'); params.set('active', '1'); }
      const endpoint = allBarns ? '/api/animal-parents' : '/api/animals';
      void fetch(`${endpoint}?${params}`, { signal: controller.signal }).then(async response => {
        const data = await response.json() as { animals?: Option[]; total?: number; error?: string };
        if (!response.ok || !Array.isArray(data.animals)) throw new Error(data.error || 'No se pudieron consultar los animales');
        if (cancelled) return;
        setOptions(previous => {
          const retained = previous.filter(item =>
            selected.current.includes(useIdValue ? String(item.id) : item.code)
            || (item.id !== undefined && selected.current.includes(`id:${item.id}`)),
          );
          return [...new Map([...retained, ...data.animals!].map(item => [item.id ?? item.code, item])).values()];
        });
        setTotal(data.total ?? data.animals.length);
      }).catch((reason: unknown) => {
        if (!cancelled && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Error al buscar animales');
      }).finally(() => { if (!cancelled) setBusy(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [query, sex, barnId, activeOnly, allBarns, limit, useIdValue, retry]);

  const displayOf = (key: string) => {
    const found = options.find(item => optionValueOf(item) === key || item.code === key);
    if (!found) return key;
    const showBarn = Boolean(found.barnName) && (allBarns || (!useIdValue && ((codeCounts.get(found.code) ?? 0) > 1 || key.startsWith('id:'))));
    return `${found.code}${found.alias ? ` · ${found.alias}` : ''}${showBarn ? ` · ${found.barnName}` : ''}`;
  };

  return (
    <div className="animal-picker">
      <FormField label={searchLabel} htmlFor={`${id}-search`}>
        <div className="animal-picker-search">
          <span className="animal-picker-search-icon" aria-hidden="true"><IconSearch size={16} /></span>
          <input id={`${id}-search`} className="form-input" type="search" enterKeyHint="search" autoCorrect="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} placeholder="Código, alias o arete" />
        </div>
      </FormField>
      {value.length > 0 && (
        <ul className="animal-picker-chips" aria-label="Animales seleccionados">
          {value.map(key => (
            <li key={key}>
              <span className="animal-picker-chip">
                <span>{displayOf(key)}</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter(item => item !== key))}
                  aria-label={`Quitar ${displayOf(key)}`}
                >
                  <IconX size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <FormField label={label} htmlFor={id}>
        <select id={id} className="form-select" multiple={multiple} required={required} value={multiple ? value : value[0] ?? ''} onChange={event => onChange(Array.from(event.currentTarget.selectedOptions).map(option => option.value).filter(Boolean))}>
          {!multiple && <option value="">{emptyLabel}</option>}
          {value.filter(key => !options.some(item => optionValueOf(item) === key)).map(key => <option key={`selected-${key}`} value={key}>{key} · seleccionado</option>)}
          {options.map(item => <option key={item.id ?? item.code} value={optionValueOf(item)}>{item.code}{item.alias ? ` · ${item.alias}` : ''}{item.barnName ? ` · ${item.barnName}` : ''}</option>)}
        </select>
      </FormField>
      <small className={`animal-picker-status${busy ? ' is-busy' : ''}`} role="status">
        {busy ? (
          <><IconRefreshCw size={12} className="spinner-icon" /><span>Buscando animales…</span></>
        ) : (
          <span>{total} coincidencias{total > limit ? ' · refine la búsqueda para ver otras fichas' : ''}</span>
        )}
      </small>
      {error && (
        <p role="alert" className="animal-picker-error">
          <IconAlertCircle size={14} />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry(value => value + 1)}>
            <IconRefreshCw size={12} />
            <span>Reintentar</span>
          </button>
        </p>
      )}
      {!busy && !error && options.length === 0 && (
        <p className="animal-picker-empty">Sin coincidencias. Pruebe con otro código, alias o arete.</p>
      )}
    </div>
  );
}

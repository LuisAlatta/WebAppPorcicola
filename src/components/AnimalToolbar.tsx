import type { CSSProperties } from 'react';
import { IconBox, IconRefreshCw } from './icons';

export function AnimalToolbar({ barns, onChangeBarns, onRefresh, loading }: {
  barns: string[];
  onChangeBarns?: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return <div className="animal-context-bar">
    <div className="animal-barn-names" aria-label="Galpones seleccionados">
      {barns.map((name, index) => <span key={name} className="animal-barn-card" style={{ '--barn-hue': (index * 137.508 + 140) % 360 } as CSSProperties}>{name}</span>)}
    </div>
    {onChangeBarns && <button type="button" className="btn btn-outline btn-sm" onClick={onChangeBarns}><IconBox size={14} /><span>Cambiar galpones</span></button>}
    <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh} disabled={loading} title="Actualizar padrón de animales" aria-label="Actualizar"><IconRefreshCw size={14} className={loading ? 'spinner-icon' : ''} /><span>Actualizar</span></button>
  </div>;
}

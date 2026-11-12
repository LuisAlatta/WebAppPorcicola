import { IconRefreshCw } from '../icons';

interface BarnScopeBarProps {
  names: string[];
  onChangeBarns: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function BarnScopeBar({ names, onChangeBarns, onRefresh, refreshing }: BarnScopeBarProps) {
  return (
    <div className="barn-scope-bar">
      <span>Galpones: {names.join(', ')}</span>
      <span className="inline-flex items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Actualizar datos"
            title="Actualizar"
          >
            <IconRefreshCw size={16} className={refreshing ? 'spinner-icon' : ''} />
          </button>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={onChangeBarns}>Cambiar galpones</button>
      </span>
    </div>
  );
}
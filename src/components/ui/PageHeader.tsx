import type { ReactNode } from 'react';
import { IconRefreshCw } from '../icons';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  cutoff?: { label?: string; value: string; onChange: (value: string) => void; max?: string };
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function PageHeader({ title, subtitle, actions, cutoff, onRefresh, refreshing }: PageHeaderProps) {
  return (
    <div className="module-heading mb-4">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="module-heading-actions">
        {cutoff && (
          <label className="module-heading-cutoff">
            <span>{cutoff.label ?? 'Corte:'}</span>
            <input
              type="date"
              className="form-input form-select-sm"
              value={cutoff.value}
              max={cutoff.max}
              onChange={(event) => cutoff.onChange(event.target.value)}
              aria-label={cutoff.label ?? 'Fecha de corte'}
            />
          </label>
        )}
        {actions}
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
      </div>
    </div>
  );
}
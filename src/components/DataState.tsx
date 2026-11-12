import type { ReactNode } from 'react';
import { IconAlertCircle, IconRefreshCw } from './icons';

type DataStateProps = {
  variant: 'loading' | 'empty' | 'error';
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function DataState({ variant, title, description, icon, action, className }: DataStateProps) {
  if (variant === 'loading') {
    return (
      <div className="data-state data-state-loading" role="status" aria-live="polite">
        <p className="inline-flex items-center gap-2">
          <IconRefreshCw size={16} className="spinner-icon text-primary" />
          <span>{title}</span>
        </p>
        <div className="data-skeleton" aria-hidden="true"><div /><div /><div /></div>
      </div>
    );
  }

  const stateIcon = icon ?? <IconAlertCircle size={26} className={variant === 'error' ? 'text-danger' : 'text-primary'} />;
  return (
    <div className={`empty-state-card data-state data-state-${variant}${className ? ` ${className}` : ''}`} role={variant === 'error' ? 'alert' : 'status'} aria-live={variant === 'error' ? 'assertive' : 'polite'}>
      <div className="empty-icon-wrap" aria-hidden="true">{stateIcon}</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action && <div className="data-state-action">{action}</div>}
    </div>
  );
}

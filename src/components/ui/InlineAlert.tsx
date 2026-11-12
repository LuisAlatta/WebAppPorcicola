import { useEffect, type ReactNode } from 'react';
import { IconAlertCircle, IconAlertTriangle, IconCheck, IconX } from '../icons';

export type AlertTone = 'success' | 'error' | 'warning' | 'info';

const TONE_ICON = {
  success: IconCheck,
  error: IconAlertCircle,
  warning: IconAlertTriangle,
  info: IconAlertCircle,
} as const;

interface InlineAlertProps {
  tone: AlertTone;
  children: ReactNode;
  onDismiss?: () => void;
  autoDismissMs?: number;
  id?: string;
  className?: string;
}

export function InlineAlert({ tone, children, onDismiss, autoDismissMs, id, className }: InlineAlertProps) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return;
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onDismiss, children]);

  const Icon = TONE_ICON[tone];
  return (
    <div
      id={id}
      className={`alert alert-${tone}${className ? ` ${className}` : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={16} />
      <span className="alert-message">{children}</span>
      {onDismiss && (
        <button type="button" className="alert-dismiss" onClick={onDismiss} aria-label="Cerrar aviso">
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}
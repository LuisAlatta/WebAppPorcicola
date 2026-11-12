import type { ReactNode } from 'react';
import { IconAlertCircle } from '../icons';

export function FormField({ label, htmlFor, labelClassName, className, error, errorId, helper, helperId, children }: {
  label?: ReactNode;
  htmlFor?: string;
  labelClassName?: string;
  className?: string;
  error?: ReactNode;
  errorId?: string;
  helper?: ReactNode;
  helperId?: string;
  children: ReactNode;
}) {
  return (
    <div className={`form-group${className ? ` ${className}` : ''}`}>
      {label != null && <label className={`form-label${labelClassName ? ` ${labelClassName}` : ''}`} htmlFor={htmlFor}>{label}</label>}
      {children}
      {error && <p id={errorId} className="field-error-message" role="alert"><IconAlertCircle size={14} /><span>{error}</span></p>}
      {helper && <p id={helperId} className="form-helper">{helper}</p>}
    </div>
  );
}
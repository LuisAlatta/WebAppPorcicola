import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
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
  const generatedId = useId();
  const childNodes = Children.toArray(children);
  const control = childNodes.find(child => isValidElement(child) && ['input', 'select', 'textarea'].includes(String(child.type))) as ReactElement<{ id?: string }> | undefined;
  const controlId = htmlFor ?? control?.props.id ?? generatedId;
  const content = control && !control.props.id
    ? childNodes.map(child => child === control ? cloneElement(control, { id: controlId }) : child)
    : children;
  return (
    <div className={`form-group${className ? ` ${className}` : ''}`}>
      {label != null ? (
        <fieldset className="field-outline">
          <legend><label className={`form-label${labelClassName ? ` ${labelClassName}` : ''}`} htmlFor={controlId}>{label}</label></legend>
          <div className="field-control">{content}</div>
        </fieldset>
      ) : children}
      {error && <p id={errorId} className="field-error-message" role="alert"><IconAlertCircle size={14} /><span>{error}</span></p>}
      {helper && <p id={helperId} className="form-helper">{helper}</p>}
    </div>
  );
}

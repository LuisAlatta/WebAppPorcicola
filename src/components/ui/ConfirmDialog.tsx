import type { ReactNode } from 'react';
import { ModalDialog } from '../ModalDialog';
import { IconAlertCircle, IconAlertTriangle, IconX } from '../icons';

interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmDialog({
  title,
  description,
  children,
  confirmLabel,
  busyLabel = 'Procesando…',
  busy = false,
  confirmDisabled = false,
  tone = 'danger',
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  return (
    <ModalDialog labelledBy="confirm-dialog-title" onDismiss={onDismiss} dismissDisabled={busy}>
      <div className="modal-header">
        <span className={`modal-icon modal-icon-${tone}`} aria-hidden="true">
          {tone === 'danger' ? <IconAlertTriangle size={20} /> : <IconAlertCircle size={20} />}
        </span>
        <div className="modal-body">
          <h2 id="confirm-dialog-title">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss} disabled={busy} aria-label="Cerrar">
          <IconX size={16} />
        </button>
      </div>
      {children}
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" onClick={onDismiss} disabled={busy} data-action="back">Cancelar</button>
        <button
          type="button"
          className={tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          data-action="save"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}

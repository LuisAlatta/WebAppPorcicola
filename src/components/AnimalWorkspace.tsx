import type { ReactNode } from 'react';
import { ModalDialog } from './ModalDialog';
import { IconX } from './icons';

export function AnimalWorkspace({ modal, title, onClose, busy, children }: {
  modal: boolean;
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  if (!modal) return <>{children}</>;
  return <ModalDialog labelledBy="animal-workspace-title" onDismiss={onClose} dismissDisabled={busy} size="wide">
    <div className="animal-dialog-header">
      <h2 id="animal-workspace-title">{title}</h2>
      <button type="button" className="btn btn-outline animal-icon-button" aria-label="Cerrar ficha del animal" title="Cerrar" onClick={onClose} disabled={busy}><IconX size={20} /></button>
    </div>
    <div className="animal-dialog-body">{children}</div>
  </ModalDialog>;
}

import type { ReactNode } from 'react';
import { ModalDialog } from './ModalDialog';
import { IconX, IconRefreshCw } from './icons';

export function AnimalLoadingSkeleton() {
  return <div className="animal-loading-state" role="status" aria-live="polite">
    <p className="inline-flex items-center gap-2"><IconRefreshCw size={18} className="spinner-icon" /><span>Cargando ficha del animal…</span></p>
    <div className="animal-loading-skeleton" aria-hidden="true"><div /><div /><div /></div>
  </div>;
}

export function AnimalWorkspace({ modal, title, onClose, busy, children, loading = false }: {
  modal: boolean;
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
  loading?: boolean;
}) {
  if (!modal) return <>{children}</>;
  return <ModalDialog labelledBy="animal-workspace-title" onDismiss={onClose} dismissDisabled={busy} size="wide">
    <div className="animal-dialog-header">
      <h2 id="animal-workspace-title">{title}</h2>
      <button type="button" className="btn btn-outline animal-icon-button" aria-label="Cerrar ficha del animal" title="Cerrar" onClick={onClose} disabled={busy}><IconX size={20} /></button>
    </div>
    <div className="animal-dialog-body" aria-busy={loading}>{loading ? <AnimalLoadingSkeleton /> : children}</div>
  </ModalDialog>;
}

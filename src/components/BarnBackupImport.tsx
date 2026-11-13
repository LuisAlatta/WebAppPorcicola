import { useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { FormField } from './ui/FormField';
import type { BarnBackup } from '../utils/barnBackup';
import { errorMessage } from '../utils/format';
import { newOperationKey } from '../utils/operations';

interface Props {
  onDismiss: () => void;
  onImported: (name: string) => void;
}

export function BarnBackupImport({ onDismiss, onImported }: Props) {
  const [backup, setBackup] = useState<BarnBackup | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => newOperationKey('barn-backup-import'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFile = async (file: File | undefined) => {
    setBackup(null);
    setName('');
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const { readBackupXlsx, backupName } = await import('../utils/barnBackup');
      const parsed = await readBackupXlsx(file);
      setBackup(parsed);
      setName(backupName(parsed));
      setKey(newOperationKey('barn-backup-import'));
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo leer el respaldo.'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!backup || reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/barns/import-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup, reason: reason.trim(), operationKey: key }),
      });
      const body = await response.json() as { error?: string; name?: string };
      if (!response.ok) throw new Error(body.error ?? 'No se pudo restaurar el galpón.');
      onImported(body.name ?? name);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo confirmar la restauración. Reintente sin cambiar el archivo ni el motivo para evitar duplicados.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog labelledBy="barn-backup-import-title" onDismiss={onDismiss} dismissDisabled={busy} size="wide">
      <div className="modal-header"><h2 id="barn-backup-import-title">Restaurar galpón desde Excel</h2></div>
      <div className="modal-body">
        <p className="text-sm text-muted">Importe el Excel original descargado antes de borrar el galpón. Se restauran sus datos y todo el historial, no los cambios hechos en la hoja de consulta. No se sobrescriben galpones existentes ni registros modificados. Los usuarios y la configuración referenciados deben seguir existiendo en esta granja.</p>
        <FormField label="Respaldo Excel (.xlsx)" htmlFor="barn-backup-file">
        <input id="barn-backup-file" className="form-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => void selectFile(event.target.files?.[0])} />
        </FormField>
        {backup && <p role="status" className="text-sm">{name} · Exportado: {backup.exportedAt} · {Object.values(backup.tables).reduce((sum, rows) => sum + rows.length, 0)} registros en {Object.keys(backup.tables).length} tablas.</p>}
        <FormField label="Motivo de restauración" htmlFor="barn-backup-import-reason">
        <input id="barn-backup-import-reason" className="form-input" value={reason} minLength={5} required disabled={busy} onChange={(event) => { setReason(event.target.value); setKey(newOperationKey('barn-backup-import')); }} placeholder="Ej. recuperar el galpón eliminado por error" />
        </FormField>
        {error && <p className="text-sm" role="alert">{error}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onDismiss} data-action="back">Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={busy || !backup || reason.trim().length < 5} onClick={() => void restore()} data-action="save">{busy ? 'Procesando…' : 'Restaurar galpón e historial'}</button>
      </div>
    </ModalDialog>
  );
}

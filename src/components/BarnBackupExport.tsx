import { useState } from 'react';
import type { BarnBackup } from '../utils/barnBackup';
import { errorMessage } from '../utils/format';

interface Props {
  barnId: number;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}

export function BarnBackupExport({ barnId, disabled, onBusyChange }: Props) {
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportFile = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/barns/${barnId}/backup`);
      const body = await response.json() as BarnBackup & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'No se pudo exportar el historial del galpón.');
      const { backupXlsx, backupPdf, downloadBackup } = await import('../utils/barnBackup');
      const bytes = format === 'xlsx' ? await backupXlsx(body) : await backupPdf(body);
      downloadBackup(bytes, `respaldo-galpon-${barnId}-${body.exportedAt.slice(0, 10)}.${format}`, format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
      setMessage('Descarga iniciada. Compruebe que el archivo se guardó antes de borrar el galpón.');
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo generar el respaldo. El galpón no se ha borrado.'));
    } finally {
      setExporting(null);
      onBusyChange(false);
    }
  };

  return (
    <section className="card p-3" aria-label="Respaldar antes de borrar">
      <h3 className="text-sm">Respaldar antes de borrar (opcional)</h3>
      <p className="text-sm text-muted">Descargue todo el galpón y su historial. El Excel permite restaurarlo desde Gestión de Galpones; el PDF es solo de consulta. Guarde estos archivos en un lugar seguro.</p>
      <div className="table-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled || exporting !== null} onClick={() => void exportFile('xlsx')}>{exporting === 'xlsx' ? 'Exportando Excel…' : 'Exportar respaldo Excel'}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled || exporting !== null} onClick={() => void exportFile('pdf')}>{exporting === 'pdf' ? 'Exportando PDF…' : 'Exportar historial PDF'}</button>
      </div>
      {message && <p className="text-sm" role="status">{message}</p>}
      {error && <p className="text-sm" role="alert">{error}</p>}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { IconAlertTriangle, IconX } from './icons';
import { fetchOperation, newOperationKey } from '../utils/operations';

interface AssociationGroup {
  key: string;
  label: string;
  blocking: boolean;
  actions: string[];
  count: number;
  unit: string;
}

interface AssociationsPayload {
  barn: { id: number; code: string; name: string; status: string };
  groups: AssociationGroup[];
  blockers: { count: number; groups: string[] };
  canDelete: boolean;
}

interface BarnAssociationsModalProps {
  barn: { id: number; code: string; name: string };
  barns: { id: number; code: string; name: string }[];
  onDismiss: () => void;
  onDeleted: (barnName: string) => void;
}

const oneOrMany = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

const UNIT_SINGULAR: Record<string, string> = { cabezas: 'cabeza', fichas: 'ficha' };

const unitOf = (count: number, unit: string) => (count === 1 ? UNIT_SINGULAR[unit] ?? unit : unit);

async function loadAssociations(barnId: number): Promise<{ payload: AssociationsPayload } | { error: string }> {
  try {
    const res = await fetch(`/api/admin/barns/${barnId}/associations`);
    const body = await res.json() as AssociationsPayload & { error?: string };
    if (!res.ok) return { error: body.error ?? 'No se pudieron cargar los datos asociados' };
    return { payload: body };
  } catch {
    return { error: 'No se pudieron cargar los datos asociados. Comprueba la conexión.' };
  }
}

export function BarnAssociationsModal({ barn, barns, onDismiss, onDeleted }: BarnAssociationsModalProps) {
  const [data, setData] = useState<AssociationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [targetBarnId, setTargetBarnId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<null | 'evacuate' | 'delete'>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const wasConfirmOpenRef = useRef(false);

  useEffect(() => {
    if (confirm) {
      confirmRef.current?.focus();
      wasConfirmOpenRef.current = true;
      return;
    }
    if (wasConfirmOpenRef.current) {
      wasConfirmOpenRef.current = false;
      primaryActionRef.current?.focus();
    }
  }, [confirm]);

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      const result = await loadAssociations(barn.id);
      if (!isMounted) return;
      setLoading(false);
      if ('error' in result) {
        setErrorMsg(result.error);
        setData(null);
        return;
      }
      setData(result.payload);
    };
    void loadInitialData();
    return () => { isMounted = false; };
  }, [barn.id]);

  const target = Number(targetBarnId);
  const hasTarget = Number.isInteger(target) && target > 0;
  const hasReason = reason.trim().length >= 5;

  const runEvacuate = async () => {
    if (!hasTarget) {
      setErrorMsg('Elija el galpón destino antes de vaciar y eliminar.');
      return;
    }
    if (!hasReason) {
      setErrorMsg('Escriba el motivo (mínimo 5 caracteres) antes de aplicar la acción.');
      return;
    }
    setConfirm(null);
    setBusy('evacuate');
    setErrorMsg(null);
    try {
      const res = await fetchOperation(`/api/admin/barns/${barn.id}/evacuate-and-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationBarnId: target, reason: reason.trim(), operationKey: newOperationKey('galp') }),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) {
        setErrorMsg(payload.error ?? 'No se pudo vaciar y eliminar el galpón');
        return;
      }
      onDeleted(barn.name);
    } catch {
      setErrorMsg('No se pudo confirmar la operación. Comprueba la conexión.');
    } finally {
      setBusy(null);
    }
  };

  const removeBarn = async () => {
    setBusy('delete');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/barns/${barn.id}`, { method: 'DELETE' });
      const payload = await res.json() as { error?: string };
      if (!res.ok) {
        setErrorMsg(payload.error ?? 'No se pudo eliminar el galpón');
        setConfirm(null);
        return;
      }
      onDeleted(barn.name);
    } catch {
      setErrorMsg('No se pudo confirmar la eliminación. Comprueba la conexión.');
    } finally {
      setBusy(null);
    }
  };

  const groups = (data?.groups ?? []).filter((group) => group.count > 0);
  const blockingCount = groups.filter((group) => group.blocking).length;
  const sumOf = (items: AssociationGroup[]) => items.reduce((total, item) => total + item.count, 0);
  const livestock = groups.filter((group) => group.actions.includes('transfer'));
  const detachable = groups.filter((group) => group.blocking && group.actions.includes('detach'));
  const migratable = groups.filter(
    (group) => group.blocking && group.actions.includes('reassign') && !group.actions.includes('detach'),
  );
  const ownedByBarn = groups.filter((group) => !group.blocking && group.actions.length === 0);
  const headsLabel = livestock.map((group) => `${group.count} ${unitOf(group.count, group.unit)}`).join(' · ');
  const headsVerb = livestock.every((group) => group.count === 1) ? 'se traslada' : 'se trasladan';
  const detachCount = sumOf(detachable);
  const migrateCount = sumOf(migratable);
  const migratePhrase = oneOrMany(migrateCount, 'dato histórico', 'datos históricos');
  const migrateVerb = migrateCount === 1 ? 'pasa' : 'pasan';
  const destinationName = barns.find((item) => item.id === target)?.name ?? '';
  const missing: string[] = [];
  if (!hasTarget) missing.push('el galpón destino');
  if (!hasReason) missing.push('el motivo (mínimo 5 caracteres)');
  const showRequirements = !loading && !!data && !data.canDelete && missing.length > 0;
  const evacuateSummary = [
    headsLabel ? `${headsLabel} ${headsVerb} a ${destinationName}` : null,
    migrateCount > 0 ? `${migratePhrase} ${migrateVerb} a ese galpón` : null,
    detachCount > 0 ? `${oneOrMany(detachCount, 'traza', 'trazas')} ${detachCount === 1 ? 'queda' : 'quedan'} en el libro sin galpón` : null,
  ].filter((item): item is string => item !== null).join('; ');

  return (
    <ModalDialog labelledBy="barn-assoc-title" onDismiss={onDismiss} dismissDisabled={busy !== null} size="wide">
      <div className="barn-assoc">
        <div className="modal-header">
          <div className="modal-body">
            <h2 id="barn-assoc-title">{barn.name}</h2>
            <p className="text-sm text-muted">
              {loading
                ? 'Consultando qué registros apuntan a este galpón…'
                : data?.canDelete
                  ? 'No queda nada que impida eliminarlo.'
                  : `${blockingCount} tipo${blockingCount === 1 ? '' : 's'} de dato${blockingCount === 1 ? '' : 's'} ${blockingCount === 1 ? 'impide' : 'impiden'} eliminarlo. Se resuelven solos al vaciar el galpón.`}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss} disabled={busy !== null} aria-label="Cerrar">
            <IconX size={16} />
          </button>
        </div>

        {errorMsg && (
          <p role="alert" className="barn-assoc-alert barn-assoc-alert-danger">
            <IconAlertTriangle size={16} /> <span>{errorMsg}</span>
          </p>
        )}

        {data && groups.length === 0 && !loading && (
          <p className="text-sm">
            No hay registros asociados a este galpón. Los cambios de personal y los corrales se eliminan con él.
          </p>
        )}

        {groups.length > 0 && (
          <ul className="barn-assoc-summary">
            {livestock.map((group) => (
              <li key={group.key}>
                <strong>{group.count} {unitOf(group.count, group.unit)}</strong>
                <span>en el galpón; {group.count === 1 ? 'se traslada al destino con un movimiento real.' : 'se trasladan al destino con movimientos reales.'}</span>
              </li>
            ))}
            {migratable.length > 0 && (
              <li>
                <strong>{migratePhrase}</strong>
                <span>de {oneOrMany(migratable.length, 'tipo', 'tipos')}; {migrateVerb} {destinationName ? `a ${destinationName}` : 'al destino'}.</span>
              </li>
            )}
            {detachable.length > 0 && (
              <li>
                <strong>{oneOrMany(detachCount, 'traza', 'trazas')}</strong>
                <span>de auditoría y operaciones; {detachCount === 1 ? 'queda' : 'quedan'} en el libro sin galpón.</span>
              </li>
            )}
            {ownedByBarn.length > 0 && (
              <li className="barn-assoc-summary-muted">
                <strong>{sumOf(ownedByBarn)} datos</strong>
                <span>de personal, accesos y corrales se eliminan con el galpón.</span>
              </li>
            )}
          </ul>
        )}

        {groups.length > 0 && (
          <div className="barn-assoc-controls card p-3">
            <div>
              <label htmlFor="barn-assoc-target" className="form-label">Galpón destino</label>
              <select
                id="barn-assoc-target"
                className="form-select"
                required
                aria-describedby={showRequirements ? 'barn-assoc-requirements' : undefined}
                value={targetBarnId}
                onChange={(event) => setTargetBarnId(event.target.value === '' ? '' : Number(event.target.value))}
              >
                <option value="">Sin destino</option>
                {barns.filter((item) => item.id !== barn.id).map((item) => (
                  <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="barn-assoc-reason" className="form-label">Motivo</label>
              <input
                id="barn-assoc-reason"
                className="form-control"
                required
                minLength={5}
                aria-describedby={showRequirements ? 'barn-assoc-requirements' : undefined}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. el galpón se abrió por error y sus registros son de otro"
              />
            </div>
            {showRequirements && (
              <p id="barn-assoc-requirements" className="barn-assoc-requirements">
                <IconAlertTriangle size={14} />
                <span>Para vaciar y eliminar falta {missing.join(' y ')}.</span>
              </p>
            )}
          </div>
        )}

        <div className="barn-assoc-footer">
          {confirm === 'evacuate' ? (
            <div className="barn-assoc-confirm" ref={confirmRef} tabIndex={-1} aria-label="Confirmar vaciado y eliminación">
              <p className="text-sm">
                {evacuateSummary ? `${evacuateSummary}. ` : 'No hay registros que mover. '}
                Después se elimina <strong>{barn.name}</strong> con sus accesos, historial de personal y corrales.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => setConfirm(null)}>Volver</button>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void runEvacuate()}>
                  {busy === 'evacuate' ? 'Vaciando…' : `Sí, vaciar y eliminar ${barn.name}`}
                </button>
              </div>
            </div>
          ) : confirm === 'delete' ? (
            <div className="barn-assoc-confirm" ref={confirmRef} tabIndex={-1} aria-label="Confirmar eliminación">
              <p className="text-sm">
                Se eliminará <strong>{barn.name}</strong> con sus cambios de personal, accesos y corrales.
                La trazabilidad desvinculada se conserva en el libro de auditoría.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => setConfirm(null)}>Volver</button>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void removeBarn()}>
                  {busy === 'delete' ? 'Eliminando…' : `Sí, eliminar ${barn.name}`}
                </button>
              </div>
            </div>
          ) : (
            <div className="barn-assoc-actions">
              <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={onDismiss}>Cancelar</button>
              <div className="table-actions">
                {data?.canDelete ? (
                  <button
                    ref={primaryActionRef}
                    type="button"
                    className="btn btn-danger"
                    disabled={busy !== null || loading}
                    title="Eliminar el galpón"
                    onClick={() => setConfirm('delete')}
                  >
                    <span>Eliminar galpón</span>
                  </button>
                ) : (
                  <button
                    ref={primaryActionRef}
                    type="button"
                    className="btn btn-danger"
                    disabled={busy !== null || loading || !hasTarget || !hasReason}
                    title={!hasTarget
                      ? 'Elija el galpón destino'
                      : !hasReason
                        ? 'Escriba el motivo (mínimo 5 caracteres)'
                        : 'Traslada el ganado, resuelve el historial y elimina el galpón'}
                    onClick={() => setConfirm('evacuate')}
                  >
                    <span>Vaciar y eliminar</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

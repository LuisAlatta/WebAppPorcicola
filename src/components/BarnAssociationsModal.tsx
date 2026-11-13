import { useEffect, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { FormField } from './ui/FormField';
import { BarnBackupExport } from './BarnBackupExport';
import { IconAlertTriangle, IconX } from './icons';
import { fetchOperation, newOperationKey } from '../utils/operations';

interface AssociationRow {
  id: string;
  label: string;
  meta: string;
  date: string | null;
  quantity: string | null;
}

interface AssociationGroup {
  key: string;
  label: string;
  note: string;
  blocking: boolean;
  actions: string[];
  count: number;
  unit: string;
  rows: AssociationRow[];
  hasMore: boolean;
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

interface DetailView {
  title: string;
  groups: AssociationGroup[];
}

const oneOrMany = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

const UNIT_SINGULAR: Record<string, string> = {
  cabezas: 'cabeza',
  fichas: 'ficha',
  movimientos: 'movimiento',
  registros: 'registro',
  cambios: 'cambio',
  usuarios: 'usuario',
  corrales: 'corral',
  tipos: 'tipo',
  trazas: 'traza',
  datos: 'dato',
  ciclos: 'ciclo',
  camadas: 'camada',
  eventos: 'evento',
  turnos: 'turno',
  pesajes: 'pesaje',
  intervalos: 'intervalo',
  imputaciones: 'imputación',
  alertas: 'alerta',
  ubicaciones: 'ubicación',
  almacenes: 'almacén',
  operaciones: 'operación',
  conciliaciones: 'conciliación',
};

const unitOf = (count: number, unit: string) => (count === 1 ? UNIT_SINGULAR[unit] ?? unit : unit);

/** Grupos que el modo borrado conserva en el libro sin galpón; debe coincidir con el worker. */
const DETACHED_ON_DELETE = new Set(['financial_allocations', 'feed_warehouses', 'operations', 'audit']);

async function loadAssociations(barnId: number): Promise<{ payload: AssociationsPayload } | { error: string }> {
  try {
    const res = await fetch(`/api/admin/barns/${barnId}/associations?rows=100`);
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
  const [detail, setDetail] = useState<DetailView | null>(null);
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
        body: JSON.stringify({ destinationBarnId: hasTarget ? target : null, reason: reason.trim(), operationKey: newOperationKey('galp') }),
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
  const livestock = (data?.groups ?? []).filter((group) => group.key === 'animals');
  const animalCount = sumOf(livestock);
  const hasOperationalStock = groups.some((group) => group.key === 'stock');
  const detachable = groups.filter((group) => group.blocking && group.actions.includes('detach'));
  const migratable = groups.filter(
    (group) => group.blocking && group.actions.includes('reassign') && !group.actions.includes('detach'),
  );
  const ownedByBarn = groups.filter((group) => !group.blocking && group.actions.length === 0);
  const headsLabel = animalCount > 0 ? oneOrMany(animalCount, 'cabeza', 'cabezas') : '';
  const headsVerb = livestock.every((group) => group.count === 1) ? 'se traslada' : 'se trasladan';
  const detachCount = sumOf(detachable);
  const migrateCount = sumOf(migratable);
  const migratePhrase = oneOrMany(migrateCount, 'dato histórico', 'datos históricos');
  const migrateVerb = migrateCount === 1 ? 'pasa' : 'pasan';
  const destinationName = barns.find((item) => item.id === target)?.name ?? '';
  const deletedHistory = [...migratable, ...detachable].filter((group) => !DETACHED_ON_DELETE.has(group.key));
  const deletedHistoryCount = sumOf(deletedHistory);
  const keptWithoutBarn = groups.filter((group) => DETACHED_ON_DELETE.has(group.key));
  const keptCount = sumOf(keptWithoutBarn);
  const deleteTargets = [
    headsLabel || null,
    deletedHistoryCount > 0 ? oneOrMany(deletedHistoryCount, 'dato histórico', 'datos históricos') : null,
  ].filter((item): item is string => item !== null).join(' y ');
  const missing: string[] = [];
  if (!hasReason) missing.push('el motivo (mínimo 5 caracteres)');
  const showRequirements = !loading && !!data && !data.canDelete && missing.length > 0;
  const showDeleteWarning = !loading && !!data && !data.canDelete && !hasTarget && groups.length > 0;
  const evacuateSummary = [
    headsLabel ? `${headsLabel} ${headsVerb} a ${destinationName}` : null,
    hasOperationalStock ? 'el saldo operativo del libro también se traslada al destino' : null,
    migrateCount > 0 ? `${migratePhrase} ${migrateVerb} a ese galpón` : null,
    detachCount > 0 ? `${oneOrMany(detachCount, 'traza', 'trazas')} ${detachCount === 1 ? 'queda' : 'quedan'} en el libro sin galpón` : null,
  ].filter((item): item is string => item !== null).join('; ');
  const deleteSummary = [
    `${deleteTargets || 'Los datos del galpón'} se eliminan permanentemente y no se trasladan a otro galpón`,
    keptCount > 0 ? `${oneOrMany(keptCount, 'registro', 'registros')} de gastos, almacenes y trazas quedan en el libro sin galpón` : null,
  ].filter((item): item is string => item !== null).join('; ');
  const openDetail = (title: string, items: AssociationGroup[]) => setDetail({ title, groups: items });

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
                <button
                  type="button"
                  className="barn-assoc-link"
                  title="Ver los registros reales detrás de este conteo"
                  onClick={() => openDetail(group.label, [group])}
                >
                  <strong>{oneOrMany(group.count, 'cabeza', 'cabezas')}</strong>
                </button>
                <span>
                  en el Padrón de Animales; {group.count === 0 ? 'no hay animales registrados.' : hasTarget
                    ? (group.count === 1 ? 'se traslada al destino con un movimiento real.' : 'se trasladan al destino con movimientos reales.')
                    : 'se eliminarán permanentemente sin traslado.'}
                </span>
              </li>
            ))}
            {migratable.length > 0 && (
              <li>
                <button
                  type="button"
                  className="barn-assoc-link"
                  title="Ver los registros reales detrás de este conteo"
                  onClick={() => openDetail('Datos históricos del galpón', migratable)}
                >
                  <strong>{migratePhrase}</strong>
                </button>
                <span>de {oneOrMany(migratable.length, 'tipo', 'tipos')}; {hasTarget ? `${migrateVerb} ${destinationName ? `a ${destinationName}` : 'al destino'}.` : 'se eliminarán permanentemente.'}</span>
              </li>
            )}
            {detachable.length > 0 && (
              <li>
                <button
                  type="button"
                  className="barn-assoc-link"
                  title="Ver los registros reales detrás de este conteo"
                  onClick={() => openDetail('Trazas, gastos y almacenes vinculados', detachable)}
                >
                  <strong>{oneOrMany(detachCount, 'traza', 'trazas')}</strong>
                </button>
                <span>de auditoría y operaciones; {detachCount === 1 ? 'queda' : 'quedan'} en el libro sin galpón.</span>
              </li>
            )}
            {ownedByBarn.length > 0 && (
              <li className="barn-assoc-summary-muted">
                <button
                  type="button"
                  className="barn-assoc-link"
                  title="Ver los registros reales detrás de este conteo"
                  onClick={() => openDetail('Personal, accesos y corrales', ownedByBarn)}
                >
                  <strong>{sumOf(ownedByBarn)} datos</strong>
                </button>
                <span>de personal, accesos y corrales se eliminan con el galpón.</span>
              </li>
            )}
          </ul>
        )}

        {showDeleteWarning && (
          <p role="note" className="barn-assoc-alert barn-assoc-alert-warning">
            <IconAlertTriangle size={16} />
            <span>
              Sin galpón destino: {deleteTargets || 'los datos del galpón'} se eliminarán permanentemente, no se trasladan a otro galpón.
              {keptCount > 0 ? ` ${oneOrMany(keptCount, 'registro', 'registros')} de gastos, almacenes y trazas se conservan en el libro sin galpón.` : ''}
            </span>
          </p>
        )}

        {groups.length > 0 && (
          <div className="barn-assoc-controls card p-3">
            <FormField label="Galpón destino" htmlFor="barn-assoc-target">
              <select
                id="barn-assoc-target"
                className="form-select"
                aria-describedby={showRequirements ? 'barn-assoc-requirements' : undefined}
                value={targetBarnId}
                onChange={(event) => setTargetBarnId(event.target.value === '' ? '' : Number(event.target.value))}
              >
                <option value="">Sin destino (borrar los datos)</option>
                {barns.filter((item) => item.id !== barn.id).map((item) => (
                  <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Motivo" htmlFor="barn-assoc-reason">
              <input
                id="barn-assoc-reason"
                className="form-input"
                required
                minLength={5}
                aria-describedby={showRequirements ? 'barn-assoc-requirements' : undefined}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. el galpón se abrió por error y sus registros son de otro"
              />
            </FormField>
            {showRequirements && (
              <p id="barn-assoc-requirements" className="barn-assoc-requirements">
                <IconAlertTriangle size={14} />
                <span>Para continuar falta {missing.join(' y ')}.</span>
              </p>
            )}
          </div>
        )}

        {data && !loading && !confirm && (
          <BarnBackupExport barnId={barn.id} disabled={busy !== null} onBusyChange={(exporting) => setBusy(exporting ? 'backup' : null)} />
        )}

        <div className="barn-assoc-footer">
          {confirm === 'evacuate' ? (
            <div className="barn-assoc-confirm" ref={confirmRef} tabIndex={-1} aria-label="Confirmar vaciado y eliminación">
              <p className={`text-sm${hasTarget ? '' : ' barn-assoc-alert-danger'}`}>
                {hasTarget ? (evacuateSummary ? `${evacuateSummary}. ` : 'No hay registros que mover. ') : `${deleteSummary}. `}
                Después se elimina <strong>{barn.name}</strong> con sus accesos, historial de personal y corrales.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => setConfirm(null)}>Volver</button>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void runEvacuate()}>
                  {busy === 'evacuate' ? (hasTarget ? 'Vaciando…' : 'Eliminando…') : hasTarget ? `Sí, vaciar y eliminar ${barn.name}` : `Sí, eliminar y borrar datos de ${barn.name}`}
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
                    disabled={busy !== null || loading || !hasReason}
                    title={!hasReason
                      ? 'Escriba el motivo (mínimo 5 caracteres)'
                      : hasTarget
                        ? 'Traslada el ganado, resuelve el historial y elimina el galpón'
                        : 'Elimina el galpón y borra permanentemente sus datos, sin traslado'}
                    onClick={() => setConfirm('evacuate')}
                  >
                    <span>{hasTarget ? 'Vaciar y eliminar' : 'Eliminar sin destino'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {detail && (
          <ModalDialog labelledBy="barn-assoc-detail-title" onDismiss={() => setDetail(null)} dismissDisabled={busy !== null} size="wide">
            <div className="barn-assoc">
              <div className="modal-header">
                <div className="modal-body">
                  <h2 id="barn-assoc-detail-title">{detail.title}</h2>
                  <p className="text-sm text-muted">Registros reales detrás del conteo, en {barn.name}.</p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(null)} disabled={busy !== null} aria-label="Cerrar detalle">
                  <IconX size={16} />
                </button>
              </div>
              <div className="barn-assoc-detail">
                {detail.groups.map((group) => (
                  <section key={group.key} className="barn-assoc-detail-group">
                    <h3>{group.label} · {group.count} {unitOf(group.count, group.unit)}</h3>
                    <p className="barn-assoc-detail-note">{group.note}</p>
                    <table className="barn-assoc-detail-table">
                      <thead>
                        <tr><th>Registro</th><th>Detalle</th><th>Fecha</th><th>Cantidad</th></tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.label}</td>
                            <td>{row.meta}</td>
                            <td>{row.date ?? '—'}</td>
                            <td>{row.quantity ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {group.hasMore && (
                      <p className="barn-assoc-detail-more">Mostrando {group.rows.length} de {group.count} registros.</p>
                    )}
                  </section>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setDetail(null)} disabled={busy !== null}>Cerrar</button>
              </div>
            </div>
          </ModalDialog>
        )}
      </div>
    </ModalDialog>
  );
}

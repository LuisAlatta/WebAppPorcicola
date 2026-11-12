import { useCallback, useEffect, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { IconAlertTriangle, IconCheck, IconRefreshCw, IconX } from './icons';
import { farmToday, fetchOperation, newOperationKey } from '../utils/operations';

type AssociationAction = 'reassign' | 'detach' | 'delete' | 'transfer';

interface AssociationRow {
  id: string;
  label: string;
  meta: string;
  date: string | null;
  quantity: string | null;
  payload: Record<string, unknown> | null;
}

interface AssociationGroup {
  key: string;
  label: string;
  note: string;
  section: 'animales' | 'operacion' | 'config' | 'asociados' | 'trazabilidad';
  blocking: boolean;
  actions: AssociationAction[];
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
  onChanged: () => void;
}

const SECTION_LABEL: Record<AssociationGroup['section'], string> = {
  animales: 'Ganado del galpón',
  operacion: 'Registros de operación',
  config: 'Configuración',
  asociados: 'Personal y accesos',
  trazabilidad: 'Trazabilidad',
};

const SECTION_ORDER: AssociationGroup['section'][] = ['animales', 'operacion', 'config', 'asociados', 'trazabilidad'];

const oneOrMany = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

const UNIT_SINGULAR: Record<string, string> = { cabezas: 'cabeza', fichas: 'ficha' };

const unitOf = (count: number, unit: string) => (count === 1 ? UNIT_SINGULAR[unit] ?? unit : unit);

const ACTION_LABEL: Record<AssociationAction, string> = {
  reassign: 'Reasignar',
  detach: 'Desvincular',
  delete: 'Eliminar',
  transfer: 'Trasladar',
};

const ACTION_HINT: Record<AssociationAction, string> = {
  reassign: 'Pasar este registro al galpón destino. Cambia a qué galpón se le atribuye.',
  detach: 'Conservar el registro y dejar de atribuirlo al galpón. No se pierde información.',
  delete: 'Borrar este registro.',
  transfer: 'Mover las cabezas con un traslado real: ajusta saldos e historial de ubicación.',
};

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

export function BarnAssociationsModal({ barn, barns, onDismiss, onDeleted, onChanged }: BarnAssociationsModalProps) {
  const [data, setData] = useState<AssociationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targetBarnId, setTargetBarnId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmEvacuate, setConfirmEvacuate] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const wasConfirmOpenRef = useRef(false);

  useEffect(() => {
    const open = confirmDelete || confirmEvacuate;
    if (open) {
      confirmRef.current?.focus();
      wasConfirmOpenRef.current = true;
      return;
    }
    if (wasConfirmOpenRef.current) {
      wasConfirmOpenRef.current = false;
      primaryActionRef.current?.focus();
    }
  }, [confirmDelete, confirmEvacuate]);

  const backFromConfirm = () => {
    setConfirmDelete(false);
    setConfirmEvacuate(false);
  };

  const refresh = useCallback(async () => {
    const result = await loadAssociations(barn.id);
    setLoading(false);
    if ('error' in result) {
      setErrorMsg(result.error);
      setData(null);
      return;
    }
    setErrorMsg(null);
    setData(result.payload);
  }, [barn.id]);

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

  const runOperation = async (path: string, body: Record<string, unknown>, busyKey: string, closeOnSuccess = false): Promise<Record<string, unknown> | null> => {
    setBusy(busyKey);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await fetchOperation(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, reason: reason.trim(), operationKey: newOperationKey('galp') }),
      });
      const payload = await res.json() as Record<string, unknown> & { error?: string };
      if (!res.ok) {
        setErrorMsg(String(payload.error ?? 'No se pudo completar la acción'));
        return null;
      }
      if (closeOnSuccess) {
        onChanged();
        onDeleted(barn.name);
        return payload;
      }
      await refresh();
      onChanged();
      return payload;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const applyRow = async (group: AssociationGroup, row: AssociationRow, action: AssociationAction) => {
    const busyKey = `${group.key}:${row.id}:${action}`;
    if (!hasReason) {
      setErrorMsg('Escriba el motivo (mínimo 5 caracteres) antes de aplicar la acción.');
      return;
    }
    if ((action === 'reassign' || action === 'transfer') && !hasTarget) {
      setErrorMsg('Elija el galpón destino antes de reasignar o trasladar.');
      return;
    }

    if (action === 'transfer') {
      const payload = row.payload ?? {};
      if (group.key === 'animals') {
        const code = String(payload.code ?? row.id);
        const result = await runOperation(`/api/animals/${encodeURIComponent(code)}/transfer`, {
          destinationBarnId: target,
          effectiveDate: farmToday(),
        }, busyKey);
        if (result) setNotice(`Ficha ${code} trasladada.`);
        return;
      }
      const result = await runOperation('/api/inventory/transfers', {
        effectiveDate: farmToday(),
        sourceBarnId: barn.id,
        destinationBarnId: target,
        stageCode: String(payload.stageCode ?? ''),
        sex: String(payload.sex ?? ''),
        quantity: Number(payload.quantity ?? 0),
        sourceLocationCode: payload.locationCode ?? null,
        sourceLotCode: payload.lotCode ?? null,
        destinationLocationCode: null,
        destinationLotCode: null,
        notes: `Vaciado de ${barn.name}`,
      }, busyKey);
      if (result) setNotice(`${Number(payload.quantity ?? 0)} cabezas trasladadas desde ${barn.name}.`);
      return;
    }

    const result = await runOperation(`/api/admin/barns/${barn.id}/associations/resolve`, {
      group: group.key,
      recordId: row.id,
      action,
      targetBarnId: action === 'reassign' ? target : undefined,
    }, busyKey);
    if (result) {
      setNotice(action === 'delete'
        ? `Registro de “${group.label}” eliminado.`
        : `Registro de “${group.label}” ${action === 'detach' ? 'desvinculado del galpón' : 'reasignado'}.`);
    }
  };

  const runVacate = async (mode: 'detach' | 'reassign') => {
    if (mode === 'reassign' && !hasTarget) {
      setErrorMsg('Elija el galpón destino antes de reasignar todo.');
      return;
    }
    if (!hasReason) {
      setErrorMsg('Escriba el motivo (mínimo 5 caracteres) antes de aplicar la acción.');
      return;
    }
    const result = await runOperation(`/api/admin/barns/${barn.id}/vacate`, {
      mode,
      targetBarnId: mode === 'reassign' ? target : undefined,
    }, `vacate:${mode}`);
    if (!result) return;
    const affected = (result.affected as { label: string; count: number }[] | undefined) ?? [];
    const skipped = (result.skipped as { label: string; count: number }[] | undefined) ?? [];
    const moved = affected.map((item) => `${item.count} ${item.label.toLowerCase()}`).join(', ');
    const pending = skipped.map((item) => `${item.count} ${item.label.toLowerCase()}`).join(', ');
    setNotice(
      `${moved ? `${mode === 'detach' ? 'Desvinculado: ' : 'Reasignado: '}${moved}.` : 'No había registros que resolver.'}`
      + (pending ? ` Queda pendiente de traslado: ${pending}.` : ''),
    );
  };

  const runEvacuate = async () => {
    if (!hasTarget) {
      setErrorMsg('Elija el galpón destino antes de vaciar y eliminar.');
      return;
    }
    if (!hasReason) {
      setErrorMsg('Escriba el motivo (mínimo 5 caracteres) antes de aplicar la acción.');
      return;
    }
    setConfirmEvacuate(false);
    await runOperation(`/api/admin/barns/${barn.id}/evacuate-and-delete`, {
      destinationBarnId: target,
    }, 'evacuate', true);
  };

  const removeBarn = async () => {
    setBusy('delete');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/barns/${barn.id}`, { method: 'DELETE' });
      const payload = await res.json() as { error?: string };
      if (!res.ok) {
        setErrorMsg(payload.error ?? 'No se pudo eliminar el galpón');
        setConfirmDelete(false);
        await refresh();
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
    detachCount > 0 ? `${detachCount} trazas quedan en el libro sin galpón` : null,
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
        {notice && (
          <p role="status" className="barn-assoc-alert barn-assoc-alert-ok">
            <IconCheck size={16} /> <span>{notice}</span>
          </p>
        )}

        {data && groups.length === 0 && !loading && (
          <p className="text-sm">
            No hay registros asociados a este galpón. Los cambios de personal y los corrales se eliminan con él.
          </p>
        )}

        {!detailOpen && groups.length > 0 && (
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
                <strong>{detachCount} trazas</strong>
                <span>de auditoría y operaciones; quedan en el libro sin galpón.</span>
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
          <>
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

            {detailOpen && (
              <div className="barn-assoc-detail">
              {SECTION_ORDER.map((section) => {
                const sectionGroups = groups.filter((group) => group.section === section);
                if (sectionGroups.length === 0) return null;
                return (
                  <section key={section} className="barn-assoc-section">
                    <h3 className="barn-assoc-section-title">{SECTION_LABEL[section]}</h3>
                    {sectionGroups.map((group) => (
                      <article key={group.key} className={`barn-assoc-group${group.blocking ? ' barn-assoc-group-blocking' : ''}`}>
                        <header className="barn-assoc-head">
                          <h4>{group.label}</h4>
                          <span className={`badge badge-sm ${group.blocking ? 'badge-danger' : 'badge-outline'}`}>
                            {group.count} {group.unit}
                            {group.hasMore ? '+' : ''}
                          </span>
                        </header>
                        <p className="barn-assoc-note">{group.note}</p>
                        <div className="barn-assoc-rows table-responsive">
                          <table className="table">
                            <thead>
                              <tr>
                                <th scope="col">Fecha</th>
                                <th scope="col">Registro</th>
                                <th scope="col">Cantidad</th>
                                <th scope="col">Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.date ?? '—'}</td>
                                  <td>
                                    <div className="table-cell-stacked">
                                      <strong>{row.label}</strong>
                                      <span className="text-sm text-muted">{row.meta}</span>
                                    </div>
                                  </td>
                                  <td>{row.quantity ?? '—'}</td>
                                  <td>
                                    <div className="table-actions">
                                      {group.actions.map((action) => (
                                        <button
                                          key={action}
                                          type="button"
                                          className={`btn btn-sm ${action === 'delete' ? 'btn-ghost text-danger' : 'btn-outline'}`}
                                          title={ACTION_HINT[action]}
                                          disabled={busy !== null}
                                          onClick={() => void applyRow(group, row, action)}
                                        >
                                          {ACTION_LABEL[action]}
                                        </button>
                                      ))}
                                      {group.actions.length === 0 && <span className="text-sm text-muted">Se elimina con el galpón</span>}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </article>
                    ))}
                  </section>
                );
              })}
              </div>
            )}
          </>
        )}

        <div className="barn-assoc-footer">
          {confirmEvacuate ? (
            <div className="barn-assoc-confirm" ref={confirmRef} tabIndex={-1} aria-label="Confirmar vaciado y eliminación">
              <p className="text-sm">
                {evacuateSummary ? `${evacuateSummary}. ` : 'No hay registros que mover. '}
                Después se elimina <strong>{barn.name}</strong> con sus accesos, historial de personal y corrales.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={backFromConfirm}>Volver</button>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void runEvacuate()}>
                  {busy === 'evacuate' ? 'Vaciando…' : `Sí, vaciar y eliminar ${barn.name}`}
                </button>
              </div>
            </div>
          ) : confirmDelete ? (
            <div className="barn-assoc-confirm" ref={confirmRef} tabIndex={-1} aria-label="Confirmar eliminación">
              <p className="text-sm">
                Se eliminará <strong>{barn.name}</strong> con sus cambios de personal, accesos y corrales.
                La trazabilidad desvinculada se conserva en el libro de auditoría.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={backFromConfirm}>Volver</button>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void removeBarn()}>
                  {busy === 'delete' ? 'Eliminando…' : `Sí, eliminar ${barn.name}`}
                </button>
              </div>
            </div>
          ) : (
            <div className="barn-assoc-actions">
              <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={onDismiss}>Cancelar</button>
              <div className="table-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy !== null}
                  aria-expanded={detailOpen}
                  onClick={() => setDetailOpen(!detailOpen)}
                >
                  <span>{detailOpen ? 'Ocultar detalle' : 'Ver detalle'}</span>
                </button>
                {detailOpen && (
                  <>
                    <button type="button" className="btn btn-outline" disabled={busy !== null || loading} onClick={() => void refresh()}>
                      <IconRefreshCw size={14} /><span>Actualizar</span>
                    </button>
                    <button type="button" className="btn btn-outline" disabled={busy !== null || !hasReason} onClick={() => void runVacate('detach')}>
                      <span>Desvincular trazas</span>
                    </button>
                    <button type="button" className="btn btn-outline" disabled={busy !== null || !hasReason || !hasTarget} onClick={() => void runVacate('reassign')}>
                      <span>Reasignar al destino</span>
                    </button>
                  </>
                )}
                {data?.canDelete ? (
                  <button
                    ref={primaryActionRef}
                    type="button"
                    className="btn btn-danger"
                    disabled={busy !== null || loading}
                    title="Eliminar el galpón"
                    onClick={() => setConfirmDelete(true)}
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
                    onClick={() => setConfirmEvacuate(true)}
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

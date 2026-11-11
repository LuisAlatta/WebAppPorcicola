import {useEffect,useRef,useState} from 'react';
import {ModalDialog} from './ModalDialog';
import {activateWaitingWorker, observeWaitingWorker} from '../utils/pwaUpdate';
import {IconDownload, IconRefreshCw, IconX, IconAlertCircle} from './icons';
import {
  PWA_INSTALL_READY_EVENT,
  PWA_INSTALLED_EVENT,
  type InstallPrompt,
} from '../utils/pwa';

export function PwaControls() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const updatingRef = useRef(false);
  const updateButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault();
      window.__pwaInstallPrompt = event as InstallPrompt;
      window.dispatchEvent(new CustomEvent(PWA_INSTALL_READY_EVENT));
    };
    const installed = () => {
      window.__pwaInstallPrompt = null;
      window.dispatchEvent(new CustomEvent(PWA_INSTALLED_EVENT));
    };
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);

    let registration: ServiceWorkerRegistration | undefined;
    let stopObserving: (() => void) | undefined;
    let cancelled = false;
    if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((result) => {
        if (cancelled) return;
        registration = result;
        stopObserving = observeWaitingWorker(result, navigator.serviceWorker, (worker) => {
          setWaiting(worker);
          if (!worker) setConfirmUpdate(false);
        });
      }).catch(() => undefined);
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      stopObserving?.();
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const performUpdate = async () => {
    if (!waiting || updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    setUpdateError('');
    setConfirmUpdate(false);
    try {
      await activateWaitingWorker(waiting, navigator.serviceWorker);
      window.location.reload();
    } catch {
      setUpdateError('No se pudo completar la actualización. Inténtalo de nuevo.');
      updatingRef.current = false;
      setUpdating(false);
    }
  };

  const dismissUpdate = () => {
    setConfirmUpdate(false);
    window.requestAnimationFrame(() => updateButtonRef.current?.focus());
  };

  if (!waiting && !updating && !updateError) return null;

  return (
    <>
      {!confirmUpdate && (
        <aside aria-label="Actualización disponible" className="pwa-update-toast">
          <span className="pwa-update-icon" aria-hidden="true">{updateError ? <IconAlertCircle size={22} /> : <IconRefreshCw size={22} className={updating ? 'spinner-icon' : ''} />}</span>
          <div className="pwa-update-copy" role="status"><strong>{updating ? 'Actualizando aplicación…' : updateError ? 'Actualización pendiente' : 'Nueva versión disponible'}</strong><span>{updateError || (updating ? 'Espera mientras se carga la nueva versión.' : 'Guarda tus formularios antes de actualizar.')}</span></div>
          <button
            ref={updateButtonRef}
            type="button"
            disabled={updating || !waiting}
            className="btn btn-primary inline-flex items-center justify-center gap-2"
            onClick={() => setConfirmUpdate(true)}
          >
            <IconDownload size={16} /><span>{updating ? 'Actualizando…' : 'Actualizar'}</span>
          </button>
        </aside>
      )}

      {confirmUpdate && (
        <ModalDialog labelledBy="pwa-update-dialog-title" onDismiss={dismissUpdate}>
          <h4 id="pwa-update-dialog-title" className="text-lg font-bold mb-2">Actualizar Aplicación</h4>
          <p className="text-sm text-muted mb-4">
            La actualización recargará la página para cargar la versión más reciente. Guarda tus formularios pendientes antes de continuar. ¿Deseas recargar ahora?
          </p>
          <div className="form-actions form-actions-sticky pwa-dialog-actions">
            <button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" onClick={dismissUpdate}><IconX size={16} /><span>Más tarde</span></button>
            <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" onClick={performUpdate}><IconRefreshCw size={16} /><span>Actualizar ahora</span></button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}

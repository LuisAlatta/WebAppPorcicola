import {useEffect,useRef,useState} from 'react';
import {ModalDialog} from './ModalDialog';

declare global {
  interface Window {
    __pwaInstallPrompt?: InstallPrompt | null;
  }
}

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaControls() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const updateButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault();
      window.__pwaInstallPrompt = event as InstallPrompt;
      window.dispatchEvent(new CustomEvent('pwa-install-ready'));
    };
    const installed = () => {
      window.__pwaInstallPrompt = null;
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    };
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);

    let registration: ServiceWorkerRegistration | undefined;
    let cancelled = false;
    const check = () => {
      if (registration?.waiting) setWaiting(registration.waiting);
    };
    if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((result) => {
        if (cancelled) return;
        registration = result;
        check();
        result.addEventListener('updatefound', () => {
          result.installing?.addEventListener('statechange', check);
        });
      }).catch(() => undefined);
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const performUpdate = () => {
    if (!waiting) return;
    setConfirmUpdate(false);
    let refreshed = false;
    const reload = () => {
      if (!refreshed) {
        refreshed = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waiting.addEventListener('statechange', () => {
      if (waiting.state === 'activated') reload();
    });
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  };

  const dismissUpdate = () => {
    setConfirmUpdate(false);
    window.requestAnimationFrame(() => updateButtonRef.current?.focus());
  };

  if (!waiting) return null;

  return (
    <>
      {!confirmUpdate && (
        <aside aria-label="Actualización disponible" className="pwa-update-toast">
          <span className="text-xs font-semibold">Nueva versión disponible</span>
          <button
            ref={updateButtonRef}
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setConfirmUpdate(true)}
            style={{ minHeight: '32px', padding: '0.25rem 0.65rem' }}
          >
            Actualizar
          </button>
        </aside>
      )}

      {confirmUpdate && (
        <ModalDialog labelledBy="pwa-update-dialog-title" onDismiss={dismissUpdate}>
          <h4 id="pwa-update-dialog-title" className="text-lg font-bold mb-2">Actualizar Aplicación</h4>
          <p className="text-sm text-muted mb-4">
            La actualización recargará la página para cargar la versión más reciente. Guarda tus formularios pendientes antes de continuar. ¿Deseas recargar ahora?
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={dismissUpdate}>Más tarde</button>
            <button type="button" className="btn btn-primary" onClick={performUpdate}>Actualizar ahora</button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}

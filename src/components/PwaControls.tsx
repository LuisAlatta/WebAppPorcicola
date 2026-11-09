import {useEffect,useRef,useState} from 'react';
import {ModalDialog} from './ModalDialog';
import {IconDownload, IconX} from './icons';

declare global {
  interface Window {
    __pwaInstallPrompt?: InstallPrompt | null;
  }
}

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_DISMISS_KEY = 'pwa-install-dismissed';
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const INSTALL_SHOW_DELAY_MS = 2000;

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return navigatorStandalone
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches;
}

function isInstallDismissed() {
  try {
    const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < INSTALL_DISMISS_MS;
  } catch {
    return false;
  }
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function PwaControls() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [manualInstall, setManualInstall] = useState(false);
  const updateButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let showTimer: number | undefined;
    const prompt = (event: Event) => {
      event.preventDefault();
      const installEvent = event as InstallPrompt;
      window.__pwaInstallPrompt = installEvent;
      setInstallPrompt(installEvent);
      setManualInstall(false);
      if (!isStandaloneMode() && !isInstallDismissed()) setShowInstall(true);
      window.dispatchEvent(new CustomEvent('pwa-install-ready'));
    };
    const installed = () => {
      window.__pwaInstallPrompt = null;
      setInstallPrompt(null);
      setShowInstall(false);
      setManualInstall(false);
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    };
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);

    if (isIosDevice() && !isStandaloneMode() && !isInstallDismissed()) {
      showTimer = window.setTimeout(() => {
        setManualInstall(true);
        setShowInstall(true);
      }, INSTALL_SHOW_DELAY_MS);
    }

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
      if (showTimer !== undefined) window.clearTimeout(showTimer);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = installPrompt ?? window.__pwaInstallPrompt ?? null;
    if (!prompt) {
      setShowInstall(false);
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Ignorar errores del navegador al mostrar el diálogo de instalación
    } finally {
      window.__pwaInstallPrompt = null;
      setInstallPrompt(null);
      setShowInstall(false);
      setManualInstall(false);
      try {
        localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
      } catch {
        // Almacenamiento no disponible
      }
    }
  };

  const dismissInstall = () => {
    setShowInstall(false);
    setManualInstall(false);
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      // Almacenamiento no disponible
    }
  };

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

  if (!waiting && !showInstall) return null;

  return (
    <>
      {showInstall && (
        <aside
          aria-label="Instalar aplicación"
          className={waiting ? 'pwa-install-card with-update' : 'pwa-install-card'}
        >
          <span className="pwa-install-icon" aria-hidden="true">
            <IconDownload size={18} />
          </span>
          <div className="pwa-install-text">
            <strong>Instalar aplicación</strong>
            <span>
              {manualInstall
                ? 'Toca Compartir y elige «Añadir a pantalla de inicio».'
                : 'Acceso directo y uso sin conexión.'}
            </span>
          </div>
          {!manualInstall && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleInstall}
              style={{ minHeight: '32px', padding: '0.25rem 0.75rem' }}
            >
              Instalar
            </button>
          )}
          <button type="button" className="pwa-install-close" onClick={dismissInstall} aria-label="Cerrar aviso de instalación">
            <IconX size={16} />
          </button>
        </aside>
      )}

      {!confirmUpdate && waiting && (
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

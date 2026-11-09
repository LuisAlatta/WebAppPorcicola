import {useEffect,useState} from 'react';
import {ModalDialog} from './ModalDialog';
import {IconDownload} from './icons';
import {
  PWA_INSTALL_READY_EVENT,
  PWA_INSTALLED_EVENT,
  isIosDevice,
  isSafariBrowser,
  isStandaloneMode,
  type InstallPrompt,
} from '../utils/pwa';

type InstallHelp = 'ios' | 'safari' | 'generic';

const HELP_TEXT: Record<InstallHelp, string> = {
  ios: 'Toca el botón Compartir del navegador y elige «Añadir a pantalla de inicio». Después abre Mi Granja PRO desde el icono nuevo.',
  safari: 'En Safari, abre el menú Archivo y elige «Añadir al Dock». También puedes usar Compartir y «Añadir a pantalla de inicio».',
  generic: 'Abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».',
};

export function PwaInstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(
    () => (typeof window === 'undefined' ? null : window.__pwaInstallPrompt ?? null),
  );
  const [standalone, setStandalone] = useState<boolean>(isStandaloneMode);
  const [installed, setInstalled] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [help, setHelp] = useState<InstallHelp | null>(null);

  useEffect(() => {
    const sync = () => setPrompt(window.__pwaInstallPrompt ?? null);
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener(PWA_INSTALL_READY_EVENT, sync);
    window.addEventListener(PWA_INSTALLED_EVENT, onInstalled);

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayMode = () => setStandalone(isStandaloneMode());
    media.addEventListener?.('change', onDisplayMode);

    return () => {
      window.removeEventListener(PWA_INSTALL_READY_EVENT, sync);
      window.removeEventListener(PWA_INSTALLED_EVENT, onInstalled);
      media.removeEventListener?.('change', onDisplayMode);
    };
  }, []);

  const ios = isIosDevice();
  const safari = !ios && isSafariBrowser();

  if (standalone || installed) return null;
  if (!prompt && !ios && !safari && !fallback) return null;

  const handleInstall = async () => {
    if (!prompt) {
      setHelp(ios ? 'ios' : safari ? 'safari' : 'generic');
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome !== 'accepted') setFallback(true);
    } catch {
      setFallback(true);
    } finally {
      window.__pwaInstallPrompt = null;
      setPrompt(null);
    }
  };

  return (
    <>
      <div className="login-install-wrap">
        <button type="button" className="btn-install-app" onClick={handleInstall}>
          <IconDownload size={16} />
          <span>Instalar aplicación</span>
        </button>
      </div>

      {help && (
        <ModalDialog labelledBy="pwa-install-help-title" onDismiss={() => setHelp(null)}>
          <h4 id="pwa-install-help-title" className="text-lg font-bold mb-2">Instalar Mi Granja PRO</h4>
          <p className="text-sm text-muted mb-4">{HELP_TEXT[help]}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setHelp(null)}>Entendido</button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}

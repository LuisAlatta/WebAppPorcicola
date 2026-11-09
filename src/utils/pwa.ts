export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __pwaInstallPrompt?: InstallPrompt | null;
  }
}

export const PWA_INSTALL_READY_EVENT = 'pwa-install-ready';
export const PWA_INSTALLED_EVENT = 'pwa-installed';

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return navigatorStandalone
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches;
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|edg|crios|fxios|opr/i.test(ua);
}

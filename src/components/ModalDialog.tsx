import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let openDialogs = 0;
let previousBodyOverflow = '';
let rootWasInert = false;

type ModalDialogProps = {
  labelledBy: string;
  onDismiss: () => void;
  dismissDisabled?: boolean;
  children: ReactNode;
  size?: 'default' | 'wide';
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function ModalDialog({ labelledBy, onDismiss, dismissDisabled = false, children, size = 'default' }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    if (openDialogs++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const root = document.getElementById('root');
      rootWasInert = root?.hasAttribute('inert') ?? false;
      root?.setAttribute('inert', '');
    }
    const previousFocus = previousFocusRef.current;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    return () => {
      if (--openDialogs === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (!rootWasInert) document.getElementById('root')?.removeAttribute('inert');
      }
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
        return;
      }

      const remainingDialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const parentDialog = remainingDialogs[remainingDialogs.length - 1];
      const fallback = parentDialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? parentDialog ?? document.querySelector<HTMLElement>(
        '[data-modal-focus-fallback], .module-heading h1, main h1, main',
      ) ?? document.body;
      if (!fallback.hasAttribute('tabindex')) fallback.tabIndex = -1;
      fallback.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
    if (event.key === 'Escape' && !dismissDisabled) {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (activeIndex < 0) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
      return;
    }

    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0].focus();
    }
  };

  return createPortal(
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className={`modal-content card p-4${size === 'wide' ? ' modal-content-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

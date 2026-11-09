import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

type ModalDialogProps = {
  labelledBy: string;
  onDismiss: () => void;
  dismissDisabled?: boolean;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function ModalDialog({ labelledBy, onDismiss, dismissDisabled = false, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    return () => {
      if (previousFocus?.isConnected) {
        previousFocus.focus();
        return;
      }

      const fallback = document.querySelector<HTMLElement>(
        '[data-modal-focus-fallback], .module-heading h1, main h1, main',
      ) ?? document.body;
      if (!fallback.hasAttribute('tabindex')) fallback.tabIndex = -1;
      fallback.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !dismissDisabled) {
      event.preventDefault();
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

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal-content card p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

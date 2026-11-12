import type { ReactNode } from 'react';

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function IconButton({ label, onClick, disabled, className, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
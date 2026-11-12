import type { ReactNode } from 'react';
import { IconX } from '../icons';

export function FilterChipRow({ children }: { children: ReactNode }) {
  return <div className="filter-chip-row">{children}</div>;
}

export function FilterChip({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel?: string }) {
  return (
    <button type="button" className="filter-chip" onClick={onRemove} aria-label={removeLabel ?? `Quitar filtro: ${label}`} title="Quitar filtro">
      <span>{label}</span>
      <IconX size={12} />
    </button>
  );
}
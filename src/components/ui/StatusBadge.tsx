import type { ReactNode } from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'outline';

interface StatusBadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function StatusBadge({ tone = 'outline', className, children }: StatusBadgeProps) {
  return <span className={`badge-status badge-${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}
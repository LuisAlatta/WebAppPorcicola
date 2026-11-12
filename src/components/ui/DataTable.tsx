import type { ReactNode } from 'react';

export function DataTable({ label, className, children }: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`table-responsive${className ? ` ${className}` : ''}`}>
      <table className="data-table" aria-label={label}>{children}</table>
    </div>
  );
}
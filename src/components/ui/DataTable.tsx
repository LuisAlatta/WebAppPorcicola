import type { ReactNode } from 'react';

export function DataTable({ label, className, heading, children }: {
  label?: string;
  className?: string;
  heading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`table-responsive${className ? ` ${className}` : ''}`}>
      {heading}
      <table className="data-table" aria-label={label}>{children}</table>
    </div>
  );
}
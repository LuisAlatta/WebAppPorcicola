import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  focal?: boolean;
  className?: string;
}

export function KpiCard({ label, value, detail, icon, focal = false, className }: KpiCardProps) {
  return (
    <div className={`kpi-card${focal ? ' kpi-focal' : ''}${className ? ` ${className}` : ''}`}>
      <span className="kpi-label inline-flex items-center gap-1.5 leading-none">
        {icon}
        <span>{label}</span>
      </span>
      <span className={`kpi-value font-numeric tabular-nums${focal ? ' text-primary' : ''}`}>{value}</span>
      {detail && <span className="kpi-detail">{detail}</span>}
    </div>
  );
}
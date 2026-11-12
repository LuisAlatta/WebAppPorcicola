import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, actions, className, children }: SectionCardProps) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      <div className="card-header-clean mb-2 flex-wrap gap-2">
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle && <span className="text-xs text-muted block mt-0.5">{subtitle}</span>}
        </div>
        {actions && <div className="inline-flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
import type { ReactNode } from 'react';

export function DataCardList({ label, grid = false, children }: { label: string; grid?: boolean; children: ReactNode }) {
  return <ul className={`data-card-list${grid ? ' data-card-grid' : ''}`} aria-label={label}>{children}</ul>;
}

export function DataCard({ state, total = false, className, children }: { state?: string; total?: boolean; className?: string; children: ReactNode }) {
  return (
    <li>
      <article className={`data-card${total ? ' data-card-total' : ''}${className ? ` ${className}` : ''}`} data-state={state}>
        {children}
      </article>
    </li>
  );
}

export function DataCardHead({ title, subtitle, badge, children }: { title: ReactNode; subtitle?: ReactNode; badge?: ReactNode; children?: ReactNode }) {
  return (
    <header className="data-card-head">
      <div className="data-card-identity">
        <span className="data-card-title">{title}</span>
        {subtitle && <span className="data-card-subtitle">{subtitle}</span>}
      </div>
      {badge}
      {children}
    </header>
  );
}

export function DataCardMeta({ items, className }: { items: { label: string; value: ReactNode; className?: string }[]; className?: string }) {
  return (
    <dl className={`data-card-meta${className ? ` ${className}` : ''}`}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.className}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataCardNote({ children }: { children: ReactNode }) {
  return <p className="data-card-note">{children}</p>;
}

export function DataCardActions({ children }: { children: ReactNode }) {
  return <div className="data-card-actions">{children}</div>;
}
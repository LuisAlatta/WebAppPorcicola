import type { CSSProperties, ReactNode } from 'react';

export type ModuleTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
  ariaLabel?: string;
};

export function ModuleTabs<T extends string>({ tabs, active, onChange, label, columns }: {
  tabs: ModuleTab[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  columns?: number;
}) {
  const style = columns ? ({ '--module-tabs-columns': String(columns) } as CSSProperties) : undefined;
  return (
    <div className="module-tabs" role="tablist" aria-label={label} style={style}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={tab.ariaLabel}
            className={`module-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(tab.id as T)}
            disabled={tab.disabled}
          >
            {tab.icon}
            <span className="module-tab-label">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="module-tab-count tabular-nums font-numeric">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

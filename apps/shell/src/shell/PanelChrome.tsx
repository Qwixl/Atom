import type { ReactNode } from "react";

type PanelSectionHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PanelSectionHeader({ title, subtitle, eyebrow, actions }: PanelSectionHeaderProps) {
  return (
    <header className="panel-chrome-header">
      <div className="panel-chrome-header-copy">
        {eyebrow ? <p className="panel-chrome-eyebrow">{eyebrow}</p> : null}
        <h1 className="panel-chrome-title">{title}</h1>
        {subtitle ? <p className="panel-chrome-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="panel-chrome-header-actions">{actions}</div> : null}
    </header>
  );
}

export type PanelFilterOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type PanelFilterPillsProps<T extends string> = {
  value: T;
  options: PanelFilterOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
};

export function PanelFilterPills<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: PanelFilterPillsProps<T>) {
  return (
    <div className="panel-filter-bar" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            className={`panel-filter-pill${selected ? " is-active" : ""}`}
            aria-selected={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count != null ? (
              <span className="panel-filter-pill-count" aria-hidden="true">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type PanelCarouselProps = {
  label?: string;
  children: ReactNode;
  className?: string;
};

export function PanelCarousel({ label, children, className }: PanelCarouselProps) {
  return (
    <section className={className ? `panel-carousel ${className}` : "panel-carousel"}>
      {label ? <h2 className="panel-carousel-label">{label}</h2> : null}
      <div className="panel-carousel-track" tabIndex={0}>
        {children}
      </div>
    </section>
  );
}

type PanelCarouselCardProps = {
  title: string;
  description?: string;
  onClick?: () => void;
  icon?: ReactNode;
};

export function PanelCarouselCard({ title, description, onClick, icon }: PanelCarouselCardProps) {
  return (
    <button type="button" className="panel-carousel-card" onClick={onClick}>
      {icon ? <span className="panel-carousel-card-icon" aria-hidden="true">{icon}</span> : null}
      <span className="panel-carousel-card-title">{title}</span>
      {description ? <span className="panel-carousel-card-desc">{description}</span> : null}
    </button>
  );
}

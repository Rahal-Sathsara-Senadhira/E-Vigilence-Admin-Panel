import React from "react";
import { X, BadgeCheck, CircleDashed, PowerOff } from "lucide-react";

// Theme-token dialog (the shared ui/Modal predates the tokens).
export function Dialog({ open, onClose, title, subtitle, children, footer, wide = false }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl ${
          wide ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, required, hint, error, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-st-rejected">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-st-rejected">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

// Number tile; `tone` colours the number when it needs attention.
export function StatTile({ label, value, tone = "ink", hint }) {
  const color = { ink: "text-ink", attention: "text-attention-ink", danger: "text-st-rejected", good: "text-st-verified" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value ?? "—"}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// Verified / unverified / inactive / grade pills for a station.
export function StationPills({ station, size = "sm" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {station.isActive === false ? (
        <span className={`inline-flex items-center gap-1 rounded-full bg-raised font-semibold text-muted ${pad}`}>
          <PowerOff className="h-3 w-3" /> Inactive
        </span>
      ) : null}
      {station.verified ? (
        <span className={`inline-flex items-center gap-1 rounded-full bg-st-verified/10 font-semibold text-st-verified ${pad}`}>
          <BadgeCheck className="h-3 w-3" /> Verified
        </span>
      ) : (
        <span className={`inline-flex items-center gap-1 rounded-full bg-attention/15 font-semibold text-attention-ink ${pad}`}>
          <CircleDashed className="h-3 w-3" /> Unverified
        </span>
      )}
      {station.grade ? (
        <span className={`rounded-full border border-line font-semibold text-muted ${pad}`}>Grade {station.grade}</span>
      ) : null}
    </span>
  );
}

// A number that turns orange/red when above zero (workload columns).
export function Count({ n, tone = "attention" }) {
  if (!n) return <span className="tabular-nums text-muted">0</span>;
  const color = tone === "danger" ? "bg-st-rejected/10 text-st-rejected" : "bg-attention/15 text-attention-ink";
  return <span className={`inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>{n}</span>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.icon ? <t.icon className="h-4 w-4" /> : null}
            {t.label}
            {typeof t.count === "number" ? (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-primary/10" : "bg-raised"}`}>{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

import React from "react";
import { CheckCircle2 } from "lucide-react";

// Small, theme-token-based building blocks for the New Complaint form.

// Numbered card for one part of the form; shows a green check once complete.
export function FormSection({ id, step, title, subtitle, complete, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6"
    >
      <header className="mb-5 flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            complete ? "bg-st-verified text-white" : "bg-primary/10 text-primary"
          }`}
          aria-hidden="true"
        >
          {complete ? <CheckCircle2 className="h-5 w-5" /> : step}
        </span>
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Field({ label, htmlFor, required, hint, error, children, className = "" }) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
          {required ? <span className="ml-0.5 text-st-rejected">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-st-rejected" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

// Segmented choice (radio group) — big targets, no dropdown to open.
export function Segmented({ name, value, onChange, options, error }) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${error ? "rounded-xl ring-2 ring-st-rejected/30" : ""}`}
    >
      {options.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active
                ? "border-primary bg-primary text-white"
                : "border-line bg-surface text-ink hover:border-primary/50 hover:bg-raised"
            }`}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({ id, checked, onChange, label, description }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line accent-[rgb(var(--primary))]"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

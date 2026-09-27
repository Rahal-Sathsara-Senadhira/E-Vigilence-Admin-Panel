import React from "react";

// Shared form field chrome — Label, Input, Select, Textarea — replacing the
// near-identical Field/Label/SelectField trio that used to be redefined in
// Users.jsx, RegionalStations.jsx, and Settings.jsx independently.

export function Label({ children }) {
  return (
    <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
      {children}
    </span>
  );
}

const fieldClasses =
  "w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-brand-blue focus:outline-none disabled:opacity-60";

export function Input({ label, className = "", ...props }) {
  return (
    <label className="block">
      {label && <Label>{label}</Label>}
      <input className={[fieldClasses, className].filter(Boolean).join(" ")} {...props} />
    </label>
  );
}

export function Textarea({ label, className = "", ...props }) {
  return (
    <label className="block">
      {label && <Label>{label}</Label>}
      <textarea className={[fieldClasses, className].filter(Boolean).join(" ")} {...props} />
    </label>
  );
}

export function Select({ label, children, className = "", ...props }) {
  return (
    <label className="block">
      {label && <Label>{label}</Label>}
      <select className={[fieldClasses, className].filter(Boolean).join(" ")} {...props}>
        {children}
      </select>
    </label>
  );
}

// Read-only display, styled distinctly from an editable Input so it never
// looks clickable (Settings > Profile's Role field, etc.)
export function ReadOnlyField({ label, value }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-200">
        {value}
      </div>
    </div>
  );
}

// Shared styling + small helpers for the police station / division pages
// (theme tokens from src/index.css).

const fieldBase =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

// Full-width form field, and an inline variant for toolbars (filters).
export const fieldClass = `${fieldBase} w-full`;
export const inlineFieldClass = `${fieldBase} w-auto`;

export const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";

export const btnSecondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60";

export const btnDanger =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-st-rejected px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";

export const GRADES = ["A1", "A2", "A3", "B", "C", "D"];

export const SLA_TEXT = {
  unacknowledged: "Not accepted within 24 hours",
  overdue: "No action within 72 hours",
};

export function formatPhone(e164) {
  if (!e164) return "";
  const n = e164.replace("+94", "0");
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

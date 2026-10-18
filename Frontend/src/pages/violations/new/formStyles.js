// Shared input styling for the New Complaint form (theme tokens).

export const inputClass =
  "h-11 w-full rounded-xl border bg-surface px-3 text-sm text-ink placeholder:text-muted transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export function inputState(error) {
  return error
    ? "border-st-rejected focus:border-st-rejected focus:ring-st-rejected/20"
    : "border-line focus:border-primary focus:ring-primary/20";
}

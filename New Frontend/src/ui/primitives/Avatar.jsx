import { cn } from "../cn.js";

/** Initials from a name: "Demo Officer Kandy" → "DK". @param {string} name */
function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** @param {{ name: string, className?: string }} props */
export function Avatar({ name, className }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-action-soft text-xs font-semibold text-action",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

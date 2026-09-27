import React from "react";

// General-purpose chip (roles, counts, generic tags) — replaces Users.jsx's
// local Pill. Violation status keeps its own StatusBadge/getStatusMeta
// (components/StatusBadge.jsx) since that's already a working, dedicated
// mapping — this is for everything else.
const TONES = {
  neutral:
    "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200",
  blue:
    "border-blue-300 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  green:
    "border-green-300 dark:border-green-700/60 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  red:
    "border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  amber:
    "border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
};

export default function Badge({ tone = "neutral", children, className = "" }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-lg border px-2 py-1 text-xs font-semibold",
        TONES[tone] || TONES.neutral,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

import React from "react";

// One button component instead of the primary/secondary/danger classes being
// copy-pasted (and drifting slightly) in every page file. Standardizes on
// brand.blue for the primary action in both themes — the old pattern used
// bg-slate-800 in light mode and dark:bg-brand-blue in dark mode, which was
// an unnecessary second "primary" color.
const VARIANTS = {
  primary:
    "border border-transparent bg-brand-blue text-white hover:bg-blue-700",
  secondary:
    "border border-slate-300 dark:border-slate-600 bg-transparent text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
  ghost:
    "border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-950",
  danger:
    "border border-red-300 dark:border-red-700/50 bg-red-50 dark:bg-red-600/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-600/30",
};

export default function Button({
  variant = "primary",
  icon: Icon,
  iconOnly = false,
  className = "",
  children,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const sizing = iconOnly ? "p-2" : "px-4 py-2";

  return (
    <button
      className={[base, sizing, VARIANTS[variant], className].filter(Boolean).join(" ")}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

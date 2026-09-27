import React from "react";
import { Loader2 } from "lucide-react";

// Replaces the plain "Loading…" / "No X found." text that was copy-pasted,
// slightly differently styled, into nearly every page.

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-slate-600 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && <Icon className="mb-1 h-8 w-8 text-slate-400" />}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-slate-500">{description}</p>
      )}
      {action}
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div className="rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-200">
      {message}
    </div>
  );
}

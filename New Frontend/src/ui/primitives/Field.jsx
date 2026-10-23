// A labelled form field: label above, hint or error below (docs/18 §7).
// Labels are always visible — never placeholder-only.

import { useId } from "react";
import { cn } from "../cn.js";

/**
 * @param {{
 *   label: import("react").ReactNode,
 *   hint?: import("react").ReactNode,
 *   error?: string,
 *   action?: import("react").ReactNode,
 *   className?: string,
 *   children: (props: { id: string, "aria-describedby"?: string, invalid: boolean }) => import("react").ReactNode,
 * }} props
 */
export function Field({ label, hint, error, action, className, children }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {action}
      </div>
      {children({ id, "aria-describedby": describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

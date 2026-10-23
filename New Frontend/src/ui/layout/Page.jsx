// Page header: title, one-line description, actions on the right (docs/18 §7).

import { cn } from "../cn.js";

/**
 * @param {{
 *   title: string,
 *   description?: import("react").ReactNode,
 *   actions?: import("react").ReactNode,
 *   children?: import("react").ReactNode,
 *   className?: string,
 * }} props
 */
export function Page({ title, description, actions, children, className }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8", className)}>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
          {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/**
 * A white panel with an optional header.
 * @param {{ title?: string, description?: string, actions?: import("react").ReactNode, children: import("react").ReactNode, className?: string }} props
 */
export function Panel({ title, description, actions, children, className }) {
  return (
    <section className={cn("rounded-xl border border-border bg-panel", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-text">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

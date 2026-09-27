import React from "react";

// The one canonical card style for the app — lighter border + soft shadow
// instead of the heavy `border-slate-400` outline used ad hoc everywhere
// before. Extracted from Dashboard.jsx's Card/Kpi, which already looked the
// most polished of the ~4 card styles that existed across the app.
export default function Card({
  title,
  subtitle,
  action,
  children,
  interactive = false,
  className = "",
  bodyClassName = "",
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
        "shadow-sm dark:shadow-none p-4 sm:p-6",
        interactive &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-blue/30 dark:hover:border-brand-blue/50 cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && (
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</p>
            )}
            {subtitle && (
              <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

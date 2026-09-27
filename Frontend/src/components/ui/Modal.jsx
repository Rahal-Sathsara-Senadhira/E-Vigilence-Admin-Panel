import React from "react";

// Replaces Users.jsx's local Modal, which hardcoded a dark card
// (bg-slate-900) while its own contents used light/dark-paired text classes
// — invisible in light mode. This version is properly themed so any content
// dropped into it (Field/Label/etc.) just works in both themes.
export default function Modal({ open = true, onClose, title, children, maxWidth = "max-w-2xl" }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <div
        className={[
          "w-full rounded-2xl border border-slate-200 dark:border-slate-700",
          "bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xl",
          maxWidth,
        ].join(" ")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-1 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// src/components/Toast.jsx
//
// Minimal global toast so API failures are visible even on pages that don't
// do their own error handling. Mount <ToastContainer /> once (in
// AdminLayout) — services/api.js pushes toasts via utils/toastBus.js.
import React from "react";
import { subscribeToToasts } from "../utils/toastBus";

export default function ToastContainer() {
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    return subscribeToToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
            t.type === "error"
              ? "border-red-900/50 bg-red-950/90 text-red-200"
              : t.type === "success"
              ? "border-emerald-900/50 bg-emerald-950/90 text-emerald-200"
              : "border-slate-800 bg-slate-900/90 text-slate-200",
          ].join(" ")}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

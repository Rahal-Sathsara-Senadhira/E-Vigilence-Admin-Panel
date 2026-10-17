import React from "react";
import { STATUS_OPTIONS, getStatusMeta } from "../../../utils/violationStatus";

// One clickable tile per status (plus "All") with its count — doubles as the
// status filter. Clicking the selected tile again goes back to "All".
export default function StatusTiles({ stats, selected, onSelect }) {
  const tiles = [
    { key: "", label: "All", count: stats?.total, dot: "bg-primary" },
    ...STATUS_OPTIONS.map((s) => {
      const meta = getStatusMeta(s);
      return { key: s, label: meta.label, count: stats?.byStatus?.[s] ?? 0, dot: meta.dot };
    }),
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {tiles.map((t) => {
        const active = selected === t.key;
        return (
          <button
            key={t.key || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? "" : t.key)}
            className={`group rounded-2xl border bg-surface px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active ? "border-primary ring-2 ring-primary/30" : "border-line"
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden="true" />
              {t.label}
            </span>
            <span className="mt-1 block text-2xl font-bold tabular-nums text-ink">
              {stats ? (t.count ?? 0).toLocaleString() : <span className="skeleton inline-block h-7 w-10 rounded" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

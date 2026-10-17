import React from "react";
import { STATUS_OPTIONS, getStatusMeta } from "../../../utils/violationStatus";

// One clickable tile per status (plus "All") with its count — doubles as the
// status filter. Each tile carries its status color as a top accent, and the
// selected one is tinted in that color. Clicking it again goes back to "All".
export default function StatusTiles({ stats, selected, onSelect }) {
  const tiles = [
    {
      key: "",
      label: "All",
      count: stats?.total,
      dot: "bg-primary",
      tile: "border-t-primary",
      tileActive: "border-primary bg-primary/10 ring-primary/30",
    },
    ...STATUS_OPTIONS.map((s) => {
      const meta = getStatusMeta(s);
      return { key: s, count: stats?.byStatus?.[s] ?? 0, ...meta };
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
            className={`rounded-2xl border border-t-4 px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${t.tile} ${
              active ? `ring-2 ${t.tileActive}` : "border-line bg-surface"
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} aria-hidden="true" />
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

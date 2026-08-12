// src/components/charts/CategoryBarChart.jsx
//
// Horizontal bar chart comparing magnitude across named categories (e.g.
// violation counts by type). Single hue — the reader compares length, not
// identity, so no categorical palette is needed. Plain SVG.
import React from "react";

const HUE = "#22d3ee"; // cyan-400
const MAX_BARS = 6;
const BAR_H = 18;
const GAP = 14;

export default function CategoryBarChart({ data = [], title = "By category" }) {
  const [hoverIdx, setHoverIdx] = React.useState(null);

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, MAX_BARS);
  const rest = sorted.slice(MAX_BARS);
  const otherCount = rest.reduce((sum, r) => sum + r.count, 0);

  const rows = otherCount > 0 ? [...top, { category: "Other", count: otherCount }] : top;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No data in this range.</p>;
  }

  return (
    <div role="img" aria-label={title} className="w-full">
      {rows.map((r, i) => {
        const pct = (r.count / maxCount) * 100;
        const isHover = hoverIdx === i;
        return (
          <div
            key={r.category}
            className="flex items-center gap-3 py-1"
            style={{ marginBottom: i === rows.length - 1 ? 0 : GAP - 8 }}
            onPointerEnter={() => setHoverIdx(i)}
            onPointerLeave={() => setHoverIdx(null)}
          >
            <span className="w-28 shrink-0 truncate text-xs text-slate-300" title={r.category}>
              {r.category}
            </span>
            <div className="relative h-[18px] flex-1 rounded bg-white/5">
              <div
                className="h-full rounded transition-[width]"
                style={{
                  width: `${pct}%`,
                  height: BAR_H,
                  background: HUE,
                  opacity: isHover ? 1 : 0.85,
                  borderRadius: 4,
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-medium text-slate-100">
              {r.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

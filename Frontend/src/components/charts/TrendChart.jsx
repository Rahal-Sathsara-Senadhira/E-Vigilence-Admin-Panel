// src/components/charts/TrendChart.jsx
//
// Single-series line/area chart for a count-over-time series (e.g. violations
// per day). No charting library — plain SVG, sized to its container.
import React from "react";

const HUE = "#22d3ee"; // cyan-400, matches the app's existing accent
const GRID = "#334155"; // slate-700, recessive
const MUTED = "#94a3b8"; // slate-400
const HEIGHT = 200;
const PAD = { top: 16, right: 12, bottom: 24, left: 12 };

function formatDay(day) {
  // day: "YYYY-MM-DD"
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TrendChart({ data = [], title = "Violations over time" }) {
  const containerRef = React.useRef(null);
  const [width, setWidth] = React.useState(600);
  const [hoverIdx, setHoverIdx] = React.useState(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  // round the axis ceiling to a clean number
  const yMax = Math.ceil(maxCount / 5) * 5 || 5;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2;
    const y = innerH - (d.count / yMax) * innerH;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${innerH} L ${points[0].x.toFixed(2)} ${innerH} Z`
      : "";

  function onPointerMove(e) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const last = points[points.length - 1];

  // sparse x-axis ticks: first, ~middle, last
  const tickIdxs =
    points.length <= 1
      ? points.map((_, i) => i)
      : Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return (
    <div ref={containerRef} className="w-full">
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">No data in this range.</p>
      ) : (
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={title}
        >
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {/* gridlines: 0, mid, max */}
            {[0, 0.5, 1].map((f) => {
              const y = innerH - f * innerH;
              return (
                <line
                  key={f}
                  x1={0}
                  x2={innerW}
                  y1={y}
                  y2={y}
                  stroke={GRID}
                  strokeWidth={1}
                />
              );
            })}

            {/* area fill */}
            {areaPath && <path d={areaPath} fill={HUE} opacity={0.1} />}

            {/* line */}
            <path d={linePath} fill="none" stroke={HUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

            {/* crosshair */}
            {hovered && (
              <line
                x1={hovered.x}
                x2={hovered.x}
                y1={0}
                y2={innerH}
                stroke={MUTED}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}

            {/* end marker + label */}
            {last && (
              <>
                <circle cx={last.x} cy={last.y} r={4} fill={HUE} stroke="#0f172a" strokeWidth={2} />
                <text
                  x={Math.min(last.x, innerW - 4)}
                  y={Math.max(last.y - 10, 10)}
                  className="fill-slate-900 dark:fill-slate-200 font-medium"
                  fontSize={11}
                  textAnchor="end"
                >
                  {last.count}
                </text>
              </>
            )}

            {/* hover marker */}
            {hovered && (
              <circle cx={hovered.x} cy={hovered.y} r={4} fill={HUE} stroke="#0f172a" strokeWidth={2} />
            )}

            {/* x-axis labels */}
            {tickIdxs.map((i) => (
              <text
                key={i}
                x={points[i].x}
                y={innerH + 16}
                className="fill-slate-900 dark:fill-slate-300 font-medium"
                fontSize={10}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              >
                {formatDay(points[i].day)}
              </text>
            ))}
          </g>
        </svg>
      )}

      {hovered && (
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-900 dark:text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: HUE }} />
          <span className="font-bold text-slate-900 dark:text-slate-100">{hovered.count}</span>
          <span className="font-medium text-slate-800 dark:text-slate-400">on {formatDay(hovered.day)}</span>
        </div>
      )}
    </div>
  );
}

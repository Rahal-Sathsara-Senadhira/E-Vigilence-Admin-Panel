// Dashboard charts — docs/12 §8. Plain HTML, no chart library:
//  - colours from the validated palette by the job they do (identity in fixed
//    slots, one hue for a single measure), never status colours;
//  - bars at most 24 px, a 4 px rounded data end, 2 px gaps between stacked
//    segments; values and labels in text colours, never the series colour;
//  - a legend for two or more series, a hover tooltip, and "View as table".

import { Info, Table2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Panel, Tooltip, cn } from "@/ui/index.js";
import { SLOT } from "../lib/palette.js";

/**
 * A chart's panel: title, its definition, and the switch to a table.
 * @param {{
 *   title: string,
 *   definition: string,
 *   table: { head: string[], rows: (string | number)[][] },
 *   children: import("react").ReactNode,
 *   empty?: boolean,
 *   emptyText?: string,
 *   className?: string,
 * }} props
 */
export function ChartPanel({
  title,
  definition,
  table,
  children,
  empty,
  emptyText = "Nothing in this period.",
  className,
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      className={className}
      title={title}
      actions={
        <span className="flex items-center gap-1">
          <Tooltip label={<span className="block max-w-72">{definition}</span>} side="top">
            <span
              role="img"
              aria-label={`What does this count? ${definition}`}
              className="grid size-8 place-items-center rounded-lg text-text-faint hover:bg-sunken hover:text-text-muted"
            >
              <Info className="size-4" aria-hidden />
            </span>
          </Tooltip>
          {!empty ? (
            <button
              type="button"
              aria-pressed={asTable}
              onClick={() => setAsTable(!asTable)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs",
                asTable ? "bg-action-soft text-action" : "text-text-muted hover:bg-sunken",
              )}
            >
              <Table2 className="size-3.5" aria-hidden />{" "}
              {asTable ? "View as chart" : "View as table"}
            </button>
          ) : null}
        </span>
      }
    >
      {empty ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">{emptyText}</p>
      ) : asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn(
                      "sticky top-0 border-b border-border bg-sunken px-4 py-2 text-xs font-medium text-text-muted",
                      i === 0 ? "text-left" : "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={cn(
                        "border-b border-border px-4 py-2",
                        j === 0 ? "text-left" : "text-right tabular-nums",
                      )}
                    >
                      {typeof c === "number" ? c.toLocaleString("en-LK") : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5">{children}</div>
      )}
    </Panel>
  );
}

/** @param {{ items: { label: string, color: string, value?: number }[] }} props */
export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: i.color }} />
          <span className="text-text">{i.label}</span>
          {i.value !== undefined ? (
            <span className="tabular-nums">{i.value.toLocaleString("en-LK")}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Columns over time, stacked by series (reports by channel).
 * @param {{
 *   series: { key: string, label: string, color: string }[],
 *   points: Record<string, any>[],
 *   tick: (at: string) => string,
 * }} props
 */
export function StackedColumns({ series, points, tick }) {
  const [hover, setHover] = useState(/** @type {number | null} */ (null));
  const totals = points.map((p) => series.reduce((s, x) => s + (p[x.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const top = niceCeil(max);
  const every = Math.max(1, Math.ceil(points.length / 8));
  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="relative mt-4 h-48">
        {[0, 0.5, 1].map((g) => (
          <div
            key={g}
            aria-hidden
            className="absolute inset-x-0 border-t border-border"
            style={{ bottom: `${g * 100}%` }}
          >
            <span className="absolute -top-2 left-0 bg-panel pr-1 text-[10px] text-text-faint tabular-nums">
              {Math.round(top * g)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 left-7 flex items-end gap-[2px]">
          {points.map((p, i) => (
            <div
              key={p.at}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="flex w-full max-w-6 flex-col-reverse gap-[2px]"
                style={{ height: `${((totals[i] ?? 0) / top) * 100}%` }}
              >
                {series.map((s, j) => {
                  const v = p[s.key] ?? 0;
                  if (!v) return null;
                  const last = series.slice(j + 1).every((x) => !(p[x.key] ?? 0));
                  return (
                    <div
                      key={s.key}
                      className={cn("w-full", last && "rounded-t")}
                      style={{ flexGrow: v, background: s.color }}
                    />
                  );
                })}
              </div>
              {hover === i ? (
                <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg border border-border bg-panel p-2 text-xs shadow-overlay">
                  <p className="font-medium text-text">{tick(p.at)}</p>
                  {series.map((s) => (
                    <p key={s.key} className="flex items-center gap-1.5 text-text-muted">
                      <span
                        aria-hidden
                        className="size-2 rounded-sm"
                        style={{ background: s.color }}
                      />
                      {s.label}: <span className="text-text tabular-nums">{p[s.key] ?? 0}</span>
                    </p>
                  ))}
                  <p className="mt-0.5 text-text">Total: {totals[i]}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 ml-7 flex gap-[2px] text-[10px] text-text-faint">
        {points.map((p, i) => (
          <span key={p.at} className="flex-1 text-center whitespace-nowrap">
            {i % every === 0 ? tick(p.at) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A round number at or above n, for the axis. @param {number} n */
function niceCeil(n) {
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

/**
 * Horizontal bars of one measure, one hue (§8.1); each bar can open its list.
 * @param {{ bars: import("../api.js").Bar[], color?: string }} props
 */
export function HBars({ bars, color = SLOT[1] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul className="grid gap-2.5">
      {bars.map((b) => {
        const row = (
          <>
            <span className="w-36 shrink-0 truncate text-xs text-text sm:w-44" title={b.label}>
              {b.label}
            </span>
            <span className="relative h-4 flex-1">
              <span
                className="absolute inset-y-0 left-0 rounded-r"
                style={{
                  width: `${(b.value / max) * 100}%`,
                  minWidth: b.value ? 2 : 0,
                  background: color,
                }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-text">
              {b.value.toLocaleString("en-LK")}
            </span>
          </>
        );
        return (
          <li key={b.key}>
            {b.link ? (
              <Link to={b.link} className="flex items-center gap-3 rounded hover:bg-sunken">
                {row}
              </Link>
            ) : (
              <span className="flex items-center gap-3">{row}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One 100% bar of parts, with each part labelled (triage outcome).
 * @param {{ parts: (import("../api.js").Bar & { color: string })[] }} props
 */
export function PartBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const pct = (/** @type {number} */ v) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div>
      <div
        className="flex h-6 gap-[2px] overflow-hidden rounded"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
      >
        {parts
          .filter((p) => p.value)
          .map((p) => (
            <div
              key={p.key}
              title={`${p.label}: ${p.value} (${pct(p.value)}%)`}
              style={{ flexGrow: p.value, background: p.color }}
            />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: p.color }}
            />
            <span className="text-text">{p.label}</span>
            <span className="ml-auto tabular-nums text-text">
              {p.value.toLocaleString("en-LK")}
            </span>
            <span className="w-9 text-right tabular-nums text-text-muted">{pct(p.value)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-muted">{total.toLocaleString("en-LK")} triaged</p>
    </div>
  );
}

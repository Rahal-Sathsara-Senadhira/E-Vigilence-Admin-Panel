// A figure on a dashboard (docs/12 D3, D4): the number, what it counts on
// hover, and the list it opens. "Needs attention" tiles carry a marker when
// above zero; throughput tiles show the change since the previous period,
// coloured only when "up" is plainly bad (§6).

import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { Link } from "react-router";
import { Tooltip, cn } from "@/ui/index.js";

/** @param {number} n @param {boolean} money */
const show = (n, money) => (money ? `Rs ${n.toLocaleString("en-LK")}` : n.toLocaleString("en-LK"));

/**
 * @param {{ f: import("../api.js").Figure, attention?: boolean }} props
 */
export function StatTile({ f, attention = false }) {
  const marked = attention && f.value > 0;
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-text-muted">{f.label}</span>
        <Tooltip label={<span className="block max-w-64">{f.definition}</span>} side="top">
          <span
            role="img"
            aria-label={`What does this count? ${f.definition}`}
            className="text-text-faint hover:text-text-muted"
            onClick={(e) => e.preventDefault()}
          >
            <Info className="size-3.5" aria-hidden />
          </span>
        </Tooltip>
      </span>
      <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums text-text">
        {show(f.value, f.money)}
      </span>
      {f.previous !== null ? <Change f={f} /> : null}
      {f.sub ? <span className="mt-0.5 block text-xs text-text-muted">{f.sub}</span> : null}
    </>
  );
  const className = cn(
    "relative block rounded-xl border border-border bg-panel p-4",
    marked && "border-l-4 border-l-attention",
    f.link && "transition-colors hover:border-border-strong hover:bg-sunken/50",
  );
  return f.link ? (
    <Link to={f.link} className={className} aria-label={`${f.label}: ${show(f.value, f.money)}`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Signed change and percentage, with an arrow. @param {{ f: import("../api.js").Figure }} props */
function Change({ f }) {
  const before = f.previous ?? 0;
  const diff = f.value - before;
  const pct = before ? Math.round((diff / before) * 100) : null;
  const Arrow = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;
  const words =
    diff === 0
      ? "Same as the previous period"
      : `${diff > 0 ? "+" : "−"}${show(Math.abs(diff), f.money)}${pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""} vs previous period`;
  return (
    <span
      className={cn(
        "mt-0.5 flex items-center gap-1 text-xs",
        f.upIsBad && diff > 0 ? "text-danger" : "text-text-muted",
      )}
    >
      <Arrow className="size-3.5 shrink-0" aria-hidden />
      {words}
    </span>
  );
}

// Wall mode — the dashboard for a screen on an operations-room wall: no
// menus, large type, read from across the room, refreshed every minute.
// What needs attention, the case pipeline and the oldest overdue items only;
// no personal data, as on every dashboard (docs/12 D6).

import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { formatRelative } from "@/lib/format.js";
import { Alert, Logo, Skeleton, cn } from "@/ui/index.js";
import { useDashboard } from "./api.js";
import { SLOT } from "./lib/palette.js";

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Colombo",
});

export function WallPage() {
  const [params] = useSearchParams();
  const filters = Object.fromEntries(
    ["divisionId", "stationId"].map((k) => [k, params.get(k) ?? undefined]),
  );
  const query = useDashboard({ ...filters, period: "today" });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const d = query.data;

  return (
    <div className="min-h-dvh bg-canvas p-6 text-text lg:p-10">
      <header className="mb-8 flex items-center gap-4">
        <Logo className="h-12 w-16 rounded-lg p-1.5" />
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {d?.kind === "station"
              ? "My station"
              : d && !d.national
                ? "Division"
                : "Command centre"}
          </h1>
          <p className="text-lg text-text-muted">
            {CLOCK.format(now)} · Sri Lanka time
            {d ? ` · updated ${formatRelative(d.generatedAt).toLowerCase()}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.()}
          className="grid size-11 place-items-center rounded-lg text-text-muted hover:bg-sunken"
          aria-label="Full screen"
        >
          <Maximize2 className="size-5" aria-hidden />
        </button>
        <Link
          to={`/dashboard${params.toString() ? `?${params}` : ""}`}
          className="grid size-11 place-items-center rounded-lg text-text-muted hover:bg-sunken"
          aria-label="Leave wall mode"
        >
          <X className="size-5" aria-hidden />
        </Link>
      </header>

      {query.isPending ? (
        <Skeleton className="h-96" />
      ) : query.isError || !d ? (
        <Alert tone="danger">{query.error?.message ?? "Couldn't load the dashboard."}</Alert>
      ) : d.kind === "mine" ? (
        <Alert tone="info">Wall mode is for station and HQ dashboards.</Alert>
      ) : (
        <div className="grid gap-8">
          <section
            aria-label="Needs attention"
            className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6"
          >
            {d.attention.map((f) => (
              <div
                key={f.key}
                className={cn(
                  "rounded-2xl border border-border bg-panel p-6",
                  f.value > 0 && "border-l-8 border-l-attention",
                )}
              >
                <p className="text-lg text-text-muted">{f.label}</p>
                <p className="mt-2 text-6xl font-semibold tracking-tight tabular-nums">
                  {f.value.toLocaleString("en-LK")}
                </p>
                {f.sub ? <p className="mt-1 text-base text-text-muted">{f.sub}</p> : null}
              </div>
            ))}
          </section>
          <div className="grid gap-8 xl:grid-cols-2">
            {d.charts?.pipeline ? (
              <section className="rounded-2xl border border-border bg-panel p-6">
                <h2 className="mb-5 text-xl font-semibold">Cases now</h2>
                <ul className="grid gap-4">
                  {d.charts.pipeline.bars.map((b) => {
                    const max = Math.max(1, ...(d.charts?.pipeline.bars ?? []).map((x) => x.value));
                    return (
                      <li key={b.key} className="flex items-center gap-4 text-lg">
                        <span className="w-52 shrink-0">{b.label}</span>
                        <span className="relative h-6 flex-1">
                          <span
                            className="absolute inset-y-0 left-0 rounded-r"
                            style={{
                              width: `${(b.value / max) * 100}%`,
                              minWidth: b.value ? 4 : 0,
                              background: SLOT[1],
                            }}
                          />
                        </span>
                        <span className="w-16 text-right text-2xl font-semibold tabular-nums">
                          {b.value}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {d.lists?.overdue ? (
              <section className="rounded-2xl border border-border bg-panel p-6">
                <h2 className="mb-5 text-xl font-semibold">Oldest overdue</h2>
                {d.lists.overdue.items.length === 0 ? (
                  <p className="text-lg text-text-muted">Nothing overdue.</p>
                ) : (
                  <ul className="grid gap-3">
                    {d.lists.overdue.items.slice(0, 8).map((i) => (
                      <li key={i.id} className="flex items-baseline gap-4 text-lg">
                        <span className="w-48 shrink-0 font-mono">{i.number}</span>
                        <span className="flex-1 truncate text-text-muted first-letter:uppercase">
                          {i.label}
                        </span>
                        <span
                          className={cn(
                            "shrink-0",
                            i.escalated ? "text-danger" : "text-text-muted",
                          )}
                        >
                          {i.escalated ? "twice the limit · " : ""}due {formatRelative(i.dueAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

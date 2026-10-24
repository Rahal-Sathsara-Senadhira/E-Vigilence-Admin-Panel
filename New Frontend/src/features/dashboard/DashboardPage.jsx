// Dashboards — docs/12: "what needs my attention now, and is the work getting
// done?" One per role (D12-1): Command centre (HQ, or a division), My
// station (OIC), My work (officers and clerks). Needs attention first, then
// throughput, then charts and lists (D2). No personal data (D6).

import { AlertTriangle, CircleCheck, Clock } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Badge, EmptyState, Page, Panel, Skeleton, cn } from "@/ui/index.js";
import { useDashboard } from "./api.js";
import { ChartPanel, HBars, PartBar, StackedColumns } from "./components/Charts.jsx";
import { Filters } from "./components/Filters.jsx";
import { StatTile } from "./components/StatTile.jsx";
import { SLOT } from "./lib/palette.js";

/** @typedef {import("./api.js").Dashboard} Dashboard */

const TITLES = {
  command: ["Command centre", "What needs attention now, and whether the work is getting done."],
  station: ["My station", "Your station's queue, its pace, and what is overdue."],
  mine: ["My work", "Your queue, soonest due first."],
};
const KEYS = ["period", "from", "to", "divisionId", "stationId", "channel", "priority"];

export function DashboardPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  /** @type {Record<string, string | undefined>} */
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined]));
  const ready = filters.period !== "custom" || (filters.from && filters.to);
  const query = useDashboard(ready ? filters : { ...filters, period: "30d" });
  const kind = query.data?.kind ?? (user.permissions["dashboard.mine"] ? "mine" : "command");
  const [title, description] = TITLES[kind];

  /** @param {Record<string, string | undefined>} next */
  const update = (next) => {
    const merged = { ...filters, ...next };
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
      ),
      { replace: true },
    );
  };

  return (
    <Page
      title={query.data && !query.data.national && kind === "command" ? "Division" : title}
      description={description}
    >
      {kind !== "mine" ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <Filters
            value={filters}
            onChange={update}
            places={kind === "command" && Boolean(user.permissions["dashboard.national"])}
            reports={kind === "command"}
          />
          {query.data ? (
            <p className="text-xs text-text-muted" title={formatDateTime(query.data.generatedAt)}>
              Updated {formatRelative(query.data.generatedAt).toLowerCase()} · Sri Lanka time
            </p>
          ) : null}
        </div>
      ) : null}
      {query.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
      ) : query.isError ? (
        <Alert tone="danger">{query.error.message}</Alert>
      ) : (
        <div className={cn("grid gap-6", query.isFetching && "opacity-80")}>
          <Section title="Needs attention">
            <Tiles figures={query.data.attention} attention />
          </Section>
          {kind === "command" ? <Command d={query.data} /> : null}
          {kind === "station" ? <Station d={query.data} /> : null}
          {kind === "mine" ? <Queue items={query.data.queue ?? []} /> : null}
        </div>
      )}
    </Page>
  );
}

/** @param {{ title: string, children: import("react").ReactNode }} props */
function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** @param {{ figures: import("./api.js").Figure[], attention?: boolean }} props */
function Tiles({ figures, attention }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {figures.map((f) => (
        <StatTile key={f.key} f={f} attention={attention} />
      ))}
    </div>
  );
}

const DAY_TICK = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH_TICK = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** @param {{ d: Dashboard }} props */
function Command({ d }) {
  const charts = /** @type {NonNullable<Dashboard["charts"]>} */ (d.charts);
  const channels = charts.channels;
  const colors = [SLOT[1], SLOT[2], SLOT[3], SLOT.other];
  const series = (channels?.series ?? []).map((s, i) => ({ ...s, color: colors[i] ?? SLOT.other }));
  const tick = (/** @type {string} */ at) =>
    channels?.bucket === "month"
      ? MONTH_TICK.format(new Date(`${at}-01T00:00:00Z`))
      : DAY_TICK.format(new Date(`${at}T00:00:00Z`));
  const outcome = charts.outcome;
  const outcomeColors = {
    accepted: SLOT[1],
    needs_info: SLOT[3],
    rejected: SLOT[2],
    merged: SLOT.other,
  };
  const anyReports = (channels?.points ?? []).some((p) => series.some((s) => p[s.key]));

  return (
    <>
      <Section title="This period">
        <Tiles figures={d.throughput ?? []} />
      </Section>
      <div className="grid gap-5 xl:grid-cols-3">
        {channels ? (
          <ChartPanel
            className="xl:col-span-2"
            title="Reports received, by channel"
            definition={channels.definition}
            empty={!anyReports}
            table={{
              head: ["Date", ...series.map((s) => s.label), "Total"],
              rows: channels.points.map((p) => [
                tick(p.at),
                ...series.map((s) => p[s.key] ?? 0),
                series.reduce((t, s) => t + (p[s.key] ?? 0), 0),
              ]),
            }}
          >
            <StackedColumns series={series} points={channels.points} tick={tick} />
          </ChartPanel>
        ) : null}
        {outcome ? (
          <ChartPanel
            title="Triage outcome"
            definition={outcome.definition}
            empty={outcome.parts.every((p) => !p.value)}
            table={{
              head: ["Result", "Reports"],
              rows: outcome.parts.map((p) => [p.label, p.value]),
            }}
          >
            <PartBar
              parts={outcome.parts.map((p) => ({
                ...p,
                color:
                  outcomeColors[/** @type {keyof typeof outcomeColors} */ (p.key)] ?? SLOT.other,
              }))}
            />
          </ChartPanel>
        ) : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <BarsPanel title="Case pipeline now" chart={charts.pipeline} now />
        <BarsPanel title="Top offences" chart={charts.offences} />
      </div>
      {d.stations ? <Stations s={d.stations} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {d.lists?.overdue ? <ItemList title="Oldest overdue" list={d.lists.overdue} due /> : null}
        {d.lists?.returned ? (
          <ItemList title="Latest returned to HQ" list={d.lists.returned} />
        ) : null}
      </div>
    </>
  );
}

/** @param {{ d: Dashboard }} props */
function Station({ d }) {
  const charts = /** @type {NonNullable<Dashboard["charts"]>} */ (d.charts);
  const maxOpen = Math.max(1, ...(d.officers?.rows ?? []).map((r) => r.open));
  return (
    <>
      <Section title="This period">
        <Tiles figures={d.throughput ?? []} />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <BarsPanel title="Cases by state" chart={charts.pipeline} now />
        <BarsPanel title="Offences in my area" chart={charts.offences} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {d.officers ? (
          <ChartPanel
            title="Cases per officer"
            definition={d.officers.definition}
            empty={d.officers.rows.length === 0}
            emptyText="No open cases now."
            table={{
              head: ["Officer", "Open", "Overdue"],
              rows: d.officers.rows.map((o) => [o.name, o.open, o.overdue]),
            }}
          >
            <ul className="grid gap-2.5">
              {d.officers.rows.map((o) => (
                <li key={o.name} className="flex items-center gap-3 text-xs">
                  <span className="w-36 shrink-0 truncate text-text">{o.name}</span>
                  <span className="relative h-4 flex-1">
                    <span
                      className="absolute inset-y-0 left-0 rounded-r"
                      style={{
                        width: `${(o.open / maxOpen) * 100}%`,
                        background: SLOT[1],
                      }}
                    />
                  </span>
                  <span className="w-8 text-right font-medium tabular-nums text-text">
                    {o.open}
                  </span>
                  <span
                    className={cn(
                      "flex w-20 items-center justify-end gap-1",
                      o.overdue ? "text-danger" : "text-text-faint",
                    )}
                  >
                    {o.overdue ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
                    {o.overdue} overdue
                  </span>
                </li>
              ))}
            </ul>
          </ChartPanel>
        ) : null}
        {d.lists?.overdue ? (
          <ItemList title="My station's overdue items" list={d.lists.overdue} due />
        ) : null}
      </div>
    </>
  );
}

/**
 * @param {{ title: string, chart: { definition: string, bars: import("./api.js").Bar[] }, now?: boolean }} props
 */
function BarsPanel({ title, chart, now = false }) {
  return (
    <ChartPanel
      title={title}
      definition={chart.definition}
      emptyText={now ? "No open cases now." : undefined}
      empty={chart.bars.every((b) => !b.value)}
      table={{ head: ["", "Count"], rows: chart.bars.map((b) => [b.label, b.value]) }}
    >
      <HBars bars={chart.bars} />
    </ChartPanel>
  );
}

/** Station comparison, sorted by overdue work, no ranking colours (D12-5). @param {{ s: NonNullable<Dashboard["stations"]> }} props */
function Stations({ s }) {
  const pct = (/** @type {{ a: number, of: number } | null} */ x) =>
    x && x.of ? Math.round((x.a / x.of) * 100) : null;
  return (
    <ChartPanel
      title="Stations"
      definition={s.definition}
      empty={s.rows.length === 0}
      table={{
        head: [
          "Station",
          "Open",
          "On-time acceptance",
          "Median days to decision",
          "Notices paid",
          "Overdue",
        ],
        rows: s.rows.map((r) => [
          r.name,
          r.open,
          r.onTime ? `${r.onTime.accepted} of ${r.onTime.of}` : "—",
          r.medianDays ?? "—",
          r.paid ? `${r.paid.paid} of ${r.paid.of}` : "—",
          r.overdue,
        ]),
      }}
    >
      <div className="-mx-5 -my-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              <th scope="col" className="border-b border-border px-5 py-2 text-left font-medium">
                Station
              </th>
              <th scope="col" className="border-b border-border px-3 py-2 text-right font-medium">
                Open
              </th>
              <th scope="col" className="border-b border-border px-3 py-2 text-left font-medium">
                On-time acceptance
              </th>
              <th scope="col" className="border-b border-border px-3 py-2 text-right font-medium">
                Days to decision
              </th>
              <th scope="col" className="border-b border-border px-3 py-2 text-right font-medium">
                Notices paid
              </th>
              <th scope="col" className="border-b border-border px-5 py-2 text-right font-medium">
                Overdue
              </th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => {
              const onTime = pct(r.onTime ? { a: r.onTime.accepted, of: r.onTime.of } : null);
              const paid = pct(r.paid ? { a: r.paid.paid, of: r.paid.of } : null);
              return (
                <tr key={r.stationId}>
                  <td className="border-b border-border px-5 py-2.5">
                    <Link to={`/stations/${r.stationId}`} className="text-text hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                    {r.open}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    {onTime === null ? (
                      <span className="text-text-faint">—</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="relative h-2.5 w-24 rounded-full bg-sunken">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${onTime}%`, background: SLOT[1] }}
                          />
                        </span>
                        <span className="tabular-nums">{onTime}%</span>
                        <span className="text-xs text-text-faint">of {r.onTime?.of}</span>
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                    {r.medianDays ?? <span className="text-text-faint">—</span>}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                    {paid === null ? <span className="text-text-faint">—</span> : `${paid}%`}
                  </td>
                  <td className="border-b border-border px-5 py-2.5 text-right font-medium tabular-nums">
                    {r.overdue}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s.total > s.rows.length ? (
        <p className="mt-3 text-xs text-text-muted">
          The {s.rows.length} stations with the most overdue work, of {s.total}.
        </p>
      ) : null}
    </ChartPanel>
  );
}

/**
 * @param {{ title: string, list: { definition: string, items: import("./api.js").Item[] }, due?: boolean }} props
 */
function ItemList({ title, list, due }) {
  return (
    <Panel title={title} description={list.definition}>
      {list.items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-text-muted">
          <CircleCheck className="size-4 text-success" aria-hidden /> Nothing here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.items.map((i) => (
            <li key={i.id}>
              <Link to={i.link} className="flex items-center gap-3 px-5 py-2.5 hover:bg-sunken">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] text-text">{i.number}</span>
                  <span className="block truncate text-xs text-text-muted first-letter:uppercase">
                    {i.label}
                  </span>
                </span>
                {i.escalated ? <Badge tone="danger">Twice the limit</Badge> : null}
                <span className="text-xs text-text-muted" title={formatDateTime(i.dueAt ?? i.at)}>
                  {due ? `due ${formatRelative(i.dueAt)}` : formatRelative(i.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** My work: one queue, soonest due first (§4.3). @param {{ items: import("./api.js").Item[] }} props */
function Queue({ items }) {
  return (
    <Section title="My queue">
      <Panel>
        {items.length === 0 ? (
          <EmptyState
            icon={<CircleCheck />}
            title="Nothing waiting"
            description="Your queue is clear."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id}>
                <Link
                  to={i.link}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-medium text-text">
                      {i.number}
                    </span>
                    <span className="block text-xs text-text-muted">{i.label}</span>
                  </span>
                  {i.priority === "P1" ? <Badge tone="danger">P1</Badge> : null}
                  {i.dueAt ? (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        i.overdue ? "text-danger" : "text-text-muted",
                      )}
                      title={formatDateTime(i.dueAt)}
                    >
                      {i.overdue ? (
                        <AlertTriangle className="size-3.5" aria-hidden />
                      ) : (
                        <Clock className="size-3.5" aria-hidden />
                      )}
                      {i.overdue ? "Overdue" : "Due"} {formatRelative(i.dueAt)}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  );
}

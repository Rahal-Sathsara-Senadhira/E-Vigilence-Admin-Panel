import React from "react";
import { getDashboardSummary } from "../../services/dashboardApi";
import TrendChart from "../../components/charts/TrendChart";
import CategoryBarChart from "../../components/charts/CategoryBarChart";

const RANGE_OPTIONS = [
  { label: "7 days", value: 7, short: "7d" },
  { label: "14 days", value: 14, short: "14d" },
  { label: "30 days", value: 30, short: "30d" },
  { label: "90 days", value: 90, short: "90d" },
  { label: "All time", value: 3650, short: "all time" },
];

function rangeShortLabel(days) {
  return RANGE_OPTIONS.find((o) => o.value === days)?.short || `${days}d`;
}

export default function Dashboard() {
  const [days, setDays] = React.useState(14);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const json = await getDashboardSummary(days);

        if (!alive) return;
        setData(json);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Dashboard request failed");
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [days]);

  if (loading && !data) return <p className="text-slate-300">Loading...</p>;

  if (err) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
        <div className="font-semibold">Dashboard failed</div>
        <div className="mt-1 text-sm opacity-90">{err}</div>
        <div className="mt-2 text-xs opacity-70">
          Open DevTools → Network → check /api/dashboard
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const kpis = data?.kpis || {};
  const byCategory = data?.byCategory || [];
  const byDay = data?.byDay || [];
  const recentViolations = data?.recentViolations || [];
  const latestReportRuns = data?.latestReportRuns || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-2 text-lg font-medium text-slate-500 dark:text-slate-400">
            Overview of E-Vigilance system
          </p>
        </div>

        {/* Date range — one row, above everything it scopes */}
        <div className="flex gap-1 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40 p-1 transition-colors">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                days === opt.value
                  ? "bg-brand-blue text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-brand-blue dark:hover:text-slate-200",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status breakdown for the selected range */}
      <div className="grid gap-4 md:grid-cols-5" style={{ opacity: loading ? 0.6 : 1 }}>
        <Kpi title={`Total (${rangeShortLabel(days)})`} value={kpis.total ?? 0} variant="blue" />
        <Kpi title="Open" value={kpis.open ?? 0} variant="blue" />
        <Kpi title="In Review" value={kpis.in_review ?? 0} variant="dark" />
        <Kpi title="Resolved" value={kpis.resolved ?? 0} variant="orange" />
        <Kpi title="Unread Notifications" value={kpis.unreadNotifications ?? 0} variant="blue" />
      </div>

      {/* System-wide totals (all time) */}
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi title="Violations (all time)" value={totals.violations ?? 0} />
        <Kpi title="Stations" value={totals.stations ?? 0} />
        <Kpi title="Users" value={totals.users ?? 0} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2" style={{ opacity: loading ? 0.6 : 1 }}>
        <Card title={`Violations over time (${rangeShortLabel(days)})`}>
          <TrendChart data={byDay} title="Violations over time" />
        </Card>

        <Card title="By category">
          <CategoryBarChart data={byCategory} title="Violations by category" />
        </Card>
      </div>

      {/* Latest lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Latest Violations">
          {recentViolations.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No violations yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {recentViolations.map((v) => (
                <div key={v.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {v.title || "Untitled"}
                    </p>
                    <span className="rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {v.status || "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {v.type || "—"} •{" "}
                    {v.createdAt ? new Date(v.createdAt).toLocaleString() : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Latest Report Runs">
          {latestReportRuns.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No report runs yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {latestReportRuns.map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {r.name || "Report Run"}
                    </p>
                    {r.kpis ? (
                      <span className="rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                        {r.kpis.total ?? 0} violations
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ title, value, variant = "default" }) {
  const baseClasses = "group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 flex flex-col gap-2 cursor-default";
  
  let variantClasses = "";
  let titleClasses = "";
  let valueClasses = "text-5xl font-bold mt-2 ";

  if (variant === "blue") {
    variantClasses = "bg-gradient-to-br from-brand-blue to-blue-800 shadow-md hover:shadow-lg hover:shadow-brand-blue/20";
    titleClasses = "text-sm text-white/80 font-medium uppercase tracking-wide";
    valueClasses += "text-white";
  } else if (variant === "dark") {
    variantClasses = "bg-gradient-to-br from-slate-700 to-slate-900 shadow-md hover:shadow-lg hover:shadow-slate-700/20";
    titleClasses = "text-sm text-white/80 font-medium uppercase tracking-wide";
    valueClasses += "text-white";
  } else if (variant === "orange") {
    variantClasses = "bg-gradient-to-br from-brand-orange to-orange-600 shadow-md hover:shadow-lg hover:shadow-brand-orange/20";
    titleClasses = "text-sm text-white/80 font-medium uppercase tracking-wide";
    valueClasses += "text-white";
  } else {
    variantClasses = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-t-4 border-t-brand-blue shadow-sm dark:shadow-none hover:border-brand-blue/30 dark:hover:border-brand-blue/50 hover:shadow-md";
    titleClasses = "text-sm text-slate-500 font-medium uppercase tracking-wide dark:text-slate-100";
    valueClasses += "text-slate-900 dark:text-slate-100";
  }

  return (
    <div className={`${baseClasses} ${variantClasses}`}>
      <p className={titleClasses}>{title}</p>
      <p className={valueClasses}>{value}</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-6 shadow-sm dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-brand-blue/30 dark:hover:border-brand-blue/50 cursor-default">
      <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

import React from "react";
import { getDashboardSummary } from "../../services/dashboardApi";
import TrendChart from "../../components/charts/TrendChart";
import CategoryBarChart from "../../components/charts/CategoryBarChart";

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

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
          <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Overview of E-Vigilance system
          </p>
        </div>

        {/* Date range — one row, above everything it scopes */}
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                days === opt.value
                  ? "bg-cyan-600 text-white"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status breakdown for the selected range */}
      <div className="grid gap-4 md:grid-cols-5" style={{ opacity: loading ? 0.6 : 1 }}>
        <Kpi title={`Total (${days}d)`} value={kpis.total ?? 0} />
        <Kpi title="Open" value={kpis.open ?? 0} />
        <Kpi title="In Review" value={kpis.in_review ?? 0} />
        <Kpi title="Resolved" value={kpis.resolved ?? 0} />
        <Kpi title="Unread Notifications" value={kpis.unreadNotifications ?? 0} />
      </div>

      {/* System-wide totals (all time) */}
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi title="Violations (all time)" value={totals.violations ?? 0} />
        <Kpi title="Stations" value={totals.stations ?? 0} />
        <Kpi title="Users" value={totals.users ?? 0} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2" style={{ opacity: loading ? 0.6 : 1 }}>
        <Card title={`Violations over time (${days}d)`}>
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
            <p className="text-sm text-slate-400">No violations yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {recentViolations.map((v) => (
                <div key={v.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">
                      {v.title || "Untitled"}
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                      {v.status || "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
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
            <p className="text-sm text-slate-400">No report runs yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {latestReportRuns.map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">
                      {r.name || "Report Run"}
                    </p>
                    {r.kpis ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        {r.kpis.total ?? 0} violations
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
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

function Kpi({ title, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

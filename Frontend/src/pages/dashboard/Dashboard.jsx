import React from "react";
import { getDashboardSummary } from "../../services/dashboardApi";

export default function Dashboard() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // ✅ FIX: getDashboardSummary returns JSON directly
        const json = await getDashboardSummary(14);

        if (!alive) return;
        setData(json);
      } catch (e) {
        if (!alive) return;

        // Support both our api wrapper errors and backend errors
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          "Dashboard request failed";
        setErr(msg);
        setData(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <p className="text-slate-300">Loading...</p>;

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
  const vio = data?.violations || {};
  const byStatus = vio?.byStatus || {};
  const latestViolations = data?.latestViolations || [];
  const latestRuns = data?.latestReportRuns || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Overview of E-Vigilance system
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Violations" value={totals.violations ?? 0} />
        <Kpi title="Regional Stations" value={totals.regionalStations ?? 0} />
        <Kpi title="Users" value={totals.users ?? 0} />
        <Kpi title="Unread Notifications" value={totals.unreadNotifications ?? 0} />
      </div>

      {/* Status breakdown */}
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Open" value={byStatus.open ?? 0} />
        <Kpi title="In Review" value={byStatus.in_review ?? byStatus.inReview ?? 0} />
        <Kpi title="Resolved" value={byStatus.resolved ?? 0} />
        <Kpi title={`Last ${vio.days ?? 14} days`} value={vio.lastNDays ?? 0} />
      </div>

      {/* Latest lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Latest Violations">
          {latestViolations.length === 0 ? (
            <p className="text-sm text-slate-400">No violations yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {latestViolations.map((v) => (
                <div key={v.id || v._id} className="py-3">
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
          {latestRuns.length === 0 ? (
            <p className="text-sm text-slate-400">No report runs yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {latestRuns.map((r) => (
                <div key={r.id} className="py-3">
                  <p className="text-sm font-medium text-slate-100">
                    {r.name || "Report Run"}
                  </p>
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
import React from "react";
import { ShieldAlert, MapPin, Users, Bell } from "lucide-react";
import { getDashboardSummary } from "../../services/dashboardApi";

export default function Dashboard() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    const res = await getDashboardSummary();
    setData(res.data);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-slate-300">Loading…</p>;
  if (!data) return <p className="text-slate-300">No data.</p>;

  const k = data.kpis;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard icon={ShieldAlert} label="Violations" value={k.total_violations} />
        <KpiCard icon={MapPin} label="Stations" value={k.total_stations} />
        <KpiCard icon={Users} label="Users" value={k.total_users} />
        <KpiCard icon={Bell} label="Unread" value={k.unread_notifications} />
      </div>

      {/* Status cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <MiniCard label="Open" value={k.open_violations} />
        <MiniCard label="In Review" value={k.in_review_violations} />
        <MiniCard label="Resolved" value={k.resolved_violations} />
      </div>

      {/* Two columns */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Latest Violations">
          <List rows={data.latestViolations} />
        </Card>

        <Card title="Unread Notifications">
          <NotificationsList rows={data.unreadNotifications} />
        </Card>
      </div>

      {/* Analytics */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Top Categories">
          <SimpleTable
            leftTitle="Category"
            rightTitle="Count"
            rows={data.byCategory.map((x) => ({ left: x.category, right: x.count }))}
          />
        </Card>

        <Card title="Last 7 Days Trend">
          <SimpleTable
            leftTitle="Day"
            rightTitle="Count"
            rows={data.trend7d.map((x) => ({ left: x.day, right: x.count }))}
          />
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-400" />
        <p className="text-sm text-slate-400">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value ?? 0}</p>
    </div>
  );
}

function MiniCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">{value ?? 0}</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-200">{title}</p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function List({ rows }) {
  if (!rows?.length) return <p className="text-slate-400">No items.</p>;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((r) => (
        <div key={r.id} className="py-2">
          <p className="text-sm font-medium text-slate-100">{r.title}</p>
          <p className="text-xs text-slate-400">
            {r.category || "—"} · {r.status} · {new Date(r.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function NotificationsList({ rows }) {
  if (!rows?.length) return <p className="text-slate-400">No unread notifications.</p>;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((n) => (
        <div key={n.id} className="py-2">
          <p className="text-sm font-medium text-slate-100">{n.title}</p>
          <p className="text-xs text-slate-400">{n.message}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {new Date(n.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function SimpleTable({ leftTitle, rightTitle, rows }) {
  if (!rows?.length) return <p className="text-slate-400">No data.</p>;
  return (
    <table className="w-full text-left text-sm text-slate-200">
      <thead className="text-xs uppercase text-slate-400">
        <tr className="border-b border-slate-800">
          <th className="py-2 pr-3">{leftTitle}</th>
          <th className="py-2 text-right">{rightTitle}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} className="border-b border-slate-800/60">
            <td className="py-2 pr-3 text-slate-100">{r.left}</td>
            <td className="py-2 text-right font-mono text-slate-300">{r.right}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

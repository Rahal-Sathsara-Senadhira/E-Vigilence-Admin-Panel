import React from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.error || "Request failed");
  return json;
}

export default function Reports() {
  const today = new Date();
  const toStr = (d) => d.toISOString().slice(0, 10);

  const [from, setFrom] = React.useState(toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = React.useState(toStr(today));
  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [summary, setSummary] = React.useState(null);

  const queryString = React.useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (status) qs.set("status", status);
    if (category) qs.set("category", category);
    return qs.toString();
  }, [from, to, status, category]);

  async function load() {
    try {
      setError("");
      setLoading(true);
      const res = await fetchJson(`${API_BASE}/api/reports/violations/summary?${queryString}`);
      setSummary(res.data);
    } catch (e) {
      setError(e.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadCsv() {
    const url = `${API_BASE}/api/reports/violations/export?${queryString}`;
    window.open(url, "_blank");
  }

  const k = summary?.kpis;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Reports</h2>
          <p className="text-sm text-slate-400">Violations analytics + CSV export</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Refresh
          </button>
          <button
            onClick={downloadCsv}
            className="rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-4">
        <div>
          <p className="text-sm text-slate-400">From</p>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
          />
        </div>

        <div>
          <p className="text-sm text-slate-400">To</p>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
          />
        </div>

        <div>
          <p className="text-sm text-slate-400">Status</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
          >
            <option value="">All</option>
            <option value="open">open</option>
            <option value="in_review">in_review</option>
            <option value="resolved">resolved</option>
          </select>
        </div>

        <div>
          <p className="text-sm text-slate-400">Category</p>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="traffic"
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
          />
        </div>

        <div className="md:col-span-4 flex justify-end">
          <button
            onClick={load}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-300">Loading report…</p>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : !summary ? null : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 md:grid-cols-4">
            <KpiCard label="Total" value={k?.total ?? 0} />
            <KpiCard label="Open" value={k?.open ?? 0} />
            <KpiCard label="In Review" value={k?.in_review ?? 0} />
            <KpiCard label="Resolved" value={k?.resolved ?? 0} />
          </div>

          {/* Breakdown */}
          <div className="grid gap-3 md:grid-cols-2">
            <BreakdownCard title="By Category" rows={summary.byCategory} left="category" right="count" />
            <BreakdownCard title="By Day" rows={summary.byDay} left="day" right="count" />
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function BreakdownCard({ title, rows, left, right }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-100">{title}</p>
        <p className="text-xs text-slate-500">{rows?.length ?? 0} rows</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="text-xs uppercase text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="py-2 pr-3">{left}</th>
              <th className="py-2 text-right">{right}</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, idx) => (
              <tr key={idx} className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-100">{r[left]}</td>
                <td className="py-2 text-right font-mono text-slate-300">{r[right]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

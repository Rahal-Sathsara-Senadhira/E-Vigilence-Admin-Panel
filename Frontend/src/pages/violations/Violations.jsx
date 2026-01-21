// src/pages/violations/Violations.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { listViolations } from "../../services/violationsApi";

export default function Violations() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");

  async function load() {
    try {
      setError("");
      setLoading(true);
      const res = await listViolations({
        status: status || undefined,
        limit: 50,
        offset: 0,
      });
      setItems(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load violations");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Violations</h2>
          <p className="text-sm text-slate-400">Showing latest items from the backend.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <Link
            to="/violations/new"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30"
          >
            <Plus className="h-4 w-4" />
            New Complaint
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400">Filter status:</p>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All</option>
          <option value="open">open</option>
          <option value="in_review">in_review</option>
          <option value="resolved">resolved</option>
        </select>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        {loading ? (
          <p className="text-slate-300">Loading…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : items.length === 0 ? (
          <p className="text-slate-300">No violations listed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-200">
              <thead className="text-xs uppercase text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-3 pr-3">Title</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Category</th>
                  <th className="py-3 pr-3">Lat</th>
                  <th className="py-3 pr-3">Lng</th>
                  <th className="py-3 pr-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id} className="border-b border-slate-800/60">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-100">{v.title}</div>
                      {v.location_text ? (
                        <div className="mt-1 font-mono text-xs text-slate-400">
                          {v.location_text}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-lg border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs">
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-slate-300">{v.category || "-"}</td>
                    <td className="py-3 pr-3 font-mono text-xs text-slate-300">
                      {Number(v.latitude).toFixed(6)}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-slate-300">
                      {Number(v.longitude).toFixed(6)}
                    </td>
                    <td className="py-3 pr-3 text-slate-400">
                      {v.created_at ? new Date(v.created_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import React from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * Fetch helper with good error messages (JSON + text fallback)
 */
async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      json?.error ||
      json?.message ||
      (text && text.length < 250 ? text : "") ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new Error(msg);
  }

  return json;
}

function toISODate(d) {
  // Date -> YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return String(isoLike);
  return d.toLocaleString();
}

export default function Reports() {
  const today = new Date();

  // Filters (same as before)
  const [from, setFrom] = React.useState(
    toISODate(new Date(today.getFullYear(), today.getMonth(), 1))
  );
  const [to, setTo] = React.useState(toISODate(today));
  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("traffic");

  // Live report state (your current process)
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [summary, setSummary] = React.useState(null);

  // Saved runs (history)
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [runsLoading, setRunsLoading] = React.useState(false);
  const [runsError, setRunsError] = React.useState("");
  const [runs, setRuns] = React.useState([]);
  const [runsMeta, setRunsMeta] = React.useState({ total: 0, limit: 20, offset: 0 });

  // Selected saved run (opened report)
  const [activeRun, setActiveRun] = React.useState(null);

  // Create run UI
  const [saving, setSaving] = React.useState(false);
  const [runName, setRunName] = React.useState("");

  const queryString = React.useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (status) qs.set("status", status);
    if (category) qs.set("category", category);
    return qs.toString();
  }, [from, to, status, category]);

  // ------------------------
  // Live report (unchanged)
  // ------------------------
  async function loadLive() {
    try {
      setError("");
      setLoading(true);

      const res = await apiFetch(`/api/reports/violations/summary?${queryString}`);
      setSummary(res.data);
      setActiveRun(null); // viewing live
    } catch (e) {
      setError(e.message || "Failed to load report");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------
  // Saved runs / history
  // ------------------------
  async function loadRuns({ limit = 20, offset = 0 } = {}) {
    try {
      setRunsError("");
      setRunsLoading(true);

      const res = await apiFetch(
        `/api/reports/violations/runs?limit=${limit}&offset=${offset}`
      );

      setRuns(res.data || []);
      setRunsMeta(res.meta || { total: 0, limit, offset });
    } catch (e) {
      setRunsError(e.message || "Failed to load report history");
      setRuns([]);
      setRunsMeta({ total: 0, limit, offset });
    } finally {
      setRunsLoading(false);
    }
  }

  async function openRun(id) {
    try {
      setError("");
      setLoading(true);

      const res = await apiFetch(`/api/reports/violations/runs/${id}`);
      setActiveRun(res.data);

      // Render snapshot as the report view
      setSummary(res.data?.snapshot || null);

      setHistoryOpen(false);
    } catch (e) {
      setError(e.message || "Failed to open report");
    } finally {
      setLoading(false);
    }
  }

  async function createAndSaveRun() {
    try {
      setError("");
      setSaving(true);

      // POST creates a stored snapshot (auditable)
      const res = await apiFetch(
        `/api/reports/violations/run?${queryString}`,
        {
          method: "POST",
          body: {
            name: runName?.trim() || null,
          },
        }
      );

      const created = res.data;
      setActiveRun(created);
      setSummary(created?.snapshot || null);

      // refresh history so it shows immediately
      await loadRuns({ limit: runsMeta.limit || 20, offset: 0 });

      // clear name (optional)
      setRunName("");
    } catch (e) {
      setError(e.message || "Failed to create report run");
    } finally {
      setSaving(false);
    }
  }

  function downloadCsv() {
    // If we opened a saved run, download the saved run CSV
    if (activeRun?.id) {
      const url = `${API_BASE}/api/reports/violations/runs/${activeRun.id}/export`;
      window.open(url, "_blank");
      return;
    }

    // Otherwise download the live CSV for current filters
    const url = `${API_BASE}/api/reports/violations/export?${queryString}`;
    window.open(url, "_blank");
  }

  React.useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = summary?.kpis;

  const viewingSaved = !!activeRun?.id;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Reports</h2>
          <p className="text-sm text-slate-400">
            Violations analytics, export, and saved report history
          </p>

          {viewingSaved ? (
            <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              <span className="font-semibold">Viewing saved report:</span>
              <span className="text-amber-100">
                {activeRun.name || `Report #${activeRun.id?.slice?.(0, 6)}`}
              </span>
              <span className="text-amber-300/80">
                • created {fmtDateTime(activeRun.createdAt)}
              </span>
            </div>
          ) : (
            <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-xs text-slate-300">
              Viewing <span className="font-semibold text-slate-100">Live</span> report
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setHistoryOpen(true);
              loadRuns({ limit: 20, offset: 0 });
            }}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Report History
          </button>

          <button
            onClick={loadLive}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Refresh Live
          </button>

          <button
            onClick={downloadCsv}
            className="rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30"
          >
            {viewingSaved ? "Download Saved CSV" : "Download CSV"}
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

        <div className="md:col-span-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadLive}
              className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
            >
              Apply Filters (Live)
            </button>

            <button
              onClick={() => setActiveRun(null)}
              className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
              title="Switch back to live mode (does not save)"
            >
              Switch to Live Mode
            </button>
          </div>

          {/* Save Run */}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <input
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder="Optional name (e.g., Weekly Traffic Report)"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100 md:w-[360px]"
            />
            <button
              onClick={createAndSaveRun}
              disabled={saving}
              className="rounded-xl border border-amber-700 bg-amber-600/20 px-4 py-2 text-sm text-amber-200 hover:bg-amber-600/30 disabled:opacity-60"
              title="Generate and save this report as a snapshot"
            >
              {saving ? "Saving..." : "Generate & Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Loading / errors */}
      {loading ? (
        <p className="text-slate-300">Loading report…</p>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : !summary ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          No data to show.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <KpiCard label="Total" value={k?.total ?? 0} />
            <KpiCard label="Open" value={k?.open ?? 0} />
            <KpiCard label="In Review" value={k?.in_review ?? 0} />
            <KpiCard label="Resolved" value={k?.resolved ?? 0} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <BreakdownCard
              title="By Category"
              rows={summary.byCategory}
              left="category"
              right="count"
            />
            <BreakdownCard title="By Day" rows={summary.byDay} left="day" right="count" />
          </div>
        </>
      )}

      {/* History Modal */}
      {historyOpen ? (
        <HistoryModal
          onClose={() => setHistoryOpen(false)}
          loading={runsLoading}
          error={runsError}
          runs={runs}
          meta={runsMeta}
          onPrev={() => {
            const nextOffset = Math.max((runsMeta.offset || 0) - (runsMeta.limit || 20), 0);
            loadRuns({ limit: runsMeta.limit || 20, offset: nextOffset });
          }}
          onNext={() => {
            const nextOffset = (runsMeta.offset || 0) + (runsMeta.limit || 20);
            if (nextOffset >= (runsMeta.total || 0)) return;
            loadRuns({ limit: runsMeta.limit || 20, offset: nextOffset });
          }}
          onOpen={(id) => openRun(id)}
        />
      ) : null}
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

function HistoryModal({ onClose, loading, error, runs, meta, onPrev, onNext, onOpen }) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-[920px] rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-100">Report History</p>
            <p className="text-xs text-slate-400">
              Open a previously created report snapshot (auditable).
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-slate-300">Loading history…</p>
          ) : error ? (
            <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
              No saved reports yet. Click <b>Generate & Save</b> on the reports page.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase text-slate-400">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Filters</th>
                    <th className="py-2 pr-3">KPIs</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/60">
                      <td className="py-3 pr-3">
                        <div className="text-slate-100">
                          {r.name || `Report #${r.id?.slice?.(0, 6)}`}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">{r.id}</div>
                      </td>

                      <td className="py-3 pr-3 text-xs text-slate-300">
                        <div>
                          <span className="text-slate-400">from:</span>{" "}
                          {r.filters?.from ? String(r.filters.from).slice(0, 10) : "—"}
                        </div>
                        <div>
                          <span className="text-slate-400">to:</span>{" "}
                          {r.filters?.to ? String(r.filters.to).slice(0, 10) : "—"}
                        </div>
                        <div>
                          <span className="text-slate-400">status:</span>{" "}
                          {r.filters?.status || "All"}
                        </div>
                        <div>
                          <span className="text-slate-400">category:</span>{" "}
                          {r.filters?.category || "All"}
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-xs text-slate-300">
                        <div>Total: <span className="font-mono">{r.kpis?.total ?? 0}</span></div>
                        <div>Open: <span className="font-mono">{r.kpis?.open ?? 0}</span></div>
                        <div>Review: <span className="font-mono">{r.kpis?.in_review ?? 0}</span></div>
                        <div>Resolved: <span className="font-mono">{r.kpis?.resolved ?? 0}</span></div>
                      </td>

                      <td className="py-3 pr-3 text-xs text-slate-300">
                        {fmtDateTime(r.createdAt)}
                        {r.createdBy ? (
                          <div className="text-[11px] text-slate-500">by {r.createdBy}</div>
                        ) : null}
                      </td>

                      <td className="py-3 text-right">
                        <button
                          onClick={() => onOpen(r.id)}
                          className="rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {meta.offset + 1} -{" "}
                  {Math.min(meta.offset + meta.limit, meta.total)} of {meta.total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onPrev}
                    disabled={(meta.offset || 0) === 0}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    onClick={onNext}
                    disabled={(meta.offset || 0) + (meta.limit || 20) >= (meta.total || 0)}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

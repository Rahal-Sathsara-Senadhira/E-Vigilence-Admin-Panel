import React from "react";
import { api, downloadFile } from "../../services/api";
import { showToast } from "../../utils/toastBus";
import { STATUS_OPTIONS } from "../../utils/violationStatus";
import TrendChart from "../../components/charts/TrendChart";
import CategoryBarChart from "../../components/charts/CategoryBarChart";

const HISTORY_LIMIT = 20;

function fmtDateTime(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return String(isoLike);
  return d.toLocaleString();
}

export default function Reports() {
  // Filters — all empty/"All" by default, so the first load shows every
  // violation on record instead of silently filtering most of it out.
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("");

  // Categories are derived from whatever the (unfiltered, on first load)
  // summary reports back — same trade-off Violations/RegionalStations make,
  // but it also fixes a real bug: category used to be free text matched
  // exactly against the DB, and this data has both "traffic" and "Traffic"
  // as distinct values, so a typo-free but wrong-case filter silently
  // excluded half the matching records.
  const [knownCategories, setKnownCategories] = React.useState(new Set());

  // Live report state
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [summary, setSummary] = React.useState(null);
  const [downloading, setDownloading] = React.useState(false);

  // Saved runs (history)
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [runsLoading, setRunsLoading] = React.useState(false);
  const [runsError, setRunsError] = React.useState("");
  const [runs, setRuns] = React.useState([]);
  const [runsMeta, setRunsMeta] = React.useState({ total: 0, limit: HISTORY_LIMIT, offset: 0 });

  // Selected saved run (opened report)
  const [activeRun, setActiveRun] = React.useState(null);

  // Create run UI
  const [saving, setSaving] = React.useState(false);
  const [runName, setRunName] = React.useState("");

  const dateRangeInvalid = !!(from && to && to < from);

  const queryString = React.useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (status) qs.set("status", status);
    if (category) qs.set("category", category);
    return qs.toString();
  }, [from, to, status, category]);

  // ------------------------
  // Live report
  // ------------------------
  async function loadLive() {
    if (dateRangeInvalid) return;

    try {
      setError("");
      setLoading(true);

      const res = await api.get(`/api/reports/violations/summary?${queryString}`);
      setSummary(res.data);
      setActiveRun(null); // viewing live

      setKnownCategories((prev) => {
        const next = new Set(prev);
        (res.data?.byCategory || []).forEach((c) => c.category && next.add(c.category));
        return next;
      });
    } catch (e) {
      setError(e.message || "Failed to load report");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  function switchToLive() {
    setActiveRun(null);
    loadLive();
  }

  // ------------------------
  // Saved runs / history
  // ------------------------
  async function loadRuns({ limit = HISTORY_LIMIT, offset = 0 } = {}) {
    try {
      setRunsError("");
      setRunsLoading(true);

      const res = await api.get(
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

      const res = await api.get(`/api/reports/violations/runs/${id}`);
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
      const res = await api.post(`/api/reports/violations/run?${queryString}`, {
        name: runName?.trim() || null,
      });

      const created = res.data;
      setActiveRun(created);
      setSummary(created?.snapshot || null);
      showToast("Report saved", "success");

      // refresh history so it shows immediately
      await loadRuns({ limit: runsMeta.limit || HISTORY_LIMIT, offset: 0 });

      // clear name (optional)
      setRunName("");
    } catch (e) {
      setError(e.message || "Failed to create report run");
    } finally {
      setSaving(false);
    }
  }

  async function downloadCsv() {
    if (downloading) return;

    try {
      setDownloading(true);

      // If we opened a saved run, download the saved run CSV
      if (activeRun?.id) {
        await downloadFile(
          `/api/reports/violations/runs/${activeRun.id}/export`,
          `report-${activeRun.id}.csv`
        );
        return;
      }

      // Otherwise download the live CSV for current filters
      await downloadFile(
        `/api/reports/violations/export?${queryString}`,
        "violations-report.csv"
      );
    } catch (e) {
      setError(e?.message || "Failed to download CSV");
    } finally {
      setDownloading(false);
    }
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setStatus("");
    setCategory("");
  }

  React.useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = summary?.kpis;
  const viewingSaved = !!activeRun?.id;
  const hasFilters = !!(from || to || status || category);

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
              loadRuns({ limit: HISTORY_LIMIT, offset: 0 });
            }}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Report History
          </button>

          <button
            onClick={loadLive}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Refresh Live
          </button>

          <button
            onClick={downloadCsv}
            disabled={downloading}
            className="rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? "Preparing…" : viewingSaved ? "Download Saved CSV" : "Download CSV"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4 md:grid-cols-4">
        <div>
          <p className="text-sm text-slate-400">From</p>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm text-slate-100"
          />
        </div>

        <div>
          <p className="text-sm text-slate-400">To</p>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm text-slate-100"
          />
        </div>

        <div>
          <p className="text-sm text-slate-400">Status</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm text-slate-100"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "in_review" ? "In Review" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-sm text-slate-400">Category</p>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm text-slate-100"
          >
            <option value="">All</option>
            {Array.from(knownCategories)
              .sort()
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </div>

        {dateRangeInvalid ? (
          <p className="md:col-span-4 text-xs text-red-400">
            "From" is after "To" — this range will always return zero results.
          </p>
        ) : null}

        <div className="md:col-span-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadLive}
              disabled={dateRangeInvalid}
              className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply Filters (Live)
            </button>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
              >
                Clear Filters
              </button>
            )}

            <button
              onClick={switchToLive}
              className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
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
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm text-slate-100 md:w-[360px]"
            />
            <button
              onClick={createAndSaveRun}
              disabled={saving || dateRangeInvalid}
              className="rounded-xl border border-amber-700 bg-amber-600/20 px-4 py-2 text-sm text-amber-200 hover:bg-amber-600/30 disabled:cursor-not-allowed disabled:opacity-60"
              title="Generate and save this report as a snapshot — saved reports are a permanent audit log and can't be deleted"
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
        <div className="rounded-xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4 text-sm text-slate-300">
          <p>{hasFilters ? "No violations match these filters." : "No data to show."}</p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
            >
              Clear filters
            </button>
          )}
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
            <Card title="Violations over time">
              <TrendChart data={summary.byDay} title="Violations over time" />
              <BreakdownTable rows={summary.byDay} left="day" right="count" />
            </Card>

            <Card title="By category">
              <CategoryBarChart data={summary.byCategory} title="Violations by category" />
              <BreakdownTable rows={summary.byCategory} left="category" right="count" />
            </Card>
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
            const nextOffset = Math.max((runsMeta.offset || 0) - (runsMeta.limit || HISTORY_LIMIT), 0);
            loadRuns({ limit: runsMeta.limit || HISTORY_LIMIT, offset: nextOffset });
          }}
          onNext={() => {
            const nextOffset = (runsMeta.offset || 0) + (runsMeta.limit || HISTORY_LIMIT);
            if (nextOffset >= (runsMeta.total || 0)) return;
            loadRuns({ limit: runsMeta.limit || HISTORY_LIMIT, offset: nextOffset });
          }}
          onOpen={(id) => openRun(id)}
        />
      ) : null}
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
      <p className="text-sm font-medium text-slate-100">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// Precise per-row figures alongside the chart above — reports are for
// audit/export, so exact numbers matter more here than on the dashboard.
function BreakdownTable({ rows, left, right }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-4 max-h-48 overflow-y-auto overflow-x-auto border-t border-slate-800 pt-3">
      <table className="w-full text-left text-sm text-slate-200">
        <thead className="text-xs uppercase text-slate-400">
          <tr className="border-b border-slate-800">
            <th className="py-1.5 pr-3">{left}</th>
            <th className="py-1.5 text-right">{right}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-b border-slate-800/60">
              <td className="py-1.5 pr-3 text-slate-100">{r[left]}</td>
              <td className="py-1.5 text-right font-mono text-slate-300">{r[right]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryModal({ onClose, loading, error, runs, meta, onPrev, onNext, onOpen }) {
  React.useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const limit = meta.limit || HISTORY_LIMIT;
  const page = Math.floor((meta.offset || 0) / limit) + 1;
  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / limit));

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[920px] rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-100">Report History</p>
            <p className="text-xs text-slate-400">
              Open a previously created report snapshot (auditable — saved reports are
              permanent and can't be deleted).
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
            <div className="rounded-xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4 text-sm text-slate-300">
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

                      <td className="py-3 pr-3 text-xs text-slate-300 whitespace-nowrap">
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
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          <span>Total: <span className="font-mono">{r.kpis?.total ?? 0}</span></span>
                          <span>Open: <span className="font-mono">{r.kpis?.open ?? 0}</span></span>
                          <span>Review: <span className="font-mono">{r.kpis?.in_review ?? 0}</span></span>
                          <span>Resolved: <span className="font-mono">{r.kpis?.resolved ?? 0}</span></span>
                        </div>
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
                  Showing {meta.offset + 1}–
                  {Math.min(meta.offset + meta.limit, meta.total)} of {meta.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onPrev}
                    disabled={(meta.offset || 0) === 0}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="px-2 text-xs text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={onNext}
                    disabled={(meta.offset || 0) + (meta.limit || HISTORY_LIMIT) >= (meta.total || 0)}
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




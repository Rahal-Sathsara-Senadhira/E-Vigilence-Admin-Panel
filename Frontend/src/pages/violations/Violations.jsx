// src/pages/violations/Violations.jsx
import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Search, ChevronRight, ChevronLeft } from "lucide-react";
import { listViolations } from "../../services/violationsApi";
import StatusBadge from "../../components/StatusBadge";
import { STATUS_OPTIONS } from "../../utils/violationStatus";

const LIMIT = 20;

function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

export default function Violations() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [q, setQ] = React.useState(searchParams.get("q") || "");
  const [debouncedQ, setDebouncedQ] = React.useState(q);
  const [refreshTick, setRefreshTick] = React.useState(0);

  // Categories are derived from whatever's currently loaded — there's no
  // dedicated "distinct categories" endpoint, same trade-off RegionalStations
  // already makes for its region filter.
  const [knownCategories, setKnownCategories] = React.useState(new Set());

  // Debounce the raw search input
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Any filter change resets to page 1
  React.useEffect(() => {
    setOffset(0);
  }, [status, category, debouncedQ]);

  // Single source of truth for fetching — fires whenever a filter or the
  // page changes.
  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");
        setLoading(true);

        const res = await listViolations({
          status: status || undefined,
          category: category || undefined,
          q: debouncedQ || undefined,
          limit: LIMIT,
          offset,
        });

        if (cancelled) return;

        setItems(res.data || []);
        setTotal(res.meta?.total ?? (res.data || []).length);

        setKnownCategories((prev) => {
          const next = new Set(prev);
          (res.data || []).forEach((v) => {
            const c = v.type || v.category;
            if (c) next.add(c);
          });
          return next;
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load violations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    setSearchParams(debouncedQ ? { q: debouncedQ } : {}, { replace: true });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, debouncedQ, offset, refreshTick]);

  const hasFilters = !!(status || category || debouncedQ);
  const page = Math.floor(offset / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage and track all reported system violations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <RefreshButton onClick={() => setRefreshTick((t) => t + 1)} />

          <Link
            to="/violations/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Complaint
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, description, or violation…"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "in_review" ? "In Review" : s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
        >
          <option value="">All categories</option>
          {Array.from(knownCategories)
            .sort()
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setStatus("");
              setCategory("");
            }}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
        {loading ? (
          <p className="text-slate-300">Loading…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-slate-300">
              {hasFilters
                ? "No violations match your filters."
                : "No violations recorded yet."}
            </p>
            {!hasFilters && (
              <Link
                to="/violations/new"
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30"
              >
                <Plus className="h-4 w-4" />
                Create the first complaint
              </Link>
            )}
          </div>
        ) : (
          <>
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
                    <th className="py-3 pr-3" />
                  </tr>
                </thead>

                <tbody>
                  {items.map((v) => {
                    const id = v._id || v.id;

                    const lat = v.location?.lat ?? v.latitude ?? v.lat ?? null;
                    const lng = v.location?.lng ?? v.longitude ?? v.lng ?? null;

                    const latNum = safeNum(lat);
                    const lngNum = safeNum(lng);

                    const created = v.createdAt ?? v.created_at ?? null;
                    const cat = v.type ?? v.category ?? "-";
                    const dms = v.location?.dms ?? v.location_text ?? null;

                    return (
                      <tr
                        key={id}
                        onClick={() => nav(`/violations/${id}`)}
                        className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-900/50"
                        title="Click to open details"
                      >
                        <td className="py-3 pr-3">
                          <div className="font-medium text-slate-100">{v.title}</div>
                          {dms ? (
                            <div className="mt-1 font-mono text-xs text-slate-400">
                              {dms}
                            </div>
                          ) : null}
                        </td>

                        <td className="py-3 pr-3">
                          <StatusBadge status={v.status} />
                        </td>

                        <td className="py-3 pr-3 text-slate-300">{cat}</td>

                        <td className="py-3 pr-3 font-mono text-xs text-slate-300">
                          {latNum == null ? "-" : latNum.toFixed(6)}
                        </td>

                        <td className="py-3 pr-3 font-mono text-xs text-slate-300">
                          {lngNum == null ? "-" : lngNum.toFixed(6)}
                        </td>

                        <td className="py-3 pr-3 text-slate-400">
                          {created ? new Date(created).toLocaleString() : "-"}
                        </td>

                        <td className="py-3 pr-0 text-right text-slate-600">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((o) => Math.max(o - LIMIT, 0))}
                  disabled={offset === 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="px-2 py-2 text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setOffset((o) => o + LIMIT)}
                  disabled={offset + LIMIT >= total}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RefreshButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
    >
      <RefreshCw className="h-4 w-4" />
      Refresh
    </button>
  );
}




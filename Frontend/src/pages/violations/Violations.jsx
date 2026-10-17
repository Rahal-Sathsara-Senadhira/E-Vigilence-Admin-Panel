// src/pages/violations/Violations.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, SearchX, Inbox, AlertCircle } from "lucide-react";
import { listViolationCatalog } from "../../services/violationCatalogApi";
import { getUser } from "../../utils/auth";
import { useViolationsQuery } from "./list/useViolationsQuery";
import StatusTiles from "./list/StatusTiles";
import ViolationsToolbar from "./list/ViolationsToolbar";
import ViolationsTable from "./list/ViolationsTable";
import ViolationCards from "./list/ViolationCards";
import Pagination from "./list/Pagination";

function NewComplaintButton({ label = "New Complaint" }) {
  return (
    <Link
      to="/violations/new"
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <Plus className="h-4 w-4" />
      {label}
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Loading violations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/5 rounded" />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
          <div className="skeleton hidden h-5 w-24 rounded-md md:block" />
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton hidden h-4 w-16 rounded md:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onClear }) {
  const Icon = hasFilters ? SearchX : Inbox;
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-muted">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold text-ink">
        {hasFilters ? "No violations match these filters" : "No violations recorded yet"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {hasFilters
          ? "Try a different search or remove a filter."
          : "Complaints you create, and reports synced from the citizen app, will appear here."}
      </p>
      <div className="mt-5">
        {hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised"
          >
            Clear all filters
          </button>
        ) : (
          <NewComplaintButton label="Create the first complaint" />
        )}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-st-rejected/10 text-st-rejected">
        <AlertCircle className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold text-ink">Couldn't load violations</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}

export default function Violations() {
  const query = useViolationsQuery();
  const { filters, setFilters, items, total, totalPages, stats, loading, error, refresh } = query;
  const isHQ = getUser()?.role === "hq";

  // Categories come from the Violation Catalog (a violation's category is its
  // primary offence's name) — previously they were collected from whichever
  // rows happened to be loaded, so most were missing.
  const [categories, setCategories] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    listViolationCatalog()
      .then((rows) => {
        if (cancelled) return;
        const names = (Array.isArray(rows) ? rows : []).map((r) => r.name).filter(Boolean);
        setCategories([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => !cancelled && setCategories([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions =
    filters.category && !categories.includes(filters.category)
      ? [filters.category, ...categories]
      : categories;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Track every reported violation from first report to final decision.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh"
            title="Refresh"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <NewComplaintButton />
        </div>
      </div>

      <StatusTiles
        stats={stats}
        selected={filters.status}
        onSelect={(status) => setFilters({ status })}
      />

      <ViolationsToolbar
        {...query}
        categories={categoryOptions}
        showUnassigned={isHQ}
      />

      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && items.length === 0 ? (
          <SkeletonRows />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={query.hasFilters} onClear={query.clearAll} />
        ) : (
          // Previous rows stay visible (dimmed) while the next page loads,
          // instead of the table collapsing to a skeleton on every change.
          <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
            <ViolationsTable items={items} />
            <ViolationCards items={items} />
            <Pagination
              page={filters.page}
              totalPages={totalPages}
              total={total}
              size={filters.size}
              onPage={(page) => setFilters({ page })}
              onSize={(size) => setFilters({ size })}
            />
          </div>
        )}
      </section>
    </div>
  );
}

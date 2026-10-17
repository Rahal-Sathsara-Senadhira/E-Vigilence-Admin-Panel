import React from "react";
import { Search, X, Copy, MapPinOff } from "lucide-react";
import { SORT_OPTIONS } from "./useViolationsQuery";
import { getStatusMeta } from "../../../utils/violationStatus";

const fieldClass =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function AttentionToggle({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-attention/40 ${
        active
          ? "border-attention bg-attention/15 text-attention-ink"
          : "border-line bg-surface text-muted hover:border-attention/60 hover:text-attention-ink"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {typeof count === "number" ? (
        <span
          className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
            active ? "bg-attention/20" : "bg-raised"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-xs font-medium text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="rounded-full p-0.5 text-muted hover:bg-raised hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export default function ViolationsToolbar({
  filters,
  setFilters,
  searchInput,
  setSearchInput,
  categories,
  stats,
  showUnassigned,
  hasFilters,
  clearAll,
}) {
  const chips = [];
  if (filters.status) {
    chips.push({ label: `Status: ${getStatusMeta(filters.status).label}`, clear: { status: "" } });
  }
  if (filters.category) chips.push({ label: `Category: ${filters.category}`, clear: { category: "" } });
  if (filters.q.trim()) chips.push({ label: `Search: “${filters.q.trim()}”`, clear: { q: "" } });
  if (filters.duplicates) chips.push({ label: "Possible duplicates", clear: { duplicates: false } });
  if (filters.unassigned) chips.push({ label: "Unassigned", clear: { unassigned: false } });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, plate number, address…"
            aria-label="Search violations"
            className={`${fieldClass} w-full pl-9 pr-9 placeholder:text-muted`}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-raised hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <select
          value={filters.category}
          onChange={(e) => setFilters({ category: e.target.value })}
          aria-label="Category"
          className={fieldClass}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <AttentionToggle
          active={filters.duplicates}
          onClick={() => setFilters({ duplicates: !filters.duplicates })}
          icon={Copy}
          label="Duplicates"
          count={stats?.duplicates}
        />

        {showUnassigned ? (
          <AttentionToggle
            active={filters.unassigned}
            onClick={() => setFilters({ unassigned: !filters.unassigned })}
            icon={MapPinOff}
            label="Unassigned"
            count={stats?.unassigned}
          />
        ) : null}

        <select
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value })}
          aria-label="Sort"
          className={fieldClass}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Chip
              key={c.label}
              label={c.label}
              onRemove={() => {
                if ("q" in c.clear) setSearchInput("");
                setFilters(c.clear);
              }}
            />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

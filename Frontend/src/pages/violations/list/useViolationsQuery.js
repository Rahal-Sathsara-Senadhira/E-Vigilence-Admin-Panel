import React from "react";
import { useSearchParams } from "react-router-dom";
import { listViolations, getViolationStats } from "../../../services/violationsApi";

export const PAGE_SIZES = [20, 50, 100];
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

// Every filter lives in the URL, so a filtered view survives a refresh and
// can be bookmarked or shared. `global_q` is the Topbar's global search.
function readFilters(sp) {
  const size = Number(sp.get("size"));
  return {
    status: sp.get("status") || "",
    category: sp.get("category") || "",
    q: sp.get("q") || sp.get("global_q") || "",
    duplicates: sp.get("dup") === "1",
    unassigned: sp.get("unassigned") === "1",
    sort: sp.get("sort") === "oldest" ? "oldest" : "newest",
    page: Math.max(1, Number(sp.get("page")) || 1),
    size: PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0],
  };
}

const URL_KEYS = {
  status: "status",
  category: "category",
  q: "q",
  duplicates: "dup",
  unassigned: "unassigned",
  sort: "sort",
  page: "page",
  size: "size",
};

const DEFAULTS = { sort: "newest", page: 1, size: PAGE_SIZES[0] };

export function useViolationsQuery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);

  // The search box updates instantly; the URL (and the fetch) follow after a
  // short pause so typing doesn't fire a request per keystroke.
  const [searchInput, setSearchInput] = React.useState(filters.q);

  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refreshTick, setRefreshTick] = React.useState(0);

  // Patch one or more filters. Anything other than a page change resets to
  // page 1; default values are dropped from the URL to keep it short.
  const setFilters = React.useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const changesPage = Object.keys(patch).some((k) => k !== "page");
          if (changesPage) next.delete("page");
          if ("q" in patch) next.delete("global_q");

          for (const [key, value] of Object.entries(patch)) {
            const urlKey = URL_KEYS[key];
            const isDefault = value === DEFAULTS[key] || value === "" || value === false || value == null;
            if (isDefault) next.delete(urlKey);
            else next.set(urlKey, value === true ? "1" : String(value));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  React.useEffect(() => {
    if (searchInput === filters.q) return undefined;
    // Untrimmed, so the box isn't rewritten under the cursor ("a " → "a")
    // when the URL syncs back; trimmed when the request is sent.
    const t = setTimeout(() => setFilters({ q: searchInput }), 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.q, setFilters]);

  // Keep the box in step when the URL changes from elsewhere (chip removed,
  // Clear all, back button).
  React.useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const queryKey = JSON.stringify(filters);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");
        setLoading(true);
        const res = await listViolations({
          status: filters.status || undefined,
          category: filters.category || undefined,
          q: filters.q.trim() || undefined,
          duplicates: filters.duplicates,
          unassigned: filters.unassigned,
          sort: filters.sort,
          limit: filters.size,
          offset: (filters.page - 1) * filters.size,
        });
        if (cancelled) return;
        setItems(res.data || []);
        setTotal(res.meta?.total ?? (res.data || []).length);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load violations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, refreshTick]);

  // Counts don't depend on the filters — only reload on refresh.
  React.useEffect(() => {
    let cancelled = false;
    getViolationStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const refresh = React.useCallback(() => setRefreshTick((t) => t + 1), []);

  const clearAll = React.useCallback(() => {
    setSearchInput("");
    setFilters({ status: "", category: "", q: "", duplicates: false, unassigned: false });
  }, [setFilters]);

  const hasFilters = !!(
    filters.status ||
    filters.category ||
    filters.q.trim() ||
    filters.duplicates ||
    filters.unassigned
  );

  return {
    filters,
    setFilters,
    searchInput,
    setSearchInput,
    clearAll,
    hasFilters,
    items,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.size)),
    stats,
    loading,
    error,
    refresh,
  };
}

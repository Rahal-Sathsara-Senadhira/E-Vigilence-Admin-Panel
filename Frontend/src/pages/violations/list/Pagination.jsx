import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "./useViolationsQuery";

// 1 … 4 5 [6] 7 8 … 20
function pageWindow(page, totalPages) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
}

const btn =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

export default function Pagination({ page, totalPages, total, size, onPage, onSize }) {
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span>
          Showing <span className="font-semibold text-ink">{from.toLocaleString()}</span>–
          <span className="font-semibold text-ink">{to.toLocaleString()}</span> of{" "}
          <span className="font-semibold text-ink">{total.toLocaleString()}</span>
        </span>
        <label className="flex items-center gap-1.5">
          <span className="sr-only sm:not-sr-only">Rows</span>
          <select
            value={size}
            onChange={(e) => onSize(Number(e.target.value))}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${btn} text-ink hover:bg-raised`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageWindow(page, totalPages).map((p) =>
          typeof p === "string" ? (
            <span key={p} className="px-1 text-muted" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              className={`${btn} ${
                p === page ? "bg-primary text-white" : "text-ink hover:bg-raised"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className={`${btn} text-ink hover:bg-raised`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

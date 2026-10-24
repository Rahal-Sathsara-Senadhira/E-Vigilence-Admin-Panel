// A compact list of cases — the left side of the Inbox and the Cases page.

import { FolderOpen, TriangleAlert } from "lucide-react";
import { formatRelative } from "@/lib/format.js";
import { EmptyState, Pagination, Skeleton, cn } from "@/ui/index.js";
import { CaseStatus, DeadlineClock, PriorityBadge } from "./CaseBadges.jsx";

/**
 * @param {{
 *   query: ReturnType<typeof import("../api.js").useCases>,
 *   selectedId?: string | null,
 *   onSelect: (id: string) => void,
 *   onPage: (page: number) => void,
 *   empty: { title: string, description: string },
 *   showStatus?: boolean,
 *   showStation?: boolean,
 * }} props
 */
export function CaseList({ query, selectedId, onSelect, onPage, empty, showStatus, showStation }) {
  if (query.isPending) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (query.isError) return <p className="p-4 text-sm text-danger">{query.error.message}</p>;
  if (query.data.items.length === 0)
    return <EmptyState icon={<FolderOpen />} title={empty.title} description={empty.description} />;
  return (
    <>
      <ul className="divide-y divide-border">
        {query.data.items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={selectedId === c.id || undefined}
              className={cn(
                "relative block w-full px-4 py-3 text-left transition-colors hover:bg-sunken",
                selectedId === c.id && "bg-action-soft hover:bg-action-soft",
              )}
            >
              {selectedId === c.id ? (
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-action" />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-medium text-text">{c.caseNumber}</span>
                <span className="text-xs text-text-muted">{formatRelative(c.openedAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={c.priority} />
                {showStatus ? <CaseStatus status={c.status} disputed={c.disputed} /> : null}
                {!showStatus && c.disputed ? <CaseStatus status={c.status} disputed /> : null}
                <span className="font-mono text-xs text-text">
                  {c.plateUnknown ? "Plate unknown" : c.vehicleNumber}
                </span>
                <DeadlineClock deadline={c.deadline} compact />
              </div>
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-text-muted">
                {c.offenceCodes.join(", ")}
                {showStation && c.station ? ` · ${c.station.name}` : ""}
                {c.investigatingOfficer ? ` · ${c.investigatingOfficer}` : ""}
                {c.warnings.length ? (
                  <span className="inline-flex items-center gap-0.5 text-warning">
                    · <TriangleAlert className="size-3" aria-hidden /> {c.warnings.length}
                  </span>
                ) : null}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <Pagination
        page={query.data.page}
        pageSize={query.data.pageSize}
        total={query.data.total}
        noun="cases"
        onPage={onPage}
      />
    </>
  );
}

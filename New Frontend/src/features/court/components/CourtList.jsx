// A compact list of court cases — the Inbox and the Court page.

import { Clock, Gavel, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/format.js";
import { Badge, EmptyState, Pagination, Skeleton, cn } from "@/ui/index.js";
import { COURT_STATUS, NEXT } from "../lib/labels.js";

/**
 * @param {{
 *   query: ReturnType<typeof import("../api.js").useCourtCases>,
 *   selectedId?: string | null,
 *   onSelect: (id: string) => void,
 *   onPage: (page: number) => void,
 *   empty: { title: string, description: string },
 * }} props
 */
export function CourtList({ query, selectedId, onSelect, onPage, empty }) {
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
    return <EmptyState icon={<Gavel />} title={empty.title} description={empty.description} />;
  return (
    <>
      <ul className="divide-y divide-border">
        {query.data.items.map((cc) => {
          const [label, tone] = COURT_STATUS[cc.status];
          return (
            <li key={cc.id}>
              <button
                type="button"
                onClick={() => onSelect(cc.id)}
                aria-current={selectedId === cc.id || undefined}
                className={cn(
                  "relative block w-full px-4 py-3 text-left transition-colors hover:bg-sunken",
                  selectedId === cc.id && "bg-action-soft hover:bg-action-soft",
                )}
              >
                {selectedId === cc.id ? (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-action" />
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-medium text-text">{cc.courtRef}</span>
                  <span className="text-xs text-text-muted">
                    {cc.courtCaseNumber ?? cc.caseNumber}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
                  {cc.flaggedToHq ? (
                    <Badge tone="danger">
                      <TriangleAlert className="size-3" aria-hidden /> {cc.postponements}{" "}
                      postponements
                    </Badge>
                  ) : null}
                  {cc.next ? (
                    <Badge>
                      <Clock className="size-3" aria-hidden /> {NEXT[cc.next.kind]}{" "}
                      {formatDateTime(cc.next.at)}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-text-muted">
                  {cc.accused?.name ?? "Accused not identified"} ·{" "}
                  {cc.charges.map((c) => c.code).join(", ")}
                  {cc.court ? ` · ${cc.court.name}` : ""}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      <Pagination
        page={query.data.page}
        pageSize={query.data.pageSize}
        total={query.data.total}
        noun="court cases"
        onPage={onPage}
      />
    </>
  );
}

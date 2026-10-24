// A compact list of notices — the Inbox and the Penalty notices page.

import { FileWarning } from "lucide-react";
import { EmptyState, Pagination, Skeleton, cn } from "@/ui/index.js";
import { rupees } from "../lib/labels.js";
import { NextDate, NoticeStatus } from "./NoticeBadges.jsx";

/**
 * @param {{
 *   query: ReturnType<typeof import("../api.js").useNotices>,
 *   selectedId?: string | null,
 *   onSelect: (id: string) => void,
 *   onPage: (page: number) => void,
 *   empty: { title: string, description: string },
 * }} props
 */
export function NoticeList({ query, selectedId, onSelect, onPage, empty }) {
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
    return (
      <EmptyState icon={<FileWarning />} title={empty.title} description={empty.description} />
    );
  return (
    <>
      <ul className="divide-y divide-border">
        {query.data.items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n.id)}
              aria-current={selectedId === n.id || undefined}
              className={cn(
                "relative block w-full px-4 py-3 text-left transition-colors hover:bg-sunken",
                selectedId === n.id && "bg-action-soft hover:bg-action-soft",
              )}
            >
              {selectedId === n.id ? (
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-action" />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-medium text-text">
                  {n.noticeNumber}
                </span>
                <span className="text-xs text-text-muted tabular-nums">
                  {n.kind === "warning" ? "Warning" : rupees(n.amount)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <NoticeStatus status={n.status} courtProposed={n.courtProposed} />
                <NextDate next={n.next} compact />
              </div>
              <p className="mt-1 truncate text-xs text-text-muted">
                {n.addressee} · {n.town}
                {n.plate ? ` · ${n.plate}` : ""} · {n.caseNumber}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <Pagination
        page={query.data.page}
        pageSize={query.data.pageSize}
        total={query.data.total}
        noun="notices"
        onPage={onPage}
      />
    </>
  );
}

// A compact list of reports — the left side of the Inbox and the Reports page.

import { Inbox, Paperclip } from "lucide-react";
import { formatRelative } from "@/lib/format.js";
import { EmptyState, Pagination, Skeleton, cn } from "@/ui/index.js";
import { CHANNEL_LABELS, label } from "../lib/labels.js";
import { PriorityBadge, ReportStatus } from "./Badges.jsx";

/**
 * @param {{
 *   query: ReturnType<typeof import("../api.js").useReports>,
 *   selectedId?: string | null,
 *   onSelect: (id: string) => void,
 *   onPage: (page: number) => void,
 *   empty: { title: string, description: string },
 *   showStatus?: boolean,
 * }} props
 */
export function ReportList({ query, selectedId, onSelect, onPage, empty, showStatus }) {
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
    return <EmptyState icon={<Inbox />} title={empty.title} description={empty.description} />;
  return (
    <>
      <ul className="divide-y divide-border">
        {query.data.items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={selectedId === r.id || undefined}
              className={cn(
                "relative block w-full px-4 py-3 text-left transition-colors hover:bg-sunken",
                selectedId === r.id && "bg-action-soft hover:bg-action-soft",
              )}
            >
              {selectedId === r.id ? (
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-action" />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-medium text-text">
                  {r.reportNumber}
                </span>
                <span className="text-xs text-text-muted">{formatRelative(r.receivedAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={r.priority} />
                {showStatus ? (
                  <ReportStatus status={r.status} underReview={r.underStationReview} />
                ) : null}
                <span className="font-mono text-xs text-text">
                  {r.plateUnknown ? "Plate unknown" : r.vehicleNumber}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-text-muted">
                {label(r.channel, CHANNEL_LABELS)}
                {r.offenceCodes.length
                  ? ` · ${r.offenceCodes.join(", ")}`
                  : " · offence not recognised"}
                {r.evidenceCount ? (
                  <span className="inline-flex items-center gap-0.5">
                    · <Paperclip className="size-3" aria-hidden /> {r.evidenceCount}
                  </span>
                ) : null}
                {r.flags.length ? ` · ${r.flags.length} to check` : ""}
                {r.reporterStanding ? ` · reporter ${r.reporterStanding.status}` : ""}
                {r.lockedBy ? ` · ${r.lockedBy} triaging` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <Pagination
        page={query.data.page}
        pageSize={query.data.pageSize}
        total={query.data.total}
        noun="reports"
        onPage={onPage}
      />
    </>
  );
}

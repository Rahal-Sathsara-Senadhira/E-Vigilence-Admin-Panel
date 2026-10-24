// Overdue — every time limit missed in your area and not yet put right,
// longest overdue first (docs/09 T3). An item leaves the list by itself once
// it moves on; nothing is cleared by hand.

import { CircleCheck, TriangleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { Badge, EmptyState, Page, Pagination, Panel, Skeleton, cn } from "@/ui/index.js";
import { useOverdue } from "../api.js";

const ITEM = {
  report: "Report",
  case: "Case",
  notice: "Notice",
  court_case: "Court case",
  payment: "Payment",
};

/** "5 h", "3 days" @param {number} hours */
const over = (hours) => (hours < 48 ? `${Math.max(hours, 0)} h` : `${Math.floor(hours / 24)} days`);

export function OverduePage() {
  const [params, setParams] = useSearchParams();
  const limitKey = params.get("limit") ?? undefined;
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useOverdue({ limitKey, page });
  const kinds = list.data?.kinds ?? [];
  const all = kinds.reduce((sum, k) => sum + k.count, 0);

  /** @param {string | undefined} key */
  const choose = (key) => setParams(key ? { limit: key } : {}, { replace: true });

  return (
    <Page
      title="Overdue"
      description="Time limits missed in your area, longest overdue first. Each item leaves this list once it moves on."
    >
      <Panel>
        {kinds.length ? (
          <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
            <Chip active={!limitKey} onClick={() => choose(undefined)}>
              All · {all}
            </Chip>
            {kinds.map((k) => (
              <Chip
                key={k.limitKey}
                active={limitKey === k.limitKey}
                onClick={() => choose(k.limitKey)}
              >
                <span className="first-letter:uppercase">{k.label}</span> · {k.count}
                {k.escalated ? (
                  <span className="ml-1 text-danger">({k.escalated} at twice the limit)</span>
                ) : null}
              </Chip>
            ))}
          </div>
        ) : null}
        {list.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.isError ? (
          <p className="p-4 text-sm text-danger">{list.error.message}</p>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={<CircleCheck />}
            title="Nothing overdue"
            description="Every step in your area is within its time limit."
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {list.data.items.map((b) => (
                <li key={b.id}>
                  <Link
                    to={b.link}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-text">
                        <span className="font-mono text-[13px] font-medium">{b.item.number}</span>
                        <span className="text-text-muted"> · {ITEM[b.item.type]}</span>
                      </span>
                      <span className="block text-xs text-text-muted first-letter:uppercase">
                        {b.label}
                        {b.stationName ? ` · ${b.stationName}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {b.escalated ? (
                        <Badge tone="danger">
                          <TriangleAlert className="size-3" aria-hidden /> Twice the limit
                        </Badge>
                      ) : null}
                      <span title={`Due ${formatDateTime(b.dueAt)}`}>
                        <span className="font-medium text-warning">{over(b.hoursOver)}</span> over
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              noun="overdue items"
              onPage={(p) =>
                setParams({ ...(limitKey ? { limit: limitKey } : {}), page: String(p) })
              }
            />
          </>
        )}
      </Panel>
    </Page>
  );
}

/** @param {{ active: boolean, onClick: () => void, children: import("react").ReactNode }} props */
function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-action bg-action-soft font-medium text-action"
          : "border-border text-text-muted hover:bg-sunken",
      )}
    >
      {children}
    </button>
  );
}

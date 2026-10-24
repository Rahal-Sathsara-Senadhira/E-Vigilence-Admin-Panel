// A compact list of payments — the Inbox and the Payments page.

import { Wallet } from "lucide-react";
import { formatRelative } from "@/lib/format.js";
import { Badge, EmptyState, Pagination, Skeleton, cn } from "@/ui/index.js";
import { FLAG_LABELS, METHOD_LABELS, PAYMENT_STATUS, rupees } from "../lib/labels.js";

/**
 * @param {{
 *   query: ReturnType<typeof import("../api.js").usePayments>,
 *   selectedId?: string | null,
 *   onSelect: (id: string) => void,
 *   onPage: (page: number) => void,
 *   empty: { title: string, description: string },
 * }} props
 */
export function PaymentList({ query, selectedId, onSelect, onPage, empty }) {
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
    return <EmptyState icon={<Wallet />} title={empty.title} description={empty.description} />;
  return (
    <>
      <ul className="divide-y divide-border">
        {query.data.items.map((p) => {
          const [label, tone] = PAYMENT_STATUS[p.status];
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-current={selectedId === p.id || undefined}
                className={cn(
                  "relative block w-full px-4 py-3 text-left transition-colors hover:bg-sunken",
                  selectedId === p.id && "bg-action-soft hover:bg-action-soft",
                )}
              >
                {selectedId === p.id ? (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-action" />
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-medium text-text">
                    {p.reference ?? "—"}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-text">
                    {rupees(p.amount)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
                  {p.refund ? (
                    <Badge tone={p.refund.status === "due" ? "warning" : "neutral"}>
                      {p.refund.status === "due" ? "Refund due" : "Refunded"}
                    </Badge>
                  ) : null}
                  {p.channel === "receipt" && p.status === "succeeded" && !p.review ? (
                    <Badge tone="action">To review</Badge>
                  ) : null}
                  {p.flags.map((f) => (
                    <Badge key={f} tone="danger">
                      {FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (f)] ?? f}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 truncate text-xs text-text-muted">
                  {p.noticeNumber} · {p.method ? METHOD_LABELS[p.method] : "—"} ·{" "}
                  {formatRelative(p.createdAt)}
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
        noun="payments"
        onPage={onPage}
      />
    </>
  );
}

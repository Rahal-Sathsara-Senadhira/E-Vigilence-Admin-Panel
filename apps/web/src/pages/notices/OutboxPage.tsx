// Letters and SMS held until go-live — docs/15 D15-3. Nothing here has been
// sent; HQ reads them to check wording and addressing.

import { Alert, Button, Card, EmptyState, PageHeader, Skeleton } from "@ev/ui";
import { Mail, MessageSquare } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "../../lib/format";
import { useOutbox } from "../../lib/notices";

export function OutboxPage() {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const outbox = useOutbox(page);
  const totalPages = outbox.data
    ? Math.max(1, Math.ceil(outbox.data.total / outbox.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title="Outbox"
        description="Letters and SMS the system would send. Nothing leaves the system until go-live."
      />
      <Card>
        {outbox.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : outbox.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(outbox.error as Error).message}</Alert>
          </div>
        ) : outbox.data.items.length === 0 ? (
          <EmptyState
            icon={<Mail className="size-5" />}
            title="No messages"
            description="Messages appear here when notices are posted, reminded or reviewed."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {outbox.data.items.map((m) => {
                const open = openId === m.id;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => setOpenId(open ? null : m.id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-raised"
                    >
                      {m.channel === "sms" ? (
                        <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted" />
                      ) : (
                        <Mail className="mt-0.5 size-4 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{m.subject}</span>
                        <span className="block truncate text-xs text-muted">
                          {m.channel === "sms" ? "SMS" : "Letter"} to {m.to}
                          {m.noticeNumber ? ` · ${m.noticeNumber}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
                        {formatDateTime(m.createdAt)}
                      </span>
                    </button>
                    <pre
                      hidden={!open}
                      className="mx-5 mb-4 overflow-x-auto rounded-lg border border-line bg-raised p-4 font-sans text-sm whitespace-pre-wrap text-ink"
                    >
                      {m.body}
                    </pre>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                {outbox.data.total} message{outbox.data.total === 1 ? "" : "s"} held
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

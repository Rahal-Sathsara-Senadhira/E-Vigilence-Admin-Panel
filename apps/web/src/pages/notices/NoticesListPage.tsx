// Penalty notice lists — docs/05 §5–6: what to post, responses to review,
// overdue notices and court proposals.

import { formatRupees } from "@ev/shared";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@ev/ui";
import { FileText, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useCurrentUser } from "../../auth/AuthProvider";
import { NoticeFlags, NoticeStatusBadge, formatDate } from "../../components/noticeBits";
import { Plate } from "../../components/reportBits";
import { useNotices, type NoticeView } from "../../lib/notices";

const TABS: { view: NoticeView; label: string; hint: string }[] = [
  {
    view: "to_post",
    label: "To post",
    hint: "Issued notices to print and send by registered post. Record the posting reference.",
  },
  {
    view: "nominations",
    label: "Driver named",
    hint: "The owner named someone else as the driver. Accept to send a new notice to the driver, or reject.",
  },
  {
    view: "disputes",
    label: "Disputes",
    hint: "Disputes for the OIC to uphold or reject. An upheld dispute withdraws the notice.",
  },
  {
    view: "overdue",
    label: "Overdue",
    hint: "Past the due date. A reminder has been sent with a final date.",
  },
  {
    view: "court_proposed",
    label: "Court proposed",
    hint: "Past the final date. The OIC confirms the referral to court.",
  },
  {
    view: "service_failed",
    label: "Not delivered",
    hint: "Returned by the post office. Re-serve to a new address.",
  },
  { view: "all", label: "All notices", hint: "Every notice, most recently changed first." },
];

export function NoticesListPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const view = TABS.find((t) => t.view === params.get("view"))?.view ?? "to_post";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const notices = useNotices({ view, q: q.trim() || undefined, page });
  const totalPages = notices.data
    ? Math.max(1, Math.ceil(notices.data.total / notices.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title="Penalty notices"
        description={
          me.stationName ? `Notices issued by ${me.stationName}.` : "Every notice nationally."
        }
      />
      <div
        role="tablist"
        aria-label="Notice lists"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.view}
            role="tab"
            aria-selected={view === t.view}
            onClick={() => (setParams({ view: t.view }), setPage(1))}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
              view === t.view
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">{TABS.find((t) => t.view === view)?.hint}</p>

      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label="Search by notice number or plate"
              placeholder="Notice number or plate"
              className="pl-9"
              value={q}
              onChange={(e) => (setQ(e.target.value), setPage(1))}
            />
          </div>
        </div>
        {notices.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : notices.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(notices.error as Error).message}</Alert>
          </div>
        ) : notices.data.items.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title="Nothing here"
            description="Notices appear here when an OIC or HQ decides on a penalty notice."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Notice</Th>
                  <Th>Addressee</Th>
                  <Th>Vehicle</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {notices.data.items.map((n) => (
                  <Tr key={n.id}>
                    <Td>
                      <Link
                        to={`/notices/${n.id}`}
                        className="font-mono text-[13px] font-semibold text-primary hover:underline"
                      >
                        {n.noticeNumber}
                      </Link>
                      <p className="font-mono text-xs text-muted">{n.caseNumber}</p>
                    </Td>
                    <Td>
                      {n.addresseeName}
                      {n.stationName && !me.stationName ? (
                        <p className="text-xs text-muted">{n.stationName}</p>
                      ) : null}
                    </Td>
                    <Td>
                      <Plate value={n.vehicleNumber} />
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {formatRupees(n.amount)}
                    </Td>
                    <Td
                      className={cn(
                        "whitespace-nowrap tabular-nums",
                        n.overdue ? "font-semibold text-danger" : "text-muted",
                      )}
                    >
                      {n.dueDate ? formatDate(n.dueDate) : "Not served"}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <NoticeStatusBadge status={n.status} />
                        <NoticeFlags flags={n.flags} />
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                {notices.data.total} notice{notices.data.total === 1 ? "" : "s"}
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

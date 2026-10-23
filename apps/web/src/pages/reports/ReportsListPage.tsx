// HQ: the triage queue and its tabs (docs/02 §5). Stations: their own
// reports, and officer observations waiting for a second officer (§7).

import { CHANNELS, CHANNEL_LABELS } from "@ev/shared";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@ev/ui";
import { Inbox, Lock, Paperclip, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth, useCurrentUser } from "../../auth/AuthProvider";
import {
  ChannelTag,
  FlagList,
  OffenceNames,
  Plate,
  PriorityTag,
  TriageBadge,
} from "../../components/reportBits";
import { formatDateTime, formatRelative } from "../../lib/format";
import { useOffenceMap, useReports, type ReportsFilter } from "../../lib/reports";

type View = ReportsFilter["view"];

const HQ_TABS: { view: View; label: string; hint: string }[] = [
  { view: "queue", label: "Triage queue", hint: "Highest priority first, then oldest." },
  {
    view: "needs_info",
    label: "Waiting for reporter",
    hint: "Asked for more information; closes automatically if no reply.",
  },
  {
    view: "station_review",
    label: "Station review",
    hint: "Opened at a station — confirm, merge or reject.",
  },
  { view: "all", label: "All reports", hint: "Every report, newest first." },
];
const STATION_TABS: { view: View; label: string; hint: string }[] = [
  { view: "all", label: "Our reports", hint: "Reports recorded at your station." },
  {
    view: "pending_station",
    label: "Second officer needed",
    hint: "Officer observations another officer or the OIC must accept.",
  },
];

function dueLabel(dueAt: string | null, overdue: boolean) {
  if (!dueAt) return "—";
  const ms = new Date(dueAt).getTime() - Date.now();
  if (overdue || ms < 0) return "Overdue";
  const h = Math.floor(ms / 3_600_000);
  return h >= 48
    ? `${Math.floor(h / 24)} days`
    : h >= 1
      ? `${h} h`
      : `${Math.max(1, Math.round(ms / 60_000))} min`;
}

export function ReportsListPage() {
  const me = useCurrentUser();
  const { allowed } = useAuth();
  const navigate = useNavigate();
  const isHq = allowed("reports.triage");
  const tabs = isHq ? HQ_TABS : STATION_TABS;
  const [params, setParams] = useSearchParams();
  const view = (tabs.find((t) => t.view === params.get("view"))?.view ?? tabs[0]!.view) as View;
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [page, setPage] = useState(1);
  const offences = useOffenceMap();
  const reports = useReports({
    view,
    q: q.trim() || undefined,
    channel: channel || undefined,
    page,
  });
  const totalPages = reports.data
    ? Math.max(1, Math.ceil(reports.data.total / reports.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title={isHq ? "Triage" : "Reports"}
        description={
          isHq
            ? "Every report is checked once before it becomes a case."
            : `Reports recorded at ${me.stationName}.`
        }
        actions={
          allowed("reports.record") ? (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => navigate("/reports/new")}
            >
              Record a report
            </Button>
          ) : null
        }
      />

      <div
        role="tablist"
        aria-label="Report lists"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => (
          <button
            key={t.view}
            role="tab"
            aria-selected={view === t.view}
            onClick={() => {
              setParams({ view: t.view });
              setPage(1);
            }}
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
      <p className="mb-4 text-sm text-muted">{tabs.find((t) => t.view === view)?.hint}</p>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label="Search by report number or plate"
              placeholder="Report number or plate"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            aria-label="Channel"
            className="sm:w-48"
            value={channel}
            onChange={(e) => (setChannel(e.target.value), setPage(1))}
          >
            <option value="">All channels</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>

        {reports.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : reports.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(reports.error as Error).message}</Alert>
          </div>
        ) : reports.data.items.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title={view === "queue" ? "The queue is empty" : "No reports here"}
            description={
              view === "queue"
                ? "New reports appear here as they arrive."
                : "Change the filters to see more."
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Report</Th>
                  <Th>Priority</Th>
                  <Th>Vehicle</Th>
                  <Th>Offence</Th>
                  <Th>Received</Th>
                  <Th>{view === "needs_info" ? "Reply due" : "Due"}</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {reports.data.items.map((r) => (
                  <Tr key={r.id} className="cursor-pointer">
                    <Td>
                      <Link
                        to={`/reports/${r.id}`}
                        className="font-mono text-[13px] font-semibold text-primary hover:underline"
                      >
                        {r.reportNumber}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ChannelTag channel={r.channel} />
                        {r.evidenceCount > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-muted"
                            title="Evidence files"
                          >
                            <Paperclip className="size-3.5" />
                            {r.evidenceCount}
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <PriorityTag priority={r.priority} suggested={r.suggestedPriority} />
                    </Td>
                    <Td>
                      <Plate value={r.vehicleNumber} />
                      {r.stationName ? <p className="text-xs text-muted">{r.stationName}</p> : null}
                    </Td>
                    <Td className="max-w-56">
                      <OffenceNames codes={r.offenceCodes} offences={offences} compact />
                      <div className="mt-1">
                        <FlagList flags={r.flags} />
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      <span title={formatDateTime(r.receivedAt)}>
                        {formatRelative(r.receivedAt)}
                      </span>
                    </Td>
                    <Td
                      className={cn(
                        "whitespace-nowrap tabular-nums",
                        r.overdue ? "font-semibold text-danger" : "text-muted",
                      )}
                    >
                      {dueLabel(r.dueAt, r.overdue)}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <TriageBadge status={r.status} />
                        {r.lockedBy ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <Lock className="size-3" /> {r.lockedBy}
                          </span>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                {reports.data.total} report{reports.data.total === 1 ? "" : "s"}
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

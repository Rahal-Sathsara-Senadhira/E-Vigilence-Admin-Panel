// Case lists per role — docs/03 §6 (the OIC's queue), docs/12 §4.

import type { CaseView } from "@ev/shared";
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
import { FolderOpen, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useCurrentUser } from "../../auth/AuthProvider";
import { CaseFlags, CaseStatusBadge, dueText } from "../../components/caseBits";
import { OffenceNames, Plate, PriorityTag } from "../../components/reportBits";
import { useCases } from "../../lib/cases";
import { formatDateTime } from "../../lib/format";
import { useOffenceMap } from "../../lib/reports";

type Tab = { view: CaseView; label: string; hint: string };

function tabsFor(role: string): Tab[] {
  if (role === "hq" || role === "dev") {
    return [
      {
        view: "open",
        label: "Not dispatched",
        hint: "Accepted at triage but not yet with a station — choose a station.",
      },
      {
        view: "returned",
        label: "Returned",
        hint: "Stations said these aren't their area. Re-dispatch them.",
      },
      {
        view: "awaiting_decision",
        label: "Awaiting decision",
        hint: "Recommendations waiting for the OIC or HQ.",
      },
      { view: "all", label: "All cases", hint: "Every case, most recently changed first." },
    ];
  }
  const base: Tab[] = [
    {
      view: "to_accept",
      label: "To accept",
      hint: "Sent to your station. Accept, or return to HQ if it isn't your area.",
    },
    {
      view: "mine",
      label: "My cases",
      hint: "Cases you are the investigating officer for, by due date.",
    },
  ];
  if (role === "station_oic") {
    base.push(
      {
        view: "no_officer",
        label: "No officer",
        hint: "Accepted cases without an investigating officer.",
      },
      {
        view: "awaiting_decision",
        label: "Awaiting decision",
        hint: "Recommendations for you to decide.",
      },
    );
  }
  base.push({ view: "all", label: "All station cases", hint: "Every case at your station." });
  return base;
}

export function CasesListPage() {
  const me = useCurrentUser();
  const tabs = tabsFor(me.role);
  const [params, setParams] = useSearchParams();
  const view = (tabs.find((t) => t.view === params.get("view"))?.view ?? tabs[0]!.view) as CaseView;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const cases = useCases({ view, q: q.trim() || undefined, page });
  const offences = useOffenceMap();
  const totalPages = cases.data
    ? Math.max(1, Math.ceil(cases.data.total / cases.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title="Cases"
        description={me.stationName ? `Cases at ${me.stationName}.` : "Every case nationally."}
      />
      <div
        role="tablist"
        aria-label="Case lists"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => (
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
      <p className="mb-4 text-sm text-muted">{tabs.find((t) => t.view === view)?.hint}</p>

      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label="Search by case number or plate"
              placeholder="Case number or plate"
              className="pl-9"
              value={q}
              onChange={(e) => (setQ(e.target.value), setPage(1))}
            />
          </div>
        </div>
        {cases.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : cases.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(cases.error as Error).message}</Alert>
          </div>
        ) : cases.data.items.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-5" />}
            title="Nothing here"
            description="Cases appear here as their status changes."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Case</Th>
                  <Th>Priority</Th>
                  <Th>Vehicle</Th>
                  <Th>Offence</Th>
                  <Th>Station · officer</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {cases.data.items.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <Link
                        to={`/cases/${c.id}`}
                        className="font-mono text-[13px] font-semibold text-primary hover:underline"
                      >
                        {c.caseNumber}
                      </Link>
                      <p className="text-xs text-muted">{formatDateTime(c.occurredAt)}</p>
                    </Td>
                    <Td>
                      <PriorityTag priority={c.priority} />
                    </Td>
                    <Td>
                      <Plate value={c.vehicleNumber} />
                    </Td>
                    <Td className="max-w-56">
                      <OffenceNames codes={c.offenceCodes} offences={offences} compact />
                      <div className="mt-1">
                        <CaseFlags flags={c.flags} />
                      </div>
                    </Td>
                    <Td className="text-muted">
                      {c.stationName ?? "—"}
                      {c.investigatingOfficer ? (
                        <p className="text-xs">{c.investigatingOfficer}</p>
                      ) : null}
                    </Td>
                    <Td
                      className={cn(
                        "whitespace-nowrap tabular-nums",
                        c.overdue ? "font-semibold text-danger" : "text-muted",
                      )}
                    >
                      {dueText(c.dueAt, c.overdue)}
                    </Td>
                    <Td>
                      <CaseStatusBadge status={c.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                {cases.data.total} case{cases.data.total === 1 ? "" : "s"}
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

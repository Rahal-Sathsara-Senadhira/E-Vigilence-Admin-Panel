// One report — docs/02. Left: what the reporter said, the evidence and the
// history. Right: the reporter, the triage decision and matching cases.

import {
  CHANNEL_LABELS,
  REJECTION_LABELS,
  TRIAGE_LABELS,
  type CaseMatch,
  type ReportDetail,
} from "@ev/shared";
import { Alert, Button, Card, CardHeader, EmptyState, Skeleton, StatusBadge } from "@ev/ui";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  GitMerge,
  Lock,
  MapPin,
  Phone,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { useAuth, useCurrentUser } from "../../auth/AuthProvider";
import { EvidenceGallery } from "../../components/EvidenceGallery";
import {
  ChannelTag,
  FlagList,
  OffenceNames,
  Plate,
  PriorityTag,
  TriageBadge,
  vehicleLabel,
} from "../../components/reportBits";
import { api } from "../../lib/api";
import { formatDateTime, formatRelative } from "../../lib/format";
import { useMatches, useOffenceMap, useReport } from "../../lib/reports";
import {
  AcceptDialog,
  MergeDialog,
  NeedsInfoDialog,
  PriorityDialog,
  ReasonActionDialog,
  RejectDialog,
  ReplyDialog,
  useSimpleAction,
} from "./triageDialogs";

type Open =
  | { kind: "accept" | "needsInfo" | "reply" | "reject" | "priority" | "reconsider" | "undoMerge" }
  | { kind: "merge"; match: CaseMatch }
  | null;

const CHECKLIST = [
  "Is it a traffic offence covered by the offence schedule?",
  "Did it happen in Sri Lanka, within the last 30 days?",
  "Is the evidence credible — not edited, staged or AI-generated?",
  "Can the vehicle be identified (readable plate, or enough detail to trace)?",
  "Does it describe an incident we already have a case for?",
];

export function ReportDetailPage() {
  const { id = "" } = useParams();
  const report = useReport(id);
  const { allowed } = useAuth();
  const isHq = allowed("reports.triage");

  if (report.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (report.isError) {
    return <Alert tone="danger">{(report.error as Error).message}</Alert>;
  }
  return <Detail report={report.data} isHq={isHq} />;
}

function Detail({ report, isHq }: { report: ReportDetail; isHq: boolean }) {
  const me = useCurrentUser();
  const offences = useOffenceMap();
  const [open, setOpen] = useState<Open>(null);
  const triageable =
    isHq &&
    (report.status === "pending" ||
      report.status === "needs_info" ||
      (report.status === "accepted" && !report.reviewedByHq));
  const lock = useTriageLock(report.id, triageable);
  const lockedByOther =
    report.lock && report.lock.byId !== me.id ? report.lock.by : lock.otherHolder;
  const matches = useMatches(report.id, isHq);

  return (
    <>
      <Link
        to={isHq ? "/triage" : "/reports"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {isHq ? "Triage" : "Reports"}
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink">
            {report.reportNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TriageBadge status={report.status} />
            <PriorityTag priority={report.priority} suggested={report.suggestedPriority} />
            <ChannelTag channel={report.channel} />
            <FlagList flags={report.flags} />
          </div>
        </div>
        <p className="text-sm text-muted">
          Received {formatDateTime(report.receivedAt)} · {report.receivedBy}
        </p>
      </div>

      {lockedByOther ? (
        <div className="mb-4">
          <Alert tone="warning" title={`${lockedByOther} is triaging this report`}>
            You can read it, but decisions are blocked until they finish or 15 minutes pass.
          </Alert>
        </div>
      ) : null}
      {report.overdue ? (
        <div className="mb-4">
          <Alert tone="danger">Past its triage time limit ({formatDateTime(report.dueAt)}).</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="What was reported"
              description="Kept exactly as received — what police conclude goes on the case."
            />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Item label="Offences">
                <OffenceNames codes={report.offenceCodes} offences={offences} />
              </Item>
              <Item label="Vehicle">
                <Plate value={report.vehicleNumber} /> · {vehicleLabel(report.vehicleType)}
                {report.vehicleDescription ? (
                  <p className="text-muted">{report.vehicleDescription}</p>
                ) : null}
              </Item>
              <Item label="When">
                {formatDateTime(report.occurredAt)}{" "}
                <span className="text-muted">({formatRelative(report.occurredAt)})</span>
              </Item>
              <Item label="Where">
                {report.address}
                {report.location ? (
                  <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted">
                    <MapPin className="size-3.5" />
                    {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-xs text-danger">
                    No location — set it when accepting, or ask the reporter.
                  </p>
                )}
              </Item>
              <Item label="Description" wide>
                <p className="whitespace-pre-line">{report.description}</p>
              </Item>
            </dl>
          </Card>

          {report.question ? (
            <Card>
              <CardHeader
                title="Question to the reporter"
                description={`Asked ${formatDateTime(report.question.askedAt)} · reply due ${formatDateTime(report.question.dueAt)}`}
              />
              <div className="space-y-3 p-5 text-sm">
                <p className="text-ink">{report.question.text}</p>
                {report.question.answer ? (
                  <div className="rounded-lg border border-line bg-raised p-3">
                    <p className="text-xs font-medium text-muted">
                      Answer · {formatDateTime(report.question.answeredAt)}
                    </p>
                    <p className="mt-1 text-ink">{report.question.answer}</p>
                  </div>
                ) : (
                  <p className="text-muted">No answer yet.</p>
                )}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Evidence"
              description="Originals are kept untouched with their fingerprints; you are viewing copies."
            />
            <div className="p-5">
              <EvidenceGallery reportId={report.id} />
            </div>
          </Card>

          <Card>
            <CardHeader title="History" />
            <ol className="space-y-4 p-5">
              {report.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-line" />
                    <div>
                      <p className="text-ink">
                        <span className="font-medium">{TRIAGE_LABELS[h.status]}</span>
                        {h.reasonCode ? ` — ${REJECTION_LABELS[h.reasonCode]}` : ""}{" "}
                        <span className="text-muted">· {h.by}</span>
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(h.at)}</p>
                      {h.note ? <p className="mt-0.5 text-muted">{h.note}</p> : null}
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <ReporterCard report={report} />
          {isHq ? (
            <HqActions report={report} blocked={!!lockedByOther} onOpen={setOpen} />
          ) : (
            <StationActions report={report} onOpen={setOpen} />
          )}
          {isHq &&
          (report.status === "pending" ||
            (report.status === "accepted" && !report.reviewedByHq)) ? (
            <MatchesCard
              matches={matches.data}
              loading={matches.isPending}
              blocked={!!lockedByOther}
              onMerge={(m) => setOpen({ kind: "merge", match: m })}
            />
          ) : null}
          {report.caseNumber && report.caseId ? (
            <Card className="p-5 text-sm">
              <p className="text-muted">Case</p>
              <Link
                to={`/cases/${report.caseId}`}
                className="font-mono text-base font-semibold text-primary hover:underline"
              >
                {report.caseNumber}
              </Link>
            </Card>
          ) : null}
        </aside>
      </div>

      {open?.kind === "accept" ? (
        <AcceptDialog report={report} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "merge" ? (
        <MergeDialog report={report} match={open.match} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "needsInfo" ? (
        <NeedsInfoDialog report={report} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "reply" ? (
        <ReplyDialog report={report} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "reject" ? (
        <RejectDialog report={report} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "priority" ? (
        <PriorityDialog report={report} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "reconsider" ? (
        <ReasonActionDialog
          report={report}
          path="reconsider"
          title="Reconsider this report"
          description="It goes back to the triage queue."
          button="Reconsider"
          success="Back in the triage queue."
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "undoMerge" ? (
        <ReasonActionDialog
          report={report}
          path="undo-merge"
          title="Undo the merge"
          description="The report leaves the case and goes back to the triage queue."
          button="Undo merge"
          success="Merge undone."
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="mb-1 text-xs font-medium text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/** Takes the 15-minute triage lock while the page is open (docs/02 §5), and gives it back on leaving. */
function useTriageLock(reportId: string, active: boolean) {
  const [otherHolder, setOtherHolder] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const take = () =>
      api<{ by: string }>(`/reports/${reportId}/lock`, { method: "POST" })
        .then(() => !cancelled && setOtherHolder(null))
        .catch(
          (err: Error) =>
            !cancelled && setOtherHolder(err.message.replace(" is triaging this report.", "")),
        );
    void take();
    const renew = setInterval(take, 10 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(renew);
      void api(`/reports/${reportId}/lock`, { method: "DELETE" }).catch(() => {});
    };
  }, [reportId, active]);
  return { otherHolder };
}

function ReporterCard({ report }: { report: ReportDetail }) {
  const r = report.reporter;
  return (
    <Card className="p-5 text-sm">
      <p className="mb-2 text-xs font-medium text-muted">Reporter</p>
      {r.kind === "anonymous" ? (
        <p className="text-ink">Anonymous — can't be asked for more information.</p>
      ) : (
        <>
          <p className="font-medium text-ink">{r.name ?? "Name not given"}</p>
          {r.phone ? (
            <a
              href={`tel:${r.phone}`}
              className="mt-0.5 inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <Phone className="size-3.5" /> {r.phone}
            </a>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            {r.kind === "citizen" ? "Mobile app account" : CHANNEL_LABELS[report.channel]}
          </p>
        </>
      )}
      {r.suspended ? (
        <div className="mt-3">
          <Alert tone="danger">Suspended from reporting.</Alert>
        </div>
      ) : r.flagged ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger/10 p-2.5 text-xs text-danger">
          <ShieldAlert className="mt-px size-4 shrink-0" /> Flagged: {r.abuseCount} fabricated or
          abusive reports in 90 days. Check the evidence carefully.
        </p>
      ) : r.abuseCount > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {r.abuseCount} earlier report(s) rejected as fabricated or abusive.
        </p>
      ) : null}
    </Card>
  );
}

function HqActions({
  report,
  blocked,
  onOpen,
}: {
  report: ReportDetail;
  blocked: boolean;
  onOpen: (o: Open) => void;
}) {
  const review = useSimpleAction(report.id, "Marked as reviewed.");
  const reconsiderOpen =
    report.canReconsiderUntil && new Date(report.canReconsiderUntil) > new Date();
  const s = report.status;

  return (
    <Card>
      <CardHeader title="Triage" />
      <div className="space-y-4 p-5">
        {s === "pending" ? (
          <>
            <ol className="space-y-2 text-sm">
              {CHECKLIST.map((c, i) => (
                <li key={i} className="flex gap-2 text-ink">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-raised text-xs font-semibold text-muted">
                    {i + 1}
                  </span>
                  {c}
                </li>
              ))}
            </ol>
            <div className="grid gap-2">
              <Button
                variant="primary"
                icon={<Check className="size-4" />}
                disabled={blocked}
                onClick={() => onOpen({ kind: "accept" })}
              >
                Accept and open case
              </Button>
              <Button
                icon={<CircleHelp className="size-4" />}
                disabled={blocked || report.reporter.kind === "anonymous"}
                title={
                  report.reporter.kind === "anonymous"
                    ? "Anonymous reporters can't be asked"
                    : undefined
                }
                onClick={() => onOpen({ kind: "needsInfo" })}
              >
                Ask the reporter
              </Button>
              <Button
                icon={<X className="size-4" />}
                disabled={blocked}
                onClick={() => onOpen({ kind: "reject" })}
              >
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={blocked}
                onClick={() => onOpen({ kind: "priority" })}
              >
                Change priority
              </Button>
            </div>
          </>
        ) : s === "needs_info" ? (
          <div className="grid gap-2">
            <Button variant="primary" disabled={blocked} onClick={() => onOpen({ kind: "reply" })}>
              Record the answer
            </Button>
            <Button disabled={blocked} onClick={() => onOpen({ kind: "reject" })}>
              Reject
            </Button>
          </div>
        ) : s === "accepted" && !report.reviewedByHq ? (
          <>
            <p className="text-sm text-muted">
              Opened at {report.stationName}. Confirm it, merge it into an existing case, or reject
              it.
            </p>
            <div className="grid gap-2">
              <Button
                variant="primary"
                loading={review.isPending}
                disabled={blocked}
                onClick={() => review.mutate({ path: "review" })}
              >
                Confirm station acceptance
              </Button>
              <Button disabled={blocked} onClick={() => onOpen({ kind: "reject" })}>
                Reject
              </Button>
            </div>
          </>
        ) : s === "rejected" ? (
          <>
            {report.rejection ? (
              <div className="rounded-lg border border-line bg-raised p-3 text-sm">
                <p className="font-medium text-ink">{REJECTION_LABELS[report.rejection.code]}</p>
                <p className="mt-1 text-muted">
                  Reporter saw: “{report.rejection.reporterMessage}”
                </p>
                {report.rejection.note ? (
                  <p className="mt-1 text-ink">Note: {report.rejection.note}</p>
                ) : null}
              </div>
            ) : null}
            {reconsiderOpen ? (
              <Button onClick={() => onOpen({ kind: "reconsider" })}>
                Reconsider (until {formatDateTime(report.canReconsiderUntil)})
              </Button>
            ) : (
              <p className="text-xs text-muted">The 30 days to reconsider have passed.</p>
            )}
          </>
        ) : s === "merged" ? (
          <Button
            icon={<GitMerge className="size-4" />}
            onClick={() => onOpen({ kind: "undoMerge" })}
          >
            Undo merge
          </Button>
        ) : (
          <p className="text-sm text-muted">
            {s === "accepted" ? "Accepted and reviewed." : TRIAGE_LABELS[s]}
          </p>
        )}
        {blocked ? (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5" /> Locked by another HQ user
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function StationActions({ report, onOpen }: { report: ReportDetail; onOpen: (o: Open) => void }) {
  const accept = useSimpleAction(report.id, "Accepted at the station — case opened.");
  if (report.status !== "pending_station") {
    return (
      <Card className="p-5 text-sm text-muted">
        {report.reviewedByHq
          ? "Reviewed by HQ."
          : report.status === "accepted"
            ? "Waiting for HQ review."
            : TRIAGE_LABELS[report.status]}
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title="Second officer"
        description="Another officer or the OIC must accept an officer's own observation."
      />
      <div className="grid gap-2 p-5">
        <Button
          variant="primary"
          loading={accept.isPending}
          onClick={() =>
            accept.mutate(
              { path: "station-accept" },
              { onError: (err) => toast.error((err as Error).message) },
            )
          }
        >
          Accept and open case
        </Button>
        <Button onClick={() => onOpen({ kind: "reject" })}>Reject</Button>
      </div>
    </Card>
  );
}

function MatchesCard({
  matches,
  loading,
  blocked,
  onMerge,
}: {
  matches: CaseMatch[] | undefined;
  loading: boolean;
  blocked: boolean;
  onMerge: (m: CaseMatch) => void;
}) {
  const offences = useOffenceMap();
  return (
    <Card>
      <CardHeader
        title="Possible matching cases"
        description="Same plate within 24 h, or the same offence within 150 m."
      />
      <div className="p-3">
        {loading ? (
          <Skeleton className="h-20" />
        ) : !matches || matches.length === 0 ? (
          <EmptyState
            title="No matching cases"
            description="If this is a new incident, accept it."
          />
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold text-ink">{m.caseNumber}</p>
                    <p className="text-xs text-muted">
                      {m.reasons.includes("same_plate") ? "Same plate" : null}
                      {m.reasons.length === 2 ? " · " : null}
                      {m.reasons.includes("same_offence_nearby")
                        ? `Same offence ${m.distanceMetres ?? ""} m away`
                        : null}
                    </p>
                  </div>
                  <StatusBadge family={m.status === "closed" ? "closed" : "new"}>
                    {m.status === "closed" ? "Closed" : "Open"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-ink">
                  <Plate value={m.vehicleNumber} /> ·{" "}
                  <OffenceNames codes={m.offenceCodes} offences={offences} compact />
                </p>
                <p className="text-xs text-muted">
                  {formatDateTime(m.occurredAt)} · {m.reportCount} report
                  {m.reportCount === 1 ? "" : "s"}
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  icon={<GitMerge className="size-4" />}
                  disabled={blocked}
                  onClick={() => onMerge(m)}
                >
                  Merge into this case
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

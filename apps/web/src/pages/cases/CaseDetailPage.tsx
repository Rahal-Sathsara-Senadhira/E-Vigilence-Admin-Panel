// One case — docs/03, docs/04 §6, docs/05 §3–4. Actions shown are those the
// API says this user may take now (`can`); the API checks each one again.

import {
  CHANNEL_LABELS,
  DISPATCH_METHOD_LABELS,
  EVIDENCE_REVIEW_ITEMS,
  NFA_REASONS,
  OUTCOME_LABELS,
  TRIAGE_LABELS,
  formatRupees,
  type CaseDetail,
  type EvidenceReviewItem,
  type EvidenceView,
} from "@ev/shared";
import { Alert, Button, Card, CardHeader, EmptyState, Skeleton } from "@ev/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileUp,
  Gavel,
  MapPin,
  RotateCcw,
  Send,
  ShieldAlert,
  Undo2,
  UserCog,
  X,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider";
import { CaseFlags, CaseStatusBadge, dueText } from "../../components/caseBits";
import { NoticeStatusBadge, formatDate } from "../../components/noticeBits";
import { EvidenceList } from "../../components/EvidenceGallery";
import { OffenceNames, Plate, PriorityTag, vehicleLabel } from "../../components/reportBits";
import { api, apiUpload } from "../../lib/api";
import { useCase, useCaseEvidence } from "../../lib/cases";
import { useCaseNotices } from "../../lib/notices";
import { formatDateTime } from "../../lib/format";
import { useOffenceMap } from "../../lib/reports";
import {
  AssignOfficerDialog,
  DecideDialog,
  DispatchDialog,
  DriverDialog,
  EvidenceReviewDialog,
  FactsDialog,
  MergeCaseDialog,
  NoteDialog,
  ReasonCaseDialog,
  RecommendDialog,
  ReturnDialog,
  StatementDialog,
  TraceDialog,
} from "./caseDialogs";

type Dialog =
  | "dispatch"
  | "return"
  | "officer"
  | "note"
  | "review"
  | "facts"
  | "trace"
  | "driver"
  | "statement"
  | "recommend"
  | "decide"
  | "override"
  | "reopen"
  | "merge"
  | null;

const EVENT_LABELS: Record<string, string> = {
  opened: "Opened",
  dispatched: "Dispatched",
  accepted: "Accepted by station",
  returned: "Returned to HQ",
  officer_assigned: "Investigating officer",
  work_started: "Work started",
  facts_corrected: "Facts corrected",
  vehicle_traced: "Vehicle traced",
  recommended: "Recommended",
  sent_back: "Sent back",
  decided: "Decided",
  overridden: "Decision overridden",
  closed: "Closed",
  reopened: "Reopened",
  merged: "Merged",
  merged_in: "Case merged in",
  report_merged: "Report merged",
  report_attached_closed: "Report attached",
  report_detached: "Report removed",
  driver_named: "Driver named on the notice",
  reconsidered: "Dispute upheld — for a new decision",
};

export function CaseDetailPage() {
  const { id = "" } = useParams();
  const c = useCase(id);
  if (c.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (c.isError) return <Alert tone="danger">{(c.error as Error).message}</Alert>;
  return <Detail c={c.data} />;
}

function Detail({ c }: { c: CaseDetail }) {
  const offences = useOffenceMap();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const current = c.dispatches.at(-1);

  return (
    <>
      <Link
        to="/cases"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Cases
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink">
            {c.caseNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CaseStatusBadge status={c.status} />
            <PriorityTag priority={c.priority} />
            <CaseFlags flags={c.flags} />
          </div>
        </div>
        <div className="text-right text-sm text-muted">
          <p>
            {c.stationName ?? "No station yet"}
            {c.investigatingOfficer ? ` · ${c.investigatingOfficer}` : ""}
          </p>
          {c.dueAt ? (
            <p className={c.overdue ? "font-semibold text-danger" : ""}>
              {c.overdue ? "Overdue since" : "Next step due"} {formatDateTime(c.dueAt)} (
              {dueText(c.dueAt, c.overdue)})
            </p>
          ) : null}
        </div>
      </div>

      {c.repeatOffender ? (
        <div className="mb-4">
          <Alert tone="warning" title="Repeat offender">
            {c.repeatOffender.vehicle > 0
              ? `This vehicle has ${c.repeatOffender.vehicle} other enforcement outcome(s) in the last 12 months. `
              : ""}
            {c.repeatOffender.person > 0
              ? `The owner or driver has ${c.repeatOffender.person}. `
              : ""}
            A warning isn't available.
          </Alert>
        </div>
      ) : null}
      {c.closedReason ? (
        <div className="mb-4">
          <Alert tone="info" title="Closed">
            {c.closedReason}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="What police conclude"
              description="Reports keep what reporters said; corrections here are in the timeline."
              action={
                c.can.work ? (
                  <Button size="sm" onClick={() => setDialog("facts")}>
                    Correct
                  </Button>
                ) : null
              }
            />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Item label="Offences">
                <OffenceNames codes={c.offenceCodes} offences={offences} />
              </Item>
              <Item label="Vehicle">
                <Plate value={c.vehicleNumber} /> · {vehicleLabel(c.vehicleType)}
                {c.vehicle ? (
                  <p className="text-muted">
                    <Link to={`/vehicles/${c.vehicle.id}`} className="text-primary hover:underline">
                      Vehicle record
                    </Link>
                    {[c.vehicle.colour, c.vehicle.make, c.vehicle.model].filter(Boolean).length
                      ? ` · ${[c.vehicle.colour, c.vehicle.make, c.vehicle.model].filter(Boolean).join(" ")}`
                      : ""}
                  </p>
                ) : null}
              </Item>
              <Item label="When">{formatDateTime(c.occurredAt)}</Item>
              <Item label="Where">
                {c.address}
                <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted">
                  <MapPin className="size-3.5" />
                  {c.location.lat.toFixed(5)}, {c.location.lng.toFixed(5)}
                </p>
              </Item>
              <Item label="Reports" wide>
                <ul className="flex flex-wrap gap-2">
                  {c.reportIds.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/reports/${r.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-xs text-primary hover:bg-raised"
                      >
                        {r.reportNumber}
                        <span className="font-sans text-muted">
                          {CHANNEL_LABELS[r.channel as keyof typeof CHANNEL_LABELS] ?? r.channel} ·{" "}
                          {TRIAGE_LABELS[r.status as keyof typeof TRIAGE_LABELS] ?? r.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Item>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="People"
              description="Who is responsible — the owner on the offence date, or the identified driver (04 §5)."
              action={
                c.can.work ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setDialog("trace")}>
                      {c.vehicle ? "Trace again" : "Trace vehicle"}
                    </Button>
                    <Button size="sm" onClick={() => setDialog("driver")}>
                      Driver
                    </Button>
                  </div>
                ) : null
              }
            />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Item label="Registered owner">
                <PersonLine p={c.owner} />
              </Item>
              <Item label="Driver">
                <PersonLine p={c.driver} empty="Not identified" />
              </Item>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Evidence review"
              action={
                c.can.work ? (
                  <Button size="sm" onClick={() => setDialog("review")}>
                    {c.evidenceReview ? "Update" : "Review"}
                  </Button>
                ) : null
              }
            />
            <div className="p-5 text-sm">
              {c.evidenceReview ? (
                <>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(EVIDENCE_REVIEW_ITEMS) as EvidenceReviewItem[]).map((k) => (
                      <li key={k} className="flex items-center gap-2 text-ink">
                        {c.evidenceReview![k] ? (
                          <Check className="size-4 text-success" aria-label="Yes" />
                        ) : (
                          <X className="size-4 text-danger" aria-label="No" />
                        )}
                        {EVIDENCE_REVIEW_ITEMS[k]}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    By {c.evidenceReview.by}, {formatDateTime(c.evidenceReview.at)}
                    {c.evidenceReview.note ? ` — ${c.evidenceReview.note}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted">Not reviewed yet — required before recommending.</p>
              )}
            </div>
          </Card>

          <CaseEvidence c={c} />

          <Card>
            <CardHeader
              title="Notes and statements"
              action={
                c.can.work ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setDialog("note")}>
                      Add note
                    </Button>
                    <Button size="sm" onClick={() => setDialog("statement")}>
                      Statement
                    </Button>
                  </div>
                ) : null
              }
            />
            <div className="space-y-4 p-5 text-sm">
              {c.statements.map((s, i) => (
                <div key={`s${i}`} className="rounded-lg border border-line p-3">
                  <p className="font-medium text-ink">
                    Statement — {s.from}: {s.name}
                  </p>
                  <p className="text-xs text-muted">
                    Taken {formatDateTime(s.takenAt)} · recorded by {s.by}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-ink">{s.summary}</p>
                </div>
              ))}
              {c.notes
                .slice()
                .reverse()
                .map((n, i) => (
                  <div key={`n${i}`}>
                    <p className="text-xs text-muted">
                      {n.by} · {formatDateTime(n.at)}
                    </p>
                    <p className="whitespace-pre-line text-ink">{n.text}</p>
                  </div>
                ))}
              {c.notes.length === 0 && c.statements.length === 0 ? (
                <p className="text-muted">Nothing recorded yet.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <ol className="space-y-4 p-5">
              {c.timeline
                .slice()
                .reverse()
                .map((e, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-line" />
                    <div>
                      <p className="text-ink">
                        <span className="font-medium">{EVENT_LABELS[e.event] ?? e.event}</span>{" "}
                        <span className="text-muted">· {e.by}</span>
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(e.at)}</p>
                      {e.note ? <p className="mt-0.5 text-muted">{e.note}</p> : null}
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <ActionsCard c={c} open={setDialog} />
          <OutcomeCard c={c} />
          <CaseNotices c={c} />
          <Card>
            <CardHeader title="Dispatch" />
            <div className="space-y-3 p-5 text-sm">
              {c.dispatches.length === 0 ? <p className="text-muted">Not dispatched yet.</p> : null}
              {c.dispatches
                .slice()
                .reverse()
                .map((d, i) => (
                  <div key={i} className={i === 0 ? "" : "border-t border-line pt-3"}>
                    <p className="font-medium text-ink">{d.stationName}</p>
                    <p className="text-xs text-muted">
                      {DISPATCH_METHOD_LABELS[d.method]}
                      {d.distanceKm !== null ? ` · ${d.distanceKm} km` : ""} ·{" "}
                      {formatDateTime(d.at)} by {d.by}
                    </p>
                    {d.reason ? <p className="text-xs text-ink">Reason: {d.reason}</p> : null}
                    {d.acceptedAt ? (
                      <p className="text-xs text-success">
                        Accepted {formatDateTime(d.acceptedAt)} by {d.acceptedBy}
                      </p>
                    ) : null}
                    {d.returnedAt ? (
                      <p className="text-xs text-danger">
                        Returned {formatDateTime(d.returnedAt)} by {d.returnedBy}: {d.returnReason}
                      </p>
                    ) : null}
                    {d.flags.length ? <CaseFlags flags={d.flags} /> : null}
                  </div>
                ))}
              {current && c.returnCount > 0 ? (
                <p className="text-xs text-muted">Returned {c.returnCount} time(s).</p>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      {dialog === "dispatch" ? <DispatchDialog c={c} onClose={close} /> : null}
      {dialog === "return" ? <ReturnDialog c={c} onClose={close} /> : null}
      {dialog === "officer" ? <AssignOfficerDialog c={c} onClose={close} /> : null}
      {dialog === "note" ? <NoteDialog c={c} onClose={close} /> : null}
      {dialog === "review" ? <EvidenceReviewDialog c={c} onClose={close} /> : null}
      {dialog === "facts" ? <FactsDialog c={c} onClose={close} /> : null}
      {dialog === "trace" ? <TraceDialog c={c} onClose={close} /> : null}
      {dialog === "driver" ? <DriverDialog c={c} onClose={close} /> : null}
      {dialog === "statement" ? <StatementDialog c={c} onClose={close} /> : null}
      {dialog === "recommend" ? <RecommendDialog c={c} onClose={close} /> : null}
      {dialog === "decide" ? <DecideDialog c={c} onClose={close} /> : null}
      {dialog === "override" ? (
        <ReasonCaseDialog
          c={c}
          path="override"
          title="Override the decision"
          description="The case goes back to awaiting decision. A notice already issued on this decision will be withdrawn."
          button="Override"
          danger
          onClose={close}
        />
      ) : null}
      {dialog === "reopen" ? (
        <ReasonCaseDialog
          c={c}
          path="reopen"
          title="Reopen the case"
          description="It goes back to investigation at the same station. Finished outcomes stay as they are."
          button="Reopen"
          onClose={close}
        />
      ) : null}
      {dialog === "merge" ? <MergeCaseDialog c={c} onClose={close} /> : null}
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

function PersonLine({ p, empty = "Not traced yet" }: { p: CaseDetail["owner"]; empty?: string }) {
  if (!p) return <span className="text-muted">{empty}</span>;
  return (
    <span>
      <Link to={`/persons/${p.id}`} className="font-medium text-primary hover:underline">
        {p.name}
      </Link>
      {p.nicMasked ? (
        <span className="ml-2 font-mono text-xs text-muted">{p.nicMasked}</span>
      ) : null}
      {!p.hasAddress ? (
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="size-3.5" /> no address
        </span>
      ) : null}
    </span>
  );
}

function ActionsCard({ c, open }: { c: CaseDetail; open: (d: Dialog) => void }) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api<{ summary: string }>(`/cases/${c.id}/accept`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.summary);
      void queryClient.invalidateQueries({ queryKey: ["case", c.id] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const k = c.can;
  const any = Object.values(k).some(Boolean);
  return (
    <Card>
      <CardHeader title="Next steps" />
      <div className="grid gap-2 p-5">
        {k.accept ? (
          <Button
            variant="primary"
            icon={<Check className="size-4" />}
            loading={accept.isPending}
            onClick={() => accept.mutate()}
          >
            Accept for our station
          </Button>
        ) : null}
        {k.return ? (
          <Button icon={<Undo2 className="size-4" />} onClick={() => open("return")}>
            Return to HQ
          </Button>
        ) : null}
        {k.dispatch ? (
          <Button
            variant={c.status === "open" || c.status === "returned" ? "primary" : "secondary"}
            icon={<Send className="size-4" />}
            onClick={() => open("dispatch")}
          >
            {c.stationId ? "Re-dispatch" : "Dispatch"}
          </Button>
        ) : null}
        {k.assignOfficer ? (
          <Button icon={<UserCog className="size-4" />} onClick={() => open("officer")}>
            {c.investigatingOfficer
              ? "Change investigating officer"
              : "Assign investigating officer"}
          </Button>
        ) : null}
        {k.recommend ? (
          <>
            <Button
              variant="primary"
              icon={<Gavel className="size-4" />}
              onClick={() => open("recommend")}
            >
              Recommend an outcome
            </Button>
            {!c.readyToRecommend.ready ? (
              <p className="text-xs text-muted">
                Still needed: {c.readyToRecommend.missing.join("; ")}.
              </p>
            ) : null}
          </>
        ) : null}
        {k.decide ? (
          <Button
            variant="primary"
            icon={<Gavel className="size-4" />}
            onClick={() => open("decide")}
          >
            Decide
          </Button>
        ) : null}
        {k.override ? (
          <Button icon={<ShieldAlert className="size-4" />} onClick={() => open("override")}>
            Override decision
          </Button>
        ) : null}
        {k.reopen ? (
          <Button icon={<RotateCcw className="size-4" />} onClick={() => open("reopen")}>
            Reopen
          </Button>
        ) : null}
        {k.merge ? (
          <Button variant="ghost" size="sm" onClick={() => open("merge")}>
            Merge into another case
          </Button>
        ) : null}
        {!any ? (
          <p className="text-sm text-muted">Nothing for you to do on this case now.</p>
        ) : null}
        {c.status === "recommended" && !k.decide && c.recommendation ? (
          <p className="text-xs text-muted">
            Waiting for the decision on {c.recommendation.by}'s recommendation.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function OutcomeCard({ c }: { c: CaseDetail }) {
  if (!c.recommendation && !c.decision) return null;
  return (
    <Card>
      <CardHeader title="Outcome" />
      <div className="space-y-3 p-5 text-sm">
        {c.recommendation ? (
          <div>
            <p className="text-xs text-muted">
              Recommended by {c.recommendation.by}, {formatDateTime(c.recommendation.at)}
            </p>
            <p className="font-medium text-ink">
              {OUTCOME_LABELS[c.recommendation.outcome]}
              {c.recommendation.addressee ? ` — to the ${c.recommendation.addressee}` : ""}
              {c.recommendation.nfaReason ? ` — ${NFA_REASONS[c.recommendation.nfaReason]}` : ""}
            </p>
            <p className="mt-1 text-ink">{c.recommendation.justification}</p>
          </div>
        ) : null}
        {c.decision ? (
          <div className="border-t border-line pt-3">
            <p className="text-xs text-muted">
              Decided by {c.decision.by} ({c.decision.role === "hq" ? "HQ" : "OIC"}),{" "}
              {formatDateTime(c.decision.at)}
              {c.decision.changed ? " · changed the recommendation" : ""}
            </p>
            <p className="font-medium text-ink">
              {OUTCOME_LABELS[c.decision.outcome]}
              {c.decision.addressee ? ` — to the ${c.decision.addressee}` : ""}
            </p>
            {c.decision.note ? <p className="mt-1 text-ink">{c.decision.note}</p> : null}
            {c.decision.outcome === "court" ? (
              <p className="mt-2 text-xs text-muted">
                Court cases are recorded from here in a later release.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CaseNotices({ c }: { c: CaseDetail }) {
  const { allowed } = useAuth();
  const show = allowed("notices.view") && !["open", "dispatched", "returned"].includes(c.status);
  const notices = useCaseNotices(c.id, show);
  if (!show || !notices.data?.length) return null;
  return (
    <Card>
      <CardHeader title="Penalty notices" />
      <ul className="divide-y divide-line text-sm">
        {notices.data.map((n) => (
          <li key={n.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <Link
                to={`/notices/${n.id}`}
                className="font-mono text-[13px] font-semibold text-primary hover:underline"
              >
                {n.noticeNumber}
              </Link>
              <NoticeStatusBadge status={n.status} />
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {n.addresseeName} · {formatRupees(n.amount)}
              {n.dueDate ? ` · due ${formatDate(n.dueDate)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CaseEvidence({ c }: { c: CaseDetail }) {
  const evidence = useCaseEvidence(c.id);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const f of Array.from(files).slice(0, 10)) {
        const ev = await apiUpload<EvidenceView>(
          `/evidence?fileName=${encodeURIComponent(f.name)}`,
          f,
          () => {},
        );
        ids.push(ev.id);
      }
      const res = await api<{ summary: string }>(`/cases/${c.id}/evidence`, {
        method: "POST",
        body: { evidenceIds: ids },
      });
      toast.success(res.summary);
      void queryClient.invalidateQueries({ queryKey: ["case-evidence", c.id] });
      void queryClient.invalidateQueries({ queryKey: ["case", c.id] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Investigation evidence"
        description="Added by the station. Each report's own evidence is on the report."
        action={
          c.can.work ? (
            <>
              <input
                ref={input}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="sr-only"
                onChange={(e) => (void add(e.target.files), (e.target.value = ""))}
              />
              <Button
                size="sm"
                icon={<FileUp className="size-4" />}
                loading={busy}
                onClick={() => input.current?.click()}
              >
                Add files
              </Button>
            </>
          ) : null
        }
      />
      <div className="p-5">
        {evidence.isPending ? (
          <Skeleton className="h-24" />
        ) : evidence.data && evidence.data.length > 0 ? (
          <EvidenceList items={evidence.data} />
        ) : (
          <EmptyState title="No investigation evidence yet" />
        )}
      </div>
    </Card>
  );
}

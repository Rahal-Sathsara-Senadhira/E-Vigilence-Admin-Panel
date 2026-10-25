// One report — what the reporter said, the evidence, possible duplicates,
// and the actions the backend allows (`can`). Opening a waiting report
// takes the 15-minute triage lock (docs/02 §5) and releases it on leaving.

import {
  CheckCircle2,
  ChevronDown,
  Clock,
  GitMerge,
  Lock,
  MessageCircleQuestion,
  RotateCcw,
  SearchCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { EvidenceStrip } from "@/domain/evidence/index.js";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { Alert, Badge, Button, Menu, MenuItem, Panel, ReasonDialog, Skeleton } from "@/ui/index.js";
import {
  lockReport,
  unlockReport,
  useReport,
  useReportAction,
  useReporterAction,
  useUploadEvidence,
} from "../api.js";
import {
  AcceptSheet,
  MergeDialog,
  PriorityDialog,
  RejectDialog,
  TextActionDialog,
} from "../actions/TriageActions.jsx";
import {
  CHANNEL_LABELS,
  FLAG_LABELS,
  LOCATION_SOURCE_LABELS,
  VEHICLE_TYPES,
  label,
} from "../lib/labels.js";
import { PriorityBadge, ReportStatus } from "./Badges.jsx";

/** @typedef {"accept" | "merge" | "ask" | "reply" | "reject" | "priority" | "undoMerge" | "reconsider" | "suspend" | "reinstate" | null} Open */

/** @param {{ id: string, canUpload: boolean }} props */
export function ReportRecord({ id, canUpload }) {
  const report = useReport(id);
  const action = useReportAction(id);
  const reporterAction = useReporterAction();
  const upload = useUploadEvidence(id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const triageable = Boolean(report.data?.can.triage);

  // The triage lock: one person decides a report at a time.
  useEffect(() => {
    if (!triageable) return undefined;
    void lockReport(id).catch(() => {});
    return () => void unlockReport(id);
  }, [id, triageable]);

  if (report.isPending) return <Skeleton className="h-96" />;
  if (report.isError) return <Alert tone="danger">{report.error.message}</Alert>;
  const r = report.data;

  /** @param {string} name @param {string} done */
  const simple = async (name, done) => {
    setError(null);
    try {
      await action.mutateAsync({ action: name });
      setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    }
  };

  const more = [
    r.can.ask && { key: "ask", label: "Ask the reporter", icon: <MessageCircleQuestion /> },
    r.can.changePriority && { key: "priority", label: "Change priority", icon: <Clock /> },
    r.can.reject && { key: "reject", label: "Reject", icon: <XCircle />, danger: true },
    r.can.undoMerge && { key: "undoMerge", label: "Undo merge", icon: <RotateCcw /> },
    r.can.reconsider && { key: "reconsider", label: "Reconsider", icon: <RotateCcw /> },
  ].filter(Boolean);

  return (
    <div className="grid gap-5">
      {/* Header: identity, state and the main next action. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-mono text-xl font-semibold text-text">{r.reportNumber}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ReportStatus status={r.status} underReview={r.underStationReview} />
            <PriorityBadge priority={r.priority} />
            <Badge>{label(r.channel, CHANNEL_LABELS)}</Badge>
            {r.lockedBy && !r.can.triage && r.status === "pending" ? (
              <Badge tone="warning">
                <Lock className="size-3" aria-hidden /> {r.lockedBy} is triaging
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Received {formatDateTime(r.receivedAt)} ({formatRelative(r.receivedAt)})
            {r.receivedBy ? ` · recorded by ${r.receivedBy}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.can.triage ? (
            <>
              <Button
                variant="primary"
                icon={<CheckCircle2 className="size-4" />}
                onClick={() => setOpen("accept")}
              >
                Accept
              </Button>
              <Button icon={<GitMerge className="size-4" />} onClick={() => setOpen("merge")}>
                Merge
              </Button>
            </>
          ) : null}
          {r.can.confirmStationReport ? (
            <Button
              variant="primary"
              icon={<CheckCircle2 className="size-4" />}
              loading={action.isPending}
              onClick={() => simple("confirm", "Station report confirmed.")}
            >
              Confirm
            </Button>
          ) : null}
          {r.can.merge && !r.can.triage ? (
            <Button icon={<GitMerge className="size-4" />} onClick={() => setOpen("merge")}>
              Merge
            </Button>
          ) : null}
          {r.can.recordReply ? (
            <Button variant="primary" onClick={() => setOpen("reply")}>
              Record answer
            </Button>
          ) : null}
          {r.can.secondOfficerAccept ? (
            <Button
              variant="primary"
              icon={<CheckCircle2 className="size-4" />}
              loading={action.isPending}
              onClick={() => simple("second-officer", "Case opened at your station.")}
            >
              Confirm and open case
            </Button>
          ) : null}
          {more.length ? (
            <Menu
              trigger={
                <Button>
                  More <ChevronDown className="size-4" aria-hidden />
                </Button>
              }
            >
              {more.map((m) =>
                m ? (
                  <MenuItem
                    key={m.key}
                    icon={m.icon}
                    danger={m.danger}
                    onSelect={() => setOpen(/** @type {Open} */ (m.key))}
                  >
                    {m.label}
                  </MenuItem>
                ) : null,
              )}
            </Menu>
          ) : null}
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {r.injuries ? (
        <Alert tone="danger" title="Someone was hurt">
          The reporter said someone was injured.
        </Alert>
      ) : null}
      {r.reporterStanding ? (
        <Alert
          tone={r.reporterStanding.status === "suspended" ? "danger" : "warning"}
          title={
            r.reporterStanding.status === "suspended"
              ? "This reporter is suspended from reporting"
              : "This reporter is flagged"
          }
        >
          {r.reporterStanding.reason ?? ""}
          {r.reporterStanding.since ? ` · since ${formatDateTime(r.reporterStanding.since)}` : ""}
        </Alert>
      ) : null}
      {r.flags.length && !["rejected", "merged"].includes(r.status) ? (
        <Alert tone="warning" title="Check before deciding">
          <ul className="list-disc pl-4">
            {r.flags.map((f) => (
              <li key={f}>
                {label(f, FLAG_LABELS)}
                {f === "evidence_download_failed" && r.evidenceSync ? (
                  <span className="block text-xs">
                    {r.evidenceSync.gaveUp
                      ? `Stopped trying after ${r.evidenceSync.attempts} tries.`
                      : `Trying again automatically (${r.evidenceSync.attempts} ${r.evidenceSync.attempts === 1 ? "try" : "tries"} so far${r.evidenceSync.nextAt ? `; next ${formatRelative(r.evidenceSync.nextAt)}` : ""}).`}
                    {r.evidenceSync.lastError ? ` Last problem: ${r.evidenceSync.lastError}.` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {r.case ? (
        <Alert tone="info">
          {r.status === "merged" ? "Merged into" : "Case"}{" "}
          <Link to={`/cases/${r.case.id}`} className="font-mono font-medium hover:underline">
            {r.case.caseNumber}
          </Link>
          .
        </Alert>
      ) : null}
      {r.status === "needs_info" ? (
        <Alert tone="warning" title="Waiting for the reporter">
          Asked {formatDateTime(r.triage.askedAt)}: “{r.triage.question}”
          {r.answerDueAt ? (
            <span className="mt-1 block text-xs">
              Rejected automatically as “no response” if there&apos;s no answer by{" "}
              {formatDateTime(r.answerDueAt)}.
            </span>
          ) : null}
        </Alert>
      ) : null}
      {r.status === "rejected" && r.triage.reasonText ? (
        <Alert tone="info" title={`Rejected by ${r.triage.decidedBy ?? "HQ"}`}>
          Reporter was told: “{r.triage.reasonText}”
          {r.triage.note ? ` · Note: ${r.triage.note}` : ""}
        </Alert>
      ) : null}

      <Panel title="What was reported">
        <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
          <Item label="Offences" wide>
            {r.offenceCodes.length ? null : (
              <span className="text-text-muted">None recognised</span>
            )}
            <ul className="flex flex-wrap gap-1.5">
              {r.offenceCodes.map((c) => (
                <li key={c}>
                  <Badge className="font-mono">{c}</Badge>
                </li>
              ))}
            </ul>
          </Item>
          <Item label="Vehicle">
            {r.plateUnknown ? (
              "Plate unknown"
            ) : (
              <span className="font-mono">{r.vehicleNumber}</span>
            )}
            {r.vehicleType ? ` · ${label(r.vehicleType, VEHICLE_TYPES)}` : ""}
            {r.vehicleDescription ? (
              <span className="block text-xs text-text-muted">{r.vehicleDescription}</span>
            ) : null}
          </Item>
          <Item label="When">{formatDateTime(r.occurredAt)}</Item>
          <Item label="Where" wide>
            {r.address ?? "—"}
            {r.location ? (
              <span className="ml-2 font-mono text-xs text-text-muted">
                {r.location.lat.toFixed(5)}, {r.location.lng.toFixed(5)}
              </span>
            ) : (
              <span className="ml-2 text-xs text-warning">No map position</span>
            )}
            {r.locationSource ? (
              <span className="block text-xs text-text-muted">
                Pin: {LOCATION_SOURCE_LABELS[r.locationSource] ?? r.locationSource}
                {r.locationAccuracy !== null ? `, accurate to about ${r.locationAccuracy} m` : ""} —
                confirmed by the reporter
              </span>
            ) : null}
          </Item>
          <Item label="What they said" wide>
            <p className="whitespace-pre-line">{r.description}</p>
          </Item>
        </dl>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Reporter">
          <div className="flex items-start gap-3 p-5 text-sm">
            <UserRound className="mt-0.5 size-4 text-text-muted" aria-hidden />
            {r.reporter.kind === "anonymous" ? (
              <p className="text-text-muted">Anonymous — can&apos;t be asked questions.</p>
            ) : (
              <div>
                <p className="text-text">{r.reporter.name ?? "Mobile app user"}</p>
                {r.reporter.kind === "citizen" ? (
                  <p className="text-xs text-text-muted">Mobile app account — answers in the app</p>
                ) : null}
                {r.reporter.phone ? (
                  <p className="font-mono text-text-muted">{r.reporter.phone}</p>
                ) : null}
              </div>
            )}
          </div>
          {r.abuse && r.abuse.count > 0 ? (
            <p className="border-t border-border px-5 py-3 text-xs text-text-muted">
              {r.abuse.count} of this reporter&apos;s reports rejected as false or abusive in the
              last {r.abuse.days} days (flagged at {r.abuse.threshold}).
            </p>
          ) : null}
          {r.can.suspendReporter || r.can.reinstateReporter ? (
            <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
              {r.can.suspendReporter ? (
                <Button size="sm" variant="danger" onClick={() => setOpen("suspend")}>
                  Suspend from reporting
                </Button>
              ) : null}
              {r.can.reinstateReporter ? (
                <Button size="sm" onClick={() => setOpen("reinstate")}>
                  {r.reporterStanding?.status === "suspended" ? "Lift suspension" : "Lift flag"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {r.triage.replies.length ? (
            <ul className="border-t border-border px-5 py-3 text-sm">
              {r.triage.replies.map((x) => (
                <li key={x.at}>
                  <span className="text-xs text-text-muted">
                    Answer, {formatDateTime(x.at)}
                    {x.recordedBy ? ` (${x.recordedBy})` : ""}:
                  </span>{" "}
                  {x.text}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
        <Panel title="Evidence">
          <div className="p-5">
            <EvidenceStrip
              items={r.evidence}
              upload={canUpload && !["rejected", "merged"].includes(r.status) ? upload : null}
            />
          </div>
        </Panel>
      </div>

      {r.matches && (r.matches.reports.length || r.matches.cases.length) ? (
        <Panel
          title="Possible duplicates"
          description="Same plate, or the same offence nearby, within a day."
        >
          <ul className="divide-y divide-border text-sm">
            {r.matches.cases.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="font-mono font-medium text-text">{m.caseNumber}</span>
                  <span className="ml-2 text-xs text-text-muted">
                    case · {m.status.replace("_", " ")}
                  </span>
                </span>
                <Badge tone="warning">{m.why}</Badge>
              </li>
            ))}
            {r.matches.reports.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link to={`/reports/${m.id}`} className="font-mono text-action hover:underline">
                  {m.reportNumber}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">{formatDateTime(m.occurredAt)}</span>
                  <Badge tone="warning">{m.why}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : r.matches ? (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <SearchCheck className="size-4" aria-hidden /> No possible duplicates found.
        </p>
      ) : null}

      <Panel title="History">
        <ol className="grid gap-3 p-5 text-sm">
          {[...r.history].reverse().map((h, i) => (
            <li key={i} className="border-l-2 border-border pl-3">
              <p className="text-text">{h.note ?? h.event}</p>
              <p className="text-xs text-text-muted">
                {h.by} · {formatDateTime(h.at)}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      {r.can.triage ? (
        <AcceptSheet
          key={`accept-${r.id}`}
          report={r}
          open={open === "accept"}
          onOpenChange={(o) => setOpen(o ? "accept" : null)}
          onDone={(x) =>
            setNotice(
              `Accepted. Case ${x.case?.caseNumber ?? ""} opened — dispatch comes with phase N3.`,
            )
          }
        />
      ) : null}
      {r.can.merge ? (
        <MergeDialog
          report={r}
          open={open === "merge"}
          onOpenChange={(o) => setOpen(o ? "merge" : null)}
        />
      ) : null}
      {r.can.ask ? (
        <TextActionDialog
          report={r}
          action="ask"
          open={open === "ask"}
          onOpenChange={(o) => setOpen(o ? "ask" : null)}
        />
      ) : null}
      {r.can.recordReply ? (
        <TextActionDialog
          report={r}
          action="reply"
          open={open === "reply"}
          onOpenChange={(o) => setOpen(o ? "reply" : null)}
        />
      ) : null}
      {r.can.reject ? (
        <RejectDialog
          report={r}
          open={open === "reject"}
          onOpenChange={(o) => setOpen(o ? "reject" : null)}
        />
      ) : null}
      {r.can.changePriority ? (
        <PriorityDialog
          report={r}
          open={open === "priority"}
          onOpenChange={(o) => setOpen(o ? "priority" : null)}
        />
      ) : null}
      <ReasonDialog
        open={open === "undoMerge"}
        onOpenChange={(o) => setOpen(o ? "undoMerge" : null)}
        title="Undo merge?"
        description="The report leaves the case and goes back to the triage queue."
        confirmLabel="Undo merge"
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "undo-merge", body: { reason } });
          setNotice("Merge undone; back in the queue.");
        }}
      />
      {r.reporter.appAccountId ? (
        <>
          <ReasonDialog
            open={open === "suspend"}
            onOpenChange={(o) => setOpen(o ? "suspend" : null)}
            title="Suspend this reporter?"
            description="They can't send reports from the mobile app until HQ lifts the suspension. Reports already sent stay as they are."
            confirmLabel="Suspend"
            danger
            minLength={10}
            onConfirm={async (reason) => {
              await reporterAction.mutateAsync({
                userId: /** @type {string} */ (r.reporter.appAccountId),
                action: "suspend",
                reason,
              });
              setNotice("Reporter suspended from reporting.");
            }}
          />
          <ReasonDialog
            open={open === "reinstate"}
            onOpenChange={(o) => setOpen(o ? "reinstate" : null)}
            title={
              r.reporterStanding?.status === "suspended" ? "Lift the suspension?" : "Lift the flag?"
            }
            description="Their reports are treated like anyone else's again."
            confirmLabel="Lift"
            minLength={10}
            onConfirm={async (reason) => {
              await reporterAction.mutateAsync({
                userId: /** @type {string} */ (r.reporter.appAccountId),
                action: "reinstate",
                reason,
              });
              setNotice("Reporter reinstated.");
            }}
          />
        </>
      ) : null}
      <ReasonDialog
        open={open === "reconsider"}
        onOpenChange={(o) => setOpen(o ? "reconsider" : null)}
        title="Reconsider this report?"
        description="It goes back to the triage queue."
        confirmLabel="Reconsider"
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "reconsider", body: { reason } });
          setNotice("Back in the triage queue.");
        }}
      />
    </div>
  );
}

/** @param {{ label: string, children: import("react").ReactNode, wide?: boolean }} props */
function Item({ label: l, children, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-text-muted">{l}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}

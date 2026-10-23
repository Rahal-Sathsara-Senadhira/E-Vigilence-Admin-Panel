// Triage decisions — docs/02 §6. Each dialog posts one action; the API checks
// the state machine, the triage lock and the permission again.

import {
  PRIORITIES,
  PRIORITY_LABELS,
  REJECTION_CODES,
  REJECTION_LABELS,
  REJECTION_REASONS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type CaseMatch,
  type Priority,
  type RejectionReason,
  type ReportDetail,
  type VehicleType,
} from "@ev/shared";
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from "@ev/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  OffencePicker,
  formatCoordinates,
  fromLocalInput,
  parseCoordinates,
  toLocalInput,
} from "../../components/reportFields";
import { ApiError, api } from "../../lib/api";
import { useStations } from "../../lib/queries";
import { useOffences } from "../../lib/reports";

function useTriageAction(reportId: string, onDone: () => void, success: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api<ReportDetail>(`/reports/${reportId}/${path}`, { method: "POST", body }),
    onSuccess: (report) => {
      queryClient.setQueryData(["report", reportId], report);
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["report-matches", reportId] });
      toast.success(success);
      onDone();
    },
  });
}

function errorOf(err: unknown) {
  if (!err) return null;
  if (err instanceof ApiError && Object.keys(err.fields).length)
    return Object.values(err.fields).join(" ");
  return (err as Error).message;
}

// ── Accept ───────────────────────────────────────────────────────────────

export function AcceptDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const offences = useOffences();
  const [codes, setCodes] = useState<string[]>(report.offenceCodes);
  const [plateUnknown, setPlateUnknown] = useState(!report.vehicleNumber);
  const [plate, setPlate] = useState(report.vehicleNumber ?? "");
  const [vehicleType, setVehicleType] = useState<VehicleType>(report.vehicleType);
  const [coords, setCoords] = useState(formatCoordinates(report.location));
  const [address, setAddress] = useState(report.address === "Not given" ? "" : report.address);
  const [occurredAt, setOccurredAt] = useState(toLocalInput(report.occurredAt));
  const [priority, setPriority] = useState<Priority>(report.priority ?? report.suggestedPriority);
  const [noEvidenceReason, setNoEvidenceReason] = useState("");
  const [note, setNote] = useState("");
  const [stationId, setStationId] = useState("");
  const [dispatchReason, setDispatchReason] = useState("");
  const stations = useStations();
  const needsReason =
    (report.channel === "citizen_app" || report.channel === "whatsapp") &&
    report.evidenceCount === 0;
  const action = useTriageAction(report.id, onClose, "Accepted — case opened.");
  const point = parseCoordinates(coords);

  const submit = () =>
    action.mutate({
      path: "accept",
      body: {
        offenceCodes: codes,
        plateUnknown,
        vehicleNumber: plateUnknown ? undefined : plate,
        vehicleType,
        location: point,
        address,
        occurredAt: fromLocalInput(occurredAt),
        priority,
        noEvidenceReason: needsReason ? noEvidenceReason : undefined,
        note: note || undefined,
        stationId: stationId || undefined,
        dispatchReason: stationId ? dispatchReason : undefined,
      },
    });

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Accept and open a case"
      description="Confirm or correct what police conclude. The report keeps what the reporter said."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            disabled={
              codes.length === 0 ||
              !point ||
              address.trim().length < 3 ||
              (!!stationId && dispatchReason.trim().length < 5)
            }
            onClick={submit}
          >
            Accept and open case
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {action.error ? (
          <div className="sm:col-span-2">
            <Alert tone="danger">{errorOf(action.error)}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-ink">Offences</p>
          <OffencePicker
            offences={offences.data ?? []}
            value={codes}
            onChange={setCodes}
            invalid={codes.length === 0}
          />
        </div>
        <Field
          label="Vehicle number"
          hint={
            plateUnknown
              ? "Accepted with the plate unknown — the case needs other details to trace it."
              : "e.g. WP CAB-1234"
          }
        >
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              disabled={plateUnknown}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Vehicle type">
          {(p) => (
            <Select
              {...p}
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_TYPE_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input
            type="checkbox"
            checked={plateUnknown}
            onChange={(e) => setPlateUnknown(e.target.checked)}
            className="size-4 accent-[var(--ev-primary)]"
          />
          Plate unknown
        </label>
        <Field
          label="Location (latitude, longitude)"
          hint="Paste from a map app, e.g. 6.9344, 79.8428"
          error={coords && !point ? "Enter a point in Sri Lanka." : undefined}
        >
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
            />
          )}
        </Field>
        <Field label="When it happened">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          )}
        </Field>
        <Field label="Address or landmark" className="sm:col-span-2">
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <Field label="Priority" hint={`Suggested: ${report.suggestedPriority}`}>
          {(p) => (
            <Select
              {...p}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((v) => (
                <option key={v} value={v}>
                  {PRIORITY_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note (optional)">
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Field
          label="Dispatch to"
          hint="Automatic: the station whose area contains the location, else the nearest."
        >
          {(p) => (
            <Select {...p} value={stationId} onChange={(e) => setStationId(e.target.value)}>
              <option value="">Automatic</option>
              {stations.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {stationId ? (
          <Field label="Why this station">
            {(p) => (
              <Input
                {...p}
                value={dispatchReason}
                onChange={(e) => setDispatchReason(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {needsReason ? (
          <Field
            label="Why it can proceed without evidence"
            hint="Required: citizen reports need evidence unless you record why (e.g. corroborated by another report)."
            className="sm:col-span-2"
          >
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={noEvidenceReason}
                onChange={(e) => setNoEvidenceReason(e.target.value)}
              />
            )}
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}

// ── Merge ────────────────────────────────────────────────────────────────

export function MergeDialog({
  report,
  match,
  onClose,
}: {
  report: ReportDetail;
  match: CaseMatch;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const action = useTriageAction(report.id, onClose, `Merged into ${match.caseNumber}.`);
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={`Merge into ${match.caseNumber}`}
      description={
        match.status === "closed"
          ? "This case is closed. The report is attached as additional information and the case is not reopened."
          : "The report and its evidence join this case. The reporter follows the case's progress."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            onClick={() =>
              action.mutate({ path: "merge", body: { caseId: match.id, note: note || undefined } })
            }
          >
            Merge
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error ? <Alert tone="danger">{errorOf(action.error)}</Alert> : null}
        <Field label="Note (optional)">
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

// ── Needs information / reply ────────────────────────────────────────────

export function NeedsInfoDialog({
  report,
  onClose,
}: {
  report: ReportDetail;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const action = useTriageAction(report.id, onClose, "Question sent to the reporter.");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Ask the reporter"
      description={
        report.channel === "citizen_app"
          ? "The reporter sees this in the mobile app. With no reply in 7 days the report closes."
          : "Call the reporter and record their answer here. With no answer in 7 days the report closes."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={question.trim().length < 10}
            loading={action.isPending}
            onClick={() => action.mutate({ path: "needs-info", body: { question } })}
          >
            Send question
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error ? <Alert tone="danger">{errorOf(action.error)}</Alert> : null}
        <Field
          label="Question"
          hint="Plain language, e.g. “Which direction was the vehicle travelling?”"
        >
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

export function ReplyDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const [answer, setAnswer] = useState("");
  const action = useTriageAction(
    report.id,
    onClose,
    "Answer recorded; the report is back in the queue.",
  );
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record the reporter's answer"
      description={report.question?.text}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!answer.trim()}
            loading={action.isPending}
            onClick={() => action.mutate({ path: "reply", body: { answer } })}
          >
            Save answer
          </Button>
        </>
      }
    >
      <Field label="Answer">
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}

// ── Reject ───────────────────────────────────────────────────────────────

export function RejectDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const [code, setCode] = useState<RejectionReason>("insufficient_evidence");
  const [note, setNote] = useState("");
  const action = useTriageAction(report.id, onClose, "Report rejected.");
  const choices = REJECTION_CODES.filter((c) => c !== "no_response");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reject this report"
      description="The reporter sees the message below, never your note."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={action.isPending}
            onClick={() =>
              action.mutate({ path: "reject", body: { reasonCode: code, note: note || undefined } })
            }
          >
            Reject
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error ? <Alert tone="danger">{errorOf(action.error)}</Alert> : null}
        <Field label="Reason">
          {(p) => (
            <Select
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value as RejectionReason)}
            >
              {choices.map((c) => (
                <option key={c} value={c}>
                  {REJECTION_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="rounded-lg border border-line bg-raised px-4 py-3 text-sm">
          <p className="text-xs font-medium text-muted">The reporter sees</p>
          <p className="mt-1 text-ink">“{REJECTION_REASONS[code]}”</p>
        </div>
        {code === "fabricated" || code === "abusive" ? (
          <Alert tone="warning">
            This counts against the reporter. Three in 90 days flags them for review.
          </Alert>
        ) : null}
        <Field label="Internal note (optional)">
          {(p) => (
            <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

// ── Priority, reconsider, undo merge ─────────────────────────────────────

export function PriorityDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const [priority, setPriority] = useState<Priority>(report.priority ?? report.suggestedPriority);
  const [reason, setReason] = useState("");
  const action = useTriageAction(report.id, onClose, "Priority changed.");
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title="Change priority"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 5}
            loading={action.isPending}
            onClick={() => action.mutate({ path: "priority", body: { priority, reason } })}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error ? <Alert tone="danger">{errorOf(action.error)}</Alert> : null}
        <Field label="Priority">
          {(p) => (
            <Select
              {...p}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((v) => (
                <option key={v} value={v}>
                  {PRIORITY_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reason">
          {(p) => (
            <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

export function ReasonActionDialog({
  report,
  path,
  title,
  description,
  button,
  success,
  onClose,
}: {
  report: ReportDetail;
  path: "reconsider" | "undo-merge";
  title: string;
  description: string;
  button: string;
  success: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const action = useTriageAction(report.id, onClose, success);
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 5}
            loading={action.isPending}
            onClick={() => action.mutate({ path, body: { reason } })}
          >
            {button}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error ? <Alert tone="danger">{errorOf(action.error)}</Alert> : null}
        <Field label="Reason" hint="Recorded in the report history and the audit log.">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Station: accept an officer observation as the second officer (docs/02 §7). */
export function useStationAccept(reportId: string) {
  return useTriageAction(reportId, () => {}, "Accepted at the station — case opened.");
}

export function useSimpleAction(reportId: string, success: string) {
  return useTriageAction(reportId, () => {}, success);
}

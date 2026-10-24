// Triage decisions — docs/02 §6. Each posts one action; the backend checks
// the state, the lock and the role again.

import { Search } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Dialog, Field, Input, Select, Sheet, Textarea } from "@/ui/index.js";
import { lookupCase, useReportAction } from "../api.js";
import { OffencePicker } from "../components/OffencePicker.jsx";
import { REJECTION_LABELS, VEHICLE_TYPES } from "../lib/labels.js";

/** @typedef {import("../api.js").Report} Report */

/** Field errors from the backend, or a single message. @param {unknown} err */
function errorsOf(err) {
  if (err instanceof ApiError && Object.keys(err.fields).length) return err.fields;
  return { root: err instanceof Error ? err.message : "Please try again." };
}

/** "2026-10-23T14:05" in the browser's time, for datetime-local inputs. @param {string} iso */
const localInput = (iso) => {
  const d = new Date(iso);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Accept: HQ's conclusions for the new case. The report keeps what the
 * reporter said (docs/02 §6.1).
 * @param {{ report: Report, open: boolean, onOpenChange: (o: boolean) => void, onDone: (r: Report) => void }} props
 */
export function AcceptSheet({ report, open, onOpenChange, onDone }) {
  const action = useReportAction(report.id);
  const [v, setV] = useState(() => ({
    offenceCodes: report.offenceCodes,
    vehicleNumber: report.vehicleNumber ?? "",
    plateUnknown: report.plateUnknown,
    vehicleType: report.vehicleType ?? "",
    address: report.address ?? "",
    occurredAt: localInput(report.occurredAt),
    priority: report.priority,
    noEvidenceReason: "",
  }));
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const needsReason = report.channel === "citizen_app" && report.evidence.length === 0;
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e?.target ? e.target.value : e });

  async function submit() {
    setErrors({});
    try {
      const result = await action.mutateAsync({
        action: "accept",
        body: {
          offenceCodes: v.offenceCodes,
          vehicleNumber: v.plateUnknown ? undefined : v.vehicleNumber,
          plateUnknown: v.plateUnknown,
          vehicleType: v.vehicleType || undefined,
          address: v.address || undefined,
          lat: report.location?.lat,
          lng: report.location?.lng,
          occurredAt: new Date(v.occurredAt).toISOString(),
          priority: v.priority,
          noEvidenceReason: v.noEvidenceReason || undefined,
        },
      });
      onOpenChange(false);
      onDone(result);
    } catch (err) {
      setErrors(errorsOf(err));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Accept ${report.reportNumber}`}
      description="Opens a case with what police conclude. Correct anything the reporter got wrong — the report keeps what they said."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={action.isPending} onClick={submit}>
            Accept and open case
          </Button>
        </>
      }
    >
      <div className="grid gap-5 p-5">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="Offences" error={errors.offenceCodes}>
          {(p) => (
            <OffencePicker
              id={p.id}
              value={v.offenceCodes}
              onChange={set("offenceCodes")}
              invalid={p.invalid}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vehicle plate" error={errors.vehicleNumber}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                disabled={v.plateUnknown}
                className="font-mono uppercase"
                value={v.vehicleNumber}
                onChange={set("vehicleNumber")}
              />
            )}
          </Field>
          <Field label="Vehicle type">
            {(p) => (
              <Select {...p} value={v.vehicleType} onChange={set("vehicleType")}>
                <option value="">Not known</option>
                {Object.entries(VEHICLE_TYPES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <label className="-mt-2 flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ev-action)]"
            checked={v.plateUnknown}
            onChange={(e) => setV({ ...v, plateUnknown: e.target.checked })}
          />
          Plate unknown — other details allow tracing
        </label>
        <Field label="Place" error={errors.address}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.address} onChange={set("address")} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When it happened" error={errors.occurredAt}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                type="datetime-local"
                value={v.occurredAt}
                onChange={set("occurredAt")}
              />
            )}
          </Field>
          <Field label="Priority" hint="P1 is dispatched first, with shorter limits.">
            {(p) => (
              <Select {...p} value={v.priority} onChange={set("priority")}>
                <option value="P1">P1 — urgent</option>
                <option value="P2">P2 — normal</option>
                <option value="P3">P3 — low</option>
              </Select>
            )}
          </Field>
        </div>
        {needsReason ? (
          <Field
            label="Why it can go ahead without evidence"
            hint="A citizen report needs evidence, unless you record why (e.g. corroborated by another report)."
            error={errors.noEvidenceReason}
          >
            {({ invalid, ...p }) => (
              <Textarea
                {...p}
                invalid={invalid}
                rows={2}
                value={v.noEvidenceReason}
                onChange={set("noEvidenceReason")}
              />
            )}
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * Merge into an existing case: one of the possible matches, or by number.
 * @param {{ report: Report, open: boolean, onOpenChange: (o: boolean) => void }} props
 */
export function MergeDialog({ report, open, onOpenChange }) {
  const action = useReportAction(report.id);
  const [caseId, setCaseId] = useState("");
  const [number, setNumber] = useState("");
  const [found, setFound] = useState(
    /** @type {{ id: string, caseNumber: string, status: string } | null} */ (null),
  );
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const cases = report.matches?.cases ?? [];

  async function find() {
    setError(null);
    try {
      const c = await lookupCase(number);
      setFound(c);
      setCaseId(c.id);
    } catch (err) {
      setFound(null);
      setError(
        err instanceof ApiError && err.fields.number
          ? err.fields.number
          : err instanceof Error
            ? err.message
            : "Not found.",
      );
    }
  }

  async function submit() {
    setError(null);
    try {
      await action.mutateAsync({ action: "merge", body: { caseId } });
      onOpenChange(false);
    } catch (err) {
      const e = errorsOf(err);
      setError(e.caseId ?? e.root ?? "Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Merge into a case"
      description="The report joins an existing case about the same incident. A closed case is not reopened — the report is added as information."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!caseId} loading={action.isPending} onClick={submit}>
            Merge
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {cases.length ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-text">Possible matches</legend>
            {cases.map((c) => (
              <label
                key={c.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-action has-[:checked]:bg-action-soft"
              >
                <input
                  type="radio"
                  name="case"
                  className="mt-0.5 accent-[var(--ev-action)]"
                  checked={caseId === c.id}
                  onChange={() => (setCaseId(c.id), setFound(null))}
                />
                <span>
                  <span className="font-mono font-medium text-text">{c.caseNumber}</span>
                  <span className="block text-xs text-text-muted">
                    {c.why} · {c.vehicleNumber ?? "plate unknown"} · {c.status.replace("_", " ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-text-muted">
            No open case matches this report&apos;s plate or place.
          </p>
        )}
        <Field label="Or find a case by number">
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                className="font-mono uppercase"
                placeholder="TC-2026-000123"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
              <Button
                icon={<Search className="size-4" />}
                onClick={find}
                disabled={number.trim().length < 6}
              >
                Find
              </Button>
            </div>
          )}
        </Field>
        {found ? (
          <Alert tone="info">
            Found <span className="font-mono">{found.caseNumber}</span> (
            {found.status.replace("_", " ")}) — it will be used.
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * A short form with one text box — ask, record a reply.
 * @param {{ report: Report, open: boolean, onOpenChange: (o: boolean) => void, action: "ask" | "reply" }} props
 */
export function TextActionDialog({ report, open, onOpenChange, action: name }) {
  const action = useReportAction(report.id);
  const [text, setText] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const ask = name === "ask";
  async function submit() {
    setError(null);
    try {
      await action.mutateAsync({ action: name, body: ask ? { question: text } : { answer: text } });
      setText("");
      onOpenChange(false);
    } catch (err) {
      const e = errorsOf(err);
      setError(e.question ?? e.answer ?? e.root ?? "Please try again.");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={ask ? "Ask the reporter" : "Record the reporter's answer"}
      description={
        ask
          ? "The report waits until they answer; with no answer in 7 days it is closed. Keep it to one clear question."
          : `Their answer to: “${report.triage.question ?? ""}”. The report goes back to the queue in its place.`
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={action.isPending} onClick={submit}>
            {ask ? "Send question" : "Save answer"}
          </Button>
        </>
      }
    >
      <Field
        label={ask ? "Question" : "Answer"}
        hint={ask ? "e.g. Which direction was the vehicle going?" : undefined}
        error={error ?? undefined}
      >
        {({ invalid, ...p }) => (
          <Textarea
            {...p}
            invalid={invalid}
            rows={3}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}

const REPORTER_SEES = {
  not_an_offence: "What you reported isn't a traffic offence we can act on.",
  insufficient_evidence: "We couldn't act on this report because the evidence wasn't enough.",
  vehicle_unidentifiable: "We couldn't identify the vehicle from this report.",
  outside_jurisdiction: "This happened outside Sri Lanka Police's area.",
  too_old: "This happened more than 30 days ago, so we can't act on it.",
  fabricated: "We couldn't accept this report.",
  abusive: "We couldn't accept this report.",
  not_traffic: "This isn't a traffic matter. For other matters call 119.",
  no_response: "We closed this report because we didn't receive the information we asked for.",
};

/** @param {{ report: Report, open: boolean, onOpenChange: (o: boolean) => void }} props */
export function RejectDialog({ report, open, onOpenChange }) {
  const action = useReportAction(report.id);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));
  async function submit() {
    setError(null);
    try {
      await action.mutateAsync({ action: "reject", body: { reasonCode, note: note || undefined } });
      onOpenChange(false);
    } catch (err) {
      const e = errorsOf(err);
      setError(e.reasonCode ?? e.root ?? "Please try again.");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Reject ${report.reportNumber}`}
      description={
        report.underStationReview
          ? "The report leaves the station's case; a case left with no report is closed."
          : "Rejected reports can be reconsidered within 30 days."
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!reasonCode}
            loading={action.isPending}
            onClick={submit}
          >
            Reject
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Reason">
          {(p) => (
            <Select {...p} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">Choose a reason</option>
              {Object.entries(REJECTION_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {reasonCode ? (
          <p className="rounded-lg bg-sunken p-3 text-sm text-text">
            <span className="block text-xs text-text-muted">The reporter will see</span>“
            {REPORTER_SEES[/** @type {keyof typeof REPORTER_SEES} */ (reasonCode)]}”
          </p>
        ) : null}
        <Field label="Internal note (optional)" hint="Never shown to the reporter.">
          {(p) => (
            <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** @param {{ report: Report, open: boolean, onOpenChange: (o: boolean) => void }} props */
export function PriorityDialog({ report, open, onOpenChange }) {
  const action = useReportAction(report.id);
  const [priority, setPriority] = useState(report.priority);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));
  async function submit() {
    setError(null);
    try {
      await action.mutateAsync({ action: "priority", body: { priority, reason } });
      onOpenChange(false);
    } catch (err) {
      const e = errorsOf(err);
      setError(e.reason ?? e.root ?? "Please try again.");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change priority"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={action.isPending} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Priority">
          {(p) => (
            <Select
              {...p}
              value={priority}
              onChange={(e) => setPriority(/** @type {any} */ (e.target.value))}
            >
              <option value="P1">P1 — urgent (severe offence, or someone hurt)</option>
              <option value="P2">P2 — normal</option>
              <option value="P3">P3 — low (minor, weak evidence)</option>
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

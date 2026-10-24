// One court case — docs/06: the police side, step by step. The officer
// prepares, files and records; the OIC approves filing and confirms the
// verdict (never the same person). Actions come from the backend (`can`).

import { CheckCircle2, FileStack, Gavel, Scale, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PersonPicker } from "@/features/registers/index.js";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Panel,
  ReasonDialog,
  Select,
  Skeleton,
  Textarea,
} from "@/ui/index.js";
import { useCourtAction, useCourtCase, useCourts } from "../api.js";
import { COURT_STATUS, HEARING_OUTCOMES, NEXT, ROUTES, VERDICTS } from "../lib/labels.js";

/** @typedef {import("../api.js").CourtCaseRecord} CourtCaseRecord */
/** @typedef {"prepare" | "approve" | "file" | "hearing" | "verdict" | "confirm" | "withdraw" | "appeal" | "appealResult" | null} Open */

/** A date input value, in Sri Lanka. @param {Date} [d] */
const dateValue = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

/** @param {unknown} err */
const errorsOf = (err) =>
  err instanceof ApiError && Object.keys(err.fields).length
    ? err.fields
    : { root: err instanceof Error ? err.message : "Please try again." };

/** @param {{ id: string }} props */
export function CourtRecord({ id }) {
  const query = useCourtCase(id);
  const action = useCourtAction(id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError) return <Alert tone="danger">{query.error.message}</Alert>;
  const cc = query.data;
  const can = cc.can ?? /** @type {NonNullable<CourtCaseRecord["can"]>} */ ({});
  const [label, tone] = COURT_STATUS[cc.status];
  const close = () => setOpen(null);

  /** @param {string} name @param {object} [body] @param {string} [done] */
  const run = async (name, body, done) => {
    setError(null);
    try {
      await action.mutateAsync({ action: name, body });
      if (done) setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-mono text-xl font-semibold text-text">{cc.courtRef}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
            {cc.next ? (
              <Badge>
                {NEXT[cc.next.kind]} {formatDateTime(cc.next.at)}
              </Badge>
            ) : null}
            {cc.flaggedToHq ? (
              <Badge tone="danger">{cc.postponements} postponements — HQ told</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {ROUTES[cc.route]} · case{" "}
            <Link to={`/cases/${cc.caseId}`} className="font-mono hover:underline">
              {cc.caseNumber}
            </Link>
            {cc.noticeId ? (
              <>
                {" "}
                · notice{" "}
                <Link to={`/notices/${cc.noticeId}`} className="font-mono hover:underline">
                  {cc.noticeNumber}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.prepare ? (
            <Button
              variant={cc.status === "referred" ? "primary" : "secondary"}
              onClick={() => setOpen("prepare")}
            >
              {cc.status === "referred" ? "Prepare" : "Edit preparation"}
            </Button>
          ) : null}
          {can.approve ? (
            <Button
              variant="primary"
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => setOpen("approve")}
            >
              Approve filing
            </Button>
          ) : null}
          {can.file ? (
            <Button variant="primary" onClick={() => setOpen("file")}>
              Record filing
            </Button>
          ) : null}
          {can.recordHearing ? (
            <Button
              variant="primary"
              icon={<Gavel className="size-4" />}
              onClick={() => setOpen("hearing")}
            >
              Record hearing
            </Button>
          ) : null}
          {can.recordVerdict ? (
            <Button icon={<Scale className="size-4" />} onClick={() => setOpen("verdict")}>
              Record verdict
            </Button>
          ) : null}
          {can.confirmVerdict ? (
            <Button
              variant="primary"
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => setOpen("confirm")}
            >
              Confirm verdict
            </Button>
          ) : null}
          {can.recordAppeal ? (
            <Button onClick={() => setOpen("appeal")}>Record appeal</Button>
          ) : null}
          {can.decideAppeal ? (
            <Button variant="primary" onClick={() => setOpen("appealResult")}>
              Appeal result
            </Button>
          ) : null}
          {can.withdraw ? (
            <Button icon={<XCircle className="size-4" />} onClick={() => setOpen("withdraw")}>
              Withdraw
            </Button>
          ) : null}
          <Link
            to={`/court/${cc.id}/bundle`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text hover:bg-sunken"
          >
            <FileStack className="size-4" aria-hidden /> Evidence bundle
          </Link>
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {cc.withdrawal ? (
        <Alert tone="info" title={`Withdrawn by ${cc.withdrawal.by}`}>
          {cc.withdrawal.reason}
        </Alert>
      ) : null}
      {cc.verdict ? (
        <Alert
          tone={cc.verdict.confirmedBy ? "success" : "warning"}
          title={`Verdict: ${VERDICTS[/** @type {keyof typeof VERDICTS} */ (cc.verdict.result)] ?? cc.verdict.result}`}
        >
          {formatDateTime(cc.verdict.date)}
          {cc.verdict.sentence ? ` · ${cc.verdict.sentence}` : ""}
          {cc.verdict.fineAmount
            ? ` · fine Rs. ${cc.verdict.fineAmount.toLocaleString("en-LK")}`
            : ""}
          {cc.verdict.fineReceiptNumber ? ` (receipt ${cc.verdict.fineReceiptNumber})` : ""}
          {" · "}
          {cc.verdict.confirmedBy
            ? `confirmed by ${cc.verdict.confirmedBy}`
            : `recorded by ${cc.verdict.recordedBy}, to be confirmed`}
        </Alert>
      ) : null}
      {cc.appeal ? (
        <Alert tone="info" title={`Appeal ${cc.appeal.reference}`}>
          {cc.appeal.result === "pending"
            ? "Waiting for the result."
            : cc.appeal.result === "changed"
              ? `Verdict changed to ${cc.appeal.newVerdict}.`
              : "The verdict stands."}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Charges">
          <ul className="divide-y divide-border text-sm">
            {cc.charges.map((c) => (
              <li key={c.code} className="flex justify-between gap-3 px-5 py-3">
                <span>
                  <span className="font-mono text-xs text-text-muted">{c.code}</span> {c.name}
                </span>
                <span className="text-text-muted">{c.legalReference}</span>
              </li>
            ))}
          </ul>
          {cc.summary ? (
            <div className="border-t border-border p-5 text-sm">
              <p className="text-xs font-medium text-text-muted">Summary for the prosecution</p>
              <p className="mt-1 whitespace-pre-line text-text">{cc.summary}</p>
            </div>
          ) : null}
        </Panel>
        <Panel title="Parties">
          <dl className="grid gap-3 p-5 text-sm">
            <Item label="Accused">
              {cc.accused ? (
                cc.accused.personId ? (
                  <Link
                    to={`/persons/${cc.accused.personId}`}
                    className="text-action hover:underline"
                  >
                    {cc.accused.name}
                  </Link>
                ) : (
                  cc.accused.name
                )
              ) : (
                <span className="text-warning">Not identified — set at preparation</span>
              )}
            </Item>
            <Item label="Court">{cc.court?.name ?? "—"}</Item>
            <Item label="Court case number">
              <span className="font-mono">{cc.courtCaseNumber ?? "—"}</span>
            </Item>
            <Item label="Prosecuting officer">{cc.prosecutingOfficer ?? "—"}</Item>
            {cc.preparedBy ? <Item label="Prepared by">{cc.preparedBy}</Item> : null}
            {cc.approvedBy ? <Item label="Filing approved by">{cc.approvedBy}</Item> : null}
          </dl>
        </Panel>
      </div>

      {cc.hearings.length ? (
        <Panel title="Hearings">
          <ol className="divide-y divide-border text-sm">
            {cc.hearings.map((h, i) => (
              <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between">
                <span>
                  <span className="font-medium text-text">{formatDateTime(h.date)}</span>
                  <span className="ml-2 text-text-muted">
                    {h.outcome
                      ? HEARING_OUTCOMES[/** @type {keyof typeof HEARING_OUTCOMES} */ (h.outcome)]
                      : "Scheduled"}
                    {h.notes ? ` — ${h.notes}` : ""}
                  </span>
                </span>
                {h.recordedBy ? (
                  <span className="text-xs text-text-muted">{h.recordedBy}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel title="History">
        <ol className="grid gap-3 p-5">
          {[...cc.history].reverse().map((h, i) => (
            <li key={i} className="border-l-2 border-border pl-3 text-sm">
              <p className="text-text">
                {h.event.replaceAll("_", " ")}
                {h.note ? <span className="text-text-muted"> — {h.note}</span> : null}
              </p>
              <p className="text-xs text-text-muted">
                {h.by} · {formatDateTime(h.at)}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      {open === "prepare" ? <PrepareDialog cc={cc} onClose={close} onDone={setNotice} /> : null}
      {open === "file" ? <FileDialog cc={cc} onClose={close} onDone={setNotice} /> : null}
      {open === "hearing" ? <HearingDialog cc={cc} onClose={close} onDone={setNotice} /> : null}
      {open === "verdict" ? <VerdictDialog cc={cc} onClose={close} onDone={setNotice} /> : null}
      {open === "appeal" ? <AppealDialog cc={cc} onClose={close} onDone={setNotice} /> : null}
      {open === "appealResult" ? (
        <AppealResultDialog cc={cc} onClose={close} onDone={setNotice} />
      ) : null}
      <Confirm
        open={open === "approve"}
        onClose={close}
        title="Approve filing?"
        text="The officer then files it in court and records the court's case number."
        label="Approve"
        busy={action.isPending}
        onConfirm={() => run("approve", undefined, "Filing approved.").then(close)}
      />
      <Confirm
        open={open === "confirm"}
        onClose={close}
        title="Confirm the verdict?"
        text="The court case and the case close."
        label="Confirm"
        busy={action.isPending}
        onConfirm={() =>
          run("verdict/confirm", undefined, "Verdict confirmed; the case is closed.").then(close)
        }
      />
      <ReasonDialog
        open={open === "withdraw"}
        onOpenChange={(o) => setOpen(o ? "withdraw" : null)}
        title="Withdraw this court case?"
        description="Only before filing. The case's outcome ends."
        confirmLabel="Withdraw"
        danger
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "withdraw", body: { reason } });
          setNotice("Court case withdrawn.");
        }}
      />
    </div>
  );
}

/** @param {{ open: boolean, onClose: () => void, title: string, text: string, label: string, busy: boolean, onConfirm: () => void }} props */
function Confirm({ open, onClose, title, text, label, busy, onConfirm }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={text}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            {label}
          </Button>
        </>
      }
    />
  );
}

/**
 * A dialog that posts one action with a form.
 * @param {{ title: string, description?: string, submit: string, onClose: () => void, onDone: (m: string) => void,
 *   cc: CourtCaseRecord, action: string, body: () => object, done: string, disabled?: boolean, children: (errors: Record<string, string>) => import("react").ReactNode }} props
 */
function FormDialog({
  title,
  description,
  submit,
  onClose,
  onDone,
  cc,
  action: name,
  body,
  done,
  disabled,
  children,
}) {
  const action = useCourtAction(cc.id);
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            disabled={disabled}
            onClick={async () => {
              setErrors({});
              try {
                await action.mutateAsync({ action: name, body: body() });
                onClose();
                onDone(done);
              } catch (err) {
                setErrors(errorsOf(err));
              }
            }}
          >
            {submit}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        {children(errors)}
      </div>
    </Dialog>
  );
}

/** @param {{ cc: CourtCaseRecord, onClose: () => void, onDone: (m: string) => void }} props */
function PrepareDialog({ cc, onClose, onDone }) {
  const courts = useCourts();
  const [courtId, setCourtId] = useState(cc.court?.id ?? "");
  const [summary, setSummary] = useState(cc.summary ?? "");
  const [accused, setAccused] = useState(
    /** @type {{ id: string, name: string } | null} */ (
      cc.accused?.personId ? { id: cc.accused.personId, name: cc.accused.name } : null
    ),
  );
  return (
    <FormDialog
      cc={cc}
      title="Prepare for court"
      description="The accused (one per court case), the court and the summary for the prosecution. The OIC then approves filing."
      submit="Save — ready for approval"
      action="prepare"
      done="Prepared; waiting for the OIC to approve filing."
      body={() => ({ courtId, summary, ...(accused ? { accusedPersonId: accused.id } : {}) })}
      disabled={!courtId || summary.trim().length < 20 || !accused}
      onClose={onClose}
      onDone={onDone}
    >
      {(errors) => (
        <>
          <PersonPicker label="Accused" value={accused} onChange={setAccused} />
          {errors.accusedPersonId ? (
            <p className="text-sm text-danger">{errors.accusedPersonId}</p>
          ) : null}
          <Field label="Magistrate's Court" error={errors.courtId}>
            {(p) => (
              <Select {...p} value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                <option value="">Choose…</option>
                {(courts.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Summary for the prosecution"
            hint="20 characters or more."
            error={errors.summary}
          >
            {({ invalid, ...p }) => (
              <Textarea
                {...p}
                invalid={invalid}
                rows={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            )}
          </Field>
        </>
      )}
    </FormDialog>
  );
}

/** @param {{ cc: CourtCaseRecord, onClose: () => void, onDone: (m: string) => void }} props */
function FileDialog({ cc, onClose, onDone }) {
  const [v, setV] = useState({ courtCaseNumber: "", firstHearing: "" });
  return (
    <FormDialog
      cc={cc}
      title="Record filing"
      description="The case number the court gave, and the first hearing date. A related notice can no longer be paid online."
      submit="Record filing"
      action="file"
      done="Filed."
      body={() => v}
      disabled={!v.courtCaseNumber.trim() || !v.firstHearing}
      onClose={onClose}
      onDone={onDone}
    >
      {(errors) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Court case number" error={errors.courtCaseNumber}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                className="font-mono"
                value={v.courtCaseNumber}
                onChange={(e) => setV({ ...v, courtCaseNumber: e.target.value })}
              />
            )}
          </Field>
          <Field label="First hearing" error={errors.firstHearing}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                type="date"
                value={v.firstHearing}
                onChange={(e) => setV({ ...v, firstHearing: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

/** @param {{ v: Record<string, string>, set: (v: Record<string, string>) => void, errors: Record<string, string> }} props */
function VerdictFields({ v, set, errors }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Sentence (optional)" error={errors.sentence} className="sm:col-span-2">
        {(p) => (
          <Input
            {...p}
            value={v.sentence ?? ""}
            onChange={(e) => set({ ...v, sentence: e.target.value })}
          />
        )}
      </Field>
      <Field label="Court fine (Rs.)" hint="Paid at court." error={errors.fineAmount}>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            value={v.fineAmount ?? ""}
            onChange={(e) => set({ ...v, fineAmount: e.target.value })}
          />
        )}
      </Field>
      <Field label="Court receipt number" error={errors.fineReceiptNumber}>
        {(p) => (
          <Input
            {...p}
            value={v.fineReceiptNumber ?? ""}
            onChange={(e) => set({ ...v, fineReceiptNumber: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

/** Only filled-in fields. @param {Record<string, string>} v */
const filled = (v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ""));

/** @param {{ cc: CourtCaseRecord, onClose: () => void, onDone: (m: string) => void }} props */
function HearingDialog({ cc, onClose, onDone }) {
  const [v, setV] = useState(
    /** @type {Record<string, string>} */ ({ outcome: "postponed", notes: "", nextDate: "" }),
  );
  const pending = cc.hearings.find((h) => !h.outcome);
  const needsNext = ["postponed", "heard"].includes(v.outcome ?? "");
  return (
    <FormDialog
      cc={cc}
      title="Record the hearing"
      description={pending ? `Hearing of ${formatDateTime(pending.date)}.` : undefined}
      submit="Record"
      action="hearings"
      done="Hearing recorded."
      body={() => filled(v)}
      disabled={needsNext && !v.nextDate}
      onClose={onClose}
      onDone={onDone}
    >
      {(errors) => (
        <>
          <Field label="What happened" error={errors.outcome}>
            {(p) => (
              <Select
                {...p}
                value={v.outcome}
                onChange={(e) => setV({ ...v, outcome: e.target.value })}
              >
                {Object.entries(HEARING_OUTCOMES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {v.outcome !== "guilty_plea" ? (
            <Field
              label={needsNext ? "Next hearing" : "Next hearing (if set)"}
              error={errors.nextDate}
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={v.nextDate ?? ""}
                  onChange={(e) => setV({ ...v, nextDate: e.target.value })}
                />
              )}
            </Field>
          ) : (
            <VerdictFields v={v} set={setV} errors={errors} />
          )}
          <Field label="Notes (optional)">
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={v.notes ?? ""}
                onChange={(e) => setV({ ...v, notes: e.target.value })}
              />
            )}
          </Field>
        </>
      )}
    </FormDialog>
  );
}

/** @param {{ cc: CourtCaseRecord, onClose: () => void, onDone: (m: string) => void }} props */
function VerdictDialog({ cc, onClose, onDone }) {
  const [v, setV] = useState(
    /** @type {Record<string, string>} */ ({ result: "convicted", date: dateValue() }),
  );
  return (
    <FormDialog
      cc={cc}
      title="Record the verdict"
      description="The OIC confirms it; then the case closes."
      submit="Record verdict"
      action="verdict"
      done="Verdict recorded; waiting for the OIC to confirm."
      body={() => filled(v)}
      onClose={onClose}
      onDone={onDone}
    >
      {(errors) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verdict" error={errors.result}>
              {(p) => (
                <Select
                  {...p}
                  value={v.result}
                  onChange={(e) => setV({ ...v, result: e.target.value })}
                >
                  {Object.entries(VERDICTS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Date" error={errors.date}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  max={dateValue()}
                  value={v.date}
                  onChange={(e) => setV({ ...v, date: e.target.value })}
                />
              )}
            </Field>
          </div>
          {v.result === "convicted" ? <VerdictFields v={v} set={setV} errors={errors} /> : null}
        </>
      )}
    </FormDialog>
  );
}

/** @param {{ cc: CourtCaseRecord, onClose: () => void, onDone: (m: string) => void }} props */
function AppealDialog({ cc, onClose, onDone }) {
  const [v, setV] = useState({ reference: "", filedAt: dateValue() });
  return (
    <FormDialog
      cc={cc}
      title="Record an appeal"
      submit="Record appeal"
      action="appeal"
      done="Appeal recorded."
      body={() => v}
      disabled={!v.reference.trim()}
      onClose={onClose}
      onDone={onDone}
    >
      {(errors) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Appeal reference" error={errors.reference}>
            {(p) => (
              <Input
                {...p}
                value={v.reference}
                onChange={(e) => setV({ ...v, reference: e.target.value })}
              />
            )}
          </Field>
          <Field label="Filed on" error={errors.filedAt}>
            {(p) => (
              <Input
                {...p}
                type="date"
                max={dateValue()}
                value={v.filedAt}
                onChange={(e) => setV({ ...v, filedAt: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

/** @param {{ cc: CourtCaseRecord, onClose: () => void, onDone: (m: string) => void }} props */
function AppealResultDialog({ cc, onClose, onDone }) {
  const [v, setV] = useState({ result: "upheld", newVerdict: "" });
  return (
    <FormDialog
      cc={cc}
      title="The appeal's result"
      submit="Record result"
      action="appeal/result"
      done="Appeal result recorded."
      body={() => filled(v)}
      disabled={v.result === "changed" && !v.newVerdict}
      onClose={onClose}
      onDone={onDone}
    >
      {(errors) => (
        <>
          <Field label="Result">
            {(p) => (
              <Select
                {...p}
                value={v.result}
                onChange={(e) => setV({ ...v, result: e.target.value })}
              >
                <option value="upheld">The verdict stands</option>
                <option value="changed">The verdict changed</option>
              </Select>
            )}
          </Field>
          {v.result === "changed" ? (
            <Field label="New verdict" error={errors.newVerdict}>
              {(p) => (
                <Select
                  {...p}
                  value={v.newVerdict}
                  onChange={(e) => setV({ ...v, newVerdict: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {Object.entries(VERDICTS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label: l, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted">{l}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}

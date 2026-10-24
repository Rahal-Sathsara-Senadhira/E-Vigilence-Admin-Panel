// The case's outcome — docs/05 §3, §4. The investigating officer (or the
// OIC) recommends when the case is ready; someone else decides (S1, S2):
// approve, change with a reason, or send back for more work.

import { CheckCircle2, CircleAlert, Gavel, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { OffencePicker } from "@/features/reports/index.js";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Panel,
  ReasonDialog,
  Select,
  Textarea,
  cn,
} from "@/ui/index.js";
import { useCaseAction } from "../api.js";
import { DECIDER_LEVELS, NFA_LABELS, OUTCOME_LABELS } from "../lib/labels.js";

/** @typedef {import("../api.js").CaseRecord} CaseRecord */
/** @typedef {import("../api.js").Outcome} OutcomeValue */
/** @typedef {keyof typeof OUTCOME_LABELS} OutcomeType */

/** @param {{ c: CaseRecord, onNotice: (m: string) => void }} props */
export function Outcome({ c, onNotice }) {
  const action = useCaseAction(c.id);
  const [open, setOpen] = useState(
    /** @type {"recommend" | "change" | "approve" | "send_back" | null} */ (null),
  );
  const close = () => setOpen(null);
  const rec = c.recommendation;
  const waiting = c.status === "recommended" && rec;

  if (!c.decision && !waiting && !c.can.recommend && !rec?.sentBack) return null;

  return (
    <Panel
      title="Outcome"
      description={
        c.can.recommend
          ? "Recommend once the case is ready. Someone else decides."
          : waiting
            ? "Recommended, waiting for the decision."
            : undefined
      }
    >
      <div className="grid gap-4 p-5">
        {c.decision ? (
          <OutcomeSummary
            title={`Decided: ${OUTCOME_LABELS[c.decision.outcome]}`}
            tone="success"
            o={c.decision}
            footer={`${c.decision.kind === "changed" ? "Changed" : "Approved"} by ${c.decision.decidedBy} (${DECIDER_LEVELS[c.decision.level]}) · ${formatDateTime(c.decision.decidedAt)}${c.decision.reason ? ` — “${c.decision.reason}”` : ""}`}
          />
        ) : null}
        {waiting ? (
          <OutcomeSummary
            title={`Recommended: ${OUTCOME_LABELS[rec.outcome]}`}
            tone="warning"
            o={rec}
            footer={`${rec.by} · ${formatDateTime(rec.at)}`}
          />
        ) : null}
        {rec?.sentBack && c.status === "investigating" ? (
          <Alert tone="warning" title="Sent back for more work">
            “{rec.sentBack.reason}” — {rec.sentBack.by}, {formatDateTime(rec.sentBack.at)}
          </Alert>
        ) : null}
        {c.overriddenDecisions.map((d, i) => (
          <p key={i} className="text-xs text-text-muted">
            Earlier decision ({OUTCOME_LABELS[/** @type {OutcomeType} */ (d.outcome)]},{" "}
            {d.decidedBy}) overridden by {d.overriddenBy}, {formatDateTime(d.overriddenAt)}: “
            {d.reason}”
          </p>
        ))}

        {c.can.decide ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => setOpen("approve")}
            >
              Approve
            </Button>
            <Button icon={<Gavel className="size-4" />} onClick={() => setOpen("change")}>
              Change outcome
            </Button>
            <Button icon={<Undo2 className="size-4" />} onClick={() => setOpen("send_back")}>
              Send back
            </Button>
          </div>
        ) : null}

        {c.can.recommend && c.readiness ? (
          <>
            <Readiness readiness={c.readiness} />
            <div>
              <Button variant="primary" onClick={() => setOpen("recommend")}>
                Recommend an outcome
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {open === "recommend" || open === "change" ? (
        <OutcomeDialog c={c} mode={open} onClose={close} onDone={onNotice} />
      ) : null}
      <ReasonDialog
        open={open === "send_back"}
        onOpenChange={(o) => setOpen(o ? "send_back" : null)}
        title="Send back for more work?"
        description="The case returns to the investigating officer with your reason."
        confirmLabel="Send back"
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "decide", body: { action: "send_back", reason } });
          onNotice("Sent back to the investigating officer.");
        }}
      />
      <Dialog
        open={open === "approve"}
        onOpenChange={(o) => setOpen(o ? "approve" : null)}
        title={rec ? `Approve: ${OUTCOME_LABELS[rec.outcome]}?` : "Approve?"}
        description={
          rec?.outcome === "no_further_action"
            ? "The case closes."
            : "The case's facts are locked. The outcome is then carried out (notices with N4)."
        }
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              loading={action.isPending}
              onClick={async () => {
                await action.mutateAsync({ action: "decide", body: { action: "approve" } });
                close();
                onNotice("Decision recorded.");
              }}
            >
              Approve
            </Button>
          </>
        }
      />
    </Panel>
  );
}

/** @param {{ title: string, tone: "success" | "warning", o: OutcomeValue, footer: string }} props */
function OutcomeSummary({ title, tone, o, footer }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "success" ? "border-success/40" : "border-warning/40",
      )}
    >
      <p className="flex items-center gap-2 font-medium text-text">
        <Badge tone={tone}>{title}</Badge>
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {o.offenceCodes.length ? (
          <div>
            <dt className="text-xs text-text-muted">Offences</dt>
            <dd className="font-mono">{o.offenceCodes.join(", ")}</dd>
          </div>
        ) : null}
        {o.addresseePerson ? (
          <div>
            <dt className="text-xs text-text-muted">Addressed to the {o.addressee}</dt>
            <dd>
              {o.addresseePerson.id ? (
                <Link
                  to={`/persons/${o.addresseePerson.id}`}
                  className="text-action hover:underline"
                >
                  {o.addresseePerson.name}
                </Link>
              ) : (
                o.addresseePerson.name
              )}
            </dd>
          </div>
        ) : null}
        {o.nfaReason ? (
          <div>
            <dt className="text-xs text-text-muted">Reason</dt>
            <dd>{NFA_LABELS[/** @type {keyof typeof NFA_LABELS} */ (o.nfaReason)]}</dd>
          </div>
        ) : null}
        {o.driverUnknownReason ? (
          <div>
            <dt className="text-xs text-text-muted">Driver unknown</dt>
            <dd>{o.driverUnknownReason}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs text-text-muted">Why</dt>
          <dd className="whitespace-pre-line">{o.justification}</dd>
        </div>
        {o.prosecutionSummary ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-text-muted">For the prosecution</dt>
            <dd className="whitespace-pre-line">{o.prosecutionSummary}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-text-muted">{footer}</p>
    </div>
  );
}

/** What each outcome still needs. @param {{ readiness: NonNullable<CaseRecord["readiness"]> }} props */
function Readiness({ readiness }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {
        /** @type {OutcomeType[]} */ (Object.keys(OUTCOME_LABELS)).map((k) => {
          const missing = readiness[k] ?? [];
          return (
            <li key={k} className="rounded-lg border border-border p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-text">
                {missing.length ? (
                  <CircleAlert className="size-4 text-warning" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                )}
                {OUTCOME_LABELS[k]}
                <span className="sr-only">{missing.length ? "— not ready" : "— ready"}</span>
              </p>
              {missing.length ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-text-muted">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-text-muted">Ready.</p>
              )}
            </li>
          );
        })
      }
    </ul>
  );
}

/**
 * Recommend an outcome, or (deciding) change it — the same fields; a change
 * needs a reason instead of a justification.
 * @param {{ c: CaseRecord, mode: "recommend" | "change", onClose: () => void, onDone: (m: string) => void }} props
 */
function OutcomeDialog({ c, mode, onClose, onDone }) {
  const action = useCaseAction(c.id);
  const inv = c.investigation;
  const firstReady =
    /** @type {OutcomeType[]} */ (Object.keys(OUTCOME_LABELS)).find(
      (k) => !(c.readiness?.[k] ?? []).length,
    ) ?? "no_further_action";
  const [v, setV] = useState({
    outcome: /** @type {OutcomeType} */ (
      mode === "change" ? (c.recommendation?.outcome ?? firstReady) : firstReady
    ),
    addressee: inv.driver ? "driver" : inv.owner ? "owner" : "",
    offenceCodes: [...c.facts.offenceCodes],
    nfaReason: "",
    driverUnknownReason: "",
    prosecutionSummary: "",
    text: "",
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const nfa = v.outcome === "no_further_action";

  async function submit() {
    setErrors({});
    const fields = {
      outcome: v.outcome,
      ...(nfa ? { nfaReason: v.nfaReason || undefined } : { offenceCodes: v.offenceCodes }),
      ...(!nfa && v.addressee ? { addressee: v.addressee } : {}),
      ...(v.outcome === "court" && v.prosecutionSummary
        ? { prosecutionSummary: v.prosecutionSummary }
        : {}),
      ...(v.outcome === "court" && !v.addressee && v.driverUnknownReason
        ? { driverUnknownReason: v.driverUnknownReason }
        : {}),
    };
    try {
      await action.mutateAsync(
        mode === "recommend"
          ? { action: "recommend", body: { ...fields, justification: v.text } }
          : { action: "decide", body: { action: "change", ...fields, reason: v.text } },
      );
      onClose();
      onDone(mode === "recommend" ? "Recommendation sent for decision." : "Decision recorded.");
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.code === "not_ready"
          ? { root: err.message }
          : err instanceof ApiError && Object.keys(err.fields).length
            ? err.fields
            : { root: err instanceof Error ? err.message : "Please try again." },
      );
    }
  }

  const people = [
    inv.owner ? ["owner", `Registered owner — ${inv.owner.name}`] : null,
    inv.driver ? ["driver", `Driver — ${inv.driver.name}`] : null,
  ].filter(Boolean);

  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={mode === "recommend" ? "Recommend an outcome" : "Change the outcome"}
      description={
        mode === "recommend"
          ? "Your recommendation goes to the OIC (or, if you are the OIC, to the division supervisor)."
          : "Your decision replaces the recommendation. Give the reason."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            disabled={v.text.trim().length < 10}
            onClick={submit}
          >
            {mode === "recommend" ? "Recommend" : "Decide"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Outcome</legend>
          {
            /** @type {OutcomeType[]} */ (Object.keys(OUTCOME_LABELS)).map((k) => {
              const missing = c.readiness?.[k] ?? [];
              return (
                <label
                  key={k}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border border-border p-3 text-sm",
                    v.outcome === k && "border-action bg-action-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="outcome"
                    className="mt-0.5 accent-[var(--ev-action)]"
                    checked={v.outcome === k}
                    onChange={() => setV({ ...v, outcome: k })}
                  />
                  <span>
                    <span className="block font-medium text-text">{OUTCOME_LABELS[k]}</span>
                    {missing.length && mode === "recommend" ? (
                      <span className="text-xs text-warning">{missing[0]}</span>
                    ) : null}
                  </span>
                </label>
              );
            })
          }
        </fieldset>

        {nfa ? (
          <Field label="Reason" error={errors.nfaReason}>
            {(p) => (
              <Select
                {...p}
                value={v.nfaReason}
                onChange={(e) => setV({ ...v, nfaReason: e.target.value })}
              >
                <option value="">Choose…</option>
                {Object.entries(NFA_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <>
            <Field
              label="Offences"
              hint="Confirm them, or correct them — corrections are recorded."
              error={errors.offenceCodes}
            >
              {(p) => (
                <OffencePicker
                  id={p.id}
                  invalid={p.invalid}
                  value={v.offenceCodes}
                  onChange={(codes) => setV({ ...v, offenceCodes: codes })}
                />
              )}
            </Field>
            <Field label="Addressed to" error={errors.addressee}>
              {(p) => (
                <Select
                  {...p}
                  value={v.addressee}
                  onChange={(e) => setV({ ...v, addressee: e.target.value })}
                >
                  {v.outcome === "court" ? (
                    <option value="">Driver unknown</option>
                  ) : (
                    <option value="">Choose…</option>
                  )}
                  {people.map((x) =>
                    x ? (
                      <option key={x[0]} value={x[0]}>
                        {x[1]}
                      </option>
                    ) : null,
                  )}
                </Select>
              )}
            </Field>
            {v.outcome === "court" ? (
              <>
                {!v.addressee ? (
                  <Field label="Why the driver is unknown">
                    {(p) => (
                      <Textarea
                        {...p}
                        rows={2}
                        value={v.driverUnknownReason}
                        onChange={(e) => setV({ ...v, driverUnknownReason: e.target.value })}
                      />
                    )}
                  </Field>
                ) : null}
                <Field label="Summary for the prosecution">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={4}
                      value={v.prosecutionSummary}
                      onChange={(e) => setV({ ...v, prosecutionSummary: e.target.value })}
                    />
                  )}
                </Field>
              </>
            ) : null}
          </>
        )}
        <Field
          label={mode === "recommend" ? "Why this outcome" : "Reason for the change"}
          hint="10 characters or more."
          error={errors.justification ?? errors.reason}
        >
          {({ invalid, ...p }) => (
            <Textarea
              {...p}
              invalid={invalid}
              rows={3}
              value={v.text}
              onChange={(e) => setV({ ...v, text: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

// The addressee's page — no sign-in (docs/05 §6). Look the notice up with
// its number and the vehicle number; then name the driver or dispute it.
// Paying opens with N5. Shows a masked name and no address: anyone who
// sees a plate in the street mustn't learn who owns the car.

import { ArrowLeft, CircleCheck, FileText, Phone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  DISPUTE_GROUNDS,
  DisputeFields,
  DriverFields,
  EMPTY_DISPUTE,
  EMPTY_DRIVER,
  driverBody,
} from "@/features/notices/index.js";
import { ApiError, api } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Badge, Button, Field, Input, Logo, Panel, cn } from "@/ui/index.js";

/**
 * @typedef {object} PublicNotice
 * @property {string} noticeNumber
 * @property {string} status
 * @property {{ name: string, role: "owner" | "driver" }} addressee
 * @property {string | null} vehicle
 * @property {string} occurredAt
 * @property {string | null} place
 * @property {{ name: string, legalReference: string, fine: number | null }[]} offences
 * @property {number | null} amount
 * @property {number | null} [demeritPoints]
 * @property {string | null} servedAt
 * @property {string | null} dueDate
 * @property {string | null} finalDueDate
 * @property {{ at: string, result: "accepted" | "rejected" | null } | null} nomination
 * @property {{ at: string, result: "upheld" | "rejected" | null, reasons: string | null } | null} dispute
 * @property {{ name: string, phone: string | null } | null} station
 * @property {{ nominate: boolean, dispute: boolean, pay: boolean }} can
 */

const STATUS = {
  issued: ["Being sent to you", "neutral"],
  served: ["Waiting for your response", "action"],
  service_failed: ["Being sent again", "neutral"],
  nominated: ["Driver named — being checked", "warning"],
  transferred: ["Passed to the named driver", "success"],
  disputed: ["Dispute being reviewed", "warning"],
  overdue: ["Overdue — please respond now", "danger"],
  court_referral: ["Referred to court", "danger"],
  paid: ["Paid", "success"],
  withdrawn: ["Withdrawn", "success"],
};

/** Errors as field messages, flattening "driver.nic" to "driver.nic". @param {unknown} err */
const errorsOf = (err) =>
  err instanceof ApiError && Object.keys(err.fields).length
    ? err.fields
    : { root: err instanceof Error ? err.message : "Please try again." };

export function PublicNoticePage() {
  const [identify, setIdentify] = useState({ noticeNumber: "", plate: "" });
  const [notice, setNotice] = useState(/** @type {PublicNotice | null} */ (null));
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(/** @type {"view" | "pay" | "nominate" | "dispute"} */ ("view"));
  const [done, setDone] = useState(/** @type {string | null} */ (null));

  async function lookup(/** @type {import("react").FormEvent} */ e) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      setNotice(
        /** @type {PublicNotice} */ (
          await api("/public/notices/lookup", { method: "POST", body: identify })
        ),
      );
      setStep("view");
      setDone(null);
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Logo className="h-8 w-12" />
          <div>
            <p className="text-sm font-semibold text-text">Sri Lanka Police</p>
            <p className="text-xs text-text-muted">Traffic penalty notices</p>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-6">
        {!notice ? (
          <Panel
            title="Find your notice"
            description="Use the notice number printed on your notice and your vehicle number."
          >
            <form onSubmit={lookup} noValidate className="grid gap-4 p-5">
              {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Notice number" hint="e.g. PN-2026-000123" error={errors.noticeNumber}>
                  {({ invalid, ...p }) => (
                    <Input
                      {...p}
                      invalid={invalid}
                      className="font-mono uppercase"
                      autoComplete="off"
                      value={identify.noticeNumber}
                      onChange={(e) => setIdentify({ ...identify, noticeNumber: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Vehicle number" hint="e.g. WP CAB-1234" error={errors.plate}>
                  {({ invalid, ...p }) => (
                    <Input
                      {...p}
                      invalid={invalid}
                      className="font-mono uppercase"
                      autoComplete="off"
                      value={identify.plate}
                      onChange={(e) => setIdentify({ ...identify, plate: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <div>
                <Button type="submit" variant="primary" loading={busy}>
                  Find my notice
                </Button>
              </div>
            </form>
          </Panel>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text"
            >
              <ArrowLeft className="size-4" aria-hidden /> Look up another notice
            </button>
            {done ? (
              <Alert tone="success" title="Received">
                {done}
              </Alert>
            ) : null}
            <NoticeSummary n={notice} />
            {step === "view" ? (
              <Options n={notice} onChoose={setStep} />
            ) : step === "pay" ? (
              <PayStep noticeNumber={notice.noticeNumber} onCancel={() => setStep("view")} />
            ) : (
              <Respond
                n={notice}
                identify={identify}
                type={step}
                onCancel={() => setStep("view")}
                onDone={(updated, message) => {
                  setNotice(updated);
                  setStep("view");
                  setDone(message);
                }}
              />
            )}
          </>
        )}
        <p className="text-xs text-text-muted">
          If someone is in danger right now, call 119. This page never asks for your bank details.
        </p>
      </main>
    </div>
  );
}

/** @param {{ n: PublicNotice }} props */
function NoticeSummary({ n }) {
  const [label, tone] = STATUS[/** @type {keyof typeof STATUS} */ (n.status)] ?? [
    n.status,
    "neutral",
  ];
  return (
    <Panel>
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <FileText className="size-3.5" aria-hidden /> Penalty notice
            </p>
            <p className="font-mono text-lg font-semibold text-text">{n.noticeNumber}</p>
            <p className="text-sm text-text-muted">
              To {n.addressee.name} (
              {n.addressee.role === "owner" ? "registered owner" : "named driver"}) · {n.vehicle}
            </p>
          </div>
          <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
        </div>
        <p className="text-sm text-text">
          {formatDateTime(n.occurredAt)}
          {n.place ? `, ${n.place}` : ""}
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {n.offences.map((o) => (
            <li key={o.name} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                {o.name} <span className="text-xs text-text-muted">({o.legalReference})</span>
              </span>
              <span className="whitespace-nowrap tabular-nums">
                {o.fine !== null ? `Rs. ${o.fine.toLocaleString("en-LK")}` : "—"}
              </span>
            </li>
          ))}
          {n.demeritPoints ? (
            <li className="flex items-center justify-between gap-3 px-3 py-2">
              <span>Demerit points on your driving record when paid</span>
              <span className="tabular-nums">{n.demeritPoints}</span>
            </li>
          ) : null}
          <li className="flex items-center justify-between gap-3 px-3 py-2 font-medium">
            <span>Amount</span>
            <span className="whitespace-nowrap tabular-nums">
              Rs. {n.amount?.toLocaleString("en-LK")}
            </span>
          </li>
        </ul>
        {n.dueDate ? (
          <p className="text-sm text-text">
            Respond by{" "}
            <span className="font-medium">{formatDateTime(n.finalDueDate ?? n.dueDate)}</span>.
          </p>
        ) : null}
        {n.dispute?.result === "rejected" ? (
          <Alert tone="warning" title="Your dispute was not accepted">
            {n.dispute.reasons}
          </Alert>
        ) : null}
        {n.station ? (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Phone className="size-3.5" aria-hidden /> Questions: {n.station.name}
            {n.station.phone ? `, ${n.station.phone}` : ""}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

/** @param {{ n: PublicNotice, onChoose: (s: "pay" | "nominate" | "dispute") => void }} props */
function Options({ n, onChoose }) {
  if (!n.can.pay && !n.can.nominate && !n.can.dispute) return null;
  return (
    <Panel title="What would you like to do?">
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <Choice
          title="Pay"
          text={`The full amount, Rs. ${n.amount?.toLocaleString("en-LK")}. Late payment is accepted until court.`}
          disabled={!n.can.pay}
          onClick={() => onChoose("pay")}
        />
        <Choice
          title="Name the driver"
          text="Someone else was driving. You can do this once, before the due date."
          disabled={!n.can.nominate}
          onClick={() => onChoose("nominate")}
        />
        <Choice
          title="Dispute"
          text="You believe the notice is wrong. You can dispute once."
          disabled={!n.can.dispute}
          onClick={() => onChoose("dispute")}
        />
      </div>
    </Panel>
  );
}

/** @param {{ title: string, text: string, disabled?: boolean, onClick?: () => void }} props */
function Choice({ title, text, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border p-4 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-action hover:bg-action-soft",
      )}
    >
      <span className="block font-medium text-text">{title}</span>
      <span className="mt-1 block text-sm text-text-muted">{text}</span>
    </button>
  );
}

/**
 * @param {{ n: PublicNotice, identify: { noticeNumber: string, plate: string }, type: "nominate" | "dispute",
 *   onCancel: () => void, onDone: (n: PublicNotice, message: string) => void }} props
 */
function Respond({ n, identify, type, onCancel, onDone }) {
  const [driver, setDriver] = useState(EMPTY_DRIVER);
  const [dispute, setDispute] = useState(EMPTY_DISPUTE);
  const [declaration, setDeclaration] = useState(false);
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErrors({});
    setBusy(true);
    try {
      const updated = /** @type {PublicNotice} */ (
        await api(`/public/notices/${type === "nominate" ? "nominate" : "dispute"}`, {
          method: "POST",
          body: {
            ...identify,
            ...(type === "nominate" ? { driver: driverBody(driver) } : dispute),
            declaration,
          },
        })
      );
      onDone(
        updated,
        type === "nominate"
          ? "Thank you. The station will check the driver's details; if accepted, the notice goes to them."
          : `Thank you. Your dispute (${DISPUTE_GROUNDS[/** @type {keyof typeof DISPUTE_GROUNDS} */ (dispute.grounds)] ?? ""}) will be reviewed within 7 days.`,
      );
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={type === "nominate" ? "Name the driver" : "Dispute the notice"}
      description={
        type === "nominate"
          ? `The driver at ${formatDateTime(n.occurredAt)}. Give their NIC or driving licence number and address.`
          : "Tell us why the notice is wrong. Bring any documents to the station if asked."
      }
    >
      <div className="grid gap-4 p-5">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        {type === "nominate" ? (
          <DriverFields value={driver} onChange={setDriver} errors={errors} />
        ) : (
          <DisputeFields value={dispute} onChange={setDispute} errors={errors} />
        )}
        <label className="flex items-start gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--ev-action)]"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
          />
          I confirm the information is true. Giving false information is an offence.
        </label>
        {errors.declaration ? <p className="text-sm text-danger">{errors.declaration}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onCancel}>Back</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!declaration}
            icon={<CircleCheck className="size-4" />}
            onClick={submit}
          >
            Send
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Paying needs the addressee's ID number too (docs/07 §5.1): the NIC, or the
 * business registration number for an organisation. Then the payment
 * simulator opens.
 * @param {{ noticeNumber: string, onCancel: () => void }} props
 */
function PayStep({ noticeNumber, onCancel }) {
  const navigate = useNavigate();
  const [idNumber, setIdNumber] = useState("");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);
  async function start() {
    setErrors({});
    setBusy(true);
    try {
      const { sessionId } = /** @type {{ sessionId: string }} */ (
        await api("/public/payments/start", { method: "POST", body: { noticeNumber, idNumber } })
      );
      navigate(`/pay/sim/${sessionId}`);
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Pay"
      description="Confirm who you are with the ID number of the person or organisation the notice is addressed to."
    >
      <div className="grid gap-4 p-5">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="NIC or business registration number" error={errors.idNumber}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              className="font-mono uppercase"
              autoComplete="off"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          )}
        </Field>
        <Alert tone="warning">
          Online payment is in TEST MODE: no real money moves. Do not enter card details anywhere.
        </Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onCancel}>Back</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={idNumber.trim().length < 5}
            onClick={start}
          >
            Continue to payment
          </Button>
        </div>
      </div>
    </Panel>
  );
}

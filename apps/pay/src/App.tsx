// The addressee's page — docs/07 §5.1, docs/05 §6.2–6.3. Find a notice with
// its number and the ID number, then name the driver or dispute it. Online
// payment is not part of this build; the page says how to pay offline.

import {
  NOTICE_STATUS_FAMILY,
  disputeSchema,
  nominationSchema,
  publicLookupSchema,
  type DisputeGround,
  type PublicNoticeView,
} from "@ev/shared";
import { Alert, Button, Card, Field, Input, Select, StatusBadge, Textarea, cn } from "@ev/ui";
import { ArrowLeft, CircleCheck, MessageSquareWarning, UserRoundPen } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { PublicError, dispute, lookup, nominate, type Credentials } from "./api";
import { LANGUAGES, formatDay, formatMoney, setLanguage, type Language } from "./i18n";

const SENDER = "Sri Lanka Police — E-Vigilance";

type Step =
  | { kind: "lookup" }
  | { kind: "notice"; n: PublicNoticeView; c: Credentials }
  | { kind: "nominate"; n: PublicNoticeView; c: Credentials }
  | { kind: "dispute"; n: PublicNoticeView; c: Credentials }
  | { kind: "done"; n: PublicNoticeView; c: Credentials; text: "nominate.done" | "dispute.done" };

type FieldErrors = Record<string, string>;

/** Checks input with the shared schema; returns the field names that failed. */
function check<T extends z.ZodType>(schema: T, value: unknown) {
  const r = schema.safeParse(value);
  if (r.success) return { data: r.data as z.output<T>, failed: [] as string[] };
  return { data: null, failed: [...new Set(r.error.issues.map((i) => String(i.path[0])))] };
}

export function App() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: "lookup" });

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-frame text-frame-ink">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="size-9 rounded-lg bg-white p-1" />
            <div>
              <p className="text-sm font-semibold">{t("app.police")}</p>
              <p className="text-xs text-frame-muted">{t("app.title")}</p>
            </div>
          </div>
          <LanguagePicker />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {step.kind === "lookup" ? (
          <Lookup onFound={(n, c) => setStep({ kind: "notice", n, c })} />
        ) : step.kind === "notice" ? (
          <NoticeView
            n={step.n}
            onNominate={() => setStep({ ...step, kind: "nominate" })}
            onDispute={() => setStep({ ...step, kind: "dispute" })}
            onAnother={() => setStep({ kind: "lookup" })}
          />
        ) : step.kind === "nominate" ? (
          <NominateForm
            c={step.c}
            onBack={() => setStep({ ...step, kind: "notice" })}
            onDone={(n) => setStep({ kind: "done", n, c: step.c, text: "nominate.done" })}
          />
        ) : step.kind === "dispute" ? (
          <DisputeForm
            c={step.c}
            onBack={() => setStep({ ...step, kind: "notice" })}
            onDone={(n) => setStep({ kind: "done", n, c: step.c, text: "dispute.done" })}
          />
        ) : (
          <div className="space-y-6">
            <Alert tone="success">
              <span className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                {t(step.text)}
              </span>
            </Alert>
            <NoticeView n={step.n} onAnother={() => setStep({ kind: "lookup" })} />
          </div>
        )}
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-2xl px-4 py-5 text-xs text-muted">
          {t("app.official", { sender: SENDER })}
        </p>
      </footer>
    </div>
  );
}

function LanguagePicker() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("app.language")} className="flex gap-1">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          lang={l.code}
          aria-pressed={i18n.language === l.code}
          onClick={() => setLanguage(l.code as Language)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm",
            i18n.language === l.code
              ? "bg-frame-active font-medium text-frame-ink"
              : "text-frame-muted hover:text-frame-ink",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ErrorAlert({ code }: { code: string | null }) {
  const { t, i18n } = useTranslation();
  if (!code) return null;
  return (
    <Alert tone="danger">
      {i18n.exists(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic")}
    </Alert>
  );
}

/** Runs one public call, turning failures into a translated error code and field errors. */
function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  async function run<T>(call: () => Promise<T>, onOk: (v: T) => void) {
    setPending(true);
    setError(null);
    try {
      onOk(await call());
    } catch (e) {
      const err = e instanceof PublicError ? e : new PublicError("generic");
      setError(err.code);
      setFields(Object.fromEntries(Object.keys(err.fields).map((k) => [k, k])));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, fields, setFields, setError, run };
}

function fieldError(t: (k: string) => string, fields: FieldErrors, name: string) {
  return fields[name] ? t(`errors.${name}`) : undefined;
}

// ── Look-up ──────────────────────────────────────────────────────────────

function Lookup({ onFound }: { onFound: (n: PublicNoticeView, c: Credentials) => void }) {
  const { t } = useTranslation();
  const [noticeNumber, setNoticeNumber] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const s = useSubmit();

  function submit(e: FormEvent) {
    e.preventDefault();
    const { data, failed } = check(publicLookupSchema, { noticeNumber, idNumber });
    s.setFields(Object.fromEntries(failed.map((f) => [f, f])));
    s.setError(null);
    if (!data) return;
    void s.run(
      () => lookup(data),
      (n) => onFound(n, data),
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-ink">{t("lookup.heading")}</h1>
      <p className="mt-1 text-sm text-muted">{t("lookup.intro")}</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <ErrorAlert code={s.error === "validation" ? null : s.error} />
        <Field
          label={t("lookup.noticeNumber")}
          hint={t("lookup.noticeHint")}
          error={fieldError(t, s.fields, "noticeNumber")}
        >
          {(p) => (
            <Input
              {...p}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              value={noticeNumber}
              onChange={(e) => setNoticeNumber(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t("lookup.idNumber")}
          hint={t("lookup.idHint")}
          error={fieldError(t, s.fields, "idNumber")}
        >
          {(p) => (
            <Input
              {...p}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={s.pending} className="w-full sm:w-auto">
          {t("lookup.submit")}
        </Button>
        <p className="text-xs text-muted">{t("lookup.privacy")}</p>
      </form>
    </Card>
  );
}

// ── The notice ───────────────────────────────────────────────────────────

function NoticeView({
  n,
  onNominate,
  onDispute,
  onAnother,
}: {
  n: PublicNoticeView;
  onNominate?: () => void;
  onDispute?: () => void;
  onAnother: () => void;
}) {
  const { t } = useTranslation();
  const message = t(`message.${n.status}`);
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <p className="text-xs text-muted">{t("app.title")}</p>
            <h1 className="font-mono text-xl font-semibold text-ink">{n.noticeNumber}</h1>
          </div>
          <StatusBadge
            family={NOTICE_STATUS_FAMILY[n.status]}
            className="h-auto min-h-6 py-0.5 whitespace-normal"
          >
            {t(`status.${n.status}`)}
          </StatusBadge>
        </div>
        {message ? (
          <div className="border-b border-line px-6 py-4">
            <Alert
              tone={n.status === "overdue" || n.status === "court_referral" ? "warning" : "info"}
            >
              {message}
            </Alert>
          </div>
        ) : null}
        <dl className="grid gap-4 px-6 py-5 text-sm sm:grid-cols-2">
          <Item label={t("notice.addressee")}>{n.addresseeMasked}</Item>
          <Item label={t("notice.vehicle")}>
            <span className="font-mono">{n.vehicleNumber ?? "—"}</span>
          </Item>
          <Item label={t("notice.offenceDate")}>{formatDay(n.offenceDate)}</Item>
          {n.payable ? (
            <Item label={t("notice.dueDate")}>
              <span className="font-semibold">{formatDay(n.dueDate)}</span>
            </Item>
          ) : null}
        </dl>
        <table className="w-full border-t border-line text-sm">
          <caption className="px-6 pt-4 pb-2 text-left text-xs font-medium text-muted">
            {t("notice.offences")}
          </caption>
          <tbody>
            {n.offences.map((o, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-6 py-2.5 text-ink">{o.name}</td>
                <td className="px-6 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {formatMoney(o.fine)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="px-6 py-3 text-ink">{t("notice.amount")}</td>
              <td className="px-6 py-3 text-right text-base whitespace-nowrap tabular-nums">
                {formatMoney(n.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {n.payable ? (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-ink">{t("pay.heading")}</h2>
          <p className="mt-2 text-sm text-ink">{t("pay.offline")}</p>
          <p className="mt-1 text-sm text-muted">{t("pay.onlineSoon")}</p>
        </Card>
      ) : null}

      {(n.canNominate && onNominate) || (n.canDispute && onDispute) ? (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-ink">{t("respond.heading")}</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {n.canNominate && onNominate ? (
              <Button icon={<UserRoundPen className="size-4" />} onClick={onNominate}>
                {t("respond.nominate")}
              </Button>
            ) : null}
            {n.canDispute && onDispute ? (
              <Button icon={<MessageSquareWarning className="size-4" />} onClick={onDispute}>
                {t("respond.dispute")}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <button onClick={onAnother} className="text-sm font-medium text-primary hover:underline">
        {t("notice.another")}
      </button>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

// ── Name the driver ──────────────────────────────────────────────────────

function FormCard({
  title,
  intro,
  onBack,
  children,
}: {
  title: string;
  intro: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {t("common.back")}
      </button>
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{intro}</p>
        {children}
      </Card>
    </div>
  );
}

function NominateForm({
  c,
  onBack,
  onDone,
}: {
  c: Credentials;
  onBack: () => void;
  onDone: (n: PublicNoticeView) => void;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState({
    driverName: "",
    driverId: "",
    driverAddress: "",
    driverPhone: "",
    declaration: false,
  });
  const s = useSubmit();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });

  function submit(e: FormEvent) {
    e.preventDefault();
    const input = { ...v, driverPhone: v.driverPhone.trim() || undefined };
    const { data, failed } = check(nominationSchema, input);
    s.setFields(Object.fromEntries(failed.map((f) => [f, f])));
    s.setError(null);
    if (!data) return;
    void s.run(() => nominate(c, data), onDone);
  }

  return (
    <FormCard title={t("nominate.heading")} intro={t("nominate.intro")} onBack={onBack}>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <ErrorAlert code={s.error === "validation" ? null : s.error} />
        <Field label={t("nominate.driverName")} error={fieldError(t, s.fields, "driverName")}>
          {(p) => <Input {...p} autoFocus value={v.driverName} onChange={set("driverName")} />}
        </Field>
        <Field label={t("nominate.driverId")} error={fieldError(t, s.fields, "driverId")}>
          {(p) => (
            <Input {...p} className="font-mono" value={v.driverId} onChange={set("driverId")} />
          )}
        </Field>
        <Field label={t("nominate.driverAddress")} error={fieldError(t, s.fields, "driverAddress")}>
          {(p) => (
            <Textarea {...p} rows={3} value={v.driverAddress} onChange={set("driverAddress")} />
          )}
        </Field>
        <Field label={t("nominate.driverPhone")}>
          {(p) => <Input {...p} type="tel" value={v.driverPhone} onChange={set("driverPhone")} />}
        </Field>
        <div>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={v.declaration}
              onChange={(e) => setV({ ...v, declaration: e.target.checked })}
              aria-invalid={!!s.fields.declaration}
              className="mt-1 size-4 shrink-0 accent-[var(--ev-primary)]"
            />
            {t("nominate.declaration")}
          </label>
          {s.fields.declaration ? (
            <p className="mt-1.5 text-[13px] text-danger">{t("errors.declaration")}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="primary" loading={s.pending}>
            {t("nominate.submit")}
          </Button>
          <Button type="button" onClick={onBack}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}

// ── Dispute ──────────────────────────────────────────────────────────────

const GROUNDS: DisputeGround[] = ["not_my_vehicle", "sold_or_stolen", "evidence_wrong", "other"];

function DisputeForm({
  c,
  onBack,
  onDone,
}: {
  c: Credentials;
  onBack: () => void;
  onDone: (n: PublicNoticeView) => void;
}) {
  const { t } = useTranslation();
  const [ground, setGround] = useState<DisputeGround>("evidence_wrong");
  const [explanation, setExplanation] = useState("");
  const s = useSubmit();

  function submit(e: FormEvent) {
    e.preventDefault();
    const { data, failed } = check(disputeSchema, { ground, explanation });
    s.setFields(Object.fromEntries(failed.map((f) => [f, f])));
    s.setError(null);
    if (!data) return;
    void s.run(() => dispute(c, data), onDone);
  }

  return (
    <FormCard title={t("dispute.heading")} intro={t("dispute.intro")} onBack={onBack}>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <ErrorAlert code={s.error === "validation" ? null : s.error} />
        <Field label={t("dispute.ground")}>
          {(p) => (
            <Select
              {...p}
              value={ground}
              onChange={(e) => setGround(e.target.value as DisputeGround)}
            >
              {GROUNDS.map((g) => (
                <option key={g} value={g}>
                  {t(`dispute.grounds.${g}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t("dispute.explanation")}
          hint={t("dispute.explanationHint")}
          error={fieldError(t, s.fields, "explanation")}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={5}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="primary" loading={s.pending}>
            {t("dispute.submit")}
          </Button>
          <Button type="button" onClick={onBack}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}

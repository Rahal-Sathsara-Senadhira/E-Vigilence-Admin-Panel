// One notice — what it says, how it was served, what happens next; and the
// actions the backend allows (`can`).

import { Gavel, MailCheck, MailX, Printer, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Panel,
  ReasonDialog,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
  Textarea,
} from "@/ui/index.js";
import { useNotice, useNoticeAction } from "../api.js";
import { NOTICE_EVENTS, rupees } from "../lib/labels.js";
import { NextDate, NoticeStatus } from "./NoticeBadges.jsx";
import { Responses } from "./Responses.jsx";
import { RecordReceiptDialog } from "@/features/payments/index.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";

/** @typedef {"posted" | "failed" | "reserve" | "withdraw" | "court" | "receipt" | null} Open */

/** Today as a date input value, in Sri Lanka. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

/** @param {{ id: string }} props */
export function NoticeRecord({ id }) {
  const query = useNotice(id);
  const navigate = useNavigate();
  const user = useCurrentUser();
  const action = useNoticeAction(id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError) return <Alert tone="danger">{query.error.message}</Alert>;
  const n = query.data;
  const penalty = n.kind === "penalty";

  /** @param {string} name @param {object} body @param {string} done */
  const run = async (name, body, done) => {
    await action.mutateAsync({ action: name, body });
    setNotice(done);
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-mono text-xl font-semibold text-text">{n.noticeNumber}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <NoticeStatus status={n.status} courtProposed={n.courtProposed} />
            <NextDate next={n.next} />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {penalty ? "Penalty notice" : "Warning letter"} · issued {formatDateTime(n.issuedAt)}{" "}
            from{" "}
            <Link to={`/cases/${n.caseId}`} className="font-mono hover:underline">
              {n.caseNumber}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {n.can.post ? (
            <Button
              variant="primary"
              icon={<Send className="size-4" />}
              onClick={() => setOpen("posted")}
            >
              Mark as posted
            </Button>
          ) : null}
          {n.can.serviceFailed ? (
            <Button icon={<MailX className="size-4" />} onClick={() => setOpen("failed")}>
              Returned mail
            </Button>
          ) : null}
          {n.can.reserve ? (
            <Button
              variant="primary"
              icon={<MailCheck className="size-4" />}
              onClick={() => setOpen("reserve")}
            >
              Re-serve
            </Button>
          ) : null}
          {n.can.confirmCourt ? (
            <Button
              variant="primary"
              icon={<Gavel className="size-4" />}
              onClick={() => setOpen("court")}
            >
              Confirm court referral
            </Button>
          ) : null}
          {penalty &&
          can(user, "payments.recordReceipt") &&
          ["issued", "served", "service_failed", "nominated", "disputed", "overdue"].includes(
            n.status,
          ) ? (
            <Button onClick={() => setOpen("receipt")}>Record a receipt</Button>
          ) : null}
          {n.can.withdraw ? (
            <Button
              variant="danger"
              icon={<XCircle className="size-4" />}
              onClick={() => setOpen("withdraw")}
            >
              Withdraw
            </Button>
          ) : null}
          <Link
            to={`/notices/${n.id}/print`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text hover:bg-sunken"
          >
            <Printer className="size-4" aria-hidden /> Print
          </Link>
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {n.courtProposed && n.status === "overdue" ? (
        <Alert tone="warning" title="Court referral proposed">
          No response after the reminder. The OIC confirms the referral (docs/05 §6.4).
        </Alert>
      ) : null}
      {n.withdrawal ? (
        <Alert tone="info" title={`Withdrawn by ${n.withdrawal.by}`}>
          {n.withdrawal.reason} · {formatDateTime(n.withdrawal.at)}
        </Alert>
      ) : null}
      {n.status === "issued" ? (
        <Alert tone="info" title="To be posted">
          Print it, post it to the address below, then mark it as posted. It is deemed served 3 days
          after posting.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Offences">
          <Table label="Offences on the notice">
            <thead>
              <tr>
                <Th>Offence</Th>
                <Th>Law</Th>
                {penalty ? <Th className="text-right">Fine</Th> : null}
              </tr>
            </thead>
            <tbody>
              {n.offences.map((o) => (
                <Tr key={o.code}>
                  <Td>
                    <span className="font-mono text-xs text-text-muted">{o.code}</span> {o.name}
                  </Td>
                  <Td className="text-text-muted">{o.legalReference}</Td>
                  {penalty ? <Td className="text-right tabular-nums">{rupees(o.fine)}</Td> : null}
                </Tr>
              ))}
              {penalty ? (
                <Tr>
                  <Td className="font-medium">Total</Td>
                  <Td />
                  <Td className="text-right font-medium tabular-nums">{rupees(n.amount)}</Td>
                </Tr>
              ) : null}
            </tbody>
          </Table>
          <dl className="grid gap-3 border-t border-border p-5 text-sm sm:grid-cols-2">
            <Item label="Vehicle">
              <span className="font-mono">{n.vehicle?.plate ?? "—"}</span>
            </Item>
            <Item label="When and where">
              {formatDateTime(n.occurredAt)}
              {n.place ? ` · ${n.place}` : ""}
            </Item>
          </dl>
        </Panel>
        <Panel title="Addressed to">
          <dl className="grid gap-3 p-5 text-sm">
            <Item label={`The ${n.addresseeDetail.role}`}>
              {n.addresseeDetail.personId ? (
                <Link
                  to={`/persons/${n.addresseeDetail.personId}`}
                  className="text-action hover:underline"
                >
                  {n.addresseeDetail.name}
                </Link>
              ) : (
                n.addresseeDetail.name
              )}
            </Item>
            <Item label="Address">{n.addresseeDetail.address}</Item>
            {n.addresseeDetail.phone ? <Item label="SMS to">{n.addresseeDetail.phone}</Item> : null}
            <Item label="Served">
              {n.servedAt ? `${formatDateTime(n.servedAt)} (deemed)` : "Not yet"}
            </Item>
            {n.dueDate ? <Item label="Due">{formatDateTime(n.dueDate)}</Item> : null}
            {n.finalDueDate ? (
              <Item label="Final date">{formatDateTime(n.finalDueDate)}</Item>
            ) : null}
          </dl>
        </Panel>
      </div>

      <Responses n={n} onDone={setNotice} onOpenNotice={(nid) => navigate(`/notices/${nid}`)} />

      {n.attempts.length ? (
        <Panel title="Service">
          <ul className="divide-y divide-border text-sm">
            {n.attempts.map((a, i) => (
              <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between">
                <span>
                  Posted to {a.address}
                  {a.sms ? " · SMS sent" : ""}
                  {a.result === "returned" ? (
                    <span className="text-danger"> · returned{a.note ? `: ${a.note}` : ""}</span>
                  ) : null}
                </span>
                <span className="text-xs text-text-muted">
                  {a.postedBy} · {formatDateTime(a.postedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="History">
        <ol className="grid gap-3 p-5">
          {[...n.history].reverse().map((e, i) => (
            <li key={i} className="border-l-2 border-border pl-3 text-sm">
              <p className="text-text">
                {NOTICE_EVENTS[/** @type {keyof typeof NOTICE_EVENTS} */ (e.event)] ?? e.event}
                {e.note ? <span className="text-text-muted"> — {e.note}</span> : null}
              </p>
              <p className="text-xs text-text-muted">
                {e.by} · {formatDateTime(e.at)}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      {open === "receipt" ? (
        <RecordReceiptDialog
          noticeId={n.id}
          amount={n.amount ?? 0}
          onClose={() => setOpen(null)}
          onDone={setNotice}
        />
      ) : null}
      {open === "posted" ? (
        <PostedDialog
          onClose={() => setOpen(null)}
          onConfirm={(postedAt) => run("posted", { postedAt }, "Marked as posted.")}
          warning={!penalty}
        />
      ) : null}
      {open === "reserve" ? (
        <ReserveDialog
          onClose={() => setOpen(null)}
          onConfirm={(body) => run("reserve", body, "New address recorded; post it again.")}
        />
      ) : null}
      <ReasonDialog
        open={open === "failed"}
        onOpenChange={(o) => setOpen(o ? "failed" : null)}
        title="Returned mail or unknown address?"
        description="The due date stops. Find a new address and re-serve, or the OIC sends it to court."
        confirmLabel="Record"
        onConfirm={(note) => run("service-failed", { note }, "Service failure recorded.")}
      />
      <ReasonDialog
        open={open === "withdraw"}
        onOpenChange={(o) => setOpen(o ? "withdraw" : null)}
        title="Withdraw this notice?"
        description="It stops here; anything waiting to be sent is cancelled. The case's outcome ends."
        confirmLabel="Withdraw"
        danger
        minLength={10}
        onConfirm={(reason) => run("withdraw", { reason }, "Notice withdrawn.")}
      />
      <ReasonDialog
        open={open === "court"}
        onOpenChange={(o) => setOpen(o ? "court" : null)}
        title="Refer to court?"
        description="The notice ends here; the court case is prepared (docs/06)."
        confirmLabel="Refer to court"
        minLength={10}
        onConfirm={(note) => run("court", { note }, "Referred to court.")}
      />
    </div>
  );
}

/** @param {{ onClose: () => void, onConfirm: (postedAt: string) => Promise<void>, warning: boolean }} props */
function PostedDialog({ onClose, onConfirm, warning }) {
  const [date, setDate] = useState(today());
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark as posted"
      description={
        warning
          ? "Posting delivers the warning letter, and the case closes."
          : "Deemed served 3 days after posting; the addressee then has 14 days to respond. An SMS goes out when a phone number is known."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(date);
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Posted
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <Field label="Posted on">
        {(p) => (
          <Input
            {...p}
            type="date"
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}

/** @param {{ onClose: () => void, onConfirm: (body: { address: string, reason: string }) => Promise<void> }} props */
function ReserveDialog({ onClose, onConfirm }) {
  const [v, setV] = useState({ address: "", reason: "" });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Re-serve at a new address"
      description="The address is also corrected on the person's record, with your reason."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={v.address.trim().length < 8 || v.reason.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setErrors({});
              try {
                await onConfirm(v);
                onClose();
              } catch (err) {
                setErrors(
                  err instanceof ApiError && Object.keys(err.fields).length
                    ? err.fields
                    : { root: err instanceof Error ? err.message : "Please try again." },
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save address
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="New address" error={errors.address}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              value={v.address}
              onChange={(e) => setV({ ...v, address: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Where the address came from"
          hint="10 characters or more."
          error={errors.reason}
        >
          {({ invalid, ...p }) => (
            <Textarea
              {...p}
              invalid={invalid}
              rows={2}
              value={v.reason}
              onChange={(e) => setV({ ...v, reason: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
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

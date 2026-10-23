// One penalty notice — docs/05 §5–6. Actions shown are those the API says this
// user may take now (`can`); the API checks each one again.

import {
  DISPUTE_GROUNDS,
  PAYMENT_METHOD_LABELS,
  formatRupees,
  type NoticeDetail,
} from "@ev/shared";
import { Alert, Button, Card, CardHeader, Skeleton } from "@ev/ui";
import {
  ArrowLeft,
  Ban,
  Gavel,
  MailWarning,
  MessageSquareWarning,
  RotateCcw,
  Send,
  UserRoundCheck,
  UserRoundPen,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { NoticeFlags, NoticeStatusBadge, formatDate } from "../../components/noticeBits";
import { Plate } from "../../components/reportBits";
import { formatDateTime } from "../../lib/format";
import { useNotice } from "../../lib/notices";
import {
  CourtDialog,
  DisputeDialog,
  NominationDialog,
  PostDialog,
  ReserveDialog,
  ReviewDisputeDialog,
  ReviewNominationDialog,
  ServiceFailedDialog,
  WithdrawDialog,
} from "./noticeDialogs";

type Dialog =
  | "post"
  | "failed"
  | "reserve"
  | "withdraw"
  | "nominate"
  | "reviewNomination"
  | "dispute"
  | "reviewDispute"
  | "court"
  | null;

const EVENT_LABELS: Record<string, string> = {
  issued: "Issued",
  posted: "Posted",
  service_failed: "Not delivered",
  nominated: "Driver named",
  nomination_rejected: "Named driver rejected",
  transferred: "Transferred to the driver",
  disputed: "Disputed",
  dispute_rejected: "Dispute rejected",
  overdue: "Overdue — reminder sent",
  court_proposed: "Court proposed",
  court_referral: "Referred to court",
  paid: "Paid",
  payment_reversed: "Payment reversed",
  withdrawn: "Withdrawn",
};

export function NoticeDetailPage() {
  const { id = "" } = useParams();
  const n = useNotice(id);
  if (n.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (n.isError) return <Alert tone="danger">{(n.error as Error).message}</Alert>;
  return <Detail n={n.data} />;
}

function Detail({ n }: { n: NoticeDetail }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  return (
    <>
      <Link
        to="/notices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Penalty notices
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink">
            {n.noticeNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <NoticeStatusBadge status={n.status} />
            <NoticeFlags flags={n.flags} />
            {n.legacy ? <span className="text-xs text-muted">Old system</span> : null}
          </div>
        </div>
        <div className="text-right text-sm text-muted">
          <p>
            Case{" "}
            <Link to={`/cases/${n.caseId}`} className="font-mono text-primary hover:underline">
              {n.caseNumber}
            </Link>
            {n.stationName ? ` · ${n.stationName}` : ""}
          </p>
          {n.dueDate ? (
            <p className={n.overdue ? "font-semibold text-danger" : ""}>
              {n.status === "overdue" && n.finalDueDate
                ? `Final date ${formatDate(n.finalDueDate)}`
                : `Due ${formatDate(n.dueDate)}`}
            </p>
          ) : null}
        </div>
      </div>

      {n.parentNoticeId ? (
        <div className="mb-4">
          <Alert tone="info">
            Issued to the named driver.{" "}
            <Link to={`/notices/${n.parentNoticeId}`} className="font-medium underline">
              See the owner's notice
            </Link>
          </Alert>
        </div>
      ) : null}
      {n.childNoticeId ? (
        <div className="mb-4">
          <Alert tone="info">
            Transferred to the named driver.{" "}
            <Link to={`/notices/${n.childNoticeId}`} className="font-medium underline">
              See the driver's notice
            </Link>
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Notice" />
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
              <Item
                label={n.addresseeRole === "owner" ? "Addressee (owner)" : "Addressee (driver)"}
              >
                <Link to={`/persons/${n.addressee.id}`} className="text-primary hover:underline">
                  {n.addressee.name}
                </Link>
                {n.addressee.nicMasked ? (
                  <span className="ml-2 font-mono text-xs text-muted">{n.addressee.nicMasked}</span>
                ) : null}
              </Item>
              <Item label="Vehicle">
                <Plate value={n.vehicleNumber} />
              </Item>
              <Item label="Service address" wide>
                {n.service.address}
              </Item>
              <Item label="Issued">{formatDateTime(n.issuedAt)}</Item>
              <Item label="Served">{n.servedAt ? formatDate(n.servedAt) : "Not yet"}</Item>
            </dl>
            <table className="w-full border-t border-line text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">Offence</th>
                  <th className="px-5 py-2 text-right font-medium">Fine</th>
                </tr>
              </thead>
              <tbody>
                {n.lines.map((l) => (
                  <tr key={l.code} className="border-t border-line">
                    <td className="px-5 py-2.5">
                      <p className="text-ink">{l.name}</p>
                      <p className="text-xs text-muted">{l.legalReference}</p>
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {formatRupees(l.fine)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line font-semibold">
                  <td className="px-5 py-2.5 text-ink">Amount due</td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {formatRupees(n.amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          {n.nomination || n.dispute || n.payment ? (
            <Card>
              <CardHeader title="Responses" />
              <div className="space-y-4 p-5 text-sm">
                {n.nomination ? (
                  <div>
                    <p className="text-xs text-muted">
                      Driver named {formatDateTime(n.nomination.at)} · {n.nomination.status}
                    </p>
                    <p className="text-ink">
                      {n.nomination.driverName}{" "}
                      <span className="font-mono text-xs text-muted">{n.nomination.driverId}</span>
                    </p>
                    <p className="text-muted">{n.nomination.driverAddress}</p>
                  </div>
                ) : null}
                {n.dispute ? (
                  <div className={n.nomination ? "border-t border-line pt-4" : ""}>
                    <p className="text-xs text-muted">
                      Disputed {formatDateTime(n.dispute.at)} · {n.dispute.status}
                    </p>
                    <p className="font-medium text-ink">{DISPUTE_GROUNDS[n.dispute.ground]}</p>
                    <p className="whitespace-pre-line text-ink">{n.dispute.explanation}</p>
                    {n.dispute.reviewReason ? (
                      <p className="mt-1 text-muted">Review: {n.dispute.reviewReason}</p>
                    ) : null}
                  </div>
                ) : null}
                {n.payment ? (
                  <div className={n.nomination || n.dispute ? "border-t border-line pt-4" : ""}>
                    <p className="text-xs text-muted">
                      Paid {formatDateTime(n.payment.receivedAt)} ·{" "}
                      {PAYMENT_METHOD_LABELS[n.payment.method]}
                      {n.payment.test ? " · test payment" : ""}
                    </p>
                    <p className="text-ink">
                      {formatRupees(n.payment.amount)} — ref{" "}
                      <span className="font-mono">{n.payment.reference}</span>
                      {n.payment.refunded ? " (refunded)" : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Timeline" />
            <ol className="space-y-4 p-5">
              {n.timeline
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
          <Actions n={n} open={setDialog} />
          <Card>
            <CardHeader title="Service" />
            <div className="space-y-3 p-5 text-sm">
              {n.service.attempts.length === 0 ? (
                <p className="text-muted">Not posted yet.</p>
              ) : null}
              {n.service.attempts
                .slice()
                .reverse()
                .map((a, i) => (
                  <div key={i} className={i === 0 ? "" : "border-t border-line pt-3"}>
                    <p className="font-mono text-ink">{a.postReference}</p>
                    <p className="text-xs text-muted">
                      Posted {formatDateTime(a.postedAt)} to {a.address}
                    </p>
                    {a.result === "failed" ? (
                      <p className="text-xs text-danger">Not delivered: {a.note}</p>
                    ) : null}
                  </div>
                ))}
              {n.reminderSentAt ? (
                <p className="border-t border-line pt-3 text-xs text-muted">
                  Reminder sent {formatDateTime(n.reminderSentAt)}
                </p>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      {dialog === "post" ? <PostDialog n={n} onClose={close} /> : null}
      {dialog === "failed" ? <ServiceFailedDialog n={n} onClose={close} /> : null}
      {dialog === "reserve" ? <ReserveDialog n={n} onClose={close} /> : null}
      {dialog === "withdraw" ? <WithdrawDialog n={n} onClose={close} /> : null}
      {dialog === "nominate" ? <NominationDialog n={n} onClose={close} /> : null}
      {dialog === "reviewNomination" ? <ReviewNominationDialog n={n} onClose={close} /> : null}
      {dialog === "dispute" ? <DisputeDialog n={n} onClose={close} /> : null}
      {dialog === "reviewDispute" ? <ReviewDisputeDialog n={n} onClose={close} /> : null}
      {dialog === "court" ? <CourtDialog n={n} onClose={close} /> : null}
    </>
  );
}

function Actions({ n, open }: { n: NoticeDetail; open: (d: Dialog) => void }) {
  const actions: {
    key: Dialog;
    label: string;
    icon: ReactNode;
    primary?: boolean;
    show: boolean;
  }[] = [
    {
      key: "post",
      label: "Record posting",
      icon: <Send className="size-4" />,
      primary: true,
      show: n.can.post,
    },
    {
      key: "reviewNomination",
      label: "Review named driver",
      icon: <UserRoundCheck className="size-4" />,
      primary: true,
      show: n.can.reviewNomination,
    },
    {
      key: "reviewDispute",
      label: "Review dispute",
      icon: <MessageSquareWarning className="size-4" />,
      primary: true,
      show: n.can.reviewDispute,
    },
    {
      key: "court",
      label: "Refer to court",
      icon: <Gavel className="size-4" />,
      primary: true,
      show: n.can.confirmCourt,
    },
    {
      key: "reserve",
      label: "Re-serve",
      icon: <RotateCcw className="size-4" />,
      show: n.can.reserve,
    },
    {
      key: "failed",
      label: "Not delivered",
      icon: <MailWarning className="size-4" />,
      show: n.can.serviceFailed,
    },
    {
      key: "nominate",
      label: "Record a named driver",
      icon: <UserRoundPen className="size-4" />,
      show: n.can.recordNomination,
    },
    {
      key: "dispute",
      label: "Record a dispute",
      icon: <MessageSquareWarning className="size-4" />,
      show: n.can.recordDispute,
    },
    { key: "withdraw", label: "Withdraw", icon: <Ban className="size-4" />, show: n.can.withdraw },
  ];
  const shown = actions.filter((a) => a.show);
  return (
    <Card>
      <CardHeader title="Next steps" />
      <div className="grid gap-2 p-5">
        {shown.length === 0 ? (
          <p className="text-sm text-muted">Nothing for you to do on this notice now.</p>
        ) : (
          shown.map((a) => (
            <Button
              key={a.key}
              variant={a.primary ? "primary" : "secondary"}
              icon={a.icon}
              onClick={() => open(a.key)}
            >
              {a.label}
            </Button>
          ))
        )}
      </div>
    </Card>
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

// One payment — how it came in, its receipt scan, review and refund; and
// the actions the backend allows (S3: not the recorder; S4: not the person
// who withdrew the notice).

import { CheckCircle2, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiBlob } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Badge, Button, Dialog, Panel, ReasonDialog, Skeleton } from "@/ui/index.js";
import { usePayment, usePaymentAction } from "../api.js";
import { FLAG_LABELS, METHOD_LABELS, PAYMENT_STATUS, rupees } from "../lib/labels.js";

/** @param {{ id: string }} props */
export function PaymentRecord({ id }) {
  const query = usePayment(id);
  const action = usePaymentAction(id);
  const [open, setOpen] = useState(/** @type {"reverse" | "refund" | null} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));

  if (query.isPending) return <Skeleton className="h-80" />;
  if (query.isError) return <Alert tone="danger">{query.error.message}</Alert>;
  const p = query.data;
  const [label, tone] = PAYMENT_STATUS[p.status];

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-mono text-xl font-semibold text-text">
            {p.reference ?? "No reference yet"}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
            <span className="text-lg font-semibold tabular-nums text-text">{rupees(p.amount)}</span>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            For{" "}
            <Link to={`/notices/${p.noticeId}`} className="font-mono hover:underline">
              {p.noticeNumber}
            </Link>{" "}
            · {p.method ? METHOD_LABELS[p.method] : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.can.review ? (
            <>
              <Button
                variant="primary"
                icon={<CheckCircle2 className="size-4" />}
                loading={action.isPending}
                onClick={async () => {
                  await action.mutateAsync({ action: "review", body: { result: "confirmed" } });
                  setNotice("Receipt confirmed.");
                }}
              >
                Confirm receipt
              </Button>
              <Button icon={<Undo2 className="size-4" />} onClick={() => setOpen("reverse")}>
                Reverse
              </Button>
            </>
          ) : null}
          {p.can.approveRefund ? (
            <Button
              variant="primary"
              icon={<RotateCcw className="size-4" />}
              onClick={() => setOpen("refund")}
            >
              Approve refund
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {p.flags.length ? (
        <Alert tone="danger" title="Flagged">
          {p.flags
            .map((f) => FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (f)] ?? f)
            .join(" · ")}
        </Alert>
      ) : null}
      {p.refund ? (
        <Alert
          tone={p.refund.status === "due" ? "warning" : "info"}
          title={p.refund.status === "due" ? "Refund due" : "Refunded"}
        >
          {p.refund.reason}
          {p.refund.reference ? ` · ${p.refund.reference}` : ""}
          {p.refund.approvedBy
            ? ` · approved by ${p.refund.approvedBy}`
            : p.refund.automatic
              ? " · automatic"
              : ""}
          {p.refund.refundedAt ? `, ${formatDateTime(p.refund.refundedAt)}` : ""}
        </Alert>
      ) : null}
      {p.review ? (
        <Alert
          tone={p.review.result === "confirmed" ? "success" : "danger"}
          title={`Receipt ${p.review.result} by ${p.review.by}`}
        >
          {formatDateTime(p.review.at)}
          {p.review.reason ? ` — “${p.review.reason}”` : ""}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Details">
          <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
            <Item label="Received">{formatDateTime(p.receivedAt)}</Item>
            <Item label="Recorded by">{p.recordedBy ?? "—"}</Item>
            {p.receipt ? (
              <>
                <Item label="Receipt number">
                  <span className="font-mono">{p.receipt.number}</span>
                </Item>
                <Item label="Paid on">{formatDateTime(p.receipt.paidOn)}</Item>
              </>
            ) : null}
            {p.payerName ? <Item label="Payer">{p.payerName}</Item> : null}
          </dl>
        </Panel>
        {p.channel === "receipt" ? <Scan id={p.id} /> : null}
      </div>

      <Panel title="History">
        <ol className="grid gap-3 p-5">
          {[...p.history].reverse().map((h, i) => (
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

      <ReasonDialog
        open={open === "reverse"}
        onOpenChange={(o) => setOpen(o ? "reverse" : null)}
        title="Reverse this receipt?"
        description="The notice is unpaid again. Give the reason (e.g. the receipt number belongs to another fine)."
        confirmLabel="Reverse"
        danger
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "review", body: { result: "reversed", reason } });
          setNotice("Receipt reversed; the notice is unpaid again.");
        }}
      />
      <Dialog
        open={open === "refund"}
        onOpenChange={(o) => setOpen(o ? "refund" : null)}
        title={`Refund ${rupees(p.amount)}?`}
        description="Test mode: the simulator returns a refund reference; no real money moves."
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={action.isPending}
              onClick={async () => {
                await action.mutateAsync({ action: "refund" });
                setOpen(null);
                setNotice("Refund approved.");
              }}
            >
              Approve refund
            </Button>
          </>
        }
      />
    </div>
  );
}

/** The receipt scan, fetched with the sign-in token. @param {{ id: string }} props */
function Scan({ id }) {
  const [url, setUrl] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    let made = /** @type {string | null} */ (null);
    const controller = new AbortController();
    apiBlob(`/payments/${id}/scan`, { signal: controller.signal })
      .then((blob) => {
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return (
    <Panel title="Receipt scan">
      <div className="p-3">
        {url ? (
          <img src={url} alt="Receipt" className="w-full rounded-lg" />
        ) : (
          <Skeleton className="h-48" />
        )}
      </div>
    </Panel>
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

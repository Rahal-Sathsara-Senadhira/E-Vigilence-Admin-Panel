// One payout batch: its payouts and totals. A finance officer other than the
// one who prepared it approves it, and the payouts are made (docs/16 §6).

import { ArrowLeft, CheckCircle2, X } from "lucide-react";
import { Link, useParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Badge, Button, Page, Panel, Skeleton } from "@/ui/index.js";
import { useBatch, usePayoutAction } from "../api.js";
import { PayoutList } from "../components/PayoutList.jsx";
import { BATCH_STATUS, points, rupees } from "../lib/labels.js";

export function BatchPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  const batch = useBatch(id);
  const action = usePayoutAction();
  const back = (
    <Link
      to="/rewards/payouts?tab=batches"
      className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
    >
      <ArrowLeft className="size-4" aria-hidden /> Batches
    </Link>
  );
  if (batch.isPending)
    return (
      <Page title="Payout batch" back={back}>
        <Skeleton className="h-80" />
      </Page>
    );
  if (batch.isError)
    return (
      <Page title="Payout batch" back={back}>
        <Alert tone="danger">{batch.error.message}</Alert>
      </Page>
    );
  const b = batch.data;
  const [label, tone] = BATCH_STATUS[b.status];
  const canPay = can(user, "rewards.approvePayouts");
  const preparedByMe = b.preparedById === user.id;
  const failed = b.payouts.filter((p) => p.status === "failed").length;

  return (
    <Page title={`Payout batch ${b.number}`} className="max-w-[1100px]" back={back}>
      <div className="grid gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xl font-semibold tabular-nums text-text">{rupees(b.amount)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
              <span className="text-sm text-text-muted">
                {b.count} payouts · {points(b.points)}
              </span>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Prepared by {b.preparedBy}, {formatDateTime(b.preparedAt)}
              {b.approvedBy
                ? ` · approved by ${b.approvedBy}, ${formatDateTime(b.approvedAt)}`
                : ""}
            </p>
          </div>
          {canPay && b.status === "prepared" ? (
            <div className="flex flex-wrap gap-2">
              {!preparedByMe ? (
                <Button
                  variant="primary"
                  icon={<CheckCircle2 className="size-4" />}
                  loading={action.isPending && action.variables?.path.endsWith("/approve")}
                  onClick={() => action.mutate({ path: `/rewards/batches/${b.id}/approve` })}
                >
                  Approve and pay
                </Button>
              ) : null}
              <Button
                icon={<X className="size-4" />}
                loading={action.isPending && action.variables?.path.endsWith("/cancel")}
                onClick={() => action.mutate({ path: `/rewards/batches/${b.id}/cancel` })}
              >
                Cancel batch
              </Button>
            </div>
          ) : null}
        </div>

        {canPay && b.status === "prepared" && preparedByMe ? (
          <Alert tone="info">You prepared this batch; another finance officer approves it.</Alert>
        ) : null}
        {action.isError ? <Alert tone="danger">{action.error.message}</Alert> : null}
        {failed ? (
          <Alert tone="warning" title={`${failed} payout${failed === 1 ? "" : "s"} failed`}>
            Retry once the citizen has corrected their details in the app, or reject with a reason.
          </Alert>
        ) : null}

        <Panel title="Payouts">
          <PayoutList rows={b.payouts} canPay={canPay} />
        </Panel>
      </div>
    </Page>
  );
}

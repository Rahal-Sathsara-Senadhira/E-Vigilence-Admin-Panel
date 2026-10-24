// Payouts in a list — waiting requests and a batch's payouts. Finance can
// retry a failed payout or reject one with a reason (docs/16 §6).

import { RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { Badge, Button, ReasonDialog } from "@/ui/index.js";
import { usePayoutAction } from "../api.js";
import { PAYOUT_STATUS, points, rupees } from "../lib/labels.js";

/**
 * @param {{ rows: import("../api.js").PayoutRow[], canPay: boolean }} props
 */
export function PayoutList({ rows, canPay }) {
  const action = usePayoutAction();
  const [rejecting, setRejecting] = useState(/** @type {string | null} */ (null));
  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((p) => {
          const [label, tone] = PAYOUT_STATUS[p.status];
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text">
                  <span className="font-semibold tabular-nums">{rupees(p.amount)}</span>
                  <span className="text-text-muted">
                    {" "}
                    · {points(p.points)} · {p.method === "bank" ? "Bank" : "Wallet"}{" "}
                    {p.accountMasked}
                  </span>
                </span>
                <span className="block text-xs text-text-muted">
                  <Link
                    to={`/rewards/accounts/${encodeURIComponent(p.userId)}`}
                    className="hover:underline"
                  >
                    Citizen {p.userId}
                  </Link>{" "}
                  · asked {formatDateTime(p.requestedAt)}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.capped ? " · monthly cap reached" : ""}
                </span>
                {p.reason ? <span className="block text-xs text-danger">{p.reason}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
                {canPay && p.status === "failed" ? (
                  <Button
                    size="sm"
                    icon={<RotateCcw className="size-4" />}
                    loading={action.isPending && action.variables?.path.includes(p.id)}
                    onClick={() => action.mutate({ path: `/rewards/payouts/${p.id}/retry` })}
                  >
                    Retry
                  </Button>
                ) : null}
                {canPay && (p.status === "failed" || p.status === "requested") ? (
                  <Button
                    size="sm"
                    icon={<X className="size-4" />}
                    onClick={() => setRejecting(p.id)}
                  >
                    Reject
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {rejecting ? (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          title="Reject this payout"
          description="The citizen sees your reason in the app, so write it plainly. Their points go back to their balance."
          confirmLabel="Reject"
          danger
          minLength={10}
          onConfirm={(reason) =>
            action.mutateAsync({ path: `/rewards/payouts/${rejecting}/reject`, body: { reason } })
          }
        />
      ) : null}
    </>
  );
}

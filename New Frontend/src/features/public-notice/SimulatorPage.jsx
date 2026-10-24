// The payment simulator — docs/07 §5. It stands in for a real payment
// provider: no real money and no card details, ever (P3); it looks like no
// real provider (P4) and says TEST MODE on every screen. The payer only
// chooses an outcome; the server confirms it with a signed message.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  Clock,
  CreditCard,
  FlaskConical,
  Printer,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Button, Panel, Skeleton, cn } from "@/ui/index.js";

/**
 * @typedef {{ noticeNumber: string, plate: string | null, offences: string[], amount: number,
 *   status: "pending" | "succeeded" | "failed", method: string | null, failureReason: string | null,
 *   bankDelay: boolean, reference: string | null, receivedAt: string | null, refunded: boolean }} SimSession
 */

const OUTCOMES = [
  ["success", "Pay — success", "The payment goes through.", CircleCheck],
  ["declined", "Card declined", "The bank refuses the payment.", CircleX],
  ["cancel", "Cancel", "The payer gives up.", CircleX],
  ["delay", "Bank delay", "Pending for a minute, then succeeds.", Clock],
];

export function SimulatorPage() {
  const { session = "" } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["simulator", session],
    queryFn: () => /** @type {Promise<SimSession>} */ (api(`/public/payments/sim/${session}`)),
    // A bank delay finishes on the server: look again until it does.
    refetchInterval: (q) => (q.state.data?.bankDelay ? 5000 : false),
  });
  const [method, setMethod] = useState(/** @type {"card" | "wallet"} */ ("card"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  /** @param {string} outcome */
  async function choose(outcome) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/public/payments/sim/${session}/outcome`, {
        method: "POST",
        body: { method, outcome },
      });
      queryClient.setQueryData(["simulator", session], updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const s = query.data;
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning print:hidden">
        <FlaskConical className="mr-1.5 inline size-4" aria-hidden />
        TEST MODE — no real money. This is a payment simulator, not a real payment service.
      </div>
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold text-text">Payment simulator</p>
          <span className="rounded-md border border-dashed border-warning px-2 py-0.5 text-xs font-medium text-warning">
            Test mode
          </span>
        </div>
      </header>
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-6">
        {query.isPending ? (
          <Skeleton className="h-72" />
        ) : query.isError || !s ? (
          <Alert tone="danger">
            {query.error?.message ?? "This payment session doesn't exist."}
          </Alert>
        ) : (
          <>
            <Panel>
              <div className="grid gap-1 p-5">
                <p className="text-xs text-text-muted">Penalty notice {s.noticeNumber}</p>
                <p className="text-3xl font-semibold tabular-nums text-text">
                  Rs. {s.amount.toLocaleString("en-LK")}
                </p>
                <p className="text-sm text-text-muted">
                  {s.plate} · {s.offences.join(", ")}
                </p>
              </div>
            </Panel>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            {s.status === "pending" && !s.bankDelay ? (
              <Panel
                title="Choose how the test payment ends"
                description="Nothing is charged. No card details are asked for."
              >
                <div className="grid gap-4 p-5">
                  <fieldset className="grid grid-cols-2 gap-2">
                    <legend className="sr-only">Method</legend>
                    {[
                      ["card", "Card", CreditCard],
                      ["wallet", "Mobile wallet", Smartphone],
                    ].map(([k, l, Icon]) => {
                      const I = /** @type {import("lucide-react").LucideIcon} */ (Icon);
                      return (
                        <label
                          key={String(k)}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm",
                            method === k && "border-action bg-action-soft font-medium",
                          )}
                        >
                          <input
                            type="radio"
                            name="method"
                            className="sr-only"
                            checked={method === k}
                            onChange={() => setMethod(/** @type {"card" | "wallet"} */ (k))}
                          />
                          <I className="size-4" aria-hidden /> {String(l)}
                        </label>
                      );
                    })}
                  </fieldset>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {OUTCOMES.map(([k, l, hint, Icon]) => {
                      const I = /** @type {import("lucide-react").LucideIcon} */ (Icon);
                      return (
                        <button
                          key={String(k)}
                          type="button"
                          disabled={busy}
                          onClick={() => choose(String(k))}
                          className={cn(
                            "flex items-start gap-2 rounded-lg border border-border p-3 text-left text-sm transition-colors hover:bg-sunken disabled:opacity-50",
                            k === "success" && "border-success",
                          )}
                        >
                          <I className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                          <span>
                            <span className="block font-medium text-text">{String(l)}</span>
                            <span className="text-xs text-text-muted">{String(hint)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Panel>
            ) : null}

            {s.bankDelay ? (
              <Alert tone="warning" title="Waiting for the bank">
                The payment is pending. This page updates by itself when it completes (about a
                minute).
              </Alert>
            ) : null}

            {s.status === "failed" ? (
              <Alert
                tone="danger"
                title={
                  s.failureReason === "cancelled" ? "Payment cancelled" : "Payment not completed"
                }
              >
                {s.failureReason === "declined"
                  ? "The (simulated) bank declined the payment. "
                  : ""}
                Nothing was charged.{" "}
                <Link to="/notice" className="font-medium underline">
                  Back to the notice
                </Link>
              </Alert>
            ) : null}

            {s.status === "succeeded" ? (
              <Panel title={s.refunded ? "Paid — and refunded" : "Payment received"}>
                <div className="grid gap-3 p-5 text-sm">
                  {s.refunded ? (
                    <Alert tone="info">
                      This notice was already paid or no longer due, so this payment was refunded
                      automatically.
                    </Alert>
                  ) : null}
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-text-muted">Reference</dt>
                      <dd className="font-mono text-base font-semibold text-text">{s.reference}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Notice</dt>
                      <dd className="font-mono text-text">{s.noticeNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Amount</dt>
                      <dd className="text-text">Rs. {s.amount.toLocaleString("en-LK")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Received</dt>
                      <dd className="text-text">{formatDateTime(s.receivedAt)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-text-muted">TEST MODE — no real money was taken.</p>
                  <div className="print:hidden">
                    <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
                      Print receipt
                    </Button>
                  </div>
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

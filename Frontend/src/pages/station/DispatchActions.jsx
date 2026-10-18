import React from "react";
import { CheckCircle2, Undo2, AlarmClock, AlertTriangle } from "lucide-react";
import { acceptCase, returnCase } from "../../services/stationsApi";
import { showToast } from "../../utils/toastBus";

const STATE = {
  sent: { label: "New — not accepted yet", cls: "bg-st-open text-white" },
  received: { label: "Accepted", cls: "bg-st-verified/15 text-st-verified" },
  in_progress: { label: "In progress", cls: "bg-st-review/15 text-st-review" },
  resolved: { label: "Done", cls: "bg-raised text-muted" },
};

// Dispatch state for one assigned case, with the station's two dispatch
// actions: Accept (acknowledge it's ours) and Return to HQ (misrouted —
// requires a reason). Return is only offered before work has started.
export default function DispatchActions({ violation, onChanged }) {
  const d = violation.dispatch;
  const [returning, setReturning] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (!d) return null;

  const state = STATE[d.status] || STATE.sent;
  const canReturn = ["open", "pending"].includes(violation.status) && ["sent", "received"].includes(d.status);

  async function accept() {
    setBusy(true);
    try {
      await acceptCase(violation._id);
      showToast("Case accepted", "success");
      onChanged?.();
    } catch {
      /* api client shows the error */
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    setBusy(true);
    try {
      await returnCase(violation._id, reason);
      showToast("Returned to HQ", "success");
      setReturning(false);
      onChanged?.();
    } catch {
      /* api client shows the error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${state.cls}`}>{state.label}</span>
        {d.sla?.overdue ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-st-rejected/10 px-2.5 py-1 font-semibold text-st-rejected">
            <AlarmClock className="h-3.5 w-3.5" /> Overdue — no action for 72h
          </span>
        ) : d.sla?.unacknowledged ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-attention/15 px-2.5 py-1 font-semibold text-attention-ink">
            <AlarmClock className="h-3.5 w-3.5" /> Waiting over 24h
          </span>
        ) : null}
        {d.flags?.overlappingJurisdictions ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <AlertTriangle className="h-3.5 w-3.5" /> On a boundary between stations
          </span>
        ) : null}

        <span className="ml-auto flex gap-2">
          {d.status === "sent" ? (
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" /> Accept
            </button>
          ) : null}
          {canReturn && !returning ? (
            <button
              type="button"
              onClick={() => setReturning(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink hover:bg-raised"
            >
              <Undo2 className="h-4 w-4" /> Not our area — return to HQ
            </button>
          ) : null}
        </span>
      </div>

      {returning ? (
        <div className="rounded-xl border border-line bg-raised p-3">
          <label htmlFor={`return-${violation._id}`} className="text-xs font-semibold text-ink">
            Why isn't this case for your station?
          </label>
          <textarea
            id={`return-${violation._id}`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. This junction is under Bambalapitiya station's area"
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setReturning(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-muted hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={sendBack}
              disabled={busy || reason.trim().length < 10}
              className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-canvas disabled:opacity-50"
            >
              Return to HQ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

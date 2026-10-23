// One minute before an idle sign-out (docs/20 §9): a warning with a
// countdown and a button to stay signed in.

import { Clock } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/session-context.js";
import { Button } from "@/ui/index.js";

export function IdleWarning() {
  const { idleSecondsLeft, stayActive, signOut } = useSession();
  const stayButton = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const open = idleSecondsLeft !== null;

  useEffect(() => {
    if (open) stayButton.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-text"
        className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6 shadow-overlay"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <Clock className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id="idle-title" className="text-base font-semibold text-text">
              Are you still there?
            </h2>
            <p id="idle-text" className="mt-1 text-sm text-text-muted">
              You&apos;ll be signed out in{" "}
              <span className="font-medium text-text tabular-nums">{idleSecondsLeft}</span> seconds
              to protect this account.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => signOut()}>Sign out now</Button>
          <Button ref={stayButton} variant="primary" onClick={stayActive}>
            Stay signed in
          </Button>
        </div>
      </div>
    </div>
  );
}

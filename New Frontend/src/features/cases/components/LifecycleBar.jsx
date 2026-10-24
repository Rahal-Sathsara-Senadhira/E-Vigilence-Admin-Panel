// Where the case is on its path (docs/03 §4, docs/18 §7). A returned case
// shows the step it fell back from; colour is never the only signal.

import { Check } from "lucide-react";
import { cn } from "@/ui/index.js";
import { LIFECYCLE } from "../lib/labels.js";

/** @param {{ status: string }} props */
export function LifecycleBar({ status }) {
  const at = status === "returned" ? 0 : LIFECYCLE.findIndex(([s]) => s === status);
  return (
    <ol className="flex gap-1 overflow-x-auto" aria-label="Case progress">
      {LIFECYCLE.map(([key, label], i) => {
        const done = i < at || status === "closed";
        const current = i === at && status !== "closed";
        return (
          <li
            key={key}
            aria-current={current ? "step" : undefined}
            className="flex min-w-[88px] flex-1 flex-col gap-1.5"
          >
            <span
              className={cn(
                "h-1.5 rounded-full",
                done ? "bg-success" : current ? "bg-action" : "bg-sunken",
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1 text-xs whitespace-nowrap",
                current ? "font-medium text-text" : "text-text-muted",
              )}
            >
              {done ? <Check className="size-3 text-success" aria-hidden /> : null}
              {current && status === "returned" ? "Returned to HQ" : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

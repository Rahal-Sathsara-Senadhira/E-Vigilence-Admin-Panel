// Status badges — docs/13 §3.4 and §7: a filled pill in the family colour,
// always with its label (colour is never the only signal).

import type { ReactNode } from "react";
import { cn } from "./primitives";

export type StatusFamily = "new" | "progress" | "waiting" | "good" | "legal" | "closed" | "problem";

const FAMILY_CLASSES: Record<StatusFamily, string> = {
  new: "bg-st-new text-white",
  progress: "bg-st-progress text-white",
  waiting: "bg-st-waiting text-[#0f1e2e]",
  good: "bg-st-good text-white",
  legal: "bg-st-legal text-white",
  closed: "bg-st-closed text-white",
  problem: "bg-st-problem text-white",
};

export function StatusBadge({
  family,
  children,
  className,
}: {
  family: StatusFamily;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        FAMILY_CLASSES[family],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Neutral outlined tag for non-status facts (role, source). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-line bg-raised px-2.5 text-xs font-medium text-ink whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small accent count or dot — "Not accepted 24h · 4" (§7 attention marker). */
export function AttentionDot({ count }: { count?: number }) {
  if (count === undefined)
    return <span aria-hidden className="inline-block size-2 rounded-full bg-accent" />;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular-nums">
      {count}
    </span>
  );
}

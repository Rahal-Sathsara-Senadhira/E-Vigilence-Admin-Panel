import { Clock } from "lucide-react";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { useNow } from "@/lib/hooks/useNow.js";
import { Badge } from "@/ui/index.js";
import { NEXT_DATES, NOTICE_STATUS_LABELS, NOTICE_STATUS_TONES } from "../lib/labels.js";

/** @param {{ status: keyof typeof NOTICE_STATUS_TONES, courtProposed?: boolean }} props */
export function NoticeStatus({ status, courtProposed }) {
  return (
    <>
      <Badge tone={NOTICE_STATUS_TONES[status] ?? "neutral"}>
        {NOTICE_STATUS_LABELS[status] ?? status}
      </Badge>
      {courtProposed && status === "overdue" ? <Badge tone="warning">Court proposed</Badge> : null}
    </>
  );
}

/**
 * The next date on the notice: quiet while there is time, amber within 2
 * days, red once passed. The text says it too.
 * @param {{ next: { kind: keyof typeof NEXT_DATES, at: string } | null, compact?: boolean }} props
 */
export function NextDate({ next, compact }) {
  const now = useNow();
  if (!next) return null;
  const left = Date.parse(next.at) - now;
  const tone = left < 0 ? "danger" : left < 2 * 86_400_000 ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      <Clock className="size-3" aria-hidden />
      {NEXT_DATES[next.kind]} {compact ? formatRelative(next.at) : formatDateTime(next.at)}
    </Badge>
  );
}

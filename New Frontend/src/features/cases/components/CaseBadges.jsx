import { Clock, TriangleAlert } from "lucide-react";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { useNow } from "@/lib/hooks/useNow.js";
import { Badge, Tooltip } from "@/ui/index.js";
import { CASE_STATUS_LABELS, CASE_STATUS_TONES, DEADLINES } from "../lib/labels.js";

export { PriorityBadge } from "@/domain/priority/index.js";

/** @param {{ status: keyof typeof CASE_STATUS_TONES, disputed?: boolean }} props */
export function CaseStatus({ status, disputed }) {
  return (
    <>
      <Badge tone={CASE_STATUS_TONES[status] ?? "neutral"}>
        {CASE_STATUS_LABELS[status] ?? status}
      </Badge>
      {disputed ? (
        <Badge tone="danger">
          <TriangleAlert className="size-3" aria-hidden /> Disputed
        </Badge>
      ) : null}
    </>
  );
}

/**
 * The next deadline: quiet while there is time, amber in the last quarter
 * (within 6 hours), red once passed. Text says it too — never colour only.
 * @param {{ deadline: { kind: keyof typeof DEADLINES, at: string } | null, compact?: boolean }} props
 */
export function DeadlineClock({ deadline, compact }) {
  const now = useNow();
  if (!deadline) return null;
  const left = Date.parse(deadline.at) - now;
  const overdue = left < 0;
  const soon = !overdue && left < 6 * 3_600_000;
  const tone = overdue ? "danger" : soon ? "warning" : "neutral";
  const text = overdue
    ? `Overdue: ${DEADLINES[deadline.kind].toLowerCase()} ${formatDateTime(deadline.at)}`
    : `${DEADLINES[deadline.kind]} ${formatDateTime(deadline.at)}`;
  return (
    <Tooltip label={text} side="top">
      <span>
        <Badge tone={tone}>
          <Clock className="size-3" aria-hidden />
          {compact ? (overdue ? "Overdue" : formatRelative(deadline.at)) : text}
          {!compact && !overdue ? ` (${formatRelative(deadline.at)})` : ""}
        </Badge>
      </span>
    </Tooltip>
  );
}

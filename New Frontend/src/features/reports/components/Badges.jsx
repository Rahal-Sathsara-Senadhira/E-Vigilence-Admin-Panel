import { Badge } from "@/ui/index.js";
import { STATUS_LABELS, label } from "../lib/labels.js";

export { PriorityBadge } from "@/domain/priority/index.js";

const STATUS_TONE = /** @type {const} */ ({
  pending: "action",
  needs_info: "warning",
  awaiting_second_officer: "warning",
  accepted: "success",
  merged: "success",
  rejected: "neutral",
});

/** @param {{ status: keyof typeof STATUS_TONE, underReview?: boolean }} props */
export function ReportStatus({ status, underReview }) {
  if (underReview) return <Badge tone="warning">Station report — HQ review</Badge>;
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label(status, STATUS_LABELS)}</Badge>;
}

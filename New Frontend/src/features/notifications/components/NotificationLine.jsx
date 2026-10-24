// One notification: its level as an icon (never colour alone), the title, the
// detail and when — the bell and the Notifications page both use it.

import { Clock, Info, Layers, TriangleAlert } from "lucide-react";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { cn } from "@/ui/index.js";

const LEVEL = {
  info: { icon: Info, className: "bg-action-soft text-action", label: "Information" },
  warning: { icon: Clock, className: "bg-warning-soft text-warning", label: "Needs attention" },
  danger: { icon: TriangleAlert, className: "bg-danger-soft text-danger", label: "Urgent" },
};

/** @param {{ n: import("../api.js").NotificationRow, compact?: boolean }} props */
export function NotificationLine({ n, compact = false }) {
  const level = LEVEL[n.level] ?? LEVEL.info;
  const Icon = n.grouped ? Layers : level.icon;
  return (
    <span className="flex w-full min-w-0 items-start gap-3">
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
          level.className,
        )}
        title={level.label}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{level.label}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm text-text",
            !n.read && "font-semibold",
            compact && "truncate",
          )}
        >
          {n.title}
        </span>
        {n.body ? (
          <span className={cn("block text-xs text-text-muted", compact && "line-clamp-2")}>
            {n.body}
          </span>
        ) : null}
        <span className="mt-0.5 block text-[11px] text-text-faint" title={formatDateTime(n.at)}>
          {formatRelative(n.at)}
        </span>
      </span>
      {!n.read ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-action" aria-label="Unread" />
      ) : null}
    </span>
  );
}

import { NOTICE_STATUS_FAMILY, NOTICE_STATUS_LABELS, type NoticeStatus } from "@ev/shared";
import { StatusBadge } from "@ev/ui";

export function NoticeStatusBadge({ status }: { status: NoticeStatus }) {
  return (
    <StatusBadge family={NOTICE_STATUS_FAMILY[status]}>{NOTICE_STATUS_LABELS[status]}</StatusBadge>
  );
}

const NOTICE_FLAG_LABELS: Record<string, string> = {
  court_proposed: "Court proposed",
};

export function NoticeFlags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={
            f === "court_proposed"
              ? "inline-flex h-5 items-center rounded bg-danger/10 px-1.5 text-[11px] font-medium text-danger"
              : "inline-flex h-5 items-center rounded bg-warning/15 px-1.5 text-[11px] font-medium text-ink"
          }
        >
          {NOTICE_FLAG_LABELS[f] ?? f}
        </span>
      ))}
    </span>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Colombo",
});

/** "4 Nov 2026" — due dates are whole days (05 §5.3). */
export const formatDate = (iso: string | null | undefined) =>
  iso ? DATE.format(new Date(iso)) : "—";

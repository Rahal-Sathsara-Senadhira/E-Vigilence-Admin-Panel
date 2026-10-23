import { CASE_STATUS_FAMILY, CASE_STATUS_LABELS, type CaseStatus } from "@ev/shared";
import { StatusBadge } from "@ev/ui";

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <StatusBadge family={CASE_STATUS_FAMILY[status]}>{CASE_STATUS_LABELS[status]}</StatusBadge>
  );
}

const CASE_FLAG_LABELS: Record<string, string> = {
  disputed_jurisdiction: "Disputed jurisdiction",
  overlapping_jurisdictions: "Overlapping areas",
  unverified_station: "Unverified station",
  no_active_officers: "No active officers",
  suspected_false_plate: "Suspected false plate",
  reported_stolen: "Reported stolen",
};

export function CaseFlags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={
            f === "suspected_false_plate" ||
            f === "reported_stolen" ||
            f === "disputed_jurisdiction"
              ? "inline-flex h-5 items-center rounded bg-danger/10 px-1.5 text-[11px] font-medium text-danger"
              : "inline-flex h-5 items-center rounded bg-warning/15 px-1.5 text-[11px] font-medium text-ink"
          }
        >
          {CASE_FLAG_LABELS[f] ?? f}
        </span>
      ))}
    </span>
  );
}

export function dueText(dueAt: string | null, overdue: boolean) {
  if (!dueAt) return "—";
  const ms = new Date(dueAt).getTime() - Date.now();
  if (overdue || ms < 0) return "Overdue";
  const h = Math.floor(ms / 3_600_000);
  return h >= 48
    ? `${Math.floor(h / 24)} days`
    : h >= 1
      ? `${h} h`
      : `${Math.max(1, Math.round(ms / 60_000))} min`;
}

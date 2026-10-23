// Small pieces shared by the report screens.

import {
  CHANNEL_LABELS,
  TRIAGE_FAMILY,
  TRIAGE_LABELS,
  VEHICLE_TYPE_LABELS,
  type Channel,
  type OffenceView,
  type Priority,
  type TriageStatus,
  type VehicleType,
} from "@ev/shared";
import { StatusBadge, Tag, cn } from "@ev/ui";

export function TriageBadge({ status }: { status: TriageStatus }) {
  return <StatusBadge family={TRIAGE_FAMILY[status]}>{TRIAGE_LABELS[status]}</StatusBadge>;
}

/**
 * Priority is not a status, so it doesn't use status colours (docs/13 §3.4):
 * P1 gets the accent marker, the others plain text.
 */
export function PriorityTag({
  priority,
  suggested,
}: {
  priority: Priority | null;
  suggested?: Priority;
}) {
  const p = priority ?? suggested;
  if (!p) return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
        p === "P1"
          ? "border-accent/50 bg-accent/10 text-accent-ink"
          : "border-line bg-surface text-ink",
      )}
      title={priority ? "Priority set at triage" : "Suggested from the offence"}
    >
      {p === "P1" ? <span aria-hidden className="size-1.5 rounded-full bg-accent" /> : null}
      {p}
      {!priority ? <span className="font-normal text-muted">suggested</span> : null}
    </span>
  );
}

export function ChannelTag({ channel }: { channel: Channel }) {
  return <Tag>{CHANNEL_LABELS[channel]}</Tag>;
}

export function Plate({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted">Plate unknown</span>;
  return <span className="font-mono text-[13px] font-medium tracking-wide">{value}</span>;
}

export function vehicleLabel(type: VehicleType) {
  return VEHICLE_TYPE_LABELS[type];
}

export function OffenceNames({
  codes,
  offences,
  compact = false,
}: {
  codes: string[];
  offences: Map<string, OffenceView>;
  compact?: boolean;
}) {
  if (codes.length === 0) return <span className="text-muted">Not recognised</span>;
  if (compact) {
    const first = offences.get(codes[0]!);
    return (
      <span>
        {first?.publicName ?? codes[0]}
        {codes.length > 1 ? <span className="text-muted"> +{codes.length - 1}</span> : null}
      </span>
    );
  }
  return (
    <ul className="space-y-1">
      {codes.map((c) => {
        const o = offences.get(c);
        return (
          <li key={c}>
            <span className="font-medium">{o?.name ?? c}</span>{" "}
            <span className="font-mono text-xs text-muted">{c}</span>
          </li>
        );
      })}
    </ul>
  );
}

const FLAG_LABELS: Record<string, string> = {
  no_location: "No location",
  no_evidence: "No evidence",
  offence_not_recognised: "Offence not recognised",
  reporter_flagged: "Reporter flagged",
  deleted_in_app: "Deleted in app",
  plate_unrecognised: "Plate not recognised",
  evidence_download_failed: "Evidence download failed",
};

export function FlagList({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={cn(
            "inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium",
            f === "reporter_flagged" ? "bg-danger/10 text-danger" : "bg-warning/15 text-ink",
          )}
        >
          {FLAG_LABELS[f] ?? f}
        </span>
      ))}
    </span>
  );
}

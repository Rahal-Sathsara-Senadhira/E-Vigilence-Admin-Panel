// Audit log entries — docs/10-evidence-audit-and-privacy.md §4.

export interface AuditActor {
  kind: "user" | "system" | "citizen" | "addressee" | "anonymous";
  userId?: string | null;
  role?: string | null;
  stationId?: string | null;
  /** Job name for `system`, attempted email for failed sign-ins. */
  label?: string | null;
}

export interface AuditEntryView {
  seq: number;
  at: string;
  actor: AuditActor;
  action: string;
  target: { type: string; id: string | null; label?: string | null } | null;
  summary: string;
  reason: string | null;
  source: { ip: string | null; app: string | null };
  hash: string;
}

export interface AuditChainStatus {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
  checkedAt: string;
}

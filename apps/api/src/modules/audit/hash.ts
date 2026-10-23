import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

/** JSON with keys sorted at every level, so the same entry always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface HashableEntry {
  seq: number;
  at: Date;
  actor: unknown;
  action: string;
  target: unknown;
  summary: string;
  reason: string | null;
  source: unknown;
  prevHash: string;
}

/** SHA-256 of the entry's content plus the previous entry's hash (docs/10 §4.2). */
export function entryHash(entry: HashableEntry): string {
  const content = canonicalJson({
    seq: entry.seq,
    at: entry.at,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    summary: entry.summary,
    reason: entry.reason,
    source: entry.source,
    prevHash: entry.prevHash,
  });
  return createHash("sha256").update(content).digest("hex");
}

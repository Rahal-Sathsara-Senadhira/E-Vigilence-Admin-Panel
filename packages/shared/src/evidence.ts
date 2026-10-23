// Evidence — docs/10 §3. Limits from docs/11 §4 (the same for the app and staff).

export const EVIDENCE_KINDS = ["photo", "video", "audio"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

const MB = 1024 * 1024;
export const EVIDENCE_MAX_BYTES: Record<EvidenceKind, number> = {
  photo: 25 * MB,
  video: 500 * MB,
  audio: 100 * MB,
};
export const EVIDENCE_MAX_ANY = Math.max(...Object.values(EVIDENCE_MAX_BYTES));
export const EVIDENCE_MAX_FILES = 10;

/** Formats recognised from the file's own bytes, never from its name. */
export const EVIDENCE_MIME_KINDS: Record<string, EvidenceKind> = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/webp": "photo",
  "image/gif": "photo",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/x-msvideo": "video",
  "video/mpeg": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
};

export type EvidenceStatus = "processing" | "ready" | "failed";

export interface EvidenceView {
  id: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  originalName: string;
  original: { size: number; mime: string; sha256: string; retained: boolean };
  viewing: { size: number; mime: string; compressed: boolean } | null;
  capturedInApp: boolean;
  uploadedAt: string;
  uploadedBy: string;
  reportId: string | null;
  caseId: string | null;
  integrity: { ok: boolean; checkedAt: string } | null;
}

export type CustodyEventType =
  "received" | "processed" | "attached" | "original_accessed" | "deleted" | "integrity_checked";

export interface CustodyEventView {
  at: string;
  event: CustodyEventType;
  actor: string;
  reason: string | null;
  detail: string | null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

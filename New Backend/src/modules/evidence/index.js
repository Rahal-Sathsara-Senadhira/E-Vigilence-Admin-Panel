// What other modules may use from evidence (docs/19 §4.2 rule 2).

import { randomUUID } from "node:crypto";
import { Evidence } from "./evidence.model.js";

export { Evidence };
export { receiveStream, receiveUpload } from "./receive-upload.js";

/**
 * Stores a received file and records it — docs/10 §3. The file goes to
 * storage first; the record is written in the caller's transaction. If the
 * transaction fails, the caller removes the stored file (`key`).
 * @param {import("#src/core/storage.js").Storage} storage
 * @param {import("./receive-upload.js").ReceivedFile} file
 */
export async function storeFile(storage, file) {
  const now = new Date();
  const key = `evidence/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${file.type.ext}`;
  await storage.putFile(key, file.tempPath, file.type.mime);
  return key;
}

/**
 * @param {import("mongoose").ClientSession} session
 * @param {{ key: string, file: import("./receive-upload.js").ReceivedFile, reportId: any, caseId?: any, receivedVia: string, by: { id: any, name: string }, capturedInApp?: boolean | null, capturedAt?: Date | null }} input
 */
export async function recordEvidence(
  session,
  { key, file, reportId, caseId = null, receivedVia, by, capturedInApp = null, capturedAt = null },
) {
  const [item] = await Evidence.create(
    [
      {
        kind: file.type.kind,
        mime: file.type.mime,
        size: file.size,
        sha256: file.sha256,
        originalKey: key,
        viewKey: key,
        originalName: file.originalName,
        reportId,
        caseId,
        receivedVia,
        uploadedBy: by,
        capturedInApp,
        capturedAt,
        custody: [
          {
            at: new Date(),
            event: "received",
            by: by.name,
            byId: by.id,
            note: `Via ${receivedVia.replaceAll("_", " ")}; fingerprint ${file.sha256.slice(0, 16)}…`,
          },
        ],
      },
    ],
    { session },
  );
  return /** @type {NonNullable<typeof item>} */ (item);
}

/** Evidence of a report, newest last, as shown on screens. @param {any[]} ids */
export async function evidenceList(ids) {
  if (!ids.length) return [];
  const items = await Evidence.find({ _id: { $in: ids } })
    .sort({ createdAt: 1 })
    .lean();
  return items.map(evidenceView);
}

/** @param {any} e */
export const evidenceView = (e) => ({
  id: String(e._id),
  kind: e.kind,
  mime: e.mime,
  size: e.size,
  sha256: e.sha256,
  originalName: e.originalName ?? null,
  uploadedBy: e.uploadedBy?.name ?? null,
  uploadedAt: new Date(e.createdAt).toISOString(),
  capturedInApp: e.capturedInApp ?? null,
  capturedAt: e.capturedAt ? new Date(e.capturedAt).toISOString() : null,
  /** Files deleted at the end of retention; the fingerprint stays. */
  deletedAt: e.deletedAt ? new Date(e.deletedAt).toISOString() : null,
});

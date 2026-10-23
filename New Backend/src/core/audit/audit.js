// The audit log — docs/10, docs/19 §6. Append-only, in a hash chain: each
// entry's hash covers the previous entry's hash, so editing or deleting an
// entry breaks every hash after it. Written in the same transaction as the
// change it records.

import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { inTransaction } from "../db/connection.js";
import { nextNumber } from "../db/counters.js";

const auditSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, unique: true },
    at: { type: Date, required: true },
    actor: {
      kind: { type: String, enum: ["staff", "anonymous", "system"], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, required: true },
      role: { type: String, default: null },
    },
    action: { type: String, required: true },
    summary: { type: String, required: true },
    target: {
      type: { type: String, default: null },
      id: { type: String, default: null },
      label: { type: String, default: null },
    },
    source: { ip: { type: String, default: null }, userAgent: { type: String, default: null } },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { versionKey: false },
);
auditSchema.index({ at: -1 });
auditSchema.index({ "actor.id": 1, at: -1 });
auditSchema.index({ "target.type": 1, "target.id": 1, at: -1 });

export const AuditEntry = mongoose.model("AuditEntry", auditSchema, "audit_log");

const GENESIS = "0".repeat(64);

/**
 * @typedef {object} AuditActor
 * @property {"staff" | "anonymous" | "system"} kind
 * @property {import("mongoose").Types.ObjectId | null} [id]
 * @property {string} name
 * @property {string | null} [role]
 */

/**
 * @typedef {object} AuditInput
 * @property {AuditActor} actor
 * @property {string} action   e.g. "auth.signed_in"
 * @property {string} summary  one plain sentence
 * @property {{ type: string, id: string, label?: string } | null} [target]
 * @property {{ ip?: string | null, userAgent?: string | null }} [source]
 */

/** @param {object} entry */
function hashOf(entry) {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

/**
 * Appends one entry. Pass the caller's transaction session so the entry
 * commits (or rolls back) with the change; without one, the entry gets its
 * own transaction. Always inside a transaction: the counter document is then
 * locked until commit, so two writers can't both chain onto the same entry.
 * @param {AuditInput} input
 * @param {import("mongoose").ClientSession} [session]
 */
export async function recordAudit(input, session) {
  if (!session) return inTransaction((own) => append(input, own));
  return append(input, session);
}

/** @param {AuditInput} input @param {import("mongoose").ClientSession} session */
async function append(input, session) {
  const seq = await nextNumber("audit_log", session);
  const previous =
    seq > 1 ? await AuditEntry.findOne({ seq: seq - 1 }, { hash: 1 }, { session }).lean() : null;
  const body = {
    seq,
    at: new Date(),
    actor: {
      kind: input.actor.kind,
      id: input.actor.id ?? null,
      name: input.actor.name,
      role: input.actor.role ?? null,
    },
    action: input.action,
    summary: input.summary,
    target: {
      type: input.target?.type ?? null,
      id: input.target?.id ?? null,
      label: input.target?.label ?? null,
    },
    source: { ip: input.source?.ip ?? null, userAgent: input.source?.userAgent ?? null },
    prevHash: previous?.hash ?? GENESIS,
  };
  const hash = hashOf({ ...body, actor: { ...body.actor, id: body.actor.id?.toString() ?? null } });
  await AuditEntry.create([{ ...body, hash }], { session });
}

/**
 * Checks the whole chain; returns the first broken sequence number, or null.
 * @returns {Promise<number | null>}
 */
export async function verifyAuditChain() {
  let prevHash = GENESIS;
  let expectedSeq = 1;
  for await (const e of AuditEntry.find().sort({ seq: 1 }).lean().cursor()) {
    const { hash, _id, ...body } = e;
    const recomputed = hashOf({
      ...body,
      actor: { ...body.actor, id: body.actor?.id?.toString() ?? null },
    });
    if (e.seq !== expectedSeq || e.prevHash !== prevHash || recomputed !== hash) return e.seq;
    prevHash = hash;
    expectedSeq += 1;
  }
  return null;
}

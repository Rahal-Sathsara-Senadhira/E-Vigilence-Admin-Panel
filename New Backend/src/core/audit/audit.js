// The audit log — docs/10, docs/19 §6. Append-only, in a hash chain: each
// entry's hash covers the previous entry's hash, so editing or deleting an
// entry breaks every hash after it. Written in the same transaction as the
// change it records.
//
// `places` records which stations and divisions an entry concerns (the
// actor's and the target's), so an OIC or division supervisor sees only
// entries about their own area (docs/20 §5.4, audit.view S/D). It is part
// of the hash, like everything else.

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
    places: {
      type: new mongoose.Schema(
        {
          stationIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
          divisionIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
        },
        { _id: false },
      ),
      default: undefined,
    },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { versionKey: false },
);
auditSchema.index({ at: -1 });
auditSchema.index({ "actor.id": 1, at: -1 });
auditSchema.index({ "target.type": 1, "target.id": 1, at: -1 });
auditSchema.index({ "places.stationIds": 1, at: -1 });
auditSchema.index({ "places.divisionIds": 1, at: -1 });
auditSchema.index({ action: 1, at: -1 });

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
 * @property {{ stationId?: any, divisionId?: any }[]} [places]  stations and divisions concerned
 */

const str = (/** @type {any} */ v) => (v === null || v === undefined ? null : String(v));

/**
 * The exact form that is hashed — the same when writing and when checking.
 * `places` is included only when present, so entries written before it
 * existed keep their hashes.
 * @param {any} e
 */
function canonical(e) {
  /** @type {any} */
  const out = {
    seq: e.seq,
    at: new Date(e.at).toISOString(),
    actor: {
      kind: e.actor.kind,
      id: str(e.actor.id),
      name: e.actor.name,
      role: e.actor.role ?? null,
    },
    action: e.action,
    summary: e.summary,
    target: {
      type: e.target?.type ?? null,
      id: e.target?.id ?? null,
      label: e.target?.label ?? null,
    },
    source: { ip: e.source?.ip ?? null, userAgent: e.source?.userAgent ?? null },
    prevHash: e.prevHash,
  };
  if (e.places) {
    out.places = {
      stationIds: (e.places.stationIds ?? []).map(String),
      divisionIds: (e.places.divisionIds ?? []).map(String),
    };
  }
  return out;
}

/** @param {any} entry */
const hashOf = (entry) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(entry)))
    .digest("hex");

/** Unique, non-empty ids. @param {any[]} ids */
const uniqueIds = (ids) =>
  [...new Set(ids.filter(Boolean).map(String))].map((id) => new mongoose.Types.ObjectId(id));

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
  const stationIds = uniqueIds((input.places ?? []).map((p) => p.stationId));
  const divisionIds = uniqueIds((input.places ?? []).map((p) => p.divisionId));
  /** @type {any} */
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
  if (stationIds.length || divisionIds.length) body.places = { stationIds, divisionIds };
  await AuditEntry.create([{ ...body, hash: hashOf(body) }], { session });
}

/**
 * Checks the whole chain; returns the first broken sequence number, or null.
 * @returns {Promise<number | null>}
 */
export async function verifyAuditChain() {
  let prevHash = GENESIS;
  let expectedSeq = 1;
  for await (const e of AuditEntry.find().sort({ seq: 1 }).lean().cursor()) {
    if (e.seq !== expectedSeq || e.prevHash !== prevHash || hashOf(e) !== e.hash) return e.seq;
    prevHash = e.hash;
    expectedSeq += 1;
  }
  return null;
}

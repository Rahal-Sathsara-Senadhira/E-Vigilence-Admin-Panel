// Reading the audit log — docs/10, docs/20 §5.4 (audit.view).
//   N / R   every entry (HQ administrator, HQ supervisor, auditor)
//   D       entries about the division or any of its stations
//   S       entries about the station
// The chain check is for national roles only: it reads the whole log.

import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { isRole, roleInfo } from "#src/core/access/roles.js";
import { AuditEntry, verifyAuditChain } from "#src/core/audit/audit.js";
import { forbidden } from "#src/core/errors.js";
import { Station } from "../organisation/organisation.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */

/** The kinds of entry, by action prefix, for filtering and labels. */
export const CATEGORIES = {
  auth: "Sign-in",
  users: "Accounts",
  stations: "Stations",
  divisions: "Divisions",
  organisation: "Reference data",
  offences: "Offence schedule",
  settings: "Settings",
};

const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Filter for the entries the user may see. @param {Actor} actor */
async function scopeFilter(actor) {
  const scope = scopeOf(actor.role, "audit.view");
  if (scope === "N" || scope === "R") return {};
  if (scope === "S") return { "places.stationIds": actor.stationId };
  if (scope === "D") {
    const stationIds = await Station.find({ divisionId: actor.divisionId }).distinct("_id");
    return {
      $or: [
        { "places.divisionIds": actor.divisionId },
        { "places.stationIds": { $in: stationIds } },
      ],
    };
  }
  throw forbidden();
}

/**
 * @param {Actor} actor
 * @param {{ q?: string, category?: string, actorId?: string, targetType?: string, targetId?: string, from?: Date, to?: Date, page: number, pageSize: number }} query
 */
export async function listAudit(actor, query) {
  /** @type {any[]} */
  const and = [await scopeFilter(actor)];
  if (query.category) and.push({ action: new RegExp(`^${escapeRegex(query.category)}\\.`) });
  if (query.actorId) and.push({ "actor.id": new mongoose.Types.ObjectId(query.actorId) });
  if (query.targetType) and.push({ "target.type": query.targetType });
  if (query.targetId) and.push({ "target.id": query.targetId });
  if (query.from) and.push({ at: { $gte: query.from } });
  if (query.to) and.push({ at: { $lte: query.to } });
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    and.push({ $or: [{ summary: rx }, { "actor.name": rx }, { "target.label": rx }] });
  }
  const filter = { $and: and };
  const [rows, total] = await Promise.all([
    AuditEntry.find(filter, { hash: 0, prevHash: 0 })
      .sort({ seq: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    AuditEntry.countDocuments(filter),
  ]);
  return {
    items: rows.map((e) => {
      const prefix = e.action.split(".")[0] ?? "";
      return {
        id: String(e._id),
        seq: e.seq,
        at: e.at.toISOString(),
        action: e.action,
        category: CATEGORIES[/** @type {keyof typeof CATEGORIES} */ (prefix)] ?? prefix,
        summary: e.summary,
        actor: {
          kind: e.actor?.kind ?? "system",
          id: e.actor?.id ? String(e.actor.id) : null,
          name: e.actor?.name ?? "Unknown",
          roleLabel: e.actor?.role && isRole(e.actor.role) ? roleInfo(e.actor.role).label : null,
        },
        target: e.target?.type
          ? { type: e.target.type, id: e.target.id ?? null, label: e.target.label ?? null }
          : null,
        ip: e.source?.ip ?? null,
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Checks the hash chain — national roles only. @param {Actor} actor */
export async function auditIntegrity(actor) {
  const scope = scopeOf(actor.role, "audit.view");
  if (scope !== "N" && scope !== "R")
    throw forbidden("Only national roles can check the whole log.");
  const [brokenAt, entries] = await Promise.all([
    verifyAuditChain(),
    AuditEntry.estimatedDocumentCount(),
  ]);
  return { ok: brokenAt === null, brokenAt, entries, checkedAt: new Date().toISOString() };
}

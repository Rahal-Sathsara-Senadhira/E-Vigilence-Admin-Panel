// The offence schedule — read by everyone who handles reports and cases;
// changed only by the HQ administrator (docs/20 §5.4, offences.manage).

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict, notFound, validationError } from "#src/core/errors.js";
import { OffenceVersion, PublicOffence } from "./offences.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip: string | null, userAgent: string | null }} RequestContext */

const escapeRegex = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SEVERITY_ORDER = { severe: 0, moderate: 1, minor: 2 };

/** @param {any} v */
const offenceView = (v) => ({
  code: v.code,
  version: v.version,
  name: v.name,
  legalReference: v.legalReference,
  outcome: v.outcome,
  spotFine: v.spotFine ?? null,
  severity: v.severity,
  demeritPoints: v.demeritPoints ?? null,
  vehicleTypes: v.vehicleTypes ?? [],
  citizenReportable: v.citizenReportable,
  publicName: v.publicName,
  publicDescription: v.publicDescription,
  active: v.active,
  effectiveFrom: new Date(v.effectiveFrom).toISOString(),
  effectiveTo: v.effectiveTo ? new Date(v.effectiveTo).toISOString() : null,
  changedBy: v.changedBy,
  reason: v.reason,
  source: v.source,
});

/** @param {{ q?: string, outcome?: string, severity?: string, status?: string }} query */
export async function listOffences(query) {
  /** @type {any} */
  const filter = { current: true };
  if (query.outcome) filter.outcome = query.outcome;
  if (query.severity) filter.severity = query.severity;
  if (query.status) filter.active = query.status === "active";
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ code: rx }, { name: rx }, { publicName: rx }, { legalReference: rx }];
  }
  const rows = await OffenceVersion.find(filter).lean();
  rows.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.name.localeCompare(b.name),
  );
  return rows.map(offenceView);
}

/** The current version and the full history, newest first. @param {string} code */
export async function getOffence(code) {
  const versions = await OffenceVersion.find({ code: code.toUpperCase() })
    .sort({ version: -1 })
    .lean();
  if (versions.length === 0) throw notFound("Offence not found.");
  return { ...offenceView(versions[0]), history: versions.map(offenceView) };
}

/**
 * Rewrites the mobile app's copy from the current schedule: active,
 * citizen-reportable offences only, names and descriptions only.
 * @param {import("mongoose").ClientSession} [session]
 */
export async function publishPublicSchedule(session) {
  const current = await OffenceVersion.find(
    { current: true, active: true, citizenReportable: true },
    null,
    { session },
  ).lean();
  current.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.publicName.localeCompare(b.publicName),
  );
  const now = new Date();
  await PublicOffence.deleteMany({ code: { $nin: current.map((o) => o.code) } }, { session });
  if (current.length) {
    await PublicOffence.bulkWrite(
      current.map((o, i) => ({
        updateOne: {
          filter: { code: o.code },
          update: {
            $set: {
              name: o.publicName,
              description: o.publicDescription,
              vehicleTypes: o.vehicleTypes ?? [],
              sortOrder: i + 1,
              publishedAt: now,
            },
          },
          upsert: true,
        },
      })),
      { session },
    );
  }
  return current.length;
}

/**
 * Staff from a request; a maintenance script passes `kind: "system"` so the
 * audit doesn't name a person who didn't make the change.
 * @param {Actor & { kind?: "system" }} actor
 */
const auditActor = (actor) =>
  actor.kind === "system"
    ? { kind: /** @type {const} */ ("system"), id: null, name: actor.name }
    : {
        kind: /** @type {const} */ ("staff"),
        id: actor.userId,
        name: actor.name,
        role: actor.role,
      };

/**
 * A new offence (version 1).
 * @param {Actor} actor @param {any} input @param {RequestContext} ctx
 */
export async function createOffence(actor, input, ctx) {
  if (await OffenceVersion.exists({ code: input.code })) {
    throw validationError({ code: "An offence with this code already exists." });
  }
  await inTransaction(async (session) => {
    await OffenceVersion.create(
      [
        {
          ...input,
          version: 1,
          active: true,
          effectiveFrom: new Date(),
          current: true,
          source: "Added by HQ",
          changedBy: actor.name,
          changedById: actor.userId,
          reason: "New offence",
        },
      ],
      { session },
    );
    await publishPublicSchedule(session);
    await recordAudit(
      {
        actor: auditActor(actor),
        action: "offences.created",
        summary: `Added ${input.code} — ${input.name}`,
        target: { type: "offence", id: input.code, label: input.code },
        source: ctx,
      },
      session,
    );
  });
  return getOffence(input.code);
}

/**
 * A change: closes the current version and starts the next one. The reason
 * (usually the gazette that made the change) is required.
 * @param {Actor & { kind?: "system" }} actor @param {string} code @param {any} input @param {RequestContext} ctx
 */
export async function changeOffence(actor, code, input, ctx) {
  const upper = code.toUpperCase();
  await inTransaction(async (session) => {
    const current = await OffenceVersion.findOne({ code: upper, current: true }, null, { session });
    if (!current) throw notFound("Offence not found.");
    const { reason, ...fields } = input;
    const same = Object.entries(fields).every(
      ([k, v]) =>
        JSON.stringify(/** @type {any} */ (current)[k] ?? null) === JSON.stringify(v ?? null),
    );
    if (same) throw conflict("no_change", "Nothing has changed.");
    const now = new Date();
    current.current = false;
    current.effectiveTo = now;
    await current.save({ session });
    await OffenceVersion.create(
      [
        {
          ...fields,
          code: upper,
          version: current.version + 1,
          effectiveFrom: now,
          current: true,
          source: current.source,
          changedBy: actor.name,
          changedById: actor.userId,
          reason,
        },
      ],
      { session },
    );
    await publishPublicSchedule(session);
    await recordAudit(
      {
        actor: auditActor(actor),
        action:
          fields.active === current.active
            ? "offences.changed"
            : fields.active
              ? "offences.reactivated"
              : "offences.deactivated",
        summary: `${upper} version ${current.version + 1}: ${reason}`,
        target: { type: "offence", id: upper, label: upper },
        source: ctx,
      },
      session,
    );
  });
  return getOffence(upper);
}

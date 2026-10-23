// Versioned settings — docs/09 T2. A change applies to items that start
// AFTER it: each item asks for the value in force when it started
// (`limitAt`), so changing a limit never moves existing deadlines.

import mongoose from "mongoose";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict, notFound, validationError } from "#src/core/errors.js";
import { LIMITS_BY_KEY, MAX_BY_UNIT, TIME_LIMITS, addLimit } from "./time-limits.catalogue.js";

const versionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    changedBy: { type: String, required: true },
    changedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, required: true },
  },
  { versionKey: false },
);
versionSchema.index({ key: 1, effectiveFrom: -1 });

export const SettingVersion = mongoose.model("SettingVersion", versionSchema, "setting_versions");

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */

/**
 * The value of a limit in force at a moment (default: now).
 * @param {string} key @param {Date} [at]
 */
export async function limitValue(key, at = new Date()) {
  const def = LIMITS_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown time limit "${key}".`);
  const v = await SettingVersion.findOne({ key, effectiveFrom: { $lte: at } })
    .sort({ effectiveFrom: -1 })
    .lean();
  return v?.value ?? def.defaultValue;
}

/**
 * When an item that started at `start` runs out of time, using the limit in
 * force at its start (T2). For other modules: cases, notices, court…
 * @param {string} key @param {Date} start
 */
export async function limitAt(key, start) {
  const def = /** @type {import("./time-limits.catalogue.js").LimitDefinition} */ (
    LIMITS_BY_KEY.get(key)
  );
  return addLimit(start, await limitValue(key, start), def.unit);
}

/** Every limit with its current value and its history. */
export async function listTimeLimits() {
  const versions = await SettingVersion.find({ key: { $in: TIME_LIMITS.map((l) => l.key) } })
    .sort({ effectiveFrom: -1 })
    .lean();
  const now = new Date();
  return TIME_LIMITS.map((def) => {
    const history = versions.filter((v) => v.key === def.key);
    const current = history.find((v) => v.effectiveFrom <= now);
    return {
      key: def.key,
      group: def.group,
      label: def.label,
      unit: def.unit,
      responsible: def.responsible,
      onBreach: def.onBreach,
      defaultValue: def.defaultValue,
      max: MAX_BY_UNIT[def.unit],
      value: current?.value ?? def.defaultValue,
      changedAt: current ? current.effectiveFrom.toISOString() : null,
      history: history.map((v) => ({
        value: v.value,
        effectiveFrom: v.effectiveFrom.toISOString(),
        changedBy: v.changedBy,
        reason: v.reason,
      })),
    };
  });
}

/**
 * Sets a new value from now on.
 * @param {Actor} actor @param {string} key @param {{ value: number, reason: string }} input
 * @param {{ ip: string | null, userAgent: string | null }} ctx
 */
export async function setTimeLimit(actor, key, { value, reason }, ctx) {
  const def = LIMITS_BY_KEY.get(key);
  if (!def) throw notFound("Time limit not found.");
  const max = MAX_BY_UNIT[def.unit];
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw validationError({ value: `Enter a whole number from 1 to ${max} ${def.unit}.` });
  }
  if ((await limitValue(key)) === value)
    throw conflict("no_change", "That is already the value in force.");
  await inTransaction(async (session) => {
    await SettingVersion.create(
      [
        {
          key,
          value,
          effectiveFrom: new Date(),
          changedBy: actor.name,
          changedById: actor.userId,
          reason,
        },
      ],
      { session },
    );
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "settings.time_limit_changed",
        summary: `${def.label}: now ${value} ${def.unit} — ${reason}`,
        target: { type: "setting", id: key, label: def.label },
        source: ctx,
      },
      session,
    );
  });
  return (await listTimeLimits()).find((l) => l.key === key);
}

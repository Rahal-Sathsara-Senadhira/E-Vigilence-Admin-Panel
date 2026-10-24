// Reward rules — docs/16 §5, §6. Versioned: a change applies to cases
// decided after it, never to points already earned. HQ administrators change
// them with a reason; every change is audited.

import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict } from "#src/core/errors.js";
import { RewardRules } from "./reward.model.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */

/**
 * @typedef {object} Rules
 * @property {{ minor: number, moderate: number, severe: number }} severityPoints
 * @property {{ code: string, points: number }[]} offencePoints
 * @property {number} warningPoints
 * @property {number} rupeesPer100Points
 * @property {number} minPayoutPoints
 * @property {number} monthlyCapRupees
 * @property {number} dailyEarningReports
 */

/** D16-3, D16-4, D16-5. @type {Readonly<Rules>} */
export const DEFAULT_RULES = Object.freeze({
  severityPoints: { minor: 10, moderate: 20, severe: 50 },
  offencePoints: [],
  warningPoints: 5,
  rupeesPer100Points: 1000,
  minPayoutPoints: 100,
  monthlyCapRupees: 10_000,
  dailyEarningReports: 10,
});

/** D16-6. */
export const LEAD_SHARE = 100;
export const EVIDENCE_SHARE = 25;

/** The rules in force at a moment (default: now). @param {Date} [at] @returns {Promise<Rules>} */
export async function rulesAt(at = new Date()) {
  const v = await RewardRules.findOne({ effectiveFrom: { $lte: at } })
    .sort({ effectiveFrom: -1 })
    .lean();
  if (!v) return DEFAULT_RULES;
  return {
    severityPoints: {
      minor: v.severityPoints?.minor ?? DEFAULT_RULES.severityPoints.minor,
      moderate: v.severityPoints?.moderate ?? DEFAULT_RULES.severityPoints.moderate,
      severe: v.severityPoints?.severe ?? DEFAULT_RULES.severityPoints.severe,
    },
    offencePoints: v.offencePoints.map((o) => ({ code: String(o.code), points: Number(o.points) })),
    warningPoints: v.warningPoints,
    rupeesPer100Points: v.rupeesPer100Points,
    minPayoutPoints: v.minPayoutPoints,
    monthlyCapRupees: v.monthlyCapRupees,
    dailyEarningReports: v.dailyEarningReports,
  };
}

/** The current rules and every earlier version, newest first. */
export async function listRules() {
  const versions = await RewardRules.find().sort({ effectiveFrom: -1 }).limit(50).lean();
  return {
    current: await rulesAt(),
    history: versions.map((v) => ({
      effectiveFrom: v.effectiveFrom.toISOString(),
      changedBy: v.changedBy,
      reason: v.reason,
    })),
  };
}

/**
 * A new version of the rules, in force from now.
 * @param {Actor} actor @param {Rules & { reason: string }} input
 * @param {{ ip?: string | null, userAgent?: string | null }} ctx
 */
export async function setRules(actor, input, ctx) {
  const { reason, ...rules } = input;
  const current = await rulesAt();
  if (JSON.stringify(normalise(current)) === JSON.stringify(normalise(rules)))
    throw conflict("unchanged", "These are the rules in force already.");
  await inTransaction(async (session) => {
    await RewardRules.create(
      [
        {
          ...rules,
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
        action: "rewards.rules_changed",
        summary: `Reward rules changed: ${reason}`,
        target: { type: "reward_rules", id: "current", label: "Reward rules" },
        source: ctx,
      },
      session,
    );
  });
  return listRules();
}

/** Same rules compare equal whatever the order of offences. @param {Rules} r */
const normalise = (r) => ({
  ...r,
  offencePoints: [...r.offencePoints].sort((a, b) => a.code.localeCompare(b.code)),
});

/**
 * A case's points before the share (§5): the highest offence's, so listing
 * extra offences earns nothing more.
 * @param {Rules} rules @param {{ code: string, severity: string }[]} offences
 */
export function casePoints(rules, offences) {
  const set = new Map(rules.offencePoints.map((o) => [o.code, o.points]));
  let best = 0;
  for (const o of offences) {
    const points =
      set.get(o.code) ??
      rules.severityPoints[/** @type {keyof Rules["severityPoints"]} */ (o.severity)] ??
      0;
    best = Math.max(best, points);
  }
  return best;
}

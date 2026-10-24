// Citizen rewards — docs/16. Two records:
//
//  - Rule versions: points per offence and the money rules, changed by HQ
//    with a reason. Each award uses the rules in force when the case was
//    decided, like the time limits (docs/09 T2).
//  - Reward entries: one per citizen report on a decided case (an award),
//    plus a recovery when points already paid out are reversed (§10).
//    Points move pending → confirmed → paid, or to reversed; a hold (fraud
//    checks, §7) stops an entry from being paid until HQ releases it.

import mongoose from "mongoose";

export const ENTRY_STATUSES = /** @type {const} */ ([
  "pending", // earned: the case was decided with enforcement
  "confirmed", // the notice was paid, the court convicted, or a warning issued
  "paid", // paid out (N8 slice 2)
  "reversed", // the outcome changed, or HQ reversed it
  "expired", // confirmed but not paid out within the expiry period
  "not_eligible", // never earned: see `reason`
]);

const ruleSchema = new mongoose.Schema(
  {
    effectiveFrom: { type: Date, required: true },
    /** D16-3: suggested points by the offence's severity. */
    severityPoints: {
      minor: { type: Number, required: true },
      moderate: { type: Number, required: true },
      severe: { type: Number, required: true },
    },
    /** Points set for particular offences, over the severity default. */
    offencePoints: {
      type: [new mongoose.Schema({ code: String, points: Number }, { _id: false })],
      default: [],
    },
    /** D16-4. */
    warningPoints: { type: Number, required: true },
    /** D16-5: 100 points = this many rupees. */
    rupeesPer100Points: { type: Number, required: true },
    minPayoutPoints: { type: Number, required: true },
    monthlyCapRupees: { type: Number, required: true },
    /** Only the first so many reports a citizen sends in a day can earn. */
    dailyEarningReports: { type: Number, required: true },
    changedBy: { type: String, required: true },
    changedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, required: true },
  },
  { versionKey: false },
);
ruleSchema.index({ effectiveFrom: -1 });

export const RewardRules = mongoose.model("RewardRules", ruleSchema, "reward_rule_versions");

const entrySchema = new mongoose.Schema(
  {
    /** The citizen's account id in the app. */
    userId: { type: String, required: true },
    /** award · recovery (negative points: paid out, then reversed) */
    kind: { type: String, enum: ["award", "recovery"], required: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reportNumber: { type: String, required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    caseNumber: { type: String, required: true },
    plate: { type: String, default: null },
    /** The case's points before the share: highest offence, or the warning points. */
    basePoints: { type: Number, required: true },
    /** D16-6: lead report 100, report adding evidence 25, duplicate 0. */
    share: { type: Number, required: true },
    points: { type: Number, required: true },
    status: { type: String, enum: ENTRY_STATUSES, required: true },
    /** What the citizen is told (plain words, never detection details — §7). */
    reason: { type: String, default: null },
    /** Held for HQ review (§7): no payout until released. Staff-only detail. */
    hold: {
      type: new mongoose.Schema(
        {
          reason: { type: String, required: true },
          by: { type: String, required: true },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    confirmedAt: { type: Date, default: null },
    /** Confirmed points lapse if not paid out by then (D16-5). */
    expiresAt: { type: Date, default: null },
    expiryWarnedAt: { type: Date, default: null },
    /** A paid-out award later reversed: the recovery entry made for it. */
    recoveredBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    payoutId: { type: mongoose.Schema.Types.ObjectId, default: null },
    history: {
      type: [
        new mongoose.Schema(
          { at: Date, event: String, by: String, note: { type: String, default: null } },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);
// One award per report; recoveries are separate entries.
entrySchema.index({ reportId: 1 }, { unique: true, partialFilterExpression: { kind: "award" } });
entrySchema.index({ userId: 1, createdAt: -1 });
entrySchema.index({ caseId: 1 });
entrySchema.index({ status: 1, expiresAt: 1 });
entrySchema.index({ "hold.at": 1 });

export const RewardEntry = mongoose.model("RewardEntry", entrySchema, "reward_entries");

/** @typedef {ReturnType<typeof RewardEntry.hydrate>} RewardEntryDocument */

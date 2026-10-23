// The offence schedule — docs/14 §4.5, D14-8; docs/08 (demerit points).
//
// Versioned: a change never edits a version, it starts a new one and closes
// the previous one (effectiveTo). Notices copy the fine at issue time, so
// old notices keep the fine that applied then.
//
// `offence_schedule_public` is the copy the citizen mobile app reads
// (docs/11 §3): reportable offences' public names and descriptions only —
// no fines or legal detail. Written only by this system.

import mongoose from "mongoose";

export const SEVERITIES = /** @type {const} */ (["minor", "moderate", "severe"]);
export const OUTCOMES = /** @type {const} */ (["spot_fine", "court"]);
export const VEHICLE_TYPES = /** @type {const} */ ([
  "motorcycle",
  "three_wheeler",
  "car",
  "van",
  "bus",
  "lorry",
  "tractor",
  "other",
]);

const versionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    version: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    legalReference: { type: String, required: true, trim: true },
    outcome: { type: String, enum: OUTCOMES, required: true },
    /** Whole rupees; null for court-only offences. */
    spotFine: { type: Number, default: null },
    severity: { type: String, enum: SEVERITIES, required: true },
    /** Set when the national demerit scheme applies (docs/08); null until then. */
    demeritPoints: { type: Number, default: null },
    /** Empty = any vehicle. */
    vehicleTypes: { type: [String], enum: VEHICLE_TYPES, default: [] },
    citizenReportable: { type: Boolean, required: true },
    publicName: { type: String, required: true, trim: true },
    publicDescription: { type: String, required: true, trim: true },
    active: { type: Boolean, required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    /** The version in force now. */
    current: { type: Boolean, required: true },
    source: { type: String, required: true },
    changedBy: { type: String, required: true },
    changedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, required: true },
  },
  { versionKey: false },
);
versionSchema.index({ code: 1, version: 1 }, { unique: true });
// At most one current version per offence.
versionSchema.index(
  { code: 1 },
  { unique: true, name: "one_current_version", partialFilterExpression: { current: true } },
);

export const OffenceVersion = mongoose.model("OffenceVersion", versionSchema, "offence_schedule");

const publicSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    vehicleTypes: { type: [String], default: [] },
    sortOrder: { type: Number, required: true },
    publishedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

export const PublicOffence = mongoose.model(
  "PublicOffence",
  publicSchema,
  "offence_schedule_public",
);

// Cases — docs/03. A case holds what police concluded; reports keep what
// people said. This file holds the record; the moves between states are in
// case-states.js, dispatch in dispatch.js.

import mongoose from "mongoose";

/** docs/03 §4. */
export const CASE_STATUSES = /** @type {const} */ ([
  "open", // accepted at HQ, not yet with a station
  "dispatched", // sent to a station, not yet accepted
  "accepted", // the station has taken it
  "investigating", // work recorded (automatic on the first work, C2)
  "recommended", // waiting for the decision (N3 outcomes)
  "decided", // outcome approved
  "closed",
  "returned", // the station sent it back as not their area
]);

/** Cases still being worked somewhere — a station can't be closed while it holds any. */
export const ACTIVE_STATUSES = /** @type {const} */ ([
  "dispatched",
  "accepted",
  "investigating",
  "recommended",
]);

export const DISPATCH_METHODS = /** @type {const} */ ([
  "jurisdiction", // the station's drawn area contains the place
  "nearest", // no area contains it: the nearest station
  "manual", // chosen by HQ, with a reason
  "station_recorded", // recorded at the station itself (docs/02 §7)
]);

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const personRef = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
  },
  { _id: false },
);

/** docs/05 §3. */
export const OUTCOME_TYPES = /** @type {const} */ ([
  "penalty_notice",
  "court",
  "warning",
  "no_further_action",
]);
/** docs/05 §8. */
export const NFA_REASONS = /** @type {const} */ ([
  "owner_not_traced",
  "insufficient_evidence",
  "false_plate",
  "not_an_offence",
  "offender_unavailable",
  "other",
]);

/** An outcome as recommended (or as changed by the decider). */
function outcomeSchema() {
  return new mongoose.Schema(
    {
      outcome: { type: String, enum: OUTCOME_TYPES, required: true },
      offenceCodes: { type: [String], default: [] },
      /** owner · driver — who the notice, warning or summons is addressed to. */
      addressee: { type: String, default: null },
      addresseePerson: { type: personRef, default: null },
      /** Court referral with the driver unknown. */
      driverUnknownReason: { type: String, default: null },
      prosecutionSummary: { type: String, default: null },
      nfaReason: { type: String, default: null },
      justification: { type: String, required: true },
      by: {
        type: new mongoose.Schema(
          {
            id: { type: mongoose.Schema.Types.ObjectId, required: true },
            name: { type: String, required: true },
            role: { type: String, required: true },
          },
          { _id: false },
        ),
        required: true,
      },
      at: { type: Date, required: true },
      /** Sent back by the decider, with the reason. */
      sentBackAt: { type: Date, default: null },
      sentBackBy: { type: String, default: null },
      sentBackReason: { type: String, default: null },
    },
    { _id: false },
  );
}

const decisionSchema = new mongoose.Schema(
  {
    outcome: { type: outcomeSchema(), required: true },
    /** approved as recommended · changed by the decider */
    kind: { type: String, enum: ["approved", "changed"], required: true },
    reason: { type: String, default: null },
    /** oic · division · hq (S2) */
    level: { type: String, required: true },
    by: { type: personRef, required: true },
    at: { type: Date, required: true },
    /** Set when HQ overrides it (docs/05 §4). */
    overriddenAt: { type: Date, default: null },
    overriddenBy: { type: String, default: null },
    overrideReason: { type: String, default: null },
  },
  { _id: false },
);

/** One time the case was sent to a station. */
const dispatchSchema = new mongoose.Schema(
  {
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", required: true },
    stationName: { type: String, required: true },
    method: { type: String, enum: DISPATCH_METHODS, required: true },
    at: { type: Date, required: true },
    by: { type: String, required: true },
    /** From the case's place to the station, when known. */
    distanceKm: { type: Number, default: null },
    /** overlapping_areas · unverified_station · no_active_officers · disputed_jurisdiction */
    warnings: { type: [String], default: [] },
    reason: { type: String, default: null },
    /** Time limits fixed when dispatched (docs/09 T2). */
    acceptBy: { type: Date, default: null },
    workBy: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: String, default: null },
    /** returned · redispatched · closed */
    endedAt: { type: Date, default: null },
    endReason: { type: String, default: null },
    endNote: { type: String, default: null },
  },
  { _id: false },
);

const caseSchema = new mongoose.Schema(
  {
    caseNumber: { type: String, required: true, unique: true },
    status: { type: String, enum: CASE_STATUSES, required: true },
    priority: { type: String, enum: ["P1", "P2", "P3"], required: true },
    /** The station holding the case now; null while open or returned. */
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", default: null, index: true },
    /** What police concluded — may differ from what reporters said. */
    facts: {
      type: new mongoose.Schema(
        {
          offenceCodes: { type: [String], default: [] },
          vehicleNumber: { type: String, default: null },
          plateUnknown: { type: Boolean, default: false },
          vehicleType: { type: String, default: null },
          location: { type: pointSchema, default: null },
          address: { type: String, default: null },
          occurredAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    reportIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Report", default: [] },
    /** Why a citizen report was accepted without evidence (docs/02 §6.1). */
    noEvidenceReason: { type: String, default: null },
    openedBy: { type: personRef, required: true },

    /** Every dispatch, newest last; the last one is current while the case is at a station. */
    dispatches: { type: [dispatchSchema], default: [] },
    /** Times a station sent it back; two make it "disputed" (docs/03 §5.3). */
    returnCount: { type: Number, default: 0 },
    disputed: { type: Boolean, default: false },

    /** The one officer responsible (docs/03 §6). */
    investigatingOfficer: { type: personRef, default: null },
    /** When the officer must be assigned by, after acceptance without one. */
    assignOfficerBy: { type: Date, default: null },
    /** When a recommendation is due, fixed at acceptance (docs/09 T2). */
    recommendBy: { type: Date, default: null },
    /** First recorded work (C2). */
    workStartedAt: { type: Date, default: null },
    notes: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, required: true },
            by: { type: String, required: true },
            byId: { type: mongoose.Schema.Types.ObjectId, default: null },
            /** station · hq */
            side: { type: String, required: true },
            text: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // ── Investigation (docs/04 §6) ──
    /** The traced vehicle (registers). */
    vehicle: {
      type: new mongoose.Schema(
        {
          id: { type: mongoose.Schema.Types.ObjectId, required: true },
          plate: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    /** The registered owner on the offence date (V4); null when not known. */
    owner: { type: personRef, default: null },
    /** The driver, when identified, and how (docs/04 §5). */
    driver: {
      type: new mongoose.Schema(
        {
          id: { type: mongoose.Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          /** stopped · evidence · statement · named_by_owner */
          basis: { type: String, required: true },
          note: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    /** Evidence review checklist: each answered yes (true) or no (false). */
    review: {
      type: new mongoose.Schema(
        {
          plateReadable: { type: Boolean, default: null },
          vehicleMatches: { type: Boolean, default: null },
          timePlaceConsistent: { type: Boolean, default: null },
          noEditing: { type: Boolean, default: null },
          offenceVisible: { type: Boolean, default: null },
          note: { type: String, default: null },
          by: { type: String, default: null },
          at: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    statements: {
      type: [
        new mongoose.Schema(
          {
            /** owner · driver · witness */
            role: { type: String, required: true },
            personId: { type: mongoose.Schema.Types.ObjectId, default: null },
            name: { type: String, required: true },
            takenAt: { type: Date, required: true },
            summary: { type: String, required: true },
            evidenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
            by: { type: String, required: true },
            at: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Evidence added during investigation (reports keep their own). */
    evidenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },

    // ── Outcome (docs/05 §3, §4) ──
    /** Every recommendation, newest last; the last is current while "recommended". */
    recommendations: { type: [outcomeSchema()], default: [] },
    /** The decision in force; replaced on override (kept in `decisions`). */
    decision: { type: decisionSchema, default: null },
    decisions: { type: [decisionSchema], default: [] },
    decideBy: { type: Date, default: null },
    /** Who decides the current recommendation: oic · division · hq (S2). */
    decideLevel: { type: String, default: null },
    /** Merged into another case (docs/03 §7). */
    mergedInto: {
      type: new mongoose.Schema(
        {
          id: { type: mongoose.Schema.Types.ObjectId, required: true },
          caseNumber: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },

    closedReason: { type: String, default: null },
    timeline: {
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
caseSchema.index({ "facts.vehicleNumber": 1, createdAt: -1 });
caseSchema.index({ "facts.location": "2dsphere" });
caseSchema.index({ status: 1, priority: 1, createdAt: 1 });
caseSchema.index({ stationId: 1, status: 1 });
caseSchema.index({ "investigatingOfficer.id": 1, status: 1 });
caseSchema.index({ "vehicle.id": 1 });
caseSchema.index({ "owner.id": 1 });
caseSchema.index({ "driver.id": 1 });
caseSchema.index({ "statements.personId": 1 });

export const Case = mongoose.model("Case", caseSchema, "cases");

/** @typedef {ReturnType<typeof Case.hydrate>} CaseDocument */

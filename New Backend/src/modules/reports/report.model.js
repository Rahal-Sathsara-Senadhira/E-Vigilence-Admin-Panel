// Reports — docs/02 §4. A report is evidence of what someone said: once
// received it isn't changed, except to add what the reporter was asked for
// and to record triage. What police conclude goes on the case.
//
// Kept in `police_reports`. The citizen app owns `reports` (docs/11 §3);
// its reports are imported here.

import mongoose from "mongoose";

export const CHANNELS = /** @type {const} */ ([
  "citizen_app",
  "whatsapp",
  "phone",
  "walk_in",
  "officer",
]);
export const STATUSES = /** @type {const} */ ([
  "pending", // waiting for HQ triage
  "needs_info", // the reporter was asked a question
  "awaiting_second_officer", // officer-observed: another officer must open the case (docs/02 §7)
  "accepted",
  "merged",
  "rejected",
]);
export const PRIORITIES = /** @type {const} */ (["P1", "P2", "P3"]);

/** Things triage should check on an imported report — docs/11 §8, §9. */
export const FLAGS = /** @type {const} */ ([
  "offence_not_recognised", // the old app's free text didn't match the schedule
  "plate_unrecognised", // the plate couldn't be read as a Sri Lankan plate
  "evidence_download_failed", // a file couldn't be fetched from the app
  "not_captured_in_app", // a file was picked from the gallery (D11-4)
  "time_in_future", // the app sent a time after the report arrived
  "offence_vehicle_mismatch", // an offence that can't apply to the vehicle type given
]);

/** What the reporter sees for each rejection — docs/02 §6.4. */
export const REJECTION_REASONS = {
  not_an_offence: "What you reported isn't a traffic offence we can act on.",
  insufficient_evidence: "We couldn't act on this report because the evidence wasn't enough.",
  vehicle_unidentifiable: "We couldn't identify the vehicle from this report.",
  outside_jurisdiction: "This happened outside Sri Lanka Police's area.",
  too_old: "This happened more than 30 days ago, so we can't act on it.",
  fabricated: "We couldn't accept this report.",
  abusive: "We couldn't accept this report.",
  not_traffic: "This isn't a traffic matter. For other matters call 119.",
  no_response: "We closed this report because we didn't receive the information we asked for.",
  /** Set by the mobile-app import only (docs/11 §6). */
  account_suspended: "Your account is suspended, so we can't accept reports from it.",
};

/** Reasons staff choose from when rejecting. */
export const STAFF_REJECTION_REASONS = Object.keys(REJECTION_REASONS).filter(
  (k) => k !== "account_suspended",
);

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const reportSchema = new mongoose.Schema(
  {
    reportNumber: { type: String, required: true, unique: true },
    channel: { type: String, enum: CHANNELS, required: true },
    receivedAt: { type: Date, required: true },
    /** Staff member who recorded it; null for the citizen app (system). */
    receivedBy: {
      type: new mongoose.Schema(
        {
          id: { type: mongoose.Schema.Types.ObjectId, default: null },
          name: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    /** Station where it was recorded, or whose case it joined — for station scope. */
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", default: null, index: true },
    /** Recorded at a station; HQ reviews it after the fact (docs/02 §7). */
    stationOriginated: { type: Boolean, default: false },
    stationReviewed: { type: Boolean, default: false },

    reporter: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: ["citizen", "named", "anonymous"], required: true },
          name: { type: String, default: null },
          phone: { type: String, default: null },
          citizenId: { type: String, default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    /** Mobile-app reports: the app's own ids (docs/11 §4); null for staff-recorded reports. */
    source: {
      type: new mongoose.Schema(
        {
          /** The app's `reports` document. */
          appReportId: { type: mongoose.Schema.Types.ObjectId, required: true },
          /** Unique per device — a re-sent report is recognised. */
          clientReportId: { type: String, default: null },
          userId: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    /** What triage should look at (mobile-app import): see FLAGS. */
    flags: { type: [String], default: [] },
    occurredAt: { type: Date, required: true },
    location: { type: pointSchema, default: null },
    address: { type: String, default: null },
    vehicleNumber: { type: String, default: null },
    plateUnknown: { type: Boolean, default: false },
    vehicleType: { type: String, default: null },
    /** Make and model, or the plate as the reporter typed it when it couldn't be read. */
    vehicleDescription: { type: String, default: null },
    offenceCodes: { type: [String], default: [] },
    description: { type: String, required: true },
    /** The reporter said someone was hurt — P1 (docs/02 §8). */
    injuries: { type: Boolean, default: false },
    evidenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },

    status: { type: String, enum: STATUSES, required: true, index: true },
    priority: { type: String, enum: PRIORITIES, required: true },
    triage: {
      type: new mongoose.Schema(
        {
          /** One person triages at a time (docs/02 §5). */
          lockedBy: {
            id: { type: mongoose.Schema.Types.ObjectId, default: null },
            name: { type: String, default: null },
          },
          lockedUntil: { type: Date, default: null },
          decidedBy: { type: String, default: null },
          decidedAt: { type: Date, default: null },
          reasonCode: { type: String, default: null },
          note: { type: String, default: null },
          question: { type: String, default: null },
          askedAt: { type: Date, default: null },
          replies: {
            type: [
              new mongoose.Schema({ at: Date, text: String, recordedBy: String }, { _id: false }),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({}),
    },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null, index: true },
    history: {
      type: [
        new mongoose.Schema(
          { at: Date, event: String, by: String, note: { type: String, default: null } },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Anonymised (or its evidence deleted) at the end of retention — docs/10 §6. */
    retention: {
      type: new mongoose.Schema({ at: Date, rule: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);
reportSchema.index({ status: 1, priority: 1, receivedAt: 1 });
reportSchema.index({ vehicleNumber: 1, occurredAt: -1 });
reportSchema.index({ location: "2dsphere" });
// Each app report is imported once (docs/11 §8) — also when re-sent under a new id.
reportSchema.index(
  { "source.appReportId": 1 },
  { unique: true, partialFilterExpression: { "source.appReportId": { $exists: true } } },
);
reportSchema.index(
  { "source.userId": 1, "source.clientReportId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "source.userId": { $type: "string" },
      "source.clientReportId": { $type: "string" },
    },
  },
);

export const Report = mongoose.model("Report", reportSchema, "police_reports");

/** @typedef {ReturnType<typeof Report.hydrate>} ReportDocument */

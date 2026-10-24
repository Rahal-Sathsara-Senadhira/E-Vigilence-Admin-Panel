// Court cases — docs/06. E-Vigilance doesn't run the court: it tracks the
// police side (preparing, filing, attending hearings) and records the
// verdict, which decides points, rewards and the person's record.

import mongoose from "mongoose";

/** Magistrate's Courts (D06-1), kept by HQ. */
const courtSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    district: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);
export const Court = mongoose.model("Court", courtSchema, "courts");

/** docs/06 §5. */
export const COURT_STATUSES = /** @type {const} */ ([
  "referred", // waiting for the officer to prepare it
  "prepared", // charges, summary and accused ready — waiting for the OIC to approve filing
  "approved", // the OIC approved filing
  "filed", // the court gave its case number; first hearing set
  "hearing", // hearings under way
  "verdict", // verdict recorded by the officer — waiting for the OIC to confirm
  "closed",
  "withdrawn",
]);

/** How the matter reached court (docs/06 §3). */
export const COURT_ROUTES = /** @type {const} */ ([
  "court_offence", // decided "court referral" on the case
  "unpaid_notice", // overdue notice, OIC confirmed
  "unserved_notice", // notice that couldn't be served
]);

export const HEARING_OUTCOMES = /** @type {const} */ ([
  "postponed",
  "heard", // heard, continuing
  "warrant_issued", // accused absent — not a verdict (docs/06 §7)
  "guilty_plea", // recorded with the conviction in one step
]);

export const VERDICTS = /** @type {const} */ ([
  "convicted",
  "acquitted",
  "withdrawn",
  "discharged",
]);

const personRef = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
  },
  { _id: false },
);

const courtCaseSchema = new mongoose.Schema(
  {
    courtRef: { type: String, required: true, unique: true },
    status: { type: String, enum: COURT_STATUSES, required: true, index: true },
    route: { type: String, enum: COURT_ROUTES, required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    caseNumber: { type: String, required: true },
    noticeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    noticeNumber: { type: String, default: null },
    stationId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    /** One accused per court case (D06-6); set at preparation when not known at referral. */
    accused: {
      type: new mongoose.Schema(
        {
          personId: { type: mongoose.Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          address: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    courtId: { type: mongoose.Schema.Types.ObjectId, ref: "Court", default: null },
    courtName: { type: String, default: null },
    /** Assigned by the court at filing. */
    courtCaseNumber: { type: String, default: null },
    charges: {
      type: [
        new mongoose.Schema({ code: String, name: String, legalReference: String }, { _id: false }),
      ],
      default: [],
    },
    summary: { type: String, default: null },
    prosecutingOfficer: { type: personRef, default: null },
    preparedBy: { type: personRef, default: null },
    preparedAt: { type: Date, default: null },
    approvedBy: { type: personRef, default: null },
    approvedAt: { type: Date, default: null },
    filedAt: { type: Date, default: null },
    hearings: {
      type: [
        new mongoose.Schema(
          {
            date: { type: Date, required: true },
            outcome: { type: String, enum: [...HEARING_OUTCOMES, null], default: null },
            notes: { type: String, default: null },
            nextDate: { type: Date, default: null },
            recordedBy: { type: String, default: null },
            recordedAt: { type: Date, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    postponements: { type: Number, default: 0 },
    flaggedToHq: { type: Boolean, default: false },
    verdict: {
      type: new mongoose.Schema(
        {
          result: { type: String, enum: VERDICTS, required: true },
          date: { type: Date, required: true },
          sentence: { type: String, default: null },
          /** Paid at court, not through the payment simulator (docs/06 §7). */
          fineAmount: { type: Number, default: null },
          fineReceiptNumber: { type: String, default: null },
          recordedBy: { type: personRef, required: true },
          recordedAt: { type: Date, required: true },
          confirmedBy: { type: personRef, default: null },
          confirmedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    appeal: {
      type: new mongoose.Schema(
        {
          reference: { type: String, required: true },
          filedAt: { type: Date, required: true },
          /** pending · upheld (verdict stands) · changed */
          result: { type: String, default: "pending" },
          newVerdict: { type: String, enum: [...VERDICTS, null], default: null },
          decidedAt: { type: Date, default: null },
          recordedBy: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    withdrawal: {
      type: new mongoose.Schema({ at: Date, by: String, reason: String }, { _id: false }),
      default: null,
    },
    /** Deadlines fixed when each step starts (docs/09 T2). */
    prepareBy: { type: Date, default: null },
    fileBy: { type: Date, default: null },
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
courtCaseSchema.index({ noticeId: 1 });

export const CourtCase = mongoose.model("CourtCase", courtCaseSchema, "court_cases");

/** @typedef {ReturnType<typeof CourtCase.hydrate>} CourtCaseDocument */

// Penalty notices and warning letters — docs/05 §5–§7. A notice copies the
// offences and fines from the schedule when issued (D05-1) and keeps the
// address it was served at; later changes to either don't alter it.

import mongoose from "mongoose";

/** docs/05 §6 (warning letters: issued → served → closed). */
export const NOTICE_STATUSES = /** @type {const} */ ([
  "issued", // created, not yet posted
  "served", // posted; due date running from deemed service
  "service_failed", // returned mail or unknown address
  "nominated", // the owner named the driver (slice 2)
  "transferred", // replaced by the driver's notice (slice 2)
  "disputed", // waiting for the OIC's review (slice 2)
  "overdue", // due date passed; reminder sent
  "court_referral", // confirmed by the OIC (docs/06)
  "paid", // (N5)
  "withdrawn",
  "closed", // a warning letter delivered
]);

/** Still running: the case's outcome isn't finished while any is in one of these. */
export const OPEN_NOTICE_STATUSES = /** @type {const} */ ([
  "issued",
  "served",
  "service_failed",
  "nominated",
  "disputed",
  "overdue",
]);

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    event: { type: String, required: true },
    by: { type: String, required: true },
    note: { type: String, default: null },
  },
  { _id: false },
);

const noticeSchema = new mongoose.Schema(
  {
    noticeNumber: { type: String, required: true, unique: true },
    /** penalty · warning */
    kind: { type: String, enum: ["penalty", "warning"], required: true },
    status: { type: String, enum: NOTICE_STATUSES, required: true, index: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", required: true, index: true },
    caseNumber: { type: String, required: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", default: null, index: true },
    addressee: {
      type: new mongoose.Schema(
        {
          personId: { type: mongoose.Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          /** owner · driver */
          role: { type: String, required: true },
          type: { type: String, required: true },
          address: { type: String, required: true },
          phone: { type: String, default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    vehicle: {
      type: new mongoose.Schema(
        { plate: { type: String, default: null }, description: { type: String, default: null } },
        { _id: false },
      ),
      default: () => ({}),
    },
    occurredAt: { type: Date, required: true },
    place: { type: String, default: null },
    /** Copied from the schedule at issue. */
    offences: {
      type: [
        new mongoose.Schema(
          {
            code: { type: String, required: true },
            name: { type: String, required: true },
            legalReference: { type: String, required: true },
            fine: { type: Number, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Whole rupees; null for a warning. */
    amount: { type: Number, default: null },

    issuedAt: { type: Date, required: true },
    issuedBy: { type: String, required: true },
    /** Post within (docs/09). */
    postBy: { type: Date, default: null },
    service: {
      type: new mongoose.Schema(
        {
          attempts: {
            type: [
              new mongoose.Schema(
                {
                  postedAt: { type: Date, required: true },
                  postedBy: { type: String, required: true },
                  postedById: { type: mongoose.Schema.Types.ObjectId, default: null },
                  address: { type: String, required: true },
                  smsTo: { type: String, default: null },
                  /** pending · returned */
                  result: { type: String, default: "pending" },
                  note: { type: String, default: null },
                },
                { _id: false },
              ),
            ],
            default: [],
          },
          reserveBy: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** Deemed served (posting + 3 days, D05-3); the due date counts from here. */
    servedAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    finalDueDate: { type: Date, default: null },
    /** The system proposes court after the final date; the OIC confirms (D05-8). */
    courtProposedAt: { type: Date, default: null },
    courtConfirmedBy: { type: String, default: null },
    withdrawal: {
      type: new mongoose.Schema({ at: Date, by: String, reason: String }, { _id: false }),
      default: null,
    },
    /** Reissued to a named driver: the owner's notice it replaces. */
    parentNoticeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Paid (docs/07): when, the payment reference, and the status it was paid from. */
    paidAt: { type: Date, default: null },
    paymentReference: { type: String, default: null },
    statusBeforePayment: { type: String, default: null },
    /** Who decided the outcome — never the dispute reviewer (S8). */
    issuedById: { type: mongoose.Schema.Types.ObjectId, default: null },

    /** The owner named the driver — once (docs/05 §6.2, D05-7). */
    nomination: {
      type: new mongoose.Schema(
        {
          at: { type: Date, required: true },
          /** online · station */
          via: { type: String, required: true },
          recordedBy: { type: String, default: null },
          driver: {
            type: new mongoose.Schema(
              {
                name: { type: String, required: true },
                nic: { type: String, default: null },
                licenceNumber: { type: String, default: null },
                address: { type: String, required: true },
                phone: { type: String, default: null },
              },
              { _id: false },
            ),
            required: true,
          },
          statement: { type: String, default: null },
          review: {
            type: new mongoose.Schema(
              {
                /** accepted · rejected */
                result: { type: String, required: true },
                reason: { type: String, default: null },
                by: { type: String, required: true },
                at: { type: Date, required: true },
              },
              { _id: false },
            ),
            default: null,
          },
          /** The driver's notice, when accepted. */
          childNoticeId: { type: mongoose.Schema.Types.ObjectId, default: null },
        },
        { _id: false },
      ),
      default: null,
    },

    /** The addressee disputed the notice — once (docs/05 §6.3). */
    dispute: {
      type: new mongoose.Schema(
        {
          at: { type: Date, required: true },
          via: { type: String, required: true },
          recordedBy: { type: String, default: null },
          /** not_my_vehicle · sold_or_stolen · evidence_wrong · other */
          grounds: { type: String, required: true },
          explanation: { type: String, required: true },
          /** The status it was disputed from (served · overdue). */
          fromStatus: { type: String, required: true },
          reviewBy: { type: Date, required: true },
          review: {
            type: new mongoose.Schema(
              {
                /** upheld · rejected */
                result: { type: String, required: true },
                reasons: { type: String, required: true },
                by: { type: String, required: true },
                at: { type: Date, required: true },
              },
              { _id: false },
            ),
            default: null,
          },
        },
        { _id: false },
      ),
      default: null,
    },
    history: { type: [eventSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);
noticeSchema.index({ status: 1, dueDate: 1 });
noticeSchema.index({ "addressee.personId": 1 });

export const Notice = mongoose.model("Notice", noticeSchema, "penalty_notices");

/** Letters and text messages waiting to go out (sending comes with N7). */
const outboxSchema = new mongoose.Schema(
  {
    noticeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    noticeNumber: { type: String, required: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    channel: { type: String, enum: ["post", "sms"], required: true },
    /** notice · reminder · warning */
    kind: { type: String, required: true },
    to: { type: String, required: true },
    /** The text of an SMS — never offence details (docs/05 §5.1). */
    text: { type: String, default: null },
    /** queued · sent */
    status: { type: String, required: true, default: "queued" },
    sentAt: { type: Date, default: null },
    sentBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
outboxSchema.index({ status: 1, channel: 1, createdAt: 1 });

export const OutboxMessage = mongoose.model("OutboxMessage", outboxSchema, "notice_outbox");

/** @typedef {ReturnType<typeof Notice.hydrate>} NoticeDocument */

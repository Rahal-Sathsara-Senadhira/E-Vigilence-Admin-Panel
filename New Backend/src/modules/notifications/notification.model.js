// Staff notifications and missed time limits — docs/09.
//
// A notification is one line in a person's bell; it links to the item it is
// about (N1) and is kept 90 days (D09-6). A breach records one time limit
// missed by one item: it alerts once at the limit and once more at twice the
// limit (T3, T4), and stays open until the item moves on.

import mongoose from "mongoose";

export const LEVELS = /** @type {const} */ (["info", "warning", "danger"]);
/** D09-6. */
export const RETENTION_DAYS = 90;

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** e.g. "case.dispatched", "deadline.cases.recommend" — similar alerts share one. */
    kind: { type: String, required: true },
    level: { type: String, enum: LEVELS, default: "info" },
    title: { type: String, required: true },
    body: { type: String, default: null },
    /** Where in the panel it leads (N1). */
    link: { type: String, default: null },
    /** Sent once per person: reminders and daily alerts. */
    key: { type: String, default: null },
    /** A summary of similar alerts (N2): how many more it stands for. */
    grouped: { type: Boolean, default: false },
    count: { type: Number, default: 1 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
notificationSchema.index({ userId: 1, updatedAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, kind: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: "string" } } },
);
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86_400 });

export const Notification = mongoose.model("Notification", notificationSchema, "notifications");

const breachSchema = new mongoose.Schema(
  {
    /** The time limit (settings key), e.g. "cases.recommend". */
    limitKey: { type: String, required: true },
    label: { type: String, required: true },
    item: {
      type: new mongoose.Schema(
        {
          /** report · case · notice · court_case · payment */
          type: { type: String, required: true },
          id: { type: mongoose.Schema.Types.ObjectId, required: true },
          number: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    stationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    link: { type: String, required: true },
    startedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    /** Twice the limit: HQ is told (T4). Null where the table names no escalation. */
    escalateAt: { type: Date, default: null },
    detectedAt: { type: Date, required: true },
    escalatedAt: { type: Date, default: null },
    /** The item moved on (done, or its deadline replaced). */
    resolvedAt: { type: Date, default: null },
  },
  { versionKey: false },
);
// One breach per item per deadline: a new deadline (sent back, re-served) is a new breach.
breachSchema.index({ limitKey: 1, "item.id": 1, dueAt: 1 }, { unique: true });
breachSchema.index({ resolvedAt: 1, dueAt: 1 });
breachSchema.index({ stationId: 1, resolvedAt: 1 });

export const Breach = mongoose.model("Breach", breachSchema, "deadline_breaches");

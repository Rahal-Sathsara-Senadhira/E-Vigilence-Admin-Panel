import mongoose from "mongoose";

// The current assignment of a violation to a station (one per violation;
// re-dispatching updates it and appends the previous one to `history`).
//
// Lifecycle: sent → received (the station accepts it) → in_progress (the
// case moves to in_review) → resolved; or → returned (the station sends it
// back to HQ: "not our jurisdiction"). Time limits are measured from
// sentAt — see modules/dispatch/dispatchSla.js.
export const DISPATCH_STATUSES = ["sent", "received", "in_progress", "resolved", "returned"];
export const DISPATCH_METHODS = ["jurisdiction", "nearest", "manual", "station_created"];

const DispatchSchema = new mongoose.Schema(
  {
    violation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Violation",
      required: true,
      index: true,
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      required: true,
      index: true,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: DISPATCH_STATUSES,
      default: "sent",
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },

    // How the station was chosen, and how far the case is from it — so a
    // misrouted case can be traced back to the rule that routed it.
    method: { type: String, enum: [...DISPATCH_METHODS, null], default: null },
    distanceKm: { type: Number, default: null },

    // Warnings raised at dispatch time.
    flags: {
      overlappingJurisdictions: { type: Boolean, default: false },
      unverifiedStation: { type: Boolean, default: false },
      noActiveOfficers: { type: Boolean, default: false },
    },

    receivedAt: { type: Date, default: null },
    receivedBy: { type: String, default: null },

    returnedAt: { type: Date, default: null },
    returnedBy: { type: String, default: null },
    returnReason: { type: String, default: null },

    // Set once the corresponding time-limit alert has been sent, so each
    // breach is notified only once.
    slaAlerts: {
      unacknowledgedAt: { type: Date, default: null },
      overdueAt: { type: Date, default: null },
    },

    // Earlier assignments of this violation, oldest first.
    history: [
      {
        _id: false,
        station: { type: mongoose.Schema.Types.ObjectId, ref: "PoliceStation" },
        status: { type: String },
        method: { type: String },
        sentAt: { type: Date },
        sentBy: { type: String },
        receivedAt: { type: Date },
        returnedAt: { type: Date },
        returnReason: { type: String },
        endedAt: { type: Date },
        endedReason: { type: String }, // "redispatched" | "returned" | "station_deactivated"
      },
    ],
  },
  { timestamps: true }
);

DispatchSchema.index({ station: 1, createdAt: -1 });
DispatchSchema.index({ violation: 1, createdAt: -1 });
DispatchSchema.index({ status: 1, sentAt: 1 });

export default mongoose.models.Dispatch || mongoose.model("Dispatch", DispatchSchema);

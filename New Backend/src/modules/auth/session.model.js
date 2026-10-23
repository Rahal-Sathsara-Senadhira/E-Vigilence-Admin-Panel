// Signed-in sessions — one per device (docs/20 §9). The refresh cookie holds
// "<session id>.<secret>"; only a hash of the secret is stored, and it
// changes on every refresh.

import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    secretHash: { type: String, required: true },
    /** The secret before the last rotation, to spot a stolen, replayed cookie. */
    previousSecretHash: { type: String, default: null },
    rotatedAt: { type: Date, required: true },
    lastActiveAt: { type: Date, required: true },
    /** Absolute end: signed out after 12 hours whatever happens. */
    expiresAt: { type: Date, required: true },
    idleMinutes: { type: Number, required: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: [
        null,
        "signed_out",
        "idle",
        "expired",
        "reuse_detected",
        "signed_out_everywhere",
        "account_changed",
      ],
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

// Old sessions are deleted 30 days after they end.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const Session = mongoose.model("Session", sessionSchema, "staff_sessions");

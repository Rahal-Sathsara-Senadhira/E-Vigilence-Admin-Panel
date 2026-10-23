// Staff accounts — docs/20. Kept in `staff_accounts`, apart from the citizen
// mobile app's own accounts, so the two can never be confused.

import mongoose from "mongoose";
import { ROLES } from "#src/core/access/roles.js";

const mfaSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    /** Encrypted authenticator key (core/auth/secrets.js). */
    secret: { type: String, default: null },
    /** Key being set up, not yet confirmed with a code. */
    pendingSecret: { type: String, default: null },
    /** Time step of the last accepted code — a code can't be used twice. */
    lastTimeStep: { type: Number, default: null },
    /** SHA-256 of each unused recovery code. */
    recoveryCodeHashes: { type: [String], default: [] },
    enabledAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, default: null },
    /** Police service (regimental) number; civilian staff may have none. */
    serviceNumber: {
      type: String,
      default: null,
      // Stored without spaces, so "PC 45123" and "pc45123" are the same number.
      set: (/** @type {string | null} */ v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null),
    },
    phone: { type: String, trim: true, default: null },
    role: { type: String, enum: ROLES, required: true },
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Division", default: null },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", default: null },
    isActive: { type: Boolean, default: true },

    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
    passwordChangedAt: { type: Date, default: null },
    mfa: { type: mfaSchema, default: () => ({}) },

    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastSignInAt: { type: Date, default: null },
    /** Raised whenever sign-in details change; older challenges stop working. */
    authVersion: { type: Number, default: 1 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
userSchema.index(
  { serviceNumber: 1 },
  { unique: true, partialFilterExpression: { serviceNumber: { $type: "string" } } },
);
userSchema.index({ stationId: 1, role: 1 });
userSchema.index({ divisionId: 1, role: 1 });

export const User = mongoose.model("User", userSchema, "staff_accounts");

/** @typedef {ReturnType<typeof User.hydrate>} UserDocument */

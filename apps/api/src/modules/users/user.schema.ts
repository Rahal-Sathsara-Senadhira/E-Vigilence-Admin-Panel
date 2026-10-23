// Staff accounts — docs/01 §3, §7.
//
// The `users` collection is shared with the mobile app's citizen accounts
// (docs/14 §4.6, D14-6). Staff documents carry `staff: true`; this system
// only ever reads and writes those, and its unique indexes cover only them.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { STAFF_ROLES, type StaffRole } from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class MfaState {
  @Prop({ type: Boolean, default: false }) enabled: boolean;
  /** AES-256-GCM encrypted authenticator secret. */
  @Prop({ type: String, default: null, select: false }) secretEnc: string | null;
  /** Secret shown during set-up, before the first code confirms it. */
  @Prop({ type: String, default: null, select: false }) pendingSecretEnc: string | null;
  /** Last accepted time step — a code can't be used twice. */
  @Prop({ type: Number, default: null }) lastTimeStep: number | null;
  @Prop({ type: Date, default: null }) enabledAt: Date | null;
}

@Schema({ collection: "users", timestamps: true })
export class StaffUser {
  @Prop({ type: Boolean, required: true, default: true, immutable: true }) staff: true;
  @Prop({ required: true, trim: true, type: String }) name: string;
  @Prop({ required: true, trim: true, lowercase: true, type: String }) email: string;
  @Prop({ required: true, type: String }) nic: string;
  @Prop({ type: String, default: null }) phone: string | null;
  @Prop({ required: true, enum: STAFF_ROLES, type: String }) role: StaffRole;
  @Prop({ type: Types.ObjectId, ref: "Station", default: null, index: true })
  stationId: Types.ObjectId | null;
  @Prop({ type: Boolean, default: true }) active: boolean;

  @Prop({ required: true, select: false, type: String }) passwordHash: string;
  @Prop({ type: Boolean, default: true }) mustChangePassword: boolean;
  @Prop({ type: Date, default: null }) passwordChangedAt: Date | null;
  @Prop({ type: Number, default: 0 }) failedLogins: number;
  @Prop({ type: Date, default: null }) lockedUntil: Date | null;
  @Prop({ type: Date, default: null }) lastLoginAt: Date | null;

  @Prop({ type: MfaState, default: () => ({}) }) mfa: MfaState;

  @Prop({ type: String, default: null }) createdBy: string | null;
  @Prop({ type: Date, default: null }) deactivatedAt: Date | null;
  @Prop({ type: String, default: null }) deactivationReason: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export type StaffUserDocument = HydratedDocument<StaffUser>;
export const StaffUserSchema = SchemaFactory.createForClass(StaffUser);

const STAFF_ONLY = { partialFilterExpression: { staff: true } };
StaffUserSchema.index({ email: 1 }, { unique: true, name: "staff_email_unique", ...STAFF_ONLY });
StaffUserSchema.index({ nic: 1 }, { unique: true, name: "staff_nic_unique", ...STAFF_ONLY });
StaffUserSchema.index(
  { staff: 1, role: 1, stationId: 1, active: 1 },
  { name: "staff_role_station" },
);

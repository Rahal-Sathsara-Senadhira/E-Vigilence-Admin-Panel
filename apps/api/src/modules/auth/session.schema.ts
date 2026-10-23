// Sign-in sessions — docs/17 §6. One per signed-in browser. The refresh token
// itself is never stored, only its SHA-256.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ collection: "staff_sessions", timestamps: true })
export class StaffSession {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: String, required: true, unique: true }) tokenHash: string;
  /** The token before the last rotation — presenting it again means it was stolen. */
  @Prop({ type: String, default: null, index: true }) prevTokenHash: string | null;
  @Prop({ type: Date, default: null }) rotatedAt: Date | null;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
  @Prop({ type: String, default: null }) revokedReason: string | null;
  @Prop({ type: Date, default: null }) lastUsedAt: Date | null;
  @Prop({ type: String, default: null }) ip: string | null;
  @Prop({ type: String, default: null }) userAgent: string | null;
}

export type StaffSessionDocument = HydratedDocument<StaffSession>;
export const StaffSessionSchema = SchemaFactory.createForClass(StaffSession);
// Expired sessions are removed a day after they expire; sign-in events stay in the audit log.
StaffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

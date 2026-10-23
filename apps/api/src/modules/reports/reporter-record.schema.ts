// Reporter standing — docs/02 §10. One record per reporter (mobile-app
// account, or phone number for named reporters). Rejections for fabricated
// or abusive reports are counted; 3 within 90 days flags the reporter.
// Suspension is shared with the mobile app through `reward_accounts` in the
// app-integration slice (docs/11 §6).

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class AbuseEventDoc {
  @Prop({ type: Types.ObjectId, required: true }) reportId: Types.ObjectId;
  @Prop({ required: true, type: String }) code: string;
  @Prop({ required: true, type: Date }) at: Date;
}

@Schema({ collection: "reporter_records", timestamps: true })
export class ReporterRecord {
  /** "user:<id>" for app accounts, "phone:+94…" for named reporters. */
  @Prop({ required: true, unique: true, type: String }) key: string;
  @Prop({ type: [AbuseEventDoc], default: [] }) abuse: AbuseEventDoc[];
  @Prop({ type: Boolean, default: false }) flagged: boolean;
  @Prop({ type: Date, default: null }) flaggedAt: Date | null;
  @Prop({ type: Boolean, default: false }) suspended: boolean;
  @Prop({ type: String, default: null }) suspendedReason: string | null;
  @Prop({ type: Date, default: null }) suspendedAt: Date | null;
}

export type ReporterRecordDocument = HydratedDocument<ReporterRecord>;
export const ReporterRecordSchema = SchemaFactory.createForClass(ReporterRecord);

// Penalty notices — docs/05 §5–6. Lines and fines are copied from the
// schedule at issue (docs/14 M6), so a later fine change never alters them.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { DISPUTE_GROUNDS, noticeMachine, type DisputeGround, type NoticeStatus } from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class NoticeLineDoc {
  @Prop({ required: true, type: String }) code: string;
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: String }) legalReference: string;
  @Prop({ required: true, type: Number }) fine: number;
  @Prop({ required: true, type: Number }) scheduleVersion: number;
}

@Schema({ _id: false })
export class ServiceAttemptDoc {
  @Prop({ required: true, type: Date }) postedAt: Date;
  @Prop({ required: true, type: String }) postReference: string;
  @Prop({ required: true, type: String }) address: string;
  @Prop({ type: String, default: null }) result: "served" | "failed" | null;
  @Prop({ type: String, default: null }) note: string | null;
  @Prop({ required: true, type: String }) by: string;
}

@Schema({ _id: false })
export class NominationDoc {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) via: "addressee" | "staff";
  @Prop({ required: true, type: String }) driverName: string;
  @Prop({ required: true, type: String }) driverId: string;
  @Prop({ required: true, type: String }) driverAddress: string;
  @Prop({ type: String, default: null }) driverPhone: string | null;
  @Prop({ required: true, type: String }) status: "pending" | "accepted" | "rejected";
  @Prop({ type: String, default: null }) reviewReason: string | null;
  /** The status the notice returns to if the nomination is rejected. */
  @Prop({ required: true, type: String }) previousStatus: NoticeStatus;
}

@Schema({ _id: false })
export class DisputeDoc {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) via: "addressee" | "staff";
  @Prop({ required: true, enum: Object.keys(DISPUTE_GROUNDS), type: String }) ground: DisputeGround;
  @Prop({ required: true, type: String }) explanation: string;
  @Prop({ required: true, type: String }) status: "pending" | "upheld" | "rejected";
  @Prop({ type: String, default: null }) reviewReason: string | null;
  @Prop({ type: String, default: null }) reviewedBy: string | null;
  @Prop({ type: Date, default: null }) reviewedAt: Date | null;
}

@Schema({ _id: false })
export class NoticeEventDoc {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) event: string;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ type: String, default: null }) note: string | null;
}

@Schema({ collection: "penalty_notices", timestamps: true })
export class PenaltyNotice {
  @Prop({ required: true, unique: true, type: String }) noticeNumber: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) caseId: Types.ObjectId;
  @Prop({ required: true, type: String }) caseNumber: string;
  @Prop({ type: Types.ObjectId, default: null, index: true }) stationId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, required: true, index: true }) addresseeId: Types.ObjectId;
  @Prop({ required: true, type: String }) addresseeRole: "owner" | "driver";
  @Prop({ required: true, type: String }) addresseeName: string;
  /** NIC or registration number as on the notice — what the public payment page asks for (07 §5.1). */
  @Prop({ type: String, default: null }) addresseeIdNumber: string | null;

  @Prop({ type: String, default: null }) vehicleNumber: string | null;
  @Prop({ required: true, type: Date }) offenceDate: Date;
  @Prop({ required: true, type: String }) place: string;
  @Prop({ type: [NoticeLineDoc], default: [] }) lines: NoticeLineDoc[];
  /** Whole rupees: the sum of the fines (D05-1). */
  @Prop({ required: true, type: Number }) amount: number;

  @Prop({ required: true, enum: noticeMachine.states, type: String }) status: NoticeStatus;
  @Prop({ required: true, type: Date }) issuedAt: Date;
  @Prop({ type: Date, default: null }) servedAt: Date | null;
  @Prop({ type: Date, default: null }) dueDate: Date | null;
  @Prop({ type: Date, default: null }) reminderSentAt: Date | null;
  @Prop({ type: Date, default: null }) finalDueDate: Date | null;
  @Prop({ type: Date, default: null }) courtProposedAt: Date | null;

  @Prop({ required: true, type: String }) serviceAddress: string;
  @Prop({ type: [ServiceAttemptDoc], default: [] }) serviceAttempts: ServiceAttemptDoc[];
  @Prop({ type: NominationDoc, default: null }) nomination: NominationDoc | null;
  @Prop({ type: DisputeDoc, default: null }) dispute: DisputeDoc | null;
  @Prop({ type: Types.ObjectId, default: null }) paymentId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) parentNoticeId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) childNoticeId: Types.ObjectId | null;
  @Prop({ type: Boolean, default: false }) legacy: boolean;
  @Prop({ type: [String], default: [] }) flags: string[];
  @Prop({ type: String, default: null }) withdrawnReason: string | null;
  @Prop({ type: [NoticeEventDoc], default: [] }) timeline: NoticeEventDoc[];

  createdAt: Date;
  updatedAt: Date;
}
export type PenaltyNoticeDocument = HydratedDocument<PenaltyNotice>;
export const PenaltyNoticeSchema = SchemaFactory.createForClass(PenaltyNotice);
PenaltyNoticeSchema.index({ status: 1, dueDate: 1 });
PenaltyNoticeSchema.index({ status: 1, finalDueDate: 1 });
PenaltyNoticeSchema.index({ stationId: 1, status: 1 });

/**
 * Letters and SMS. Until go-live nothing is sent (docs/15 D15-3): messages
 * are held here and shown on the outbox screen.
 */
@Schema({ collection: "outbox_messages", versionKey: false })
export class OutboxMessage {
  @Prop({ required: true, type: String }) channel: "post" | "sms";
  @Prop({ required: true, type: String }) to: string;
  @Prop({ required: true, type: String }) template: string;
  @Prop({ required: true, type: String }) subject: string;
  @Prop({ required: true, type: String }) body: string;
  @Prop({ type: Types.ObjectId, default: null, index: true }) noticeId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) noticeNumber: string | null;
  @Prop({ required: true, type: Date }) createdAt: Date;
  @Prop({ type: String, default: "held" }) status: "held";
}
export const OutboxMessageSchema = SchemaFactory.createForClass(OutboxMessage);
OutboxMessageSchema.index({ createdAt: -1 });

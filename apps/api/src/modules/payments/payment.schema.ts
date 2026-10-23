// Payments and refunds — docs/07. Money records are never edited or deleted
// (P6): a correction is a new entry (refund, reversal) with a reason.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class ReceiptReviewDoc {
  @Prop({ required: true, type: String }) status: "pending" | "accepted" | "reversed";
  @Prop({ type: String, default: null }) by: string | null;
  @Prop({ type: Date, default: null }) at: Date | null;
  @Prop({ type: String, default: null }) reason: string | null;
}

@Schema({ _id: false })
export class RefundDoc {
  @Prop({ required: true, type: String }) reference: string;
  @Prop({ required: true, type: String }) reason: string;
  @Prop({ required: true, type: String }) approvedBy: string;
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ type: Boolean, default: false }) automatic: boolean;
}

@Schema({ collection: "payments", timestamps: true })
export class Payment {
  /** SIM-… for simulator payments; the receipt number for recorded ones (P2: processed once). */
  @Prop({ required: true, unique: true, type: String }) reference: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) noticeId: Types.ObjectId;
  @Prop({ required: true, type: String }) noticeNumber: string;
  @Prop({ required: true, type: Number }) amount: number;
  @Prop({ required: true, enum: PAYMENT_METHODS, type: String }) method: PaymentMethod;
  @Prop({ required: true, type: String }) status: "succeeded" | "failed" | "refunded";
  @Prop({ type: String, default: null }) payerName: string | null;
  @Prop({ required: true, type: Date }) receivedAt: Date;
  @Prop({ required: true, type: String }) recordedBy: string;
  /** The signed confirmation as received (online), or the receipt scan's evidence id (recorded). */
  @Prop({ type: String, default: null }) confirmation: string | null;
  @Prop({ type: Types.ObjectId, default: null }) scanEvidenceId: Types.ObjectId | null;
  /** Simulator money — never counted as real collection (docs/12 D12-6). */
  @Prop({ type: Boolean, default: false }) test: boolean;
  @Prop({ type: ReceiptReviewDoc, default: null }) review: ReceiptReviewDoc | null;
  @Prop({ type: RefundDoc, default: null }) refund: RefundDoc | null;
  @Prop({ type: Boolean, default: false }) refundPending: boolean;
  @Prop({ type: String, default: null }) refundReason: string | null;
  @Prop({ type: [String], default: [] }) flags: string[];

  createdAt: Date;
  updatedAt: Date;
}
export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ receivedAt: -1 });
PaymentSchema.index({ "review.status": 1 });
PaymentSchema.index({ refundPending: 1 });

/** One online payment attempt through the simulator (07 §5.2). */
@Schema({ collection: "payment_sessions", timestamps: true })
export class PaymentSession {
  @Prop({ type: Types.ObjectId, required: true }) noticeId: Types.ObjectId;
  @Prop({ required: true, type: String }) noticeNumber: string;
  /** Fixed from the notice when the session starts (P1). */
  @Prop({ required: true, type: Number }) amount: number;
  @Prop({ required: true, type: String }) method: "sim_card" | "sim_wallet";
  @Prop({ type: String, default: null }) payerName: string | null;
  @Prop({ required: true, type: String }) status:
    "open" | "delayed" | "succeeded" | "declined" | "cancelled" | "failed";
  @Prop({ type: String, default: null }) reference: string | null;

  createdAt: Date;
  updatedAt: Date;
}
export type PaymentSessionDocument = HydratedDocument<PaymentSession>;
export const PaymentSessionSchema = SchemaFactory.createForClass(PaymentSession);
PaymentSessionSchema.index({ status: 1, updatedAt: 1 });

/** Confirmations that didn't match (wrong amount, unknown reference, bad signature) — flagged to HQ (07 §12). */
@Schema({ collection: "payment_anomalies", versionKey: false })
export class PaymentAnomaly {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) kind: string;
  @Prop({ required: true, type: String }) detail: string;
  @Prop({ type: String, default: null }) payload: string | null;
}
export const PaymentAnomalySchema = SchemaFactory.createForClass(PaymentAnomaly);

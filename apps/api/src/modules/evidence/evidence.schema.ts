// Evidence items and their chain of custody — docs/10 §3, docs/14 §4.5.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  EVIDENCE_KINDS,
  type CustodyEventType,
  type EvidenceKind,
  type EvidenceStatus,
} from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class StoredFileDoc {
  @Prop({ type: String, default: null }) storageKey: string | null;
  @Prop({ required: true, type: Number }) size: number;
  @Prop({ required: true, type: String }) mime: string;
  @Prop({ required: true, type: String }) sha256: string;
}

@Schema({ collection: "evidence_items", timestamps: true })
export class EvidenceItem {
  @Prop({ required: true, enum: EVIDENCE_KINDS, type: String }) kind: EvidenceKind;
  @Prop({ required: true, type: String }) status: EvidenceStatus;
  /** As sent, for display only — never used as a storage path. */
  @Prop({ required: true, type: String }) originalName: string;
  /** Kept from now on (D06-4). `retained: false` for migrated items that only have a fingerprint. */
  @Prop({ type: StoredFileDoc, required: true }) original: StoredFileDoc;
  @Prop({ type: Boolean, default: true }) originalRetained: boolean;
  @Prop({ type: StoredFileDoc, default: null }) viewing: StoredFileDoc | null;
  @Prop({ type: Boolean, default: false }) compressed: boolean;
  @Prop({ type: String, default: null }) processingError: string | null;

  @Prop({ type: Boolean, default: false }) capturedInApp: boolean;
  @Prop({ type: Date, default: null }) capturedAt: Date | null;

  @Prop({ required: true, type: String }) uploadedBy: string;
  @Prop({ required: true, type: String }) uploadedByName: string;
  /** Until claimed by a report, only the uploader can see or attach it; unclaimed uploads are deleted after a day. */
  @Prop({ type: Types.ObjectId, default: null, index: true }) reportId: Types.ObjectId | null;
  /** Evidence added during investigation belongs to the case (docs/04 §6). */
  @Prop({ type: Types.ObjectId, default: null, index: true }) caseId: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) claimedAt: Date | null;

  @Prop({ type: Date, default: null }) integrityCheckedAt: Date | null;
  @Prop({ type: Boolean, default: null }) integrityOk: boolean | null;

  createdAt: Date;
  updatedAt: Date;
}
export type EvidenceItemDocument = HydratedDocument<EvidenceItem>;
export const EvidenceItemSchema = SchemaFactory.createForClass(EvidenceItem);
EvidenceItemSchema.index({ reportId: 1, createdAt: 1 });
EvidenceItemSchema.index({ status: 1, updatedAt: 1 });
EvidenceItemSchema.index({ "original.sha256": 1 });

/** Append-only (docs/14 M7). */
@Schema({ collection: "custody_events", versionKey: false })
export class CustodyEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true }) evidenceId: Types.ObjectId;
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) event: CustodyEventType;
  @Prop({ required: true, type: String }) actor: string;
  @Prop({ type: String, default: null }) actorId: string | null;
  @Prop({ type: String, default: null }) role: string | null;
  @Prop({ type: String, default: null }) reason: string | null;
  @Prop({ type: String, default: null }) detail: string | null;
}
export const CustodyEventSchema = SchemaFactory.createForClass(CustodyEvent);

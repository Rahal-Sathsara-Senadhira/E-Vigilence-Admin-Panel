// The single append-only audit log — docs/10-evidence-audit-and-privacy.md §4.
// There is no update or delete path anywhere in the code (docs/14 M7).

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class AuditActorDoc {
  @Prop({ required: true, type: String }) kind:
    "user" | "system" | "citizen" | "addressee" | "anonymous";
  @Prop({ type: String, default: null }) userId: string | null;
  @Prop({ type: String, default: null }) role: string | null;
  @Prop({ type: String, default: null }) stationId: string | null;
  @Prop({ type: String, default: null }) label: string | null;
}

@Schema({ _id: false })
export class AuditTargetDoc {
  @Prop({ required: true, type: String }) type: string;
  @Prop({ type: String, default: null }) id: string | null;
  @Prop({ type: String, default: null }) label: string | null;
}

@Schema({ _id: false })
export class AuditSourceDoc {
  @Prop({ type: String, default: null }) ip: string | null;
  @Prop({ type: String, default: null }) app: string | null;
}

@Schema({ collection: "audit_log", versionKey: false })
export class AuditEntry {
  /** One global order for the hash chain; unique, so two writers can't fork it. */
  @Prop({ required: true, unique: true, type: Number }) seq: number;
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ type: AuditActorDoc, required: true }) actor: AuditActorDoc;
  @Prop({ required: true, index: true, type: String }) action: string;
  @Prop({ type: AuditTargetDoc, default: null }) target: AuditTargetDoc | null;
  @Prop({ required: true, type: String }) summary: string;
  @Prop({ type: String, default: null }) reason: string | null;
  @Prop({ type: AuditSourceDoc, default: () => ({}) }) source: AuditSourceDoc;
  @Prop({ required: true, type: String }) prevHash: string;
  @Prop({ required: true, type: String }) hash: string;
}

export type AuditEntryDocument = HydratedDocument<AuditEntry>;
export const AuditEntrySchema = SchemaFactory.createForClass(AuditEntry);
AuditEntrySchema.index({ "actor.stationId": 1, seq: -1 });
AuditEntrySchema.index({ "target.type": 1, "target.id": 1, seq: -1 });

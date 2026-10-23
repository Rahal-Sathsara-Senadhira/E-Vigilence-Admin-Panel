// A report — docs/02 §4. "Evidence of what someone said": after receipt only
// the reporter's answer and triage are added; what police conclude lives on
// the case (§6.1).

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  CHANNELS,
  PRIORITIES,
  REJECTION_CODES,
  VEHICLE_TYPES,
  triageMachine,
  type Channel,
  type Priority,
  type RejectionReason,
  type TriageStatus,
  type VehicleType,
} from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class GeoPointDoc {
  @Prop({ type: String, enum: ["Point"], default: "Point" }) type: "Point";
  /** [lng, lat] */
  @Prop({ type: [Number], required: true }) coordinates: number[];
}

@Schema({ _id: false })
export class ReceivedByDoc {
  @Prop({ required: true, type: String }) kind: "user" | "system";
  @Prop({ type: String, default: null }) userId: string | null;
  @Prop({ required: true, type: String }) name: string;
  @Prop({ type: String, default: null }) role: string | null;
}

@Schema({ _id: false })
export class ReporterDoc {
  @Prop({ required: true, type: String }) kind: "citizen" | "named" | "anonymous";
  /** Mobile-app account (citizen). */
  @Prop({ type: String, default: null }) userId: string | null;
  @Prop({ type: String, default: null }) name: string | null;
  @Prop({ type: String, default: null }) phone: string | null;
}

@Schema({ _id: false })
export class LockDoc {
  @Prop({ required: true, type: String }) userId: string;
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: Date }) until: Date;
}

@Schema({ _id: false })
export class QuestionDoc {
  @Prop({ required: true, type: String }) text: string;
  @Prop({ required: true, type: Date }) askedAt: Date;
  @Prop({ required: true, type: String }) askedBy: string;
  @Prop({ required: true, type: Date }) dueAt: Date;
  @Prop({ type: String, default: null }) answer: string | null;
  @Prop({ type: Date, default: null }) answeredAt: Date | null;
}

@Schema({ _id: false })
export class RejectionDoc {
  @Prop({ required: true, enum: REJECTION_CODES, type: String }) code: RejectionReason;
  @Prop({ type: String, default: null }) note: string | null;
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) by: string;
}

@Schema({ _id: false })
export class TriageEventDoc {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) status: TriageStatus;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ type: String, default: null }) byId: string | null;
  @Prop({ type: String, default: null }) reasonCode: RejectionReason | null;
  @Prop({ type: String, default: null }) note: string | null;
}

@Schema({ collection: "incident_reports", timestamps: true })
export class IncidentReport {
  @Prop({ required: true, unique: true, type: String }) reportNumber: string;
  @Prop({ required: true, enum: CHANNELS, type: String }) channel: Channel;
  @Prop({ required: true, type: Date }) receivedAt: Date;
  @Prop({ type: ReceivedByDoc, required: true }) receivedBy: ReceivedByDoc;
  @Prop({ type: ReporterDoc, required: true }) reporter: ReporterDoc;

  /** Mobile app: the source document in `reports`, and the device's id (docs/11 §4). */
  @Prop({ type: Types.ObjectId, default: null }) sourceReportId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) clientReportId: string | null;

  @Prop({ required: true, type: Date }) occurredAt: Date;
  @Prop({ type: GeoPointDoc, default: null }) location: GeoPointDoc | null;
  @Prop({ required: true, type: String }) address: string;
  @Prop({ type: String, default: null }) vehicleNumber: string | null;
  @Prop({ type: Boolean, default: false }) plateUnknown: boolean;
  @Prop({ required: true, enum: VEHICLE_TYPES, type: String }) vehicleType: VehicleType;
  @Prop({ type: String, default: null }) vehicleDescription: string | null;
  @Prop({ type: [String], default: [] }) offenceCodes: string[];
  @Prop({ required: true, type: String }) description: string;
  @Prop({ type: [Types.ObjectId], default: [] }) evidenceIds: Types.ObjectId[];
  @Prop({ type: Boolean, default: false }) someoneHurt: boolean;

  /** Station that recorded it (walk-in, station phone, officer — docs/02 §7). */
  @Prop({ type: Types.ObjectId, default: null }) stationId: Types.ObjectId | null;

  @Prop({ required: true, enum: triageMachine.states, type: String }) status: TriageStatus;
  @Prop({ required: true, enum: PRIORITIES, type: String }) suggestedPriority: Priority;
  @Prop({ type: String, enum: [...PRIORITIES, null], default: null }) priority: Priority | null;
  /** Triage deadline, fixed when the report arrived (docs/09 T2). */
  @Prop({ type: Date, default: null }) triageDueAt: Date | null;

  @Prop({ type: LockDoc, default: null }) lock: LockDoc | null;
  @Prop({ type: QuestionDoc, default: null }) question: QuestionDoc | null;
  @Prop({ type: RejectionDoc, default: null }) rejection: RejectionDoc | null;
  @Prop({ type: Types.ObjectId, default: null, index: true }) caseId: Types.ObjectId | null;
  /** Station-accepted reports start false until HQ reviews them (docs/02 §7). */
  @Prop({ type: Boolean, default: true }) hqReviewed: boolean;
  /** no_location, no_evidence, offence_not_recognised, reporter_flagged, deleted_in_app … */
  @Prop({ type: [String], default: [] }) flags: string[];
  @Prop({ type: [TriageEventDoc], default: [] }) history: TriageEventDoc[];

  createdAt: Date;
  updatedAt: Date;
}

export type IncidentReportDocument = HydratedDocument<IncidentReport>;
export const IncidentReportSchema = SchemaFactory.createForClass(IncidentReport);
IncidentReportSchema.index({ status: 1, priority: 1, receivedAt: 1 });
IncidentReportSchema.index({ status: 1, suggestedPriority: 1, receivedAt: 1 });
IncidentReportSchema.index({ stationId: 1, receivedAt: -1 });
IncidentReportSchema.index({ vehicleNumber: 1, occurredAt: -1 });
IncidentReportSchema.index({ location: "2dsphere" });
IncidentReportSchema.index(
  { "reporter.userId": 1 },
  { partialFilterExpression: { "reporter.kind": "citizen" } },
);
IncidentReportSchema.index(
  { sourceReportId: 1 },
  { unique: true, partialFilterExpression: { sourceReportId: { $type: "objectId" } } },
);
IncidentReportSchema.index(
  { "question.dueAt": 1 },
  { partialFilterExpression: { status: "needs_info" } },
);

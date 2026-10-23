// A case — docs/03 §3, docs/04 §6, docs/05 §3–4.
//
// The dispatch history lives on the case (one record, changed atomically
// with the case's state), rather than in a separate collection; the old
// system's `dispatches` move into it at migration (docs/14 §6.3).

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  ADDRESSEE_ROLES,
  DISPATCH_METHODS,
  OUTCOMES,
  PRIORITIES,
  STATEMENT_FROM,
  VEHICLE_TYPES,
  caseMachine,
  type AddresseeRole,
  type CaseStatus,
  type DispatchMethod,
  type NfaReason,
  type Outcome,
  type Priority,
  type VehicleType,
} from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";
import { GeoPointDoc } from "../reports/report.schema";

@Schema({ _id: false })
export class CaseEventDoc {
  @Prop({ required: true, type: Date }) at: Date;
  /** opened, dispatched, accepted, returned, officer_assigned, work_started, recommended, decided, sent_back, overridden, closed, reopened, merged … */
  @Prop({ required: true, type: String }) event: string;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ type: String, default: null }) byId: string | null;
  @Prop({ type: String, default: null }) note: string | null;
}

@Schema({ _id: false })
export class DispatchDoc {
  @Prop({ type: Types.ObjectId, required: true }) stationId: Types.ObjectId;
  @Prop({ required: true, type: String }) stationName: string;
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, enum: DISPATCH_METHODS, type: String }) method: DispatchMethod;
  @Prop({ type: Number, default: null }) distanceKm: number | null;
  /** overlapping_jurisdictions, unverified_station, no_active_officers */
  @Prop({ type: [String], default: [] }) flags: string[];
  @Prop({ type: String, default: null }) reason: string | null;
  @Prop({ type: Date, default: null }) acceptedAt: Date | null;
  @Prop({ type: String, default: null }) acceptedBy: string | null;
  @Prop({ type: Date, default: null }) returnedAt: Date | null;
  @Prop({ type: String, default: null }) returnedBy: string | null;
  @Prop({ type: String, default: null }) returnReason: string | null;
}

@Schema({ _id: false })
export class NoteDoc {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, type: String }) byId: string;
  @Prop({ required: true, type: String }) text: string;
}

@Schema({ _id: false })
export class EvidenceReviewDoc {
  @Prop({ required: true, type: Boolean }) plateReadable: boolean;
  @Prop({ required: true, type: Boolean }) vehicleMatches: boolean;
  @Prop({ required: true, type: Boolean }) timePlaceConsistent: boolean;
  @Prop({ required: true, type: Boolean }) notEdited: boolean;
  @Prop({ required: true, type: Boolean }) offenceVisible: boolean;
  @Prop({ type: String, default: null }) note: string | null;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, type: Date }) at: Date;
}

@Schema({ _id: false })
export class StatementDoc {
  @Prop({ required: true, type: Date }) at: Date;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, enum: STATEMENT_FROM, type: String })
  from: (typeof STATEMENT_FROM)[number];
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: Date }) takenAt: Date;
  @Prop({ required: true, type: String }) summary: string;
  @Prop({ type: [Types.ObjectId], default: [] }) evidenceIds: Types.ObjectId[];
}

@Schema({ _id: false })
export class RecommendationDoc {
  @Prop({ required: true, enum: OUTCOMES, type: String }) outcome: Outcome;
  @Prop({ type: String, enum: [...ADDRESSEE_ROLES, null], default: null })
  addressee: AddresseeRole | null;
  @Prop({ type: String, default: null }) nfaReason: NfaReason | null;
  @Prop({ required: true, type: String }) justification: string;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, type: String }) byId: string;
  @Prop({ required: true, type: Date }) at: Date;
}

@Schema({ _id: false })
export class DecisionDoc {
  @Prop({ required: true, enum: OUTCOMES, type: String }) outcome: Outcome;
  @Prop({ type: String, enum: [...ADDRESSEE_ROLES, null], default: null })
  addressee: AddresseeRole | null;
  @Prop({ type: String, default: null }) nfaReason: NfaReason | null;
  /** The decider changed the officer's recommendation. */
  @Prop({ type: Boolean, default: false }) changed: boolean;
  @Prop({ type: String, default: null }) note: string | null;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, type: String }) byId: string;
  @Prop({ required: true, type: String }) role: string;
  @Prop({ required: true, type: Date }) at: Date;
}

@Schema({ collection: "cases", timestamps: true })
export class Case {
  @Prop({ required: true, unique: true, type: String }) caseNumber: string;
  @Prop({ type: [Types.ObjectId], default: [], index: true }) reportIds: Types.ObjectId[];
  @Prop({ required: true, enum: PRIORITIES, type: String }) priority: Priority;
  @Prop({ type: [String], default: [] }) offenceCodes: string[];
  @Prop({ required: true, type: Date }) occurredAt: Date;
  @Prop({ type: GeoPointDoc, required: true }) location: GeoPointDoc;
  @Prop({ required: true, type: String }) address: string;
  @Prop({ type: String, default: null }) vehicleNumber: string | null;
  @Prop({ type: Boolean, default: false }) plateUnknown: boolean;
  @Prop({ required: true, enum: VEHICLE_TYPES, type: String }) vehicleType: VehicleType;

  // Dispatch (03 §5)
  @Prop({ type: Types.ObjectId, default: null, index: true }) stationId: Types.ObjectId | null;
  @Prop({ type: [DispatchDoc], default: [] }) dispatches: DispatchDoc[];
  @Prop({ type: Number, default: 0 }) returnCount: number;
  /** disputed_jurisdiction, overlapping_jurisdictions, unverified_station, no_active_officers, suspected_false_plate … */
  @Prop({ type: [String], default: [] }) flags: string[];

  // Responsibility (03 §6)
  @Prop({ type: String, default: null, index: true }) investigatingOfficerId: string | null;
  @Prop({ type: String, default: null }) investigatingOfficerName: string | null;
  @Prop({ type: Date, default: null }) workStartedAt: Date | null;

  // Investigation (04 §6)
  @Prop({ type: Types.ObjectId, default: null, index: true }) vehicleId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null, index: true }) ownerId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null, index: true }) driverId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) driverBasis: string | null;
  @Prop({ type: EvidenceReviewDoc, default: null }) evidenceReview: EvidenceReviewDoc | null;
  @Prop({ type: [NoteDoc], default: [] }) notes: NoteDoc[];
  @Prop({ type: [StatementDoc], default: [] }) statements: StatementDoc[];
  /** Evidence added during investigation (the reports' evidence stays on the reports). */
  @Prop({ type: [Types.ObjectId], default: [] }) evidenceIds: Types.ObjectId[];

  // Outcome (05 §3–4)
  @Prop({ type: RecommendationDoc, default: null }) recommendation: RecommendationDoc | null;
  @Prop({ type: DecisionDoc, default: null }) decision: DecisionDoc | null;

  @Prop({ required: true, enum: caseMachine.states, type: String }) status: CaseStatus;
  /** When the current stage's time limit runs out (docs/09 §4), fixed when the stage starts. */
  @Prop({ type: Date, default: null }) dueAt: Date | null;
  @Prop({ type: String, default: null }) closedReason: string | null;
  @Prop({ type: Types.ObjectId, default: null }) mergedInto: Types.ObjectId | null;
  @Prop({ required: true, type: String }) openedBy: string;
  @Prop({ type: [CaseEventDoc], default: [] }) timeline: CaseEventDoc[];

  createdAt: Date;
  updatedAt: Date;
}

export type CaseDocument = HydratedDocument<Case>;
export const CaseSchema = SchemaFactory.createForClass(Case);
CaseSchema.index({ status: 1, createdAt: -1 });
CaseSchema.index({ stationId: 1, status: 1 });
CaseSchema.index({ status: 1, dueAt: 1 });
CaseSchema.index({ vehicleNumber: 1, occurredAt: -1 });
CaseSchema.index({ location: "2dsphere" });

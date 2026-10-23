// Offence schedule versions — docs/14 §4.5, D14-8. Each change is a new
// version; the current one has `current: true` and `effectiveTo: null`. Append-only except for
// closing the previous version's `effectiveTo` when a new one starts.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  OFFENCE_OUTCOMES,
  SEVERITIES,
  VEHICLE_TYPES,
  type OffenceOutcome,
  type Severity,
  type VehicleType,
} from "@ev/shared";
import type { HydratedDocument } from "mongoose";

@Schema({ collection: "offence_schedule", versionKey: false })
export class OffenceVersion {
  @Prop({ required: true, type: String }) code: string;
  @Prop({ required: true, type: Number }) version: number;
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: String }) legalReference: string;
  @Prop({ required: true, enum: OFFENCE_OUTCOMES, type: String }) outcome: OffenceOutcome;
  @Prop({ type: Number, default: null }) spotFine: number | null;
  @Prop({ required: true, enum: SEVERITIES, type: String }) severity: Severity;
  @Prop({ type: Number, default: null }) demeritPoints: number | null;
  @Prop({ type: [String], enum: VEHICLE_TYPES, default: [] }) vehicleTypes: VehicleType[];
  @Prop({ required: true, type: Boolean }) citizenReportable: boolean;
  @Prop({ required: true, type: String }) publicName: string;
  @Prop({ required: true, type: String }) publicDescription: string;
  @Prop({ required: true, type: Boolean }) active: boolean;
  @Prop({ required: true, type: Date }) effectiveFrom: Date;
  @Prop({ type: Date, default: null }) effectiveTo: Date | null;
  /** true on the version in force now (effectiveTo is null). */
  @Prop({ required: true, type: Boolean }) current: boolean;
  @Prop({ required: true, type: String }) source: string;
  @Prop({ required: true, type: String }) changedBy: string;
  @Prop({ required: true, type: String }) reason: string;
}

export type OffenceVersionDocument = HydratedDocument<OffenceVersion>;
export const OffenceVersionSchema = SchemaFactory.createForClass(OffenceVersion);
OffenceVersionSchema.index({ code: 1, version: 1 }, { unique: true });
// At most one current version per offence.
OffenceVersionSchema.index(
  { code: 1 },
  { unique: true, name: "one_current_version", partialFilterExpression: { current: true } },
);

/**
 * The copy the mobile app reads — docs/11 §3: names and descriptions only,
 * no fines or legal detail. Written only by this system.
 */
@Schema({ collection: "offence_schedule_public", versionKey: false })
export class PublicOffenceDoc {
  @Prop({ required: true, unique: true, type: String }) code: string;
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: String }) description: string;
  @Prop({ type: [String], default: [] }) vehicleTypes: VehicleType[];
  @Prop({ required: true, type: Number }) sortOrder: number;
  @Prop({ required: true, type: Date }) publishedAt: Date;
}
export const PublicOffenceSchema = SchemaFactory.createForClass(PublicOffenceDoc);

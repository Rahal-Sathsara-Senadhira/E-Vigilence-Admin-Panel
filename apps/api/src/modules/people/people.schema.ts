// Vehicle and person registers — docs/04 §3–4.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
  PERSON_TYPES,
  VEHICLE_FLAGS,
  VEHICLE_TYPES,
  type PersonType,
  type VehicleFlag,
  type VehicleType,
} from "@ev/shared";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ collection: "persons", timestamps: true })
export class Person {
  @Prop({ required: true, enum: PERSON_TYPES, type: String }) type: PersonType;
  @Prop({ required: true, trim: true, type: String }) name: string;
  @Prop({ type: String, default: null }) nic: string | null;
  @Prop({ type: String, default: null }) businessRegNo: string | null;
  @Prop({ type: String, default: null }) licenceNumber: string | null;
  /** Required before a notice can be served (docs/04 §4). */
  @Prop({ type: String, default: null }) address: string | null;
  @Prop({ type: String, default: null }) phone: string | null;
  /** Set when HQ merges this record into another (P2). */
  @Prop({ type: Types.ObjectId, default: null }) mergedInto: Types.ObjectId | null;
  @Prop({ required: true, type: String }) createdBy: string;

  createdAt: Date;
  updatedAt: Date;
}
export type PersonDocument = HydratedDocument<Person>;
export const PersonSchema = SchemaFactory.createForClass(Person);
// Unique when present (P1): the same NIC, licence or registration number can't be entered twice.
PersonSchema.index(
  { nic: 1 },
  { unique: true, partialFilterExpression: { nic: { $type: "string" } } },
);
PersonSchema.index(
  { licenceNumber: 1 },
  { unique: true, partialFilterExpression: { licenceNumber: { $type: "string" } } },
);
PersonSchema.index(
  { businessRegNo: 1 },
  { unique: true, partialFilterExpression: { businessRegNo: { $type: "string" } } },
);
PersonSchema.index({ name: 1 });

@Schema({ _id: false })
export class OwnershipDoc {
  @Prop({ type: Types.ObjectId, required: true }) personId: Types.ObjectId;
  /** The owner from this date (null = not known). Ownership is added, never overwritten (V3). */
  @Prop({ type: Date, default: null }) from: Date | null;
  @Prop({ type: Date, default: null }) to: Date | null;
  @Prop({ required: true, type: String }) dmtReference: string;
  @Prop({ required: true, type: String }) recordedBy: string;
  @Prop({ required: true, type: String }) recordedById: string;
  @Prop({ required: true, type: Date }) recordedAt: Date;
}

@Schema({ _id: false })
export class VehicleFlagDoc {
  @Prop({ required: true, enum: VEHICLE_FLAGS, type: String }) flag: VehicleFlag;
  @Prop({ type: String, default: null }) reference: string | null;
  @Prop({ required: true, type: String }) reason: string;
  @Prop({ required: true, type: String }) by: string;
  @Prop({ required: true, type: Date }) at: Date;
}

@Schema({ collection: "vehicles", timestamps: true })
export class Vehicle {
  @Prop({ required: true, unique: true, type: String }) plate: string;
  @Prop({ type: String, enum: [...VEHICLE_TYPES, null], default: null }) type: VehicleType | null;
  @Prop({ type: String, default: null }) make: string | null;
  /** "model" would clash with Mongoose's Document.model(). */
  @Prop({ type: String, default: null }) vehicleModel: string | null;
  @Prop({ type: String, default: null }) colour: string | null;
  @Prop({ type: [OwnershipDoc], default: [] }) ownership: OwnershipDoc[];
  @Prop({ type: [VehicleFlagDoc], default: [] }) flags: VehicleFlagDoc[];

  createdAt: Date;
  updatedAt: Date;
}
export type VehicleDocument = HydratedDocument<Vehicle>;
export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
VehicleSchema.index({ "ownership.personId": 1 });

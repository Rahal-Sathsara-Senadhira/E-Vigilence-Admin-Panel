// Police stations and territorial divisions. Same collections as the old
// system (`policestations`, `divisions`) so its verified data carries over
// (docs/14 §2). Phase 0 reads them; editing arrives with phase 2.

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types, type HydratedDocument } from "mongoose";

@Schema({ collection: "divisions", timestamps: true })
export class Division {
  @Prop({ required: true, trim: true, unique: true, type: String }) name: string;
  @Prop({ required: true, trim: true, type: String }) range: string;
  @Prop({ required: true, trim: true, type: String }) province: string;
  @Prop({ type: Boolean, default: true }) isActive: boolean;
}
export type DivisionDocument = HydratedDocument<Division>;
export const DivisionSchema = SchemaFactory.createForClass(Division);

@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, enum: ["Point"], default: "Point" }) type: "Point";
  /** [lng, lat] */
  @Prop({ type: [Number], required: true }) coordinates: number[];
}

/** The area a station is responsible for, drawn by HQ — Polygon or MultiPolygon, [lng, lat]. */
@Schema({ _id: false })
export class Jurisdiction {
  @Prop({ type: String, enum: ["Polygon", "MultiPolygon"], required: true }) type:
    "Polygon" | "MultiPolygon";
  @Prop({ type: Array, required: true }) coordinates: unknown[];
}

@Schema({ collection: "policestations", timestamps: true })
export class Station {
  @Prop({ required: true, trim: true, type: String }) name: string;
  @Prop({ type: Types.ObjectId, ref: Division.name, default: null, index: true })
  divisionId: Types.ObjectId | null;
  @Prop({ type: String, default: "" }) address: string;
  @Prop({ type: String, default: "" }) phone: string;
  @Prop({ type: String, default: "" }) email: string;
  @Prop({ type: Boolean, default: true }) isActive: boolean;
  @Prop({ type: Boolean, default: false, index: true }) verified: boolean;
  @Prop({ type: String, default: "manual" }) source: string;
  @Prop({ type: String, default: null }) osmId: string | null;
  @Prop({ type: GeoPoint, required: true }) location: GeoPoint;
  /** No default: an empty shape would break the 2dsphere index (as in the old system). */
  @Prop({ type: Jurisdiction, default: undefined }) jurisdiction?: Jurisdiction;
  @Prop({ type: Number, default: null }) jurisdictionAreaKm2: number | null;
}
export type StationDocument = HydratedDocument<Station>;
export const StationSchema = SchemaFactory.createForClass(Station);
StationSchema.index({ location: "2dsphere" });
StationSchema.index({ jurisdiction: "2dsphere" }, { sparse: true });
StationSchema.index({ name: 1 });

// Versioned settings — docs/09 T2: a change never rewrites history; each value
// has the moment it took effect, so an item keeps the limit that applied when
// it started. Append-only (docs/14 M7).
//
// A new collection rather than the old `settings`: that one allows a single
// row per key and so can't hold history (docs/14 §4.5).

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

@Schema({ collection: "setting_versions", versionKey: false })
export class SettingVersion {
  @Prop({ required: true, type: String }) key: string;
  @Prop({ required: true, type: Number }) value: number;
  @Prop({ required: true, type: Number }) previous: number;
  @Prop({ required: true, type: Date }) effectiveFrom: Date;
  @Prop({ required: true, type: String }) changedBy: string;
  @Prop({ required: true, type: String }) changedByName: string;
  @Prop({ required: true, type: String }) reason: string;
}

export type SettingVersionDocument = HydratedDocument<SettingVersion>;
export const SettingVersionSchema = SchemaFactory.createForClass(SettingVersion);
SettingVersionSchema.index({ key: 1, effectiveFrom: -1 });

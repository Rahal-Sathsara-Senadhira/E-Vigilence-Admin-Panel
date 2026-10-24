// Divisions and police stations — docs/03 §3 (jurisdiction), docs/20 R3.
//
// A station is "verified" once an HQ administrator has confirmed its
// division and map position. Imported stations start unverified: their
// division is only *suggested* (nearest division headquarters), never
// assigned silently. Dispatch (N3) uses verified stations only.

import mongoose from "mongoose";

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    /** [longitude, latitude] — GeoJSON order. */
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const areaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Polygon", "MultiPolygon"], required: true },
    coordinates: { type: Array, required: true },
  },
  { _id: false },
);

const divisionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    range: { type: String, trim: true, default: null },
    province: { type: String, trim: true, default: null },
    /** Approximate headquarters town; used only to suggest divisions for stations. */
    anchor: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export const Division = mongoose.model("Division", divisionSchema, "divisions");

const stationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    divisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Division",
      default: null,
      index: true,
    },
    /** Nearest division headquarters at import — a hint for verification only. */
    suggestedDivisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Division", default: null },
    location: { type: pointSchema, default: null },
    /** The station's area of responsibility, for dispatch (docs/03). */
    area: { type: areaSchema, default: null },
    address: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    isActive: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    source: { type: String, enum: ["osm", "manual", "seed"], default: "manual" },
    osmId: { type: String, default: null },
    /** The Magistrate's Court its cases go to by default (docs/06 D06-1). */
    defaultCourtId: { type: mongoose.Schema.Types.ObjectId, ref: "Court", default: null },
  },
  { timestamps: true, versionKey: false },
);

stationSchema.index({ location: "2dsphere" });
stationSchema.index({ area: "2dsphere" });
stationSchema.index(
  { osmId: 1 },
  { unique: true, partialFilterExpression: { osmId: { $type: "string" } } },
);
stationSchema.index({ name: 1 });

export const Station = mongoose.model("Station", stationSchema, "stations");

/** @typedef {ReturnType<typeof Station.hydrate>} StationDocument */
/** @typedef {ReturnType<typeof Division.hydrate>} DivisionDocument */

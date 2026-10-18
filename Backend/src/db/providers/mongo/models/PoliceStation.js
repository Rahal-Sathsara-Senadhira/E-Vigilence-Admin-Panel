import mongoose from "mongoose";

export const STATION_GRADES = ["A1", "A2", "A3", "B", "C", "D"];
export const STATION_SOURCES = ["seed", "osm", "manual", "csv"];

const PointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: "coordinates must be [lng, lat]",
      },
    },
  },
  { _id: false }
);

const JurisdictionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Polygon", "MultiPolygon"], required: true },
    coordinates: { type: Array, required: true, default: undefined },
  },
  { _id: false }
);

const PoliceStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Optional official station code; unique when set.
    code: { type: String, default: null, trim: true },

    // Territorial division (the regional office). Required to verify a
    // station; imported stations may not have one until HQ assigns it.
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Division", default: null, index: true },
    // Official grading (Sri Lanka Police: A1, A2, A3, B, C, D).
    grade: { type: String, enum: [...STATION_GRADES, null], default: null },

    area: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" }, // +94… when set
    email: { type: String, default: "", trim: true, lowercase: true },
    oicName: { type: String, default: "", trim: true }, // Officer-in-charge

    // Legacy free-text fields kept for older records.
    district: { type: String, default: null },
    province: { type: String, default: null },

    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: String, default: null },
    deactivationReason: { type: String, default: null },

    // Data quality: imported/seeded stations start unverified until HQ
    // confirms the name, pin and division (verification queue).
    verified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    source: { type: String, enum: STATION_SOURCES, default: "manual" },
    osmId: { type: String, default: null }, // e.g. "node/123456"
    // Where OpenStreetMap places this station, when it differs from our
    // pin — offered to HQ in the verification queue, never applied silently.
    osmLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      distanceKm: { type: Number, default: null },
    },

    // GeoJSON Point: coordinates are [lng, lat]
    location: { type: PointSchema, required: true },

    // Area this station is responsible for (drawn by HQ). Dispatch sends a
    // case to the station whose jurisdiction contains it, before falling
    // back to the nearest station. Polygon or MultiPolygon, [lng, lat].
    // No default: an empty shape would break the 2dsphere index.
    jurisdiction: { type: JurisdictionSchema, default: undefined },
    jurisdictionAreaKm2: { type: Number, default: null },
    jurisdictionUpdatedAt: { type: Date, default: null },
    jurisdictionUpdatedBy: { type: String, default: null },
  },
  { timestamps: true, minimize: true }
);

// CRITICAL for $near queries
PoliceStationSchema.index({ location: "2dsphere" });
// Point-in-jurisdiction lookups ($geoIntersects). Stations without a drawn
// jurisdiction are simply not in this index.
PoliceStationSchema.index({ jurisdiction: "2dsphere" }, { sparse: true });
PoliceStationSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);
PoliceStationSchema.index(
  { osmId: 1 },
  { unique: true, partialFilterExpression: { osmId: { $type: "string" } } }
);

export default mongoose.models.PoliceStation || mongoose.model("PoliceStation", PoliceStationSchema);

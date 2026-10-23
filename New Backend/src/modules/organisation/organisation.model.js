// Divisions and police stations — the minimum accounts need (docs/20 R3).
// Phase N1 adds areas, contact details and the management screens.

import mongoose from "mongoose";

const divisionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export const Station = mongoose.model("Station", stationSchema, "stations");

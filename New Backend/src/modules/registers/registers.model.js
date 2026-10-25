// The person and vehicle registers — docs/04 §3, §4. Built from what
// officers find through the usual police channels (we can't query the DMT):
// each trace adds to the record, nothing is overwritten.

import mongoose from "mongoose";

export const PERSON_TYPES = /** @type {const} */ (["individual", "organisation"]);
export const VEHICLE_FLAGS = /** @type {const} */ (["suspected_false_plate", "reported_stolen"]);

const personSchema = new mongoose.Schema(
  {
    type: { type: String, enum: PERSON_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    /** Individuals: old (9 digits + V/X) or new (12 digits) NIC, canonical form. */
    nic: { type: String, default: null },
    /** Organisations: business registration number. */
    businessRegNo: { type: String, default: null },
    licenceNumber: { type: String, default: null },
    /** Required to serve a penalty notice (docs/04 §4). */
    address: { type: String, default: null, trim: true },
    phone: { type: String, default: null },
    createdBy: { type: String, required: true },
    /** Corrections, newest last (V5). */
    changes: {
      type: [
        new mongoose.Schema(
          { at: Date, by: String, fields: [String], reason: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Personal details removed at the end of retention (docs/10 §6); the record stays for its links. */
    anonymisedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
// One record per identifier (P1): searched before every create.
for (const field of ["nic", "businessRegNo", "licenceNumber"]) {
  personSchema.index(
    { [field]: 1 },
    { unique: true, partialFilterExpression: { [field]: { $type: "string" } } },
  );
}
personSchema.index({ name: "text" });

const ownershipSchema = new mongoose.Schema(
  {
    personId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", required: true },
    from: { type: Date, required: true },
    /** null while current. */
    to: { type: Date, default: null },
    dmtReference: { type: String, default: null },
    recordedBy: { type: String, required: true },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

const vehicleSchema = new mongoose.Schema(
  {
    /** Canonical Sri Lankan form, e.g. "WP CAB-1234". */
    plate: { type: String, required: true, unique: true },
    type: { type: String, default: null },
    make: { type: String, default: null, trim: true },
    model: { type: String, default: null, trim: true },
    colour: { type: String, default: null, trim: true },
    /** Owners over time, oldest first (V3: added, never overwritten). */
    ownership: { type: [ownershipSchema], default: [] },
    /** When an officer last checked the owner with the registry (V2). */
    lastCheckedAt: { type: Date, default: null },
    checks: {
      type: [
        new mongoose.Schema(
          {
            at: Date,
            by: String,
            dmtReference: String,
            checkedOn: Date,
            caseNumber: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    flags: {
      type: [
        new mongoose.Schema(
          {
            type: { type: String, enum: VEHICLE_FLAGS, required: true },
            note: { type: String, required: true },
            reference: { type: String, default: null },
            /** Stolen: offences after this date are not the owner's (docs/04 §8). */
            since: { type: Date, default: null },
            at: { type: Date, required: true },
            by: { type: String, required: true },
            clearedAt: { type: Date, default: null },
            clearedBy: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);

export const Person = mongoose.model("Person", personSchema, "persons");
export const Vehicle = mongoose.model("Vehicle", vehicleSchema, "vehicles");

/** @typedef {ReturnType<typeof Person.hydrate>} PersonDocument */
/** @typedef {ReturnType<typeof Vehicle.hydrate>} VehicleDocument */

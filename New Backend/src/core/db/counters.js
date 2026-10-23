// Gap-free sequence numbers (audit log, and later RP-, TC-, PN- numbers).
// Taken inside the caller's transaction, so a rolled-back write gives its
// number back.

import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, value: { type: Number, required: true } },
  { versionKey: false },
);

export const Counter = mongoose.model("Counter", counterSchema, "counters");

/**
 * @param {string} name
 * @param {import("mongoose").ClientSession} [session]
 * @returns {Promise<number>}
 */
export async function nextNumber(name, session) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session },
  ).lean();
  return /** @type {{ value: number }} */ (doc).value;
}

import mongoose from "mongoose";

// Atomic sequence counters, keyed by name (e.g. "citation-2026"). Incremented
// with a single findOneAndUpdate($inc) so concurrent callers never get the
// same value — unlike counting existing documents and adding one.
const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: "counters", versionKey: false }
);

const Counter = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
export default Counter;

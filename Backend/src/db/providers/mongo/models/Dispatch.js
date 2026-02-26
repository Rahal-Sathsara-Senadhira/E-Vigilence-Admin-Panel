import mongoose from "mongoose";

const DispatchSchema = new mongoose.Schema(
  {
    violation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Violation",
      required: true,
      unique: true, // prevent double dispatch per violation
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      required: true,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sentAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["sent", "failed"], default: "sent" },
  },
  { timestamps: true }
);

export default mongoose.model("Dispatch", DispatchSchema);
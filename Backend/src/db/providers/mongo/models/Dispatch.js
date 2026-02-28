import mongoose from "mongoose";

const DispatchSchema = new mongoose.Schema(
  {
    violation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Violation",
      required: true,
      index: true,
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      required: true,
      index: true,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["sent", "received", "in_progress", "resolved"],
      default: "sent",
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

DispatchSchema.index({ station: 1, createdAt: -1 });
DispatchSchema.index({ violation: 1, createdAt: -1 });

export default mongoose.model("Dispatch", DispatchSchema);
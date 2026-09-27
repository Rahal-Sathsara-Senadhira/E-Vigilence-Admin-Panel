import mongoose from "mongoose";

// Read-mostly mirror of the schema owned by the separate citizen-reporting
// app (github.com/Pasan-Liyanage/E-Vigilance-Client), which writes to this
// same shared database's `reports` collection. This repo never creates
// documents here — it only reads them (to mirror into Violation, see
// citizenReportSync.js) and patches `status` back (see violationStatus.js's
// toCitizenStatus, used from violations.controller.js / dispatch.service.js)
// so the citizen app reflects HQ/station progress.
//
// Field shapes are intentionally loose (nothing required) — this app is not
// the owner of this schema and must not fail to read a document just because
// the citizen app's shape shifts slightly.
const MediaSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    kind: { type: String, default: null }, // 'image' | 'video' | 'audio'
    mimeType: { type: String, default: null },
    storage: { type: String, default: null }, // 'cloudinary' | 'gridfs'
  },
  { _id: false }
);

const CitizenReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    evidencePath: { type: String, default: null },
    evidence: { type: [MediaSchema], default: [] },
    voiceNote: { type: MediaSchema, default: null },

    vehicleType: { type: String, default: null },
    vehicleNumber: { type: String, default: null },
    vehicleModel: { type: String, default: null },

    dateTime: { type: Date, default: null },
    issueType: { type: String, default: null },

    location: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    additionalDetails: { type: String, default: null },

    // Owned by the citizen app: In Progress | Completed | Rejected
    status: { type: String, default: "In Progress" },
  },
  { timestamps: true, collection: "reports" }
);

const CitizenReport =
  mongoose.models.CitizenReport ||
  mongoose.model("CitizenReport", CitizenReportSchema);

export default CitizenReport;

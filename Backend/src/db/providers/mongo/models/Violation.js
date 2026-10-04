import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema(
  {
    // Not required at the schema level: citizen reports synced in from the
    // shared `reports` collection (see citizenReportSync.js) can have no GPS
    // fix. The HTTP create route (violations.validation.js#validateCreate)
    // still requires lat/lng or a DMS string for manually-created violations.
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    dms: { type: String, default: null },
  },
  { _id: false }
);

const ViolationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    // Denormalized from violations[0]'s catalog entry name (see
    // utils/violationCatalog.js) — kept as a plain string rather than a
    // populated ref so dashboard.service.js / reports.service.js's existing
    // `$group: { _id: "$type" }` aggregations don't need rewriting.
    type: { type: String, required: true, trim: true },

    // References into ViolationCatalogEntry (VIOLATIONS_BUSINESS_LOGIC.md #1)
    // — used to be free-typed strings, which is how "traffic" and "Traffic"
    // ended up as two different categories. Resolved via
    // utils/violationCatalog.js#resolveCatalogEntries, never written
    // directly from client-supplied strings.
    violations: [{ type: mongoose.Schema.Types.ObjectId, ref: "ViolationCatalogEntry" }],

    description: { type: String, default: "" },

    location: { type: LocationSchema, required: true },

    reported_by: { type: String, default: null },
    status: { type: String, default: "pending" },

    // Set when a status transition to "rejected" requires a reason
    // (utils/violationWorkflow.js) — not used for any other status.
    rejectionReason: { type: String, default: null },

    // Structured identifying fields — these used to be collected on the New
    // Complaint form and then silently dropped (never read by the create
    // controller), so the frontend defensively stuffed them into free-text
    // `description` as a workaround. Real fields now.
    vehicleNumber: { type: String, default: null, uppercase: true, trim: true, index: true },
    vehicleType: { type: String, default: null, trim: true },
    callerMobile: { type: String, default: null, trim: true },

    // ✅ Evidence: images, videos, audios (URLs)
    images: [{ type: String }],
    videos: [{ type: String }],
    audios: [{ type: String }],

    // ✅ Station access control (added without changing existing behavior)
    assignedStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      default: null,
    },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: String, default: null },
    stationNote: { type: String, default: "" },

    // Audit trail: one entry per status/note change, oldest first.
    statusHistory: [
      {
        status: { type: String, required: true },
        note: { type: String, default: "" },
        changedBy: { type: String, default: null },
        changedByRole: { type: String, default: null },
        changedAt: { type: Date, default: Date.now },
      },
    ],

    // Populated by a coarse same-type/place/time check at creation time.
    possibleDuplicateOf: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Violation" },
    ],

    // Set when this Violation was mirrored from the citizen app's shared
    // `reports` collection (see citizenReportSync.js) — also the de-dup key
    // that stops a report from being imported twice.
    sourceReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CitizenReport",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

ViolationSchema.index({ type: 1, createdAt: -1 });

const Violation = mongoose.models.Violation || mongoose.model("Violation", ViolationSchema);
export default Violation;
import Citation from "../../db/providers/mongo/models/Citation.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import { HttpError } from "../../utils/httpError.js";

// What HQ may set by hand — "void" is system-only (see citations.service.js).
const MANUAL_PAYMENT_STATUSES = ["unpaid", "paid", "appealed", "waived"];
const FILTERABLE_PAYMENT_STATUSES = [...MANUAL_PAYMENT_STATUSES, "void"];

// Allowed manual moves. "paid" and "waived" are final — money received or
// forgiven isn't silently undone (an overturned verification voids the
// citation instead, keeping the prior status for any refund). An appeal is
// either rejected (back to unpaid), upheld (waived), or settled (paid).
const PAYMENT_TRANSITIONS = {
  unpaid: ["paid", "appealed", "waived"],
  appealed: ["unpaid", "paid", "waived"],
  paid: [],
  waived: [],
};

// Forgiving a fine, recording an appeal, or deciding one needs a written
// reason on the record.
function noteRequired(from, to) {
  return to === "waived" || to === "appealed" || from === "appealed";
}

// Overdue is derived, not stored: unpaid past its due date. An appealed
// citation is on hold, so it isn't overdue while the appeal is open.
function isOverdue(doc, now = new Date()) {
  return doc.paymentStatus === "unpaid" && !!doc.dueDate && new Date(doc.dueDate) < now;
}

function toId(doc) {
  if (!doc) return null;
  const x = { ...doc };
  x.id = String(x._id);
  delete x._id;
  x.isOverdue = isOverdue(doc);
  x.allowedPaymentStatuses = x.voidedAt ? [] : PAYMENT_TRANSITIONS[x.paymentStatus] || [];
  return x;
}

// HQ sees every citation; a station account only those tied to violations
// assigned to its own station (same scoping as violations.controller.js).
// Returns the station id to scope by, or null for HQ. Any other role, or a
// station account with no station, is refused — otherwise a missing
// stationId would match every *unassigned* violation's citations.
function stationScopeFor(user) {
  if (user?.role === "hq") return null;

  const isStationRole = user?.role === "station_admin" || user?.role === "station_officer";
  if (!isStationRole || !user.stationId) throw new HttpError(403, "Forbidden");

  return String(user.stationId);
}

export async function list(req, res) {
  const scopedStation = stationScopeFor(req.user);

  const filter = {};

  if (scopedStation) {
    const stationViolations = await Violation.find({ assignedStation: scopedStation })
      .select("_id")
      .lean();
    filter.violation = { $in: stationViolations.map((v) => v._id) };
  }

  if (req.query.paymentStatus === "overdue") {
    filter.paymentStatus = "unpaid";
    filter.dueDate = { $lt: new Date() };
  } else if (FILTERABLE_PAYMENT_STATUSES.includes(req.query.paymentStatus)) {
    filter.paymentStatus = req.query.paymentStatus;
  }

  const rows = await Citation.find(filter)
    .populate({ path: "violation", select: "title type vehicleNumber status" })
    .sort({ createdAt: -1 })
    .lean();

  res.json(rows.map(toId));
}

export async function getOne(req, res) {
  const scopedStation = stationScopeFor(req.user);

  const row = await Citation.findById(req.params.id)
    .populate({ path: "violation", select: "title type vehicleNumber status assignedStation" })
    .lean();
  if (!row) throw new HttpError(404, "Citation not found");

  // 404 rather than 403 so a station can't probe which ids exist elsewhere.
  if (scopedStation && String(row.violation?.assignedStation || "") !== scopedStation) {
    throw new HttpError(404, "Citation not found");
  }

  res.json(toId(row));
}

// HQ-only: move a citation along PAYMENT_TRANSITIONS — no payment gateway
// exists in this codebase, this is intentionally a manual field. Every change
// is appended to paymentHistory. A voided citation is closed for good.
export async function updatePaymentStatus(req, res) {
  const { paymentStatus } = req.body || {};
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

  if (!MANUAL_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new HttpError(
      400,
      `paymentStatus must be one of: ${MANUAL_PAYMENT_STATUSES.join(", ")}`
    );
  }

  const existing = await Citation.findById(req.params.id).select("voidedAt paymentStatus").lean();
  if (!existing) throw new HttpError(404, "Citation not found");
  if (existing.voidedAt) {
    throw new HttpError(409, "This citation has been voided and can no longer be updated");
  }

  const from = existing.paymentStatus;
  if (from === paymentStatus) {
    throw new HttpError(400, `Citation is already ${from}`);
  }
  if (!(PAYMENT_TRANSITIONS[from] || []).includes(paymentStatus)) {
    throw new HttpError(409, `A ${from} citation can't be changed to ${paymentStatus}`);
  }
  if (noteRequired(from, paymentStatus) && !note) {
    throw new HttpError(400, `A note is required to change a citation from ${from} to ${paymentStatus}`);
  }

  // Conditional on the status just checked, so two concurrent changes can't
  // both apply.
  const updated = await Citation.findOneAndUpdate(
    { _id: req.params.id, voidedAt: { $exists: false }, paymentStatus: from },
    {
      $set: { paymentStatus },
      $push: {
        paymentHistory: {
          from,
          to: paymentStatus,
          note: note || null,
          changedBy: req.user?.id ? String(req.user.id) : null,
          changedAt: new Date(),
        },
      },
    },
    { new: true }
  )
    .populate({ path: "violation", select: "title type vehicleNumber status" })
    .lean();

  if (!updated) {
    throw new HttpError(409, "This citation was changed by someone else — reload and try again");
  }
  res.json(toId(updated));
}

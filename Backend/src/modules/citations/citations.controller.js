import Citation from "../../db/providers/mongo/models/Citation.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import { HttpError } from "../../utils/httpError.js";

// What HQ may set by hand — "void" is system-only (see citations.service.js).
const MANUAL_PAYMENT_STATUSES = ["unpaid", "paid", "appealed", "waived"];
const FILTERABLE_PAYMENT_STATUSES = [...MANUAL_PAYMENT_STATUSES, "void"];

function toId(doc) {
  if (!doc) return null;
  const x = { ...doc };
  x.id = String(x._id);
  delete x._id;
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

  if (FILTERABLE_PAYMENT_STATUSES.includes(req.query.paymentStatus)) {
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

// HQ-only: mark a citation paid/appealed/waived — no payment gateway exists
// in this codebase, this is intentionally a manual field. A voided citation
// is closed and can't be moved back into a payable state.
export async function updatePaymentStatus(req, res) {
  const { paymentStatus } = req.body || {};

  if (!MANUAL_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new HttpError(
      400,
      `paymentStatus must be one of: ${MANUAL_PAYMENT_STATUSES.join(", ")}`
    );
  }

  const existing = await Citation.findById(req.params.id).select("voidedAt").lean();
  if (!existing) throw new HttpError(404, "Citation not found");
  if (existing.voidedAt) {
    throw new HttpError(409, "This citation has been voided and can no longer be updated");
  }

  const updated = await Citation.findOneAndUpdate(
    { _id: req.params.id, voidedAt: { $exists: false } },
    { $set: { paymentStatus } },
    { new: true }
  )
    .populate({ path: "violation", select: "title type vehicleNumber status" })
    .lean();

  if (!updated) {
    throw new HttpError(409, "This citation has been voided and can no longer be updated");
  }
  res.json(toId(updated));
}

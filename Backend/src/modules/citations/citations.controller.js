import Citation from "../../db/providers/mongo/models/Citation.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import { HttpError } from "../../utils/httpError.js";

function toId(doc) {
  if (!doc) return null;
  const x = { ...doc };
  x.id = String(x._id);
  delete x._id;
  return x;
}

// HQ sees every citation; a station account only sees citations tied to
// violations assigned to their own station (same scoping pattern
// dashboard.service.js already uses for Violations).
export async function list(req, res) {
  const role = req.user?.role;
  const stationId = req.user?.stationId || null;

  const filter = {};

  if (role !== "hq") {
    const stationViolations = await Violation.find({ assignedStation: stationId })
      .select("_id")
      .lean();
    filter.violation = { $in: stationViolations.map((v) => v._id) };
  }

  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

  const rows = await Citation.find(filter)
    .populate({ path: "violation", select: "title type vehicleNumber status" })
    .sort({ createdAt: -1 })
    .lean();

  res.json(rows.map(toId));
}

export async function getOne(req, res) {
  const row = await Citation.findById(req.params.id)
    .populate({ path: "violation", select: "title type vehicleNumber status" })
    .lean();
  if (!row) throw new HttpError(404, "Citation not found");
  res.json(toId(row));
}

// HQ-only: mark a citation paid/appealed/waived — no payment gateway exists
// in this codebase, this is intentionally a manual field.
export async function updatePaymentStatus(req, res) {
  const { paymentStatus } = req.body || {};
  const allowed = ["unpaid", "paid", "appealed", "waived"];

  if (!allowed.includes(paymentStatus)) {
    throw new HttpError(400, `paymentStatus must be one of: ${allowed.join(", ")}`);
  }

  const updated = await Citation.findByIdAndUpdate(
    req.params.id,
    { $set: { paymentStatus } },
    { new: true }
  )
    .populate({ path: "violation", select: "title type vehicleNumber status" })
    .lean();

  if (!updated) throw new HttpError(404, "Citation not found");
  res.json(toId(updated));
}

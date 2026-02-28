// src/modules/dispatch/dispatch.service.js

import Dispatch from "../../db/providers/mongo/models/Dispatch.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";

/**
 * Dispatch nearest station for a violation.
 * - Creates/updates Dispatch document (upsert)
 * - ALWAYS updates Violation.assignedStation to match latest dispatch (important!)
 */
export async function dispatchNearestStationForViolation(violationId, userId = null) {
  const violation = await Violation.findById(violationId);
  if (!violation) {
    const err = new Error("Violation not found");
    err.status = 404;
    throw err;
  }

  const lat = violation?.location?.lat;
  const lng = violation?.location?.lng;

  if (lat == null || lng == null) {
    const err = new Error("Violation has no lat/lng location");
    err.status = 400;
    throw err;
  }

  // Find nearest station using geoNear ($near)
  const station = await PoliceStation.findOne({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
      },
    },
  });

  if (!station) {
    const err = new Error("No police station found near this violation");
    err.status = 404;
    throw err;
  }

  // ✅ Upsert dispatch record for this violation
  const dispatch = await Dispatch.findOneAndUpdate(
    { violation: violation._id },
    {
      $set: {
        station: station._id,
        sentBy: userId || null,
        sentAt: new Date(),
        status: "sent",
      },
      $setOnInsert: {
        violation: violation._id,
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // ✅ IMPORTANT: ALWAYS update the violation assignment to match latest dispatch
  violation.assignedStation = station._id;
  violation.assignedAt = new Date();
  violation.assignedBy = userId ? String(userId) : null;
  await violation.save();

  return { dispatch, station };
}

/**
 * Inbox:
 * - HQ/admin see all dispatches
 * - station users see only dispatches sent to their station
 */
export async function getInboxDispatchesForUser(user) {
  const role = user?.role;
  const stationId = user?.stationId || null;

  const isHQ = role === "hq" || role === "admin";
  const filter = isHQ ? {} : { station: stationId };

  return Dispatch.find(filter)
    .populate("violation")
    .populate("station")
    .sort({ createdAt: -1 });
}

/**
 * ✅ BEST / FIXED:
 * Station assigned violations should be derived from Dispatch collection
 * so re-dispatch and station filtering NEVER breaks.
 */
export async function getAssignedViolationsForStation(stationId) {
  const dispatches = await Dispatch.find({ station: stationId })
    .populate("violation")
    .sort({ createdAt: -1 })
    .lean();

  return dispatches
    .map((d) => d.violation)
    .filter(Boolean);
}

/**
 * Latest dispatch for a given violation (for Violation Details page)
 */
export async function getLatestDispatchForViolation(violationId) {
  return Dispatch.findOne({ violation: violationId })
    .populate("station")
    .populate("violation")
    .sort({ createdAt: -1 });
}

/**
 * Station updates violation status/note (still uses assignedStation check)
 * Since we now ALWAYS update assignedStation during dispatch, this becomes reliable.
 */
function normalizeStationStatus(input) {
  const s = String(input || "").trim().toLowerCase();
  if (s === "under_review") return "in_review";
  if (s === "closed") return "resolved";
  return s;
}

export async function stationUpdateViolationForStation({
  violationId,
  stationId,
  status,
  stationNote,
}) {
  const v = await Violation.findById(violationId);
  if (!v) {
    const err = new Error("Violation not found");
    err.status = 404;
    throw err;
  }

  // Only assigned station can update
  if (!v.assignedStation || String(v.assignedStation) !== String(stationId)) {
    const err = new Error("Not allowed (different station)");
    err.status = 403;
    throw err;
  }

  if (typeof status !== "undefined") {
    const norm = normalizeStationStatus(status);
    const allowed = new Set([
      "open",
      "pending",
      "in_review",
      "resolved",
      "verified",
      "rejected",
    ]);
    if (!allowed.has(norm)) {
      const err = new Error(`Invalid status: ${status}`);
      err.status = 400;
      throw err;
    }
    v.status = norm;
  }

  if (typeof stationNote !== "undefined") {
    v.stationNote = String(stationNote || "");
  }

  await v.save();
  return v;
}
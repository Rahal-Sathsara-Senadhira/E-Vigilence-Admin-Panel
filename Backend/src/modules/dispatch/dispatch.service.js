// src/modules/dispatch/dispatch.service.js

import Dispatch from "../../db/providers/mongo/models/Dispatch.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import { normalizeStatus } from "../../utils/violationStatus.js";
import { syncStatusToCitizenReport } from "../violations/citizenReportSync.js";

/**
 * Shared by both the auto-nearest and manual-override dispatch paths:
 * upsert the Dispatch record and stamp the Violation's assignment.
 */
async function assignViolationToStation(violation, station, userId) {
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

  violation.assignedStation = station._id;
  violation.assignedAt = new Date();
  violation.assignedBy = userId ? String(userId) : null;
  await violation.save();

  return { dispatch, station };
}

/**
 * Dispatch nearest ACTIVE station for a violation.
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

  // Find nearest ACTIVE station using geoNear ($near)
  const station = await PoliceStation.findOne({
    isActive: { $ne: false },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
      },
    },
  });

  if (!station) {
    const err = new Error("No active police station found near this violation");
    err.status = 404;
    throw err;
  }

  return assignViolationToStation(violation, station, userId);
}

/**
 * Manual override: HQ picks a specific station instead of the nearest one
 * (e.g. for jurisdiction reasons). Rejects inactive/missing stations.
 */
export async function dispatchToStation(violationId, stationId, userId = null) {
  const violation = await Violation.findById(violationId);
  if (!violation) {
    const err = new Error("Violation not found");
    err.status = 404;
    throw err;
  }

  const station = await PoliceStation.findOne({
    _id: stationId,
    isActive: { $ne: false },
  });

  if (!station) {
    const err = new Error("Station not found or inactive");
    err.status = 404;
    throw err;
  }

  return assignViolationToStation(violation, station, userId);
}

/**
 * Inbox:
 * - HQ sees all dispatches
 * - station users see only dispatches sent to their station
 */
export async function getInboxDispatchesForUser(user) {
  const role = user?.role;
  const stationId = user?.stationId || null;

  const isHQ = role === "hq";
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
export async function stationUpdateViolationForStation({
  violationId,
  stationId,
  status,
  stationNote,
  userId = null,
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

  let statusChanged = false;

  if (typeof status !== "undefined") {
    const norm = normalizeStatus(status);
    if (!norm) {
      const err = new Error(`Invalid status: ${status}`);
      err.status = 400;
      throw err;
    }
    v.status = norm;
    statusChanged = true;
  }

  if (typeof stationNote !== "undefined") {
    v.stationNote = String(stationNote || "");
  }

  if (statusChanged) {
    v.statusHistory.push({
      status: v.status,
      note: v.stationNote || "",
      changedBy: userId ? String(userId) : null,
      changedByRole: "station",
      changedAt: new Date(),
    });
  }

  await v.save();

  if (statusChanged && v.sourceReportId) {
    await syncStatusToCitizenReport(v.sourceReportId, v.status);
  }

  return v;
}
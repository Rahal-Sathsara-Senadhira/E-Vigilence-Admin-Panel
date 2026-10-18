// src/modules/dispatch/dispatch.service.js

import Dispatch from "../../db/providers/mongo/models/Dispatch.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import User from "../../db/providers/mongo/models/User.js";
import { distanceKm } from "../../utils/geo.js";
import { slaState, notifyHq } from "./dispatchSla.js";
import { normalizeStatus } from "../../utils/violationStatus.js";
import { syncStatusToCitizenReport } from "../violations/citizenReportSync.js";
import {
  assertValidTransition,
  assertRequiredFieldsForTransition,
  assertDifferentReviewer,
} from "../../utils/violationWorkflow.js";
import {
  assertCitationCanBeIssued,
  createCitationForVerifiedViolation,
} from "../citations/citations.service.js";

// A violation can only be sent to (or moved between) stations while it is
// still being worked on — once verified, resolved or rejected the case is
// closed, and re-dispatching would hand it to a station that can't act on it.
const DISPATCHABLE_STATUSES = new Set(["open", "pending", "in_review"]);
const STATION_ROLES = ["station_admin", "station_officer"];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function assertDispatchable(violation) {
  if (!DISPATCHABLE_STATUSES.has(violation.status)) {
    throw httpError(409, `A ${violation.status} violation can't be dispatched — reopen it first`);
  }
}

async function activeOfficerCount(stationId) {
  return User.countDocuments({ stationId, isActive: true, role: { $in: STATION_ROLES } });
}

// Warnings worth raising for a dispatch to `station`.
async function dispatchFlags(station, extra = {}) {
  return {
    overlappingJurisdictions: !!extra.overlappingJurisdictions,
    unverifiedStation: station.verified !== true,
    noActiveOfficers: (await activeOfficerCount(station._id)) === 0,
  };
}

/**
 * Which station a case at (lat, lng) belongs to:
 *   1. an active station whose drawn jurisdiction contains the point (if
 *      several overlap, the smallest area wins and the overlap is flagged);
 *   2. otherwise the nearest active station.
 * `excludeStationId` skips one station (e.g. the one being deactivated).
 * Returns { station, method, distanceKm, overlappingJurisdictions } or null.
 */
export async function chooseStationFor(lat, lng, { excludeStationId = null } = {}) {
  const point = { type: "Point", coordinates: [lng, lat] };
  const exclude = excludeStationId ? { _id: { $ne: excludeStationId } } : {};

  const containing = await PoliceStation.find({
    ...exclude,
    isActive: true,
    jurisdiction: { $geoIntersects: { $geometry: point } },
  })
    .sort({ jurisdictionAreaKm2: 1 })
    .limit(5);

  if (containing.length > 0) {
    const station = containing[0];
    const [sLng, sLat] = station.location.coordinates;
    return {
      station,
      method: "jurisdiction",
      distanceKm: Math.round(distanceKm({ lat, lng }, { lat: sLat, lng: sLng }) * 100) / 100,
      overlappingJurisdictions: containing.length > 1,
    };
  }

  const station = await PoliceStation.findOne({
    ...exclude,
    isActive: true,
    location: { $near: { $geometry: point } },
  });
  if (!station) return null;

  const [sLng, sLat] = station.location.coordinates;
  return {
    station,
    method: "nearest",
    distanceKm: Math.round(distanceKm({ lat, lng }, { lat: sLat, lng: sLng }) * 100) / 100,
    overlappingJurisdictions: false,
  };
}

/**
 * Upserts the violation's Dispatch (keeping the previous assignment in
 * `history`) and stamps the Violation's assignment. Used by every dispatch
 * path: auto (jurisdiction/nearest), manual, station-created, reassignment.
 */
export async function assignViolationToStation(
  violation,
  station,
  userId,
  { method = "manual", distanceKm: km = null, flags = null, received = false, endedReason = "redispatched" } = {}
) {
  const now = new Date();
  const previous = await Dispatch.findOne({ violation: violation._id }).lean();

  const update = {
    $set: {
      station: station._id,
      sentBy: userId || null,
      sentAt: now,
      status: received ? "received" : "sent",
      method,
      distanceKm: km,
      flags: flags || (await dispatchFlags(station)),
      receivedAt: received ? now : null,
      receivedBy: received && userId ? String(userId) : null,
      returnedAt: null,
      returnedBy: null,
      returnReason: null,
      slaAlerts: { unacknowledgedAt: null, overdueAt: null },
    },
    $setOnInsert: { violation: violation._id, createdAt: now },
  };
  if (previous) {
    update.$push = {
      history: {
        station: previous.station,
        status: previous.status,
        method: previous.method,
        sentAt: previous.sentAt,
        sentBy: previous.sentBy ? String(previous.sentBy) : null,
        receivedAt: previous.receivedAt,
        returnedAt: previous.returnedAt,
        returnReason: previous.returnReason,
        endedAt: now,
        endedReason: previous.status === "returned" ? "returned" : endedReason,
      },
    };
  }

  const dispatch = await Dispatch.findOneAndUpdate({ violation: violation._id }, update, {
    upsert: true,
    new: true,
  });

  violation.assignedStation = station._id;
  violation.assignedAt = now;
  violation.assignedBy = userId ? String(userId) : null;
  await violation.save();

  return { dispatch, station };
}

async function loadDispatchableViolation(violationId) {
  const violation = await Violation.findById(violationId);
  if (!violation) throw httpError(404, "Violation not found");
  assertDispatchable(violation);
  return violation;
}

/**
 * Auto dispatch: the station whose jurisdiction contains the case, else the
 * nearest active station (see chooseStationFor). Kept under its original
 * name — the route is still /dispatch-nearest.
 */
export async function dispatchNearestStationForViolation(violationId, userId = null) {
  const violation = await loadDispatchableViolation(violationId);

  const lat = violation?.location?.lat;
  const lng = violation?.location?.lng;
  if (lat == null || lng == null) {
    throw httpError(
      400,
      "This violation has no map location yet. Set its location on the map, or choose a station manually."
    );
  }

  const choice = await chooseStationFor(lat, lng);
  if (!choice) throw httpError(404, "No active police station found near this violation");

  const flags = await dispatchFlags(choice.station, choice);
  return assignViolationToStation(violation, choice.station, userId, {
    method: choice.method,
    distanceKm: choice.distanceKm,
    flags,
  });
}

/**
 * Manual override: HQ picks a specific station (e.g. for jurisdiction
 * reasons). Rejects inactive/missing stations. `options.method` lets the
 * station-created complaint path record itself (and mark it received —
 * the station filed it, so there's nothing to acknowledge).
 */
export async function dispatchToStation(violationId, stationId, userId = null, options = {}) {
  const violation = await loadDispatchableViolation(violationId);

  const station = await PoliceStation.findOne({ _id: stationId, isActive: true });
  if (!station) throw httpError(404, "Station not found or inactive");

  let km = null;
  if (violation.location?.lat != null && violation.location?.lng != null) {
    const [sLng, sLat] = station.location.coordinates;
    km = Math.round(distanceKm(violation.location, { lat: sLat, lng: sLng }) * 100) / 100;
  }

  return assignViolationToStation(violation, station, userId, {
    method: options.method || "manual",
    distanceKm: km,
    received: options.method === "station_created",
    endedReason: options.endedReason,
  });
}

/**
 * Inbox:
 * - HQ sees all dispatches
 * - station users see only dispatches currently with their station
 *   (a case returned to HQ leaves their inbox)
 */
export async function getInboxDispatchesForUser(user) {
  const isHQ = user?.role === "hq";
  const filter = isHQ ? {} : { station: user?.stationId || null, status: { $ne: "returned" } };

  return Dispatch.find(filter).populate("violation").populate("station").sort({ createdAt: -1 });
}

/**
 * Violations currently assigned to a station, each with its dispatch state
 * ({ status, sentAt, receivedAt, method, flags, sla }) so the station can
 * accept or return it.
 */
export async function getAssignedViolationsForStation(stationId) {
  const dispatches = await Dispatch.find({ station: stationId, status: { $ne: "returned" } })
    .populate("violation")
    .sort({ createdAt: -1 })
    .lean();

  return dispatches
    .filter((d) => d.violation)
    .map((d) => ({
      ...d.violation,
      dispatch: {
        status: d.status,
        sentAt: d.sentAt,
        receivedAt: d.receivedAt,
        method: d.method,
        flags: d.flags,
        sla: slaState(d),
      },
    }));
}

/**
 * The assigned station acknowledges a dispatched case ("Accept").
 */
export async function receiveDispatch({ violationId, stationId, userId }) {
  const dispatch = await Dispatch.findOne({ violation: violationId });
  if (!dispatch || String(dispatch.station) !== String(stationId) || dispatch.status === "returned") {
    throw httpError(403, "This case isn't assigned to your station");
  }
  if (dispatch.status !== "sent") return dispatch; // already accepted — no-op

  dispatch.status = "received";
  dispatch.receivedAt = new Date();
  dispatch.receivedBy = userId ? String(userId) : null;
  await dispatch.save();
  return dispatch;
}

/**
 * The assigned station sends a misrouted case back to HQ ("not our
 * jurisdiction"). Only before work starts (case open/pending). The case
 * becomes unassigned — it shows in HQ's "Unassigned" queue — and HQ is
 * notified. Returns are counted per station, which shows where
 * jurisdictions need fixing.
 */
export async function returnDispatchToHq({ violationId, stationId, userId, userRole, reason }) {
  const text = String(reason ?? "").trim();
  if (text.length < 10) throw httpError(400, "Say why this case isn't for your station (at least 10 characters)");

  const v = await Violation.findById(violationId);
  if (!v) throw httpError(404, "Violation not found");
  if (!v.assignedStation || String(v.assignedStation) !== String(stationId)) {
    throw httpError(403, "Not allowed (different station)");
  }
  if (!["open", "pending"].includes(v.status)) {
    throw httpError(409, "Only cases that haven't been worked on yet can be returned");
  }

  const dispatch = await Dispatch.findOne({ violation: v._id });
  const now = new Date();
  if (dispatch) {
    dispatch.status = "returned";
    dispatch.returnedAt = now;
    dispatch.returnedBy = userId ? String(userId) : null;
    dispatch.returnReason = text;
    await dispatch.save();
  }

  const station = await PoliceStation.findById(stationId).select("name").lean();
  v.assignedStation = null;
  v.assignedAt = null;
  v.assignedBy = null;
  v.statusHistory.push({
    status: v.status,
    note: `Returned to HQ by ${station?.name ?? "station"}: ${text}`,
    changedBy: userId ? String(userId) : null,
    changedByRole: userRole || "station",
    changedAt: now,
  });
  await v.save();

  await notifyHq({
    title: "Case returned by a station",
    message: `${station?.name ?? "A station"} returned “${v.title}”: ${text}`,
    meta: { kind: "dispatch_returned", violationId: String(v._id), stationId: String(stationId) },
  });

  return v;
}

// Keeps the dispatch status in step with the violation's workflow status.
async function syncDispatchWithViolation(violationId, violationStatus, userId) {
  const dispatch = await Dispatch.findOne({ violation: violationId });
  if (!dispatch || dispatch.status === "returned") return;

  if (violationStatus === "in_review" && ["sent", "received"].includes(dispatch.status)) {
    dispatch.status = "in_progress";
    if (!dispatch.receivedAt) {
      dispatch.receivedAt = new Date();
      dispatch.receivedBy = userId ? String(userId) : null;
    }
  } else if (["verified", "resolved", "rejected"].includes(violationStatus)) {
    dispatch.status = "resolved";
  } else {
    return;
  }
  await dispatch.save();
}
export { syncDispatchWithViolation };

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
  rejectionReason,
  userId = null,
  userRole = null,
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
  let nowVerified = false;

  if (typeof status !== "undefined") {
    const norm = normalizeStatus(status);
    if (!norm) {
      const err = new Error(`Invalid status: ${status}`);
      err.status = 400;
      throw err;
    }

    try {
      assertValidTransition(v.status, norm, userRole);
      assertRequiredFieldsForTransition(norm, v, { rejectionReason });
      if (norm === "verified" && v.status !== "verified") assertDifferentReviewer(v, userId);
      if (norm === "verified") await assertCitationCanBeIssued(v.violations);
    } catch (e) {
      const err = new Error(e.message);
      err.status = e.statusCode || 500;
      throw err;
    }

    v.status = norm;
    statusChanged = true;
    nowVerified = norm === "verified";
  }

  if (typeof stationNote !== "undefined") {
    v.stationNote = String(stationNote || "");
  }

  // Only recorded as part of a rejection — otherwise a station could rewrite
  // the stated reason on a violation without rejecting anything.
  if (statusChanged && v.status === "rejected") {
    v.rejectionReason = String(rejectionReason).trim();
  }

  if (statusChanged) {
    v.statusHistory.push({
      status: v.status,
      note: v.status === "rejected" ? v.rejectionReason : v.stationNote || "",
      changedBy: userId ? String(userId) : null,
      changedByRole: userRole || "station",
      changedAt: new Date(),
    });
  }

  await v.save();

  if (statusChanged) await syncDispatchWithViolation(v._id, v.status, userId);

  if (statusChanged && v.sourceReportId) {
    await syncStatusToCitizenReport(v.sourceReportId, v.status, {
      rejectionReason: v.rejectionReason,
    });
  }

  // Idempotent — returns the existing active citation if there is one.
  if (nowVerified) {
    await v.populate("violations");
    await createCitationForVerifiedViolation(v, userId);
  }

  return v;
}
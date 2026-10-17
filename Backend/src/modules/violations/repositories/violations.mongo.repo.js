import mongoose from "mongoose";
import Violation from "../../../db/providers/mongo/models/Violation.js";
import PoliceStation from "../../../db/providers/mongo/models/PoliceStation.js";
import { toId } from "../../../db/providers/mongo/models/_helpers.js";
import { extractCoordinates } from "../../../utils/extractCoordinates.js";
import { distanceKm } from "../../../utils/geo.js";

// Beyond this, the coordinates written in a citizen's address and their GPS
// fix probably describe different places, which is worth a warning.
const LOCATION_MISMATCH_KM = 2;

/**
 * Km between the GPS fix and coordinates the citizen typed into the address,
 * when both exist and disagree by more than LOCATION_MISMATCH_KM. Null
 * otherwise. Computed on read, so nothing extra is stored.
 */
function locationMismatchKm(lat, lng, address) {
  if (lat == null || lng == null || !address) return null;
  const typed = extractCoordinates(address);
  if (!typed) return null;
  const km = distanceKm({ lat, lng }, typed);
  return km > LOCATION_MISMATCH_KM ? Math.round(km * 10) / 10 : null;
}

function toFrontend(doc) {
  const v = toId(doc);

  // NOTE:
  // Different frontend screens sometimes expect different key names
  // (snake_case vs camelCase, flat vs nested location).
  // To prevent "empty fields" caused by mismatched keys, we return a
  // backwards-compatible payload that includes BOTH naming styles.
  const lat = v.location?.lat ?? null;
  const lng = v.location?.lng ?? null;
  const dms = v.location?.dms ?? null;
  const address = v.location?.address ?? null;
  const createdAt = v.createdAt ?? null;

  return {
    id: v.id,
    _id: v.id, // some FE code uses _id

    title: v.title,
    status: v.status,

    // category/type compatibility
    category: v.type,
    type: v.type,

    // violations array — populated ViolationCatalogEntry docs
    // ({_id, name, legalCode, fineAmount, severity}), not bare IDs.
    violations: Array.isArray(v.violations) ? v.violations : [],

    // Structured fields (VIOLATIONS_BUSINESS_LOGIC.md #2) — previously
    // collected on the form and silently dropped.
    vehicleNumber: v.vehicleNumber ?? null,
    vehicleType: v.vehicleType ?? null,
    callerMobile: v.callerMobile ?? null,
    vehicleModel: v.vehicleModel ?? null,
    rejectionReason: v.rejectionReason ?? null,

    // When the offence happened (citizen reports), as opposed to createdAt.
    occurredAt: v.occurredAt ?? null,
    occurred_at: v.occurredAt ?? null,

    // Flat location fields (snake_case + camelCase)
    latitude: lat,
    longitude: lng,
    lat,
    lng,

    // DMS compatibility
    location_text: dms,
    dms,
    locationText: dms,

    // Human-readable place from the citizen app (null for HQ-created ones)
    address,

    // Nested location for screens expecting `location.lat/lng/dms`
    location: { lat, lng, dms, address },
    locationMismatchKm: locationMismatchKm(lat, lng, address),

    description: v.description ?? "",

    // Evidence: images, videos, audios
    images: Array.isArray(v.images) ? v.images : [],
    videos: Array.isArray(v.videos) ? v.videos : [],
    audios: Array.isArray(v.audios) ? v.audios : [],

    // Created time compatibility
    created_at: createdAt,
    createdAt,
    created: createdAt,

    // Station assignment / audit trail / duplicate flag (both naming styles,
    // consistent with the rest of this payload)
    assignedStation: v.assignedStation ?? null,
    assigned_station: v.assignedStation ?? null,
    stationNote: v.stationNote ?? "",
    station_note: v.stationNote ?? "",
    statusHistory: Array.isArray(v.statusHistory) ? v.statusHistory : [],
    status_history: Array.isArray(v.statusHistory) ? v.statusHistory : [],
    possibleDuplicateOf: Array.isArray(v.possibleDuplicateOf) ? v.possibleDuplicateOf : [],
    possible_duplicate_of: Array.isArray(v.possibleDuplicateOf) ? v.possibleDuplicateOf : [],

    // Set when this Violation was mirrored from the citizen app's shared
    // `reports` collection (see citizenReportSync.js).
    sourceReportId: v.sourceReportId ?? null,
    source_report_id: v.sourceReportId ?? null,
  };
}

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
};

// Id → name for the stations the given violations are assigned to, so the
// list can show a station name without changing `assignedStation` (an id
// everywhere else in the app) into a populated object.
async function stationNamesFor(docs) {
  const ids = [...new Set(docs.map((d) => d.assignedStation).filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();

  const stations = await PoliceStation.find({ _id: { $in: ids } }).select("name").lean();
  return new Map(stations.map((s) => [String(s._id), s.name]));
}

export async function list({
  type,
  status,
  q,
  assignedStation,
  unassigned = false,
  duplicates = false,
  sort = "newest",
  limit = 50,
  offset = 0,
}) {
  const filter = {};
  // A station-scoped caller only ever sees its own station, so "unassigned"
  // can't widen that.
  if (assignedStation) filter.assignedStation = assignedStation;
  else if (unassigned) filter.assignedStation = null;
  if (duplicates) filter["possibleDuplicateOf.0"] = { $exists: true };
  if (type) filter.type = type;
  if (status) filter.status = status;

  if (q) {
    // Escaped, so the search box matches text literally and can't be used
    // to run an expensive pattern.
    const term = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
      { vehicleNumber: { $regex: term, $options: "i" } },
      { "location.address": { $regex: term, $options: "i" } },
    ];
  }

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);

  const [total, docs] = await Promise.all([
    Violation.countDocuments(filter),
    Violation.find(filter)
      .populate("violations")
      .sort(SORTS[sort] || SORTS.newest)
      .skip(off)
      .limit(lim)
      .lean(),
  ]);

  const stationNames = await stationNamesFor(docs);

  return {
    data: docs.map((d) => ({
      ...toFrontend(d),
      assignedStationName: d.assignedStation ? stationNames.get(String(d.assignedStation)) ?? null : null,
    })),
    meta: { total, limit: lim, offset: off },
  };
}

// Counts for the Violations page's status tiles and attention toggles —
// scoped the same way `list` is.
export async function stats({ assignedStation } = {}) {
  const scope = assignedStation
    ? { assignedStation: new mongoose.Types.ObjectId(String(assignedStation)) }
    : {};

  const [byStatusRaw, total, unassigned, duplicates] = await Promise.all([
    Violation.aggregate([{ $match: scope }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Violation.countDocuments(scope),
    assignedStation ? 0 : Violation.countDocuments({ assignedStation: null }),
    Violation.countDocuments({ ...scope, "possibleDuplicateOf.0": { $exists: true } }),
  ]);

  const byStatus = Object.fromEntries(byStatusRaw.map((x) => [x._id, x.count]));
  return { total, byStatus, unassigned, duplicates };
}

export async function getById(id) {
  const doc = await Violation.findById(id).populate("violations").lean();
  return doc ? toFrontend(doc) : null;
}

export async function create(payload) {
  const created = await Violation.create(payload);
  const doc = await Violation.findById(created._id).populate("violations").lean();
  return toFrontend(doc);
}

export async function update(id, patch, historyEntry = null) {
  const update = historyEntry
    ? { $set: patch, $push: { statusHistory: historyEntry } }
    : { $set: patch };

  const doc = await Violation.findByIdAndUpdate(id, update, { new: true })
    .populate("violations")
    .lean();
  return doc ? toFrontend(doc) : null;
}

export async function remove(id) {
  const r = await Violation.deleteOne({ _id: id });
  return r.deletedCount > 0;
}

// Coarse same-type/place/time check: no geospatial index needed for a ~150m
// bounding box over a 24h window. Flags, never blocks, creation.
//
// Also matches the same vehicle number within the window, whatever the type
// or place — the same plate reported twice in a day is worth a look even
// when the two reports picked different offences or pinned different spots.
export async function findPossibleDuplicates({
  type,
  lat,
  lng,
  vehicleNumber,
  sinceMs = 24 * 60 * 60 * 1000,
  delta = 0.0015,
}) {
  const plate = String(vehicleNumber || "").trim().toUpperCase();
  const hasPlace = !!type && lat != null && lng != null;
  if (!hasPlace && !plate) return [];

  const since = new Date(Date.now() - sinceMs);

  const matchers = [];
  if (hasPlace) {
    matchers.push({
      type,
      "location.lat": { $gte: lat - delta, $lte: lat + delta },
      "location.lng": { $gte: lng - delta, $lte: lng + delta },
    });
  }
  if (plate) matchers.push({ vehicleNumber: plate });

  const docs = await Violation.find({
    createdAt: { $gte: since },
    $or: matchers,
  })
    .select("_id")
    .limit(5)
    .lean();

  return docs.map((d) => String(d._id));
}

export default { list, stats, getById, create, update, remove, findPossibleDuplicates };

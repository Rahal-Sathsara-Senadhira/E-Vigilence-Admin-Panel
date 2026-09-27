import Violation from "../../../db/providers/mongo/models/Violation.js";
import { toId } from "../../../db/providers/mongo/models/_helpers.js";

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
  const createdAt = v.createdAt ?? null;

  return {
    id: v.id,
    _id: v.id, // some FE code uses _id

    title: v.title,
    status: v.status,

    // category/type compatibility
    category: v.type,
    type: v.type,

    // violations array
    violations: Array.isArray(v.violations) ? v.violations : [],

    // Flat location fields (snake_case + camelCase)
    latitude: lat,
    longitude: lng,
    lat,
    lng,

    // DMS compatibility
    location_text: dms,
    dms,
    locationText: dms,

    // Nested location for screens expecting `location.lat/lng/dms`
    location: { lat, lng, dms },

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

export async function list({ type, status, q, limit = 50, offset = 0 }) {
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;

  if (q) {
    filter.$or = [
      { title: { $regex: String(q), $options: "i" } },
      { description: { $regex: String(q), $options: "i" } },
      { violations: { $elemMatch: { $regex: String(q), $options: "i" } } },
    ];
  }

  const [total, docs] = await Promise.all([
    Violation.countDocuments(filter),
    Violation.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Number(limit) || 50)
      .lean(),
  ]);

  return {
    data: docs.map(toFrontend),
    meta: {
      total,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    },
  };
}

export async function getById(id) {
  const doc = await Violation.findById(id).lean();
  return doc ? toFrontend(doc) : null;
}

export async function create(payload) {
  const doc = await Violation.create(payload);
  return toFrontend(doc.toObject());
}

export async function update(id, patch, historyEntry = null) {
  const update = historyEntry
    ? { $set: patch, $push: { statusHistory: historyEntry } }
    : { $set: patch };

  const doc = await Violation.findByIdAndUpdate(id, update, { new: true }).lean();
  return doc ? toFrontend(doc) : null;
}

export async function remove(id) {
  const r = await Violation.deleteOne({ _id: id });
  return r.deletedCount > 0;
}

// Coarse same-type/place/time check: no geospatial index needed for a ~150m
// bounding box over a 24h window. Flags, never blocks, creation.
export async function findPossibleDuplicates({
  type,
  lat,
  lng,
  sinceMs = 24 * 60 * 60 * 1000,
  delta = 0.0015,
}) {
  if (!type || lat == null || lng == null) return [];

  const since = new Date(Date.now() - sinceMs);

  const docs = await Violation.find({
    type,
    createdAt: { $gte: since },
    "location.lat": { $gte: lat - delta, $lte: lat + delta },
    "location.lng": { $gte: lng - delta, $lte: lng + delta },
  })
    .select("_id")
    .limit(5)
    .lean();

  return docs.map((d) => String(d._id));
}

export default { list, getById, create, update, remove, findPossibleDuplicates };

import mongoose from "mongoose";
import PoliceStation, { STATION_GRADES } from "../../db/providers/mongo/models/PoliceStation.js";
import Division from "../../db/providers/mongo/models/Division.js";
import StationAuditLog from "../../db/providers/mongo/models/StationAuditLog.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import Dispatch from "../../db/providers/mongo/models/Dispatch.js";
import User from "../../db/providers/mongo/models/User.js";
import { HttpError } from "../../utils/httpError.js";
import { normalizeSriLankanPhone } from "../../utils/phone.js";
import { isInSriLanka } from "../../utils/complaintOptions.js";
import { distanceKm, geoJsonAreaKm2, validateJurisdiction } from "../../utils/geo.js";
import { chooseStationFor, dispatchToStation } from "../dispatch/dispatch.service.js";
import { stationWorkload, stationProfileStats } from "./stationStats.js";

const OPEN_STATUSES = ["open", "pending", "in_review"];
const STATION_ROLES = ["station_admin", "station_officer"];
// What a station's own admin (the OIC's office) may change. Everything else
// — name, location, division, grade, jurisdiction, status — is HQ's.
const STATION_ADMIN_FIELDS = ["phone", "email", "oicName"];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v));

function toClient(s, extra = {}) {
  if (!s) return null;
  const [lng, lat] = s.location?.coordinates || [];
  return {
    id: String(s._id),
    _id: String(s._id),
    name: s.name,
    code: s.code ?? null,
    divisionId: s.divisionId ? String(s.divisionId._id ?? s.divisionId) : null,
    division:
      s.divisionId && typeof s.divisionId === "object" && s.divisionId.name
        ? { id: String(s.divisionId._id), name: s.divisionId.name, range: s.divisionId.range, province: s.divisionId.province }
        : null,
    grade: s.grade ?? null,
    area: s.area || "",
    address: s.address || "",
    phone: s.phone || "",
    email: s.email || "",
    oicName: s.oicName || "",
    lat: lat ?? null,
    lng: lng ?? null,
    location: s.location,
    isActive: s.isActive !== false,
    deactivatedAt: s.deactivatedAt ?? null,
    deactivationReason: s.deactivationReason ?? null,
    verified: !!s.verified,
    verifiedAt: s.verifiedAt ?? null,
    source: s.source || "manual",
    osmId: s.osmId ?? null,
    osmLocation: s.osmLocation?.lat != null ? s.osmLocation : null,
    hasJurisdiction: !!s.jurisdiction?.type,
    jurisdictionAreaKm2: s.jurisdictionAreaKm2 ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...extra,
  };
}

async function audit(stationId, action, user, { changes = {}, meta = {} } = {}) {
  await StationAuditLog.create({
    station: stationId,
    action,
    changes,
    meta,
    by: user?.id ? String(user.id) : null,
    byRole: user?.role ?? null,
  });
}

// Station users may only look at their own station.
export function assertCanView(user, stationId) {
  if (user?.role === "hq") return;
  if (STATION_ROLES.includes(user?.role) && String(user.stationId) === String(stationId)) return;
  throw new HttpError(404, "Police station not found");
}

async function loadStation(id) {
  if (!isId(id)) throw new HttpError(404, "Police station not found");
  const s = await PoliceStation.findById(id);
  if (!s) throw new HttpError(404, "Police station not found");
  return s;
}

// --- validation ----------------------------------------------------------------

// Cleans the writable fields in `body` into a patch (only keys present are
// touched). Throws 400 listing every problem.
async function buildPatch(body, { creating = false, current = null } = {}) {
  const patch = {};
  const errors = [];

  if (creating || "name" in body) {
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 3) errors.push("name must be at least 3 characters");
    else patch.name = name;
  }
  if ("code" in body) {
    const code = String(body.code ?? "").trim().toUpperCase();
    patch.code = code || null;
  }
  if ("divisionId" in body) {
    if (body.divisionId == null || body.divisionId === "") patch.divisionId = null;
    else if (!isId(body.divisionId) || !(await Division.exists({ _id: body.divisionId }))) {
      errors.push("divisionId must be an existing division");
    } else patch.divisionId = body.divisionId;
  }
  if ("grade" in body) {
    if (body.grade == null || body.grade === "") patch.grade = null;
    else if (!STATION_GRADES.includes(body.grade)) errors.push(`grade must be one of ${STATION_GRADES.join(", ")}`);
    else patch.grade = body.grade;
  }
  for (const k of ["area", "address", "oicName"]) {
    if (k in body) patch[k] = String(body[k] ?? "").trim().slice(0, 300);
  }
  if ("phone" in body) {
    const raw = String(body.phone ?? "").trim();
    if (!raw) patch.phone = "";
    else {
      const p = normalizeSriLankanPhone(raw);
      if (!p) errors.push("phone must be a Sri Lankan number");
      else patch.phone = p;
    }
  }
  if ("email" in body) {
    const e = String(body.email ?? "").trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.push("email is not valid");
    else patch.email = e;
  }
  if (creating || "lat" in body || "lng" in body) {
    const lat = Number(body.lat ?? current?.location?.coordinates?.[1]);
    const lng = Number(body.lng ?? current?.location?.coordinates?.[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) errors.push("lat and lng are required");
    else if (!isInSriLanka(lat, lng)) errors.push("The station must be located in Sri Lanka");
    else patch.location = { type: "Point", coordinates: [lng, lat] };
  }

  if (errors.length) throw new HttpError(400, errors.join(". "));
  return patch;
}

// Same name (case-insensitive) or code as another station.
async function assertUnique(patch, exceptId = null) {
  const not = exceptId ? { _id: { $ne: exceptId } } : {};
  if (patch.name) {
    const clash = await PoliceStation.exists({ ...not, name: { $regex: `^${escapeRegex(patch.name)}$`, $options: "i" } });
    if (clash) throw new HttpError(409, `A station named “${patch.name}” already exists`);
  }
  if (patch.code) {
    const clash = await PoliceStation.exists({ ...not, code: patch.code });
    if (clash) throw new HttpError(409, `Station code ${patch.code} is already used`);
  }
}

function diff(before, patch) {
  const changes = {};
  for (const [k, to] of Object.entries(patch)) {
    const from = before?.[k];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes[k] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}

// --- reads ---------------------------------------------------------------------

export async function listStations(query = {}, user) {
  const filter = {};
  if (query.q) {
    const q = escapeRegex(String(query.q).trim());
    filter.$or = [{ name: { $regex: q, $options: "i" } }, { code: { $regex: q, $options: "i" } }, { area: { $regex: q, $options: "i" } }];
  }
  if (query.divisionId === "none") filter.divisionId = null;
  else if (query.divisionId && isId(query.divisionId)) filter.divisionId = query.divisionId;
  if (query.status === "active") filter.isActive = true;
  else if (query.status === "inactive") filter.isActive = false;
  if (query.verified === "true") filter.verified = true;
  else if (query.verified === "false") filter.verified = false;

  const rows = await PoliceStation.find(filter)
    .select("-jurisdiction")
    .populate("divisionId", "name range province")
    .sort({ name: 1 })
    .limit(2000)
    .lean();

  // Workload numbers are HQ-only.
  if (user?.role !== "hq" || query.stats !== "true") return rows.map((s) => toClient(s));

  const workload = await stationWorkload(rows.map((s) => s._id));
  return rows.map((s) => toClient(s, { stats: workload(s._id) }));
}

export async function getStation(id, user) {
  assertCanView(user, id);
  const s = await PoliceStation.findById(isId(id) ? id : null).populate("divisionId", "name range province").lean();
  if (!s) throw new HttpError(404, "Police station not found");

  const [workload, profile] = await Promise.all([stationWorkload([s._id]), stationProfileStats(s._id)]);
  return toClient(s, {
    jurisdiction: s.jurisdiction ?? null,
    stats: { ...workload(s._id), ...profile },
  });
}

export async function listOfficers(id, user) {
  assertCanView(user, id);
  const users = await User.find({ stationId: id, role: { $in: STATION_ROLES } })
    .select("name email role isActive createdAt")
    .sort({ role: 1, name: 1 })
    .lean();
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive !== false,
    createdAt: u.createdAt,
  }));
}

export async function listAudit(id, user) {
  assertCanView(user, id);
  const rows = await StationAuditLog.find({ station: id }).sort({ createdAt: -1 }).limit(100).lean();
  const userIds = [...new Set(rows.map((r) => r.by).filter((x) => x && isId(x)))];
  const names = new Map(
    (await User.find({ _id: { $in: userIds } }).select("name").lean()).map((u) => [String(u._id), u.name])
  );
  return rows.map((r) => ({
    id: String(r._id),
    action: r.action,
    changes: r.changes,
    meta: r.meta,
    by: r.by ? names.get(r.by) ?? "Unknown user" : r.byRole === "migration" ? "Data import" : "System",
    at: r.createdAt,
  }));
}

// Unverified stations with what HQ needs to confirm them: a suggested
// division (nearest division HQ town) and the OpenStreetMap pin if it
// differs from ours.
export async function verificationQueue() {
  const [stations, divisions] = await Promise.all([
    PoliceStation.find({ verified: false, isActive: true })
      .select("-jurisdiction")
      .populate("divisionId", "name range province")
      .sort({ name: 1 })
      .lean(),
    Division.find({ isActive: true, "anchor.lat": { $ne: null } }).lean(),
  ]);

  return stations.map((s) => {
    const [lng, lat] = s.location.coordinates;
    let suggested = null;
    if (!s.divisionId) {
      let best = null;
      for (const d of divisions) {
        const km = distanceKm({ lat, lng }, d.anchor);
        if (!best || km < best.km) best = { d, km };
      }
      if (best) suggested = { id: String(best.d._id), name: best.d.name, distanceKm: Math.round(best.km * 10) / 10 };
    }
    return toClient(s, { suggestedDivision: suggested });
  });
}

// --- writes (HQ unless noted) --------------------------------------------------

export async function createStation(body, user) {
  const patch = await buildPatch(body, { creating: true });
  await assertUnique(patch);
  const s = await PoliceStation.create({ ...patch, source: "manual", verified: false, isActive: true });
  await audit(s._id, "created", user, { changes: diff({}, patch) });
  return toClient(s.toObject());
}

// HQ may change any writable field; a station's own admin only contact
// details (phone, email, OIC name).
export async function updateStation(id, body, user) {
  const s = await loadStation(id);

  let input = body || {};
  if (user?.role !== "hq") {
    if (user?.role !== "station_admin" || String(user.stationId) !== String(id)) {
      throw new HttpError(403, "Only HQ can change this station");
    }
    const notAllowed = Object.keys(input).filter((k) => !STATION_ADMIN_FIELDS.includes(k));
    if (notAllowed.length) {
      throw new HttpError(403, `Station admins can only change ${STATION_ADMIN_FIELDS.join(", ")}`);
    }
  }

  const patch = await buildPatch(input, { current: s });
  await assertUnique(patch, s._id);

  // A verified station must keep a division.
  if (s.verified && "divisionId" in patch && !patch.divisionId) {
    throw new HttpError(400, "A verified station must belong to a division");
  }

  const before = s.toObject();
  Object.assign(s, patch);
  await s.save();

  const changes = diff(
    { ...before, location: before.location, divisionId: before.divisionId ? String(before.divisionId) : null },
    { ...patch, ...(patch.divisionId !== undefined ? { divisionId: patch.divisionId ? String(patch.divisionId) : null } : {}) }
  );
  if (Object.keys(changes).length) await audit(s._id, "updated", user, { changes });
  return getStation(id, { role: "hq" });
}

// HQ confirms an imported/unverified station. Optionally accepts the
// OpenStreetMap pin, and assigns the division in the same step.
export async function verifyStation(id, body, user) {
  const s = await loadStation(id);
  const patch = await buildPatch(
    {
      ...(body?.divisionId !== undefined ? { divisionId: body.divisionId } : {}),
      ...(body?.useOsmLocation && s.osmLocation?.lat != null ? { lat: s.osmLocation.lat, lng: s.osmLocation.lng } : {}),
    },
    { current: s }
  );

  const divisionId = patch.divisionId !== undefined ? patch.divisionId : s.divisionId;
  if (!divisionId) throw new HttpError(400, "Choose the station's division before verifying it");

  const before = s.toObject();
  Object.assign(s, patch, { verified: true, verifiedAt: new Date(), verifiedBy: user?.id ? String(user.id) : null });
  if (patch.location) s.osmLocation = { lat: null, lng: null, distanceKm: null };
  await s.save();

  await audit(s._id, "verified", user, {
    changes: diff({ ...before, divisionId: before.divisionId ? String(before.divisionId) : null }, {
      divisionId: String(divisionId),
      ...(patch.location ? { location: patch.location } : {}),
    }),
    meta: { usedOsmLocation: !!patch.location },
  });
  return getStation(id, { role: "hq" });
}

// Sets (or clears, with geometry = null) the station's jurisdiction. Returns
// the station plus any other stations whose areas overlap the new one — a
// warning, not an error: dispatch picks the smaller area and flags it.
export async function setJurisdiction(id, geometry, user) {
  const s = await loadStation(id);

  if (geometry == null) {
    s.jurisdiction = undefined;
    s.jurisdictionAreaKm2 = null;
    s.jurisdictionUpdatedAt = new Date();
    s.jurisdictionUpdatedBy = user?.id ? String(user.id) : null;
    await s.save();
    await audit(s._id, "jurisdiction", user, { meta: { cleared: true } });
    return { station: await getStation(id, { role: "hq" }), overlaps: [] };
  }

  const problems = validateJurisdiction(geometry, isInSriLanka);
  if (problems.length) throw new HttpError(400, problems.join(". "));

  const areaKm2 = Math.round(geoJsonAreaKm2(geometry) * 100) / 100;
  if (areaKm2 <= 0) throw new HttpError(400, "The jurisdiction has no area");

  const [sLng, sLat] = s.location.coordinates;
  const replaced = !!s.jurisdiction?.type;

  s.jurisdiction = { type: geometry.type, coordinates: geometry.coordinates };
  s.jurisdictionAreaKm2 = areaKm2;
  s.jurisdictionUpdatedAt = new Date();
  s.jurisdictionUpdatedBy = user?.id ? String(user.id) : null;
  try {
    await s.save();
  } catch (err) {
    // MongoDB rejects self-intersecting shapes when indexing them.
    if (/geo|loop|edges|intersect/i.test(err?.message || "")) {
      throw new HttpError(400, "The jurisdiction outline crosses itself — redraw it");
    }
    throw err;
  }

  const overlapping = await PoliceStation.find({
    _id: { $ne: s._id },
    isActive: true,
    jurisdiction: { $geoIntersects: { $geometry: s.jurisdiction } },
  })
    .select("name")
    .lean();

  // Does the area cover the station's own pin? (A warning, not an error —
  // a station can sit just outside the area it polices.)
  const containsOwnPin = await PoliceStation.exists({
    _id: s._id,
    jurisdiction: { $geoIntersects: { $geometry: { type: "Point", coordinates: [sLng, sLat] } } },
  });

  await audit(s._id, "jurisdiction", user, {
    meta: { areaKm2, overlaps: overlapping.map((o) => o.name), coversStation: !!containsOwnPin, replaced },
  });

  return {
    station: await getStation(id, { role: "hq" }),
    overlaps: overlapping.map((o) => ({ id: String(o._id), name: o.name })),
    containsOwnPin: !!containsOwnPin,
  };
}

// What deactivating a station would involve: each open case with a
// suggested new station (jurisdiction, else nearest active), and its users.
export async function deactivationPlan(id) {
  const s = await loadStation(id);

  const cases = await Violation.find({ assignedStation: s._id, status: { $in: OPEN_STATUSES } })
    .select("title status location vehicleNumber createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const planned = [];
  for (const v of cases) {
    let suggestion = null;
    if (v.location?.lat != null && v.location?.lng != null) {
      const choice = await chooseStationFor(v.location.lat, v.location.lng, { excludeStationId: s._id });
      if (choice) {
        suggestion = {
          stationId: String(choice.station._id),
          stationName: choice.station.name,
          method: choice.method,
          distanceKm: choice.distanceKm,
        };
      }
    }
    planned.push({
      id: String(v._id),
      title: v.title,
      status: v.status,
      vehicleNumber: v.vehicleNumber ?? null,
      suggestion,
    });
  }

  const users = await User.find({ stationId: s._id, role: { $in: STATION_ROLES }, isActive: true })
    .select("name email role")
    .lean();

  return {
    station: { id: String(s._id), name: s.name, isActive: s.isActive },
    cases: planned,
    users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role })),
  };
}

/**
 * Deactivates a station. Refused unless the request accounts for every open
 * case (reassignments: [{ violationId, stationId }]) and every active user
 * (users: [{ userId, action: "move" | "deactivate", stationId? }]) — so no
 * case is stranded and no account is left pointing at a closed station.
 */
export async function deactivateStation(id, body, user) {
  const s = await loadStation(id);
  if (!s.isActive) throw new HttpError(409, "This station is already inactive");

  const reason = String(body?.reason ?? "").trim();
  if (reason.length < 5) throw new HttpError(400, "Give a reason for deactivating the station");

  const plan = await deactivationPlan(id);
  const reassign = new Map((body?.reassignments || []).map((r) => [String(r.violationId), String(r.stationId)]));
  const userPlan = new Map((body?.users || []).map((u) => [String(u.userId), u]));

  const missingCases = plan.cases.filter((c) => !reassign.get(c.id));
  if (missingCases.length) {
    throw new HttpError(400, `Choose a new station for every open case (${missingCases.length} left)`);
  }
  const missingUsers = plan.users.filter((u) => !userPlan.get(u.id));
  if (missingUsers.length) {
    throw new HttpError(400, `Decide what happens to every officer (${missingUsers.length} left)`);
  }

  // Validate targets up front so nothing is half-done.
  const targetIds = [
    ...new Set([
      ...reassign.values(),
      ...[...userPlan.values()].filter((u) => u.action === "move").map((u) => String(u.stationId)),
    ]),
  ];
  if (targetIds.includes(String(s._id))) throw new HttpError(400, "Cases and officers must move to a different station");
  const targets = await PoliceStation.find({ _id: { $in: targetIds.filter(isId) }, isActive: true }).select("_id").lean();
  if (targets.length !== targetIds.length) throw new HttpError(400, "Every target station must be an existing, active station");
  for (const u of userPlan.values()) {
    if (!["move", "deactivate"].includes(u.action)) throw new HttpError(400, "Officer action must be move or deactivate");
  }

  for (const c of plan.cases) {
    await dispatchToStation(c.id, reassign.get(c.id), user?.id ?? null, {
      method: "manual",
      endedReason: "station_deactivated",
    });
  }
  for (const u of plan.users) {
    const p = userPlan.get(u.id);
    await User.updateOne(
      { _id: u.id },
      p.action === "move" ? { $set: { stationId: p.stationId } } : { $set: { isActive: false } }
    );
  }

  s.isActive = false;
  s.deactivatedAt = new Date();
  s.deactivatedBy = user?.id ? String(user.id) : null;
  s.deactivationReason = reason;
  await s.save();

  await audit(s._id, "deactivated", user, {
    meta: {
      reason,
      casesReassigned: plan.cases.length,
      officersMoved: [...userPlan.values()].filter((u) => u.action === "move").length,
      officersDeactivated: [...userPlan.values()].filter((u) => u.action === "deactivate").length,
    },
  });
  return getStation(id, { role: "hq" });
}

export async function reactivateStation(id, user) {
  const s = await loadStation(id);
  if (s.isActive) throw new HttpError(409, "This station is already active");
  s.isActive = true;
  s.deactivatedAt = null;
  s.deactivatedBy = null;
  s.deactivationReason = null;
  await s.save();
  await audit(s._id, "reactivated", user);
  return getStation(id, { role: "hq" });
}

// Only a station that was never used can be deleted; anything with history
// is deactivated instead, so no violation, dispatch or account is orphaned.
export async function deleteStation(id) {
  const s = await loadStation(id);
  const [hasCases, hasDispatches, hasUsers] = await Promise.all([
    Violation.exists({ assignedStation: s._id }),
    Dispatch.exists({ $or: [{ station: s._id }, { "history.station": s._id }] }),
    User.exists({ stationId: s._id }),
  ]);
  if (hasCases || hasDispatches || hasUsers) {
    throw new HttpError(409, "This station has cases or officers on record — deactivate it instead");
  }
  await PoliceStation.deleteOne({ _id: s._id });
  await StationAuditLog.deleteMany({ station: s._id });
}

/**
 * Bulk import (CSV rows parsed by the client): each row creates a station,
 * or updates the one with the same code. Rows are validated one by one and
 * reported back; imported stations are unverified.
 * Row: { name, code?, lat, lng, division?, grade?, phone?, address?, area? }
 */
export async function importStations(rows, user) {
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, "No rows to import");
  if (rows.length > 2000) throw new HttpError(400, "Import at most 2000 rows at a time");

  const divisions = await Division.find({}).select("name").lean();
  const divisionByName = new Map(divisions.map((d) => [d.name.toLowerCase(), String(d._id)]));

  const report = { created: 0, updated: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    try {
      const input = { ...row };
      if (row.division) {
        const did = divisionByName.get(String(row.division).trim().toLowerCase());
        if (!did) throw new HttpError(400, `Unknown division “${row.division}”`);
        input.divisionId = did;
      }
      delete input.division;

      const existing = row.code ? await PoliceStation.findOne({ code: String(row.code).trim().toUpperCase() }) : null;
      if (existing) {
        const patch = await buildPatch(input, { current: existing });
        await assertUnique(patch, existing._id);
        const changes = diff(existing.toObject(), patch);
        Object.assign(existing, patch);
        await existing.save();
        if (Object.keys(changes).length) await audit(existing._id, "updated", user, { changes, meta: { via: "csv" } });
        report.updated++;
      } else {
        const patch = await buildPatch(input, { creating: true });
        await assertUnique(patch);
        const s = await PoliceStation.create({ ...patch, source: "csv", verified: false, isActive: true });
        await audit(s._id, "imported", user, { meta: { via: "csv", row: i + 1 } });
        report.created++;
      }
    } catch (err) {
      report.errors.push({ row: i + 1, name: row.name ?? null, message: err.message });
    }
  }
  return report;
}

export async function nearestStations(lat, lng, limit = 3) {
  const items = await PoliceStation.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        spherical: true,
        query: { isActive: true },
      },
    },
    { $limit: limit },
    { $project: { name: 1, area: 1, verified: 1, location: 1, distanceMeters: 1 } },
  ]);
  return items.map((s) => ({
    id: String(s._id),
    name: s.name,
    area: s.area,
    verified: !!s.verified,
    lat: s.location.coordinates[1],
    lng: s.location.coordinates[0],
    distanceKm: s.distanceMeters / 1000,
  }));
}

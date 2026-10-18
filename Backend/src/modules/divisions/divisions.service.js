import mongoose from "mongoose";
import Division from "../../db/providers/mongo/models/Division.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import { HttpError } from "../../utils/httpError.js";
import { isInSriLanka } from "../../utils/complaintOptions.js";
import { stationWorkload } from "../policeStations/stationStats.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function toClient(d, extra = {}) {
  return {
    id: String(d._id),
    name: d.name,
    range: d.range,
    province: d.province,
    anchor: d.anchor?.lat != null ? d.anchor : null,
    isActive: d.isActive !== false,
    ...extra,
  };
}

const ZERO = { stations: 0, activeStations: 0, verifiedStations: 0, openCases: 0, unacknowledged: 0, overdue: 0, officers: 0, returned30d: 0 };

// Every division with its stations' workload rolled up — the regional view.
export async function listDivisions() {
  const [divisions, stations] = await Promise.all([
    Division.find({}).sort({ province: 1, range: 1, name: 1 }).lean(),
    PoliceStation.find({ divisionId: { $ne: null } }).select("divisionId isActive verified").lean(),
  ]);
  const workload = await stationWorkload(stations.map((s) => s._id));

  const totals = new Map();
  for (const s of stations) {
    const k = String(s.divisionId);
    const t = totals.get(k) || { ...ZERO };
    const w = workload(s._id);
    t.stations++;
    if (s.isActive !== false) t.activeStations++;
    if (s.verified) t.verifiedStations++;
    for (const f of ["openCases", "unacknowledged", "overdue", "officers", "returned30d"]) t[f] += w[f];
    totals.set(k, t);
  }

  return divisions.map((d) => toClient(d, { stats: totals.get(String(d._id)) || { ...ZERO } }));
}

export async function getDivision(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) throw new HttpError(404, "Division not found");
  const d = await Division.findById(id).lean();
  if (!d) throw new HttpError(404, "Division not found");

  const stations = await PoliceStation.find({ divisionId: d._id }).select("-jurisdiction").sort({ name: 1 }).lean();
  const workload = await stationWorkload(stations.map((s) => s._id));

  return toClient(d, {
    stations: stations.map((s) => ({
      id: String(s._id),
      name: s.name,
      code: s.code ?? null,
      grade: s.grade ?? null,
      isActive: s.isActive !== false,
      verified: !!s.verified,
      hasJurisdiction: !!s.jurisdiction?.type,
      lat: s.location.coordinates[1],
      lng: s.location.coordinates[0],
      stats: workload(s._id),
    })),
  });
}

async function buildPatch(body, creating) {
  const patch = {};
  const errors = [];
  for (const k of ["name", "range", "province"]) {
    if (creating || k in body) {
      const v = String(body[k] ?? "").trim().replace(/\s+/g, " ");
      if (v.length < 2) errors.push(`${k} is required`);
      else patch[k] = v;
    }
  }
  if ("anchor" in body) {
    const lat = Number(body.anchor?.lat);
    const lng = Number(body.anchor?.lng);
    if (body.anchor == null) patch.anchor = { lat: null, lng: null };
    else if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInSriLanka(lat, lng)) {
      errors.push("anchor must be a point in Sri Lanka");
    } else patch.anchor = { lat, lng };
  }
  if ("isActive" in body) patch.isActive = Boolean(body.isActive);
  if (errors.length) throw new HttpError(400, errors.join(". "));
  return patch;
}

async function assertUniqueName(name, exceptId) {
  if (!name) return;
  const clash = await Division.exists({
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  if (clash) throw new HttpError(409, `A division named “${name}” already exists`);
}

export async function createDivision(body) {
  const patch = await buildPatch(body || {}, true);
  await assertUniqueName(patch.name);
  const d = await Division.create(patch);
  return toClient(d.toObject(), { stats: { ...ZERO } });
}

export async function updateDivision(id, body) {
  const d = await Division.findById(id);
  if (!d) throw new HttpError(404, "Division not found");
  const patch = await buildPatch(body || {}, false);
  await assertUniqueName(patch.name, d._id);

  // A division can't be retired while active stations still belong to it.
  if (patch.isActive === false && d.isActive !== false) {
    const active = await PoliceStation.countDocuments({ divisionId: d._id, isActive: true });
    if (active > 0) {
      throw new HttpError(409, `Move or deactivate this division's ${active} active station(s) first`);
    }
  }

  Object.assign(d, patch);
  await d.save();
  return getDivision(id);
}

import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./violations.service.js";
import { validateCreate, validateStaffComplaint } from "./violations.validation.js";
import { HttpError } from "../../utils/httpError.js";
import { parseDms, formatDms } from "../../utils/parseDms.js";
import { normalizePlate, normalizePlateLoose } from "../../utils/plate.js";
import { normalizeSriLankanPhone } from "../../utils/phone.js";
import {
  storeEvidenceFile,
  claimEvidenceUploads,
  discardEvidenceUpload,
} from "../evidence/evidenceUploads.js";
import {
  dispatchToStation,
  dispatchNearestStationForViolation,
} from "../dispatch/dispatch.service.js";
import { normalizeStatus } from "../../utils/violationStatus.js";
import {
  syncStatusToCitizenReport,
  syncCitizenReports,
  rememberDeletedCitizenReport,
} from "./citizenReportSync.js";
import { resolveCatalogEntries } from "../../utils/violationCatalog.js";
import ViolationCatalogEntry from "../../db/providers/mongo/models/ViolationCatalogEntry.js";
import {
  assertValidTransition,
  assertRequiredFieldsForTransition,
  assertDifferentReviewer,
} from "../../utils/violationWorkflow.js";
import { assertAllowedEvidence } from "../../utils/evidenceUrls.js";
import {
  assertCitationCanBeIssued,
  createCitationForVerifiedViolation,
  voidCitationsForViolation,
} from "../citations/citations.service.js";

// `req.body.violations` may be catalog ObjectIds (frontend, picking from the
// catalog) or free-text names (ingest path) — resolveCatalogEntries handles
// both uniformly. `type` is then derived from the first resolved entry's
// name, never taken from the client directly (VIOLATIONS_BUSINESS_LOGIC.md #1).
async function resolveViolationsAndType(rawViolations) {
  const resolvedIds = await resolveCatalogEntries(rawViolations);
  let type = "Uncategorized";

  if (resolvedIds.length > 0) {
    const primary = await ViolationCatalogEntry.findById(resolvedIds[0]).lean();
    if (primary) type = primary.name;
  }

  return { violationIds: resolvedIds, type };
}

// A retired (isActive: false) catalog entry can't be newly attached by HQ —
// only kept on a violation that already had it, so re-saving an older
// violation still works. The ingest / citizen-sync paths are exempt: they
// carry what the citizen reported.
async function assertNoRetiredEntries(violationIds, alreadyOnViolation = []) {
  const kept = new Set(idsOf(alreadyOnViolation));
  const added = idsOf(violationIds).filter((id) => !kept.has(id));
  if (added.length === 0) return;

  const retired = await ViolationCatalogEntry.find({ _id: { $in: added }, isActive: false })
    .select("name")
    .lean();

  if (retired.length > 0) {
    throw new HttpError(
      400,
      `These offences are retired in the Violation Catalog: ${retired.map((r) => r.name).join(", ")}`
    );
  }
}

// HQ sees every violation; a station account only those assigned to its own
// station (same scoping as dashboard.service.js). Returns the station id to
// filter by, or null for HQ. Any other role, or a station account with no
// station, is refused.
function stationScopeFor(user) {
  if (user?.role === "hq") return null;

  const isStationRole = user?.role === "station_admin" || user?.role === "station_officer";
  if (!isStationRole || !user.stationId) throw new HttpError(403, "Forbidden");

  return String(user.stationId);
}

export const list = asyncHandler(async (req, res) => {
  const type = req.query.type ?? req.query.category;
  const scopedStation = stationScopeFor(req.user);

  const result = await svc.list({
    assignedStation: scopedStation || undefined,
    type: type || undefined,
    status: req.query.status || undefined,
    q: req.query.q || undefined,
    unassigned: req.query.unassigned === "true",
    duplicates: req.query.duplicates === "true",
    sort: req.query.sort || undefined,
    limit: req.query.limit ?? 50,
    offset: req.query.offset ?? 0,
  });

  res.json({ ...result, data: result.data.map((v) => redactForCaller(v, req.user)) });
});

// GET /api/violations/stats — counts per status plus unassigned/duplicate
// totals, for the Violations page. Scoped like `list`.
export const stats = asyncHandler(async (req, res) => {
  const scopedStation = stationScopeFor(req.user);
  res.json(await svc.stats({ assignedStation: scopedStation || undefined }));
});

export const getById = asyncHandler(async (req, res) => {
  const scopedStation = stationScopeFor(req.user);
  const item = await svc.getById(req.params.id);

  // 404 rather than 403 so a station can't probe which ids exist elsewhere.
  if (scopedStation && String(item.assignedStation || "") !== scopedStation) {
    throw new HttpError(404, "Violation not found");
  }

  res.json(redactForCaller(item, req.user));
});

// ---------------------------------------------------------------------------
// Staff complaints (New Complaint page) — HQ and station staff.
// ---------------------------------------------------------------------------

const CHANNEL_LABELS = { phone: "Phone call", walk_in: "Walk-in", officer: "Officer observed", other: "Other" };

// Loads the chosen offences and checks each is a live catalog entry that
// applies to the vehicle type. Returns the entries in the order chosen.
async function loadOffences(ids, vehicleType) {
  const docs = await ViolationCatalogEntry.find({ _id: { $in: ids } }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const entries = ids.map((id) => byId.get(id));

  if (entries.some((e) => !e)) throw new HttpError(400, "One of the selected offences no longer exists");

  const retired = entries.filter((e) => e.isActive === false).map((e) => e.name);
  if (retired.length) {
    throw new HttpError(400, `These offences are retired in the Violation Catalog: ${retired.join(", ")}`);
  }

  const wrongVehicle = entries
    .filter((e) => Array.isArray(e.vehicleTypes) && e.vehicleTypes.length > 0 && !e.vehicleTypes.includes(vehicleType))
    .map((e) => e.name);
  if (wrongVehicle.length) {
    throw new HttpError(400, `Not applicable to a ${vehicleType}: ${wrongVehicle.join(", ")}`);
  }

  return entries;
}

// Station users don't see who called in a complaint — only HQ does.
function redactForCaller(v, user) {
  if (!v || user?.role === "hq") return v;
  return { ...v, callerName: null, callerMobile: null, reported_by: null };
}

// POST /api/violations — create a complaint. Station staff's complaints are
// assigned to their own station; HQ may ask for dispatch to the nearest
// station in the same request (`dispatch: "nearest"`). A repeated request
// with the same Idempotency-Key header returns the original complaint.
export const createComplaint = asyncHandler(async (req, res) => {
  const scopedStation = stationScopeFor(req.user);
  const userId = String(req.user.id);

  const rawKey = req.get("Idempotency-Key");
  const idempotencyKey = rawKey ? `${userId}:${String(rawKey).slice(0, 100)}` : undefined;
  if (idempotencyKey) {
    const existing = await svc.findByIdempotencyKey(idempotencyKey);
    if (existing) return res.status(200).json({ ...redactForCaller(existing, req.user), replayed: true });
  }

  const { errors, value } = validateStaffComplaint(req.body);
  if (errors.length) throw new HttpError(400, errors.join(". "));

  const offences = await loadOffences(value.violations, value.vehicleType);
  const names = offences.map((o) => o.name);

  const claim = await claimEvidenceUploads(req.body.evidenceIds, userId);

  let created;
  try {
    created = await svc.create({
      title: `${value.vehicleNumber ?? "Unknown plate"} — ${names.join(", ")}`,
      type: names[0],
      violations: offences.map((o) => o._id),
      description: value.description,
      location: {
        lat: value.location.lat,
        lng: value.location.lng,
        dms: formatDms(value.location.lat, value.location.lng),
        address: value.location.address,
      },
      occurredAt: value.occurredAt,
      status: "open",
      channel: value.channel,
      callerName: value.callerName,
      callerMobile: value.callerMobile,
      callerAnonymous: value.callerAnonymous,
      reported_by: value.callerAnonymous
        ? `Anonymous (${CHANNEL_LABELS[value.channel]})`
        : value.callerName
          ? `${value.callerName} (${CHANNEL_LABELS[value.channel]})`
          : CHANNEL_LABELS[value.channel],
      vehicleNumber: value.vehicleNumber,
      vehicleType: value.vehicleType,
      vehicleModel: value.vehicleModel,
      vehicleColor: value.vehicleColor,
      images: claim.files.images,
      videos: claim.files.videos,
      audios: claim.files.audios,
      evidenceFiles: claim.evidenceFiles,
      idempotencyKey,
      createdBy: userId,
      createdByRole: req.user.role,
    });
  } catch (err) {
    await claim.release();
    // Two identical requests raced past the lookup above — return the winner.
    if (err?.code === 11000 && idempotencyKey) {
      const existing = await svc.findByIdempotencyKey(idempotencyKey);
      if (existing) return res.status(200).json({ ...redactForCaller(existing, req.user), replayed: true });
    }
    throw err;
  }

  await claim.finalize(created.id);

  // Assignment never fails the create — the complaint exists either way and
  // can be dispatched from its details page.
  let dispatch = null;
  try {
    if (scopedStation) {
      const r = await dispatchToStation(created.id, scopedStation, userId);
      dispatch = { stationId: String(r.station._id), stationName: r.station.name };
    } else if (req.body.dispatch === "nearest") {
      const r = await dispatchNearestStationForViolation(created.id, userId);
      dispatch = { stationId: String(r.station._id), stationName: r.station.name };
    }
  } catch (err) {
    dispatch = { error: err.message || "Dispatch failed" };
  }

  res.status(201).json({ ...redactForCaller(created, req.user), dispatch });
});

// POST /api/violations/check-duplicates — the New Complaint page's
// pre-submit check: recent complaints with the same plate, or the same
// offence at nearly the same spot. Station users only see their own
// station's records.
export const checkDuplicates = asyncHandler(async (req, res) => {
  const scopedStation = stationScopeFor(req.user);
  const { vehicleNumber, violations, location } = req.body || {};

  let type = null;
  const firstId = Array.isArray(violations) ? String(violations[0] ?? "") : "";
  if (/^[a-f0-9]{24}$/i.test(firstId)) {
    const entry = await ViolationCatalogEntry.findById(firstId).select("name").lean();
    type = entry?.name ?? null;
  }

  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const docs = await svc.findDuplicateCandidates({
    type,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    vehicleNumber: normalizePlate(vehicleNumber),
    assignedStation: scopedStation || undefined,
  });

  const plate = normalizePlate(vehicleNumber);
  res.json({
    matches: docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      vehicleNumber: d.vehicleNumber,
      address: d.location?.address ?? null,
      createdAt: d.createdAt,
      reason: plate && d.vehicleNumber === plate ? "Same plate" : "Same offence nearby",
    })),
  });
});

// POST /api/violations/evidence — one evidence file (multipart field
// "file", plus "kind" = images|videos|audios and optional "lastModified").
// Staged until a complaint claims it; see modules/evidence/evidenceUploads.js.
export const uploadEvidenceFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "No file provided");
  const upload = await storeEvidenceFile(req.file, req.body?.kind, req, req.body?.lastModified);
  res.status(201).json(upload);
});

// DELETE /api/violations/evidence/:uploadId — discard an upload removed from
// the form before submitting.
export const discardEvidenceFile = asyncHandler(async (req, res) => {
  await discardEvidenceUpload(req.params.uploadId, req.user.id);
  res.json({ ok: true });
});

// POST /api/violations/ingest — machine-to-machine path from the citizen
// backend (and the legacy create shape). Staff use createComplaint above.
export const create = asyncHandler(async (req, res) => {
  const errors = validateCreate(req.body);
  if (errors.length) throw new HttpError(400, errors.join(", "));

  const dmsText = req.body.dms ?? req.body.locationText;

  let location = req.body.location;

  // ✅ If location not provided, allow DMS text and parse to lat/lng
  if (!location && dmsText) {
    const parsed = parseDms(dmsText);
    if (!parsed) throw new HttpError(400, "Invalid DMS format");
    location = { ...parsed, dms: dmsText };
  }

  const { violationIds, type } = await resolveViolationsAndType(req.body.violations);
  if (req.user) {
    await assertNoRetiredEntries(violationIds);
    for (const key of ["images", "videos", "audios"]) {
      assertAllowedEvidence(req.body[key], [], req.get("host"));
    }
  }

  const created = await svc.create({
    title: req.body.title,
    type,
    violations: violationIds,
    description: req.body.description || "",
    location,
    reported_by: req.body.reported_by || null,
    status: normalizeStatus(req.body.status, "open"),
    images: Array.isArray(req.body.images) ? req.body.images : [],
    videos: Array.isArray(req.body.videos) ? req.body.videos : [],
    audios: Array.isArray(req.body.audios) ? req.body.audios : [],
    vehicleNumber: normalizePlateLoose(req.body.vehicleNumber),
    vehicleType: req.body.vehicleType || null,
    callerMobile: req.body.callerMobile || null,
    // Who/what created this record — req.user is absent on the ingest path
    // (see requireIngestKey), which is a machine-to-machine call.
    createdBy: req.user?.id || null,
    createdByRole: req.user?.role || "ingest",
  });

  res.status(201).json(created);
});

// Once a violation is verified (a citation exists) or resolved (terminal),
// the facts the finding rests on are frozen: changing the offence, vehicle,
// place or evidence afterwards would leave an issued citation describing
// something else. To correct a verified violation HQ rejects it (voiding the
// citation), reopens it, edits, and verifies again.
const LOCKED_STATUSES = new Set(["verified", "resolved"]);

const sameText = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
const idsOf = (list) => (Array.isArray(list) ? list : []).map((x) => String(x?._id ?? x));
const sameList = (a, b) => JSON.stringify(idsOf(a)) === JSON.stringify(idsOf(b));

// Names of the fields in `patch` whose value actually differs from `current`.
// The Violation Details edit form re-sends every field on each save, so an
// unchanged value must not count as an edit.
function changedFields(current, patch) {
  const changed = [];

  for (const key of ["title", "description", "vehicleType", "vehicleModel", "callerMobile"]) {
    if (key in patch && !sameText(patch[key], current[key])) changed.push(key);
  }
  if (
    "vehicleNumber" in patch &&
    // Compared in canonical form, so normalizing an old record's spelling
    // ("wp-bbx-1182" → "WP BBX-1182") doesn't count as an edit.
    !sameText(normalizePlateLoose(patch.vehicleNumber), normalizePlateLoose(current.vehicleNumber))
  ) {
    changed.push("vehicleNumber");
  }
  if ("violations" in patch && !sameList(patch.violations, current.violations)) {
    changed.push("violations");
  }
  for (const key of ["images", "videos", "audios"]) {
    if (key in patch && !sameList(patch[key], current[key])) changed.push(key);
  }
  if (
    "location" in patch &&
    (patch.location.lat !== current.location?.lat ||
      patch.location.lng !== current.location?.lng ||
      !sameText(patch.location.address, current.location?.address))
  ) {
    changed.push("location");
  }
  // Needed to overturn a verification (verified → rejected); otherwise frozen.
  if (
    "rejectionReason" in patch &&
    patch.status !== "rejected" &&
    !sameText(patch.rejectionReason, current.rejectionReason)
  ) {
    changed.push("rejectionReason");
  }

  return changed;
}

export const update = asyncHandler(async (req, res) => {
  const current = await svc.getById(req.params.id);
  const patch = {};

  if (typeof req.body.title === "string" && req.body.title.trim()) {
    patch.title = req.body.title.trim();
  }

  if (Array.isArray(req.body.violations)) {
    const { violationIds, type } = await resolveViolationsAndType(req.body.violations);
    await assertNoRetiredEntries(violationIds, current.violations);
    patch.violations = violationIds;
    patch.type = type;
  }

  if (typeof req.body.description === "string") {
    patch.description = req.body.description;
  }

  // Same rules as creating: canonical Sri Lankan plate / phone, or cleared.
  // (An unchanged legacy value that doesn't parse is kept as it was, so
  // re-saving an old record doesn't fail.)
  if (typeof req.body.vehicleNumber === "string") {
    const raw = req.body.vehicleNumber.trim();
    const plate = normalizePlate(raw);
    if (raw && !plate && raw.toUpperCase() !== String(current.vehicleNumber ?? "").toUpperCase()) {
      throw new HttpError(400, "vehicleNumber must be a Sri Lankan plate (e.g. WP CAB-1234, CAB-1234, 250-1234)");
    }
    patch.vehicleNumber = raw ? plate ?? current.vehicleNumber : null;
  }
  if (typeof req.body.vehicleType === "string") patch.vehicleType = req.body.vehicleType;
  if (typeof req.body.callerMobile === "string") {
    const raw = req.body.callerMobile.trim();
    const phone = normalizeSriLankanPhone(raw);
    if (raw && !phone && raw !== String(current.callerMobile ?? "")) {
      throw new HttpError(400, "callerMobile must be a valid Sri Lankan phone number");
    }
    patch.callerMobile = raw ? phone ?? current.callerMobile : null;
  }
  if (typeof req.body.vehicleModel === "string") patch.vehicleModel = req.body.vehicleModel;
  if (typeof req.body.rejectionReason === "string") patch.rejectionReason = req.body.rejectionReason;

  let historyEntry = null;
  if (typeof req.body.status !== "undefined") {
    const normalized = normalizeStatus(req.body.status);
    if (!normalized) {
      throw new HttpError(400, `Invalid status: ${req.body.status}`);
    }
    patch.status = normalized;
    historyEntry = {
      status: normalized,
      changedBy: req.user?.id || null,
      changedByRole: req.user?.role || null,
      changedAt: new Date(),
    };
  }

  let location = req.body.location;
  const dmsText = req.body.dms ?? req.body.locationText;
  if (!location && dmsText) {
    const parsed = parseDms(dmsText);
    if (!parsed) throw new HttpError(400, "Invalid DMS format");
    location = { ...parsed, dms: dmsText };
  }
  if (location) {
    const { lat, lng } = location;
    if (
      typeof lat !== "number" || typeof lng !== "number" ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      throw new HttpError(400, "location.lat and location.lng must be valid numbers");
    }
    // $set replaces the whole location sub-document, so carry the citizen's
    // address over unless this request supplies one, and keep dms in step
    // with the coordinates it describes.
    patch.location = {
      lat,
      lng,
      dms: typeof location.dms === "string" && parseDms(location.dms) ? location.dms : formatDms(lat, lng),
      address: location.address !== undefined ? location.address : current.location?.address ?? null,
    };
  }

  for (const key of ["images", "videos", "audios"]) {
    if (Array.isArray(req.body[key])) {
      assertAllowedEvidence(req.body[key], current[key], req.get("host"));
      patch[key] = req.body[key];
    }
  }

  if (LOCKED_STATUSES.has(current.status)) {
    const changed = changedFields(current, patch);
    if (changed.length > 0) {
      throw new HttpError(
        409,
        `Can't change ${changed.join(", ")} on a ${current.status} violation` +
          (current.status === "verified" ? " — reject and reopen it first" : "")
      );
    }
  }

  let previousStatus = null;
  if (patch.status) {
    assertValidTransition(current.status, patch.status, req.user?.role);
    assertRequiredFieldsForTransition(patch.status, current, patch);
    // Checked before saving, so a violation can't end up verified with no
    // citation because its fine couldn't be worked out.
    if (patch.status === "verified" && current.status !== "verified") {
      assertDifferentReviewer(current, req.user?.id);
    }
    if (patch.status === "verified") {
      await assertCitationCanBeIssued(patch.violations ?? current.violations);
    }
    // Reopening a rejected violation clears its old reason, so a later
    // rejection has to state a new one (the edit form re-sends the old text).
    if (current.status === "rejected" && patch.status !== "rejected") {
      patch.rejectionReason = null;
    }
    if (patch.status === "rejected" && historyEntry) {
      historyEntry.note = String(patch.rejectionReason).trim();
    }
    previousStatus = current.status;
  }

  const updated = await svc.update(req.params.id, patch, historyEntry);

  if (historyEntry && updated.sourceReportId) {
    await syncStatusToCitizenReport(updated.sourceReportId, updated.status, {
      rejectionReason: updated.rejectionReason,
    });
  }

  // The actual enforcement consequence of verification — see
  // VIOLATIONS_BUSINESS_LOGIC.md #4. createCitationForVerifiedViolation is
  // idempotent (one active citation per violation), so re-saving "verified"
  // never mints a second one.
  if (patch.status === "verified") {
    await createCitationForVerifiedViolation(updated, req.user?.id);
  }

  // HQ overturning a verification: the fine goes with it.
  if (previousStatus === "verified" && patch.status === "rejected") {
    await voidCitationsForViolation(updated.id, {
      reason: `Verification overturned: ${updated.rejectionReason || "rejected"}`,
      userId: req.user?.id,
    });
  }

  res.json(updated);
});

export const remove = asyncHandler(async (req, res) => {
  const current = await svc.getById(req.params.id);
  await svc.remove(req.params.id);
  // A citation must not stay payable for a violation that no longer exists.
  await voidCitationsForViolation(req.params.id, {
    reason: "Violation deleted",
    userId: req.user?.id,
  });
  // Otherwise the background sync would re-import the citizen report.
  await rememberDeletedCitizenReport(current.sourceReportId, req.user?.id || null);
  res.json({ ok: true });
});

// POST /api/violations/sync-citizen-reports
// Manual trigger for the same import the background interval runs on a
// timer (see server.js) — lets HQ pull in new citizen reports on demand
// instead of waiting for the next tick.
export const syncCitizenReportsNow = asyncHandler(async (req, res) => {
  const result = await syncCitizenReports();
  res.json(result);
});

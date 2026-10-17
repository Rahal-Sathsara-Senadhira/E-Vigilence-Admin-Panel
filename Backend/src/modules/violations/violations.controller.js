import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./violations.service.js";
import { validateCreate } from "./violations.validation.js";
import { HttpError } from "../../utils/httpError.js";
import { parseDms, formatDms } from "../../utils/parseDms.js";
import { uploadMultipleEvidenceFiles } from "../../utils/evidenceStorage.js";
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

  res.json(result);
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

  res.json(item);
});

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
    vehicleNumber: req.body.vehicleNumber || null,
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
    !sameText(String(patch.vehicleNumber ?? "").toUpperCase(), String(current.vehicleNumber ?? "").toUpperCase())
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

  if (typeof req.body.vehicleNumber === "string") patch.vehicleNumber = req.body.vehicleNumber;
  if (typeof req.body.vehicleType === "string") patch.vehicleType = req.body.vehicleType;
  if (typeof req.body.callerMobile === "string") patch.callerMobile = req.body.callerMobile;
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

/**
 * Upload evidence files (images, videos, audios). Uses Cloudinary when
 * configured, otherwise falls back to GridFS (utils/evidenceStorage.js) —
 * same STORAGE_DRIVER=auto behavior the citizen app's backend already uses.
 * Expects multipart form data with files.
 */
export const uploadEvidence = asyncHandler(async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    throw new HttpError(400, "No files provided");
  }

  const uploadedUrls = {
    images: [],
    videos: [],
    audios: [],
  };

  try {
    // Handle image uploads
    if (req.files.images) {
      const images = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];
      uploadedUrls.images = await uploadMultipleEvidenceFiles(images, "evidence/images", req);
    }

    // Handle video uploads
    if (req.files.videos) {
      const videos = Array.isArray(req.files.videos)
        ? req.files.videos
        : [req.files.videos];
      uploadedUrls.videos = await uploadMultipleEvidenceFiles(videos, "evidence/videos", req);
    }

    // Handle audio uploads
    if (req.files.audios) {
      const audios = Array.isArray(req.files.audios)
        ? req.files.audios
        : [req.files.audios];
      uploadedUrls.audios = await uploadMultipleEvidenceFiles(audios, "evidence/audios", req);
    }

    res.status(201).json({
      ok: true,
      data: uploadedUrls,
      message: "Files uploaded successfully",
    });
  } catch (error) {
    throw new HttpError(500, error.message || "File upload failed");
  }
});

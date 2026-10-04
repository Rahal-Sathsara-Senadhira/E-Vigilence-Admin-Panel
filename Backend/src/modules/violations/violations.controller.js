import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./violations.service.js";
import { validateCreate } from "./violations.validation.js";
import { HttpError } from "../../utils/httpError.js";
import { parseDms } from "../../utils/parseDms.js";
import { uploadMultipleEvidenceFiles } from "../../utils/evidenceStorage.js";
import { normalizeStatus } from "../../utils/violationStatus.js";
import { syncStatusToCitizenReport, syncCitizenReports } from "./citizenReportSync.js";
import { resolveCatalogEntries } from "../../utils/violationCatalog.js";
import ViolationCatalogEntry from "../../db/providers/mongo/models/ViolationCatalogEntry.js";
import { assertValidTransition, assertRequiredFieldsForTransition } from "../../utils/violationWorkflow.js";
import { createCitationForVerifiedViolation } from "../citations/citations.service.js";

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

export const list = asyncHandler(async (req, res) => {
  const type = req.query.type ?? req.query.category;

  const result = await svc.list({
    type: type || undefined,
    status: req.query.status || undefined,
    q: req.query.q || undefined,
    limit: req.query.limit ?? 50,
    offset: req.query.offset ?? 0,
  });

  res.json(result);
});

export const getById = asyncHandler(async (req, res) => {
  const item = await svc.getById(req.params.id);
  // ✅ item will be full doc now (repo fix below)
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

export const update = asyncHandler(async (req, res) => {
  const patch = {};

  if (typeof req.body.title === "string" && req.body.title.trim()) {
    patch.title = req.body.title.trim();
  }

  if (Array.isArray(req.body.violations)) {
    const { violationIds, type } = await resolveViolationsAndType(req.body.violations);
    patch.violations = violationIds;
    patch.type = type;
  }

  if (typeof req.body.description === "string") {
    patch.description = req.body.description;
  }

  if (typeof req.body.vehicleNumber === "string") patch.vehicleNumber = req.body.vehicleNumber;
  if (typeof req.body.vehicleType === "string") patch.vehicleType = req.body.vehicleType;
  if (typeof req.body.callerMobile === "string") patch.callerMobile = req.body.callerMobile;
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
  if (location) patch.location = location;

  if (Array.isArray(req.body.images)) patch.images = req.body.images;
  if (Array.isArray(req.body.videos)) patch.videos = req.body.videos;
  if (Array.isArray(req.body.audios)) patch.audios = req.body.audios;

  let wasVerified = false;
  if (patch.status) {
    const current = await svc.getById(req.params.id);
    assertValidTransition(current.status, patch.status, req.user?.role);
    assertRequiredFieldsForTransition(patch.status, current, patch);
    wasVerified = current.status === "verified";
  }

  const updated = await svc.update(req.params.id, patch, historyEntry);

  if (historyEntry && updated.sourceReportId) {
    await syncStatusToCitizenReport(updated.sourceReportId, updated.status);
  }

  // The actual enforcement consequence of verification — see
  // VIOLATIONS_BUSINESS_LOGIC.md #4. Guarded on the *previous* status so
  // re-saving an already-verified violation doesn't mint a second citation.
  if (patch.status === "verified" && !wasVerified) {
    await createCitationForVerifiedViolation(updated, req.user?.id);
  }

  res.json(updated);
});

export const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id);
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

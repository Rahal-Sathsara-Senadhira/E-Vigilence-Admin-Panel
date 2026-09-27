import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./violations.service.js";
import { validateCreate } from "./violations.validation.js";
import { HttpError } from "../../utils/httpError.js";
import { parseDms } from "../../utils/parseDms.js";
import { uploadMultipleToCloudinary } from "../../utils/cloudinaryUpload.js";
import { normalizeStatus } from "../../utils/violationStatus.js";
import { syncStatusToCitizenReport, syncCitizenReports } from "./citizenReportSync.js";

function normalizeViolations(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const item of v) {
    const val = String(item ?? "").trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
  }
  return out;
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

  const type = req.body.type ?? req.body.category;
  const dmsText = req.body.dms ?? req.body.locationText;

  let location = req.body.location;

  // ✅ If location not provided, allow DMS text and parse to lat/lng
  if (!location && dmsText) {
    const parsed = parseDms(dmsText);
    if (!parsed) throw new HttpError(400, "Invalid DMS format");
    location = { ...parsed, dms: dmsText };
  }

  const violations = normalizeViolations(req.body.violations);

  const created = await svc.create({
    title: req.body.title,
    type,
    violations,
    description: req.body.description || "",
    location,
    reported_by: req.body.reported_by || null,
    status: normalizeStatus(req.body.status, "open"),
    images: Array.isArray(req.body.images) ? req.body.images : [],
    videos: Array.isArray(req.body.videos) ? req.body.videos : [],
    audios: Array.isArray(req.body.audios) ? req.body.audios : [],
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

  const type = req.body.type ?? req.body.category;
  if (typeof type === "string" && type.trim()) patch.type = type.trim();

  if (Array.isArray(req.body.violations)) {
    patch.violations = normalizeViolations(req.body.violations);
  }

  if (typeof req.body.description === "string") {
    patch.description = req.body.description;
  }

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

  const updated = await svc.update(req.params.id, patch, historyEntry);

  if (historyEntry && updated.sourceReportId) {
    await syncStatusToCitizenReport(updated.sourceReportId, updated.status);
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
 * Upload evidence files (images, videos, audios) to Cloudinary
 * Expects multipart form data with files
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
      const imageUrls = await uploadMultipleToCloudinary(
        images,
        "evidence/images"
      );
      uploadedUrls.images = imageUrls;
    }

    // Handle video uploads
    if (req.files.videos) {
      const videos = Array.isArray(req.files.videos)
        ? req.files.videos
        : [req.files.videos];
      const videoUrls = await uploadMultipleToCloudinary(
        videos,
        "evidence/videos"
      );
      uploadedUrls.videos = videoUrls;
    }

    // Handle audio uploads
    if (req.files.audios) {
      const audios = Array.isArray(req.files.audios)
        ? req.files.audios
        : [req.files.audios];
      const audioUrls = await uploadMultipleToCloudinary(
        audios,
        "evidence/audios"
      );
      uploadedUrls.audios = audioUrls;
    }

    res.status(201).json({
      ok: true,
      data: uploadedUrls,
      message: "Files uploaded successfully to Cloudinary",
    });
  } catch (error) {
    throw new HttpError(500, error.message || "File upload failed");
  }
});

import CitizenReport from "../../db/providers/mongo/models/CitizenReport.js";
import CitizenReportSkip from "../../db/providers/mongo/models/CitizenReportSkip.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import User from "../../db/providers/mongo/models/User.js";
import * as violationsService from "./violations.service.js";
import { fromCitizenStatus, toCitizenStatus } from "../../utils/violationStatus.js";
import { extractCoordinates } from "../../utils/extractCoordinates.js";
import { formatDms, parseDms } from "../../utils/parseDms.js";
import { resolveCatalogEntries } from "../../utils/violationCatalog.js";
import ViolationCatalogEntry from "../../db/providers/mongo/models/ViolationCatalogEntry.js";

function splitEvidence(evidence = [], voiceNote = null, evidencePath = null) {
  const images = [];
  const videos = [];
  const audios = [];

  for (const item of evidence) {
    if (!item?.url) continue;
    if (item.kind === "video") videos.push(item.url);
    else if (item.kind === "audio") audios.push(item.url);
    else images.push(item.url);
  }

  if (voiceNote?.url) audios.push(voiceNote.url);
  if (evidencePath && images.length === 0 && videos.length === 0) {
    images.push(evidencePath);
  }

  return { images, videos, audios };
}

async function describeReporter(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).lean();
  if (!user) return null;

  const contact = user.phone || user.email || "";
  return contact ? `${user.name} (${contact})` : user.name || null;
}

function buildTitle(report) {
  const parts = [report.issueType, report.vehicleNumber].filter(Boolean);
  return parts.length ? parts.join(" — ") : "Citizen-reported violation";
}

/**
 * The citizen app's free-text location, tidied for display: Windows line
 * endings and runs of blank lines removed. Null when there is nothing.
 */
export function cleanAddress(text) {
  if (typeof text !== "string") return null;
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

/**
 * Maps the citizen app's location fields onto this app's Violation.location.
 *
 * The citizen app stores numbers in latitude/longitude (set by "Use my
 * current location") and a human-readable place in `location` (looked up
 * from the GPS fix, or typed). Here the numbers become lat/lng plus their
 * DMS form, and the text goes to `address` - never into `dms`, which the
 * rest of this app reads as coordinates. Coordinates typed into the text are
 * used only when there is no GPS fix.
 */
export function citizenLocation(report) {
  const address = cleanAddress(report.location);
  const hasGps =
    Number.isFinite(report.latitude) && Number.isFinite(report.longitude);
  const coords = hasGps
    ? { lat: report.latitude, lng: report.longitude }
    : extractCoordinates(address);

  return {
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    dms: coords ? formatDms(coords.lat, coords.lng) : null,
    address,
  };
}

/**
 * Imports any CitizenReport not yet mirrored into Violation. Safe to call
 * repeatedly — Violation.sourceReportId is the de-dup key. Reports HQ has
 * deleted are listed in CitizenReportSkip and stay deleted. Per-report
 * failures are logged and skipped rather than aborting the whole batch.
 */
export async function syncCitizenReports() {
  const [alreadyImported, skipped] = await Promise.all([
    Violation.find({ sourceReportId: { $ne: null } }).select("sourceReportId").lean(),
    CitizenReportSkip.find({}).select("reportId").lean(),
  ]);
  const doneIds = new Set([
    ...alreadyImported.map((v) => String(v.sourceReportId)),
    ...skipped.map((s) => String(s.reportId)),
  ]);

  const reports = await CitizenReport.find({}).lean();
  const pending = reports.filter((r) => !doneIds.has(String(r._id)));

  let imported = 0;

  for (const report of pending) {
    try {
      const reportedBy = await describeReporter(report.userId);
      const { images, videos, audios } = splitEvidence(
        report.evidence,
        report.voiceNote,
        report.evidencePath
      );

      // Match against static catalog entries (never auto-creates new entries)
      const violationIds = await resolveCatalogEntries([
        report.issueType || "Reported violation",
      ]);
      const primary = violationIds[0]
        ? await ViolationCatalogEntry.findById(violationIds[0]).lean()
        : null;

      await violationsService.create({
        title: buildTitle(report),
        type: primary?.name || report.issueType || "Uncategorized",
        violations: violationIds,
        description: report.additionalDetails || "",
        location: citizenLocation(report),
        reported_by: reportedBy,
        status: fromCitizenStatus(report.status),
        images,
        videos,
        audios,
        vehicleNumber: report.vehicleNumber || null,
        vehicleType: report.vehicleType || null,
        vehicleModel: report.vehicleModel || null,
        occurredAt: report.dateTime || null,
        sourceReportId: report._id,
        createdBy: null,
        createdByRole: "citizen-report-sync",
      });

      imported++;
    } catch (err) {
      console.error(
        `⚠️  Failed to sync citizen report ${report._id}:`,
        err.message
      );
    }
  }

  const backfilled = await backfillCitizenFields();

  return { scanned: reports.length, imported, backfilled };
}

/**
 * One-time upgrade of citizen-sourced violations imported before
 * `location.address`, `occurredAt` and `vehicleModel` existed. Those kept
 * the citizen's address text in `location.dms`. Moves it to `address`,
 * makes `dms` describe the coordinates, and fills in missing coordinates
 * from the report. Coordinates HQ already set on the map are kept.
 *
 * Writing `location.address` (even as null) marks a record as done, so
 * repeated runs only look at records that still need it.
 */
async function backfillCitizenFields() {
  const stale = await Violation.find({
    sourceReportId: { $ne: null },
    "location.address": { $exists: false },
  })
    .select("location sourceReportId occurredAt vehicleModel")
    .lean();
  if (!stale.length) return 0;

  const reports = await CitizenReport.find({
    _id: { $in: stale.map((v) => v.sourceReportId) },
  }).lean();
  const reportById = new Map(reports.map((r) => [String(r._id), r]));

  let fixed = 0;
  for (const v of stale) {
    const report = reportById.get(String(v.sourceReportId));
    const fromReport = report ? citizenLocation(report) : null;
    const oldDms = v.location?.dms ?? null;
    const oldDmsIsCoords = Boolean(oldDms && parseDms(oldDms));

    const hasCoords = Number.isFinite(v.location?.lat) && Number.isFinite(v.location?.lng);
    const coords = hasCoords
      ? { lat: v.location.lat, lng: v.location.lng }
      : fromReport?.lat != null
        ? { lat: fromReport.lat, lng: fromReport.lng }
        : extractCoordinates(cleanAddress(oldDms));

    const set = {
      "location.lat": coords?.lat ?? null,
      "location.lng": coords?.lng ?? null,
      "location.dms": coords ? formatDms(coords.lat, coords.lng) : null,
      // Prefer the report's own text; otherwise whatever text sat in dms.
      "location.address": fromReport?.address ?? (oldDmsIsCoords ? null : cleanAddress(oldDms)),
    };
    if (!v.occurredAt && report?.dateTime) set.occurredAt = report.dateTime;
    if (!v.vehicleModel && report?.vehicleModel) set.vehicleModel = report.vehicleModel;

    await Violation.updateOne({ _id: v._id }, { $set: set });
    fixed++;
  }

  return fixed;
}

/**
 * Writes HQ/station progress back to the citizen app's own status field, so
 * their app reflects it without either repo calling the other's API. A
 * rejection also carries its reason, so the citizen learns why. No-op if the
 * violation didn't originate from a citizen report.
 */
export async function syncStatusToCitizenReport(sourceReportId, adminStatus, { rejectionReason } = {}) {
  if (!sourceReportId) return;

  const citizenStatus = toCitizenStatus(adminStatus);
  await CitizenReport.updateOne(
    { _id: sourceReportId },
    {
      $set: {
        status: citizenStatus,
        rejectionReason: citizenStatus === "Rejected" ? rejectionReason || null : null,
      },
    }
  );
}

/**
 * Called when HQ deletes a violation. A citizen-sourced one is added to the
 * skip list so the next sync does not import its report again.
 */
export async function rememberDeletedCitizenReport(sourceReportId, deletedBy = null) {
  if (!sourceReportId) return;
  await CitizenReportSkip.updateOne(
    { reportId: sourceReportId },
    { $setOnInsert: { reportId: sourceReportId, reason: "deleted", deletedBy } },
    { upsert: true }
  );
}

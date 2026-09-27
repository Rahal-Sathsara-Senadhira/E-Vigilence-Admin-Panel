import CitizenReport from "../../db/providers/mongo/models/CitizenReport.js";
import Violation from "../../db/providers/mongo/models/Violation.js";
import User from "../../db/providers/mongo/models/User.js";
import * as violationsService from "./violations.service.js";
import { fromCitizenStatus, toCitizenStatus } from "../../utils/violationStatus.js";

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
 * Imports any CitizenReport not yet mirrored into Violation. Safe to call
 * repeatedly — Violation.sourceReportId is the de-dup key. Per-report
 * failures are logged and skipped rather than aborting the whole batch.
 */
export async function syncCitizenReports() {
  const alreadyImported = await Violation.find({ sourceReportId: { $ne: null } })
    .select("sourceReportId")
    .lean();
  const importedIds = new Set(alreadyImported.map((v) => String(v.sourceReportId)));

  const reports = await CitizenReport.find({}).lean();
  const pending = reports.filter((r) => !importedIds.has(String(r._id)));

  let imported = 0;

  for (const report of pending) {
    try {
      const reportedBy = await describeReporter(report.userId);
      const { images, videos, audios } = splitEvidence(
        report.evidence,
        report.voiceNote,
        report.evidencePath
      );

      const hasCoords =
        typeof report.latitude === "number" && typeof report.longitude === "number";

      await violationsService.create({
        title: buildTitle(report),
        type: report.issueType || "other",
        violations: [report.issueType || "Reported violation"],
        description: report.additionalDetails || "",
        location: {
          lat: hasCoords ? report.latitude : null,
          lng: hasCoords ? report.longitude : null,
          dms: report.location || null,
        },
        reported_by: reportedBy,
        status: fromCitizenStatus(report.status),
        images,
        videos,
        audios,
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

  return { scanned: reports.length, imported };
}

/**
 * Writes HQ/station progress back to the citizen app's own status field, so
 * their app reflects it without either repo calling the other's API. No-op
 * if the violation didn't originate from a citizen report.
 */
export async function syncStatusToCitizenReport(sourceReportId, adminStatus) {
  if (!sourceReportId) return;

  await CitizenReport.updateOne(
    { _id: sourceReportId },
    { $set: { status: toCitizenStatus(adminStatus) } }
  );
}

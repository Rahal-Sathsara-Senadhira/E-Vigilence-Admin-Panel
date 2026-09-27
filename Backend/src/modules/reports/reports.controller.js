import * as service from "./reports.service.js";

export async function violationsSummary(req, res, next) {
  try {
    const data = await service.getViolationsSummary(req.query);
    res.json({ data });
  } catch (e) {
    next(e);
  }
}

export async function violationsExportCsv(req, res, next) {
  try {
    const csv = await service.exportViolationsCsv(req.query);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"violations_report.csv\"");
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
}

// -----------------------------
// Saved report runs (history)
// -----------------------------

export async function createViolationsReportRun(req, res, next) {
  try {
    // optional fields
    const name = req.body?.name || null;
    // requireAuth is applied to this whole router — always attribute to the
    // authenticated caller, never a client-supplied value.
    const createdBy = req.user?.name || req.user?.email || req.user?.id || null;

    const run = await service.createViolationsReportRun({
      query: req.query,
      name,
      createdBy,
    });

    res.status(201).json({ data: run });
  } catch (e) {
    next(e);
  }
}

export async function listViolationsReportRuns(req, res, next) {
  try {
    const data = await service.listViolationsReportRuns(req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function getViolationsReportRun(req, res, next) {
  try {
    const run = await service.getViolationsReportRunById(req.params.id);
    if (!run) return res.status(404).json({ message: "Report run not found" });
    res.json({ data: run });
  } catch (e) {
    next(e);
  }
}

export async function exportViolationsReportRunCsv(req, res, next) {
  try {
    const csv = await service.exportViolationsReportRunCsv(req.params.id);
    if (!csv) return res.status(404).json({ message: "Report run not found" });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="violations_report_${req.params.id}.csv"`
    );
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
}

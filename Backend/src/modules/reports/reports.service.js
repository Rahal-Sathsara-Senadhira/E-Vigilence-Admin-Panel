import Violation from "../../db/providers/mongo/models/Violation.js";
import ReportRun from "../../db/providers/mongo/models/ReportRun.js";

function parseDate(d, fallback) {
  if (!d) return fallback;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return fallback;
  return x;
}

function buildFilter({ from, to, status, category }) {
  const start = parseDate(from, new Date("1970-01-01"));
  const end = parseDate(to, new Date());

  // include full "to" day
  end.setHours(23, 59, 59, 999);

  const filter = {
    createdAt: { $gte: start, $lte: end },
  };

  if (status) filter.status = status;
  if (category) filter.type = category; // your schema uses "type" for category

  return filter;
}

function normalizeFilters({ from, to, status, category }) {
  const start = from ? parseDate(from, null) : null;
  const endRaw = to ? parseDate(to, null) : null;
  const end = endRaw ? new Date(endRaw) : null;
  if (end) end.setHours(23, 59, 59, 999);

  return {
    from: start,
    to: end,
    status: status || null,
    category: category || null,
  };
}

export async function getViolationsSummary(query) {
  const filter = buildFilter(query);

  const [total, open, in_review, resolved] = await Promise.all([
    Violation.countDocuments(filter),
    Violation.countDocuments({ ...filter, status: "open" }),
    Violation.countDocuments({ ...filter, status: "in_review" }),
    Violation.countDocuments({ ...filter, status: "resolved" }),
  ]);

  // byCategory
  const byCategoryRaw = await Violation.aggregate([
    { $match: filter },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // byDay
  const byDayRaw = await Violation.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    kpis: { total, open, in_review, resolved },
    byCategory: byCategoryRaw.map((x) => ({ category: x._id || "unknown", count: x.count })),
    byDay: byDayRaw.map((x) => ({ day: x._id, count: x.count })),
  };
}

export async function exportViolationsCsv(query) {
  const filter = buildFilter(query);

  const rows = await Violation.find(filter)
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const header = [
    "title",
    "type",
    "status",
    "createdAt",
    "lat",
    "lng",
    "dms",
    "violations",
    "description",
  ];

  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const lines = [header.join(",")];

  for (const r of rows) {
    const line = [
      escape(r.title),
      escape(r.type),
      escape(r.status),
      escape(r.createdAt),
      escape(r.location?.lat),
      escape(r.location?.lng),
      escape(r.location?.dms),
      escape(Array.isArray(r.violations) ? r.violations.join(" | ") : ""),
      escape(r.description),
    ].join(",");

    lines.push(line);
  }

  return lines.join("\n");
}

// -----------------------------
// Saved / auditable report runs
// -----------------------------

async function getViolationIdsForFilter(filter) {
  // limit for safety (CSV/export in UI is capped too)
  const docs = await Violation.find(filter)
    .select({ _id: 1 })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  return docs.map((d) => d._id);
}

export async function createViolationsReportRun({ query, name, createdBy }) {
  const filter = buildFilter(query);
  const filtersNormalized = normalizeFilters(query);

  const [snapshot, violationIds] = await Promise.all([
    getViolationsSummary(query),
    getViolationIdsForFilter(filter),
  ]);

  const doc = await ReportRun.create({
    name: name || null,
    filters: filtersNormalized,
    snapshot,
    violationIds,
    createdBy: createdBy || null,
  });

  return {
    id: String(doc._id),
    name: doc.name,
    filters: doc.filters,
    snapshot: doc.snapshot,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

export async function listViolationsReportRuns({ limit = 20, offset = 0 }) {
  const lim = Math.min(Number(limit) || 20, 100);
  const off = Math.max(Number(offset) || 0, 0);

  const [total, docs] = await Promise.all([
    ReportRun.countDocuments({}),
    ReportRun.find({})
      .sort({ createdAt: -1 })
      .skip(off)
      .limit(lim)
      .lean(),
  ]);

  return {
    data: docs.map((d) => ({
      id: String(d._id),
      name: d.name,
      filters: d.filters,
      kpis: d.snapshot?.kpis || null,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
    })),
    meta: { total, limit: lim, offset: off },
  };
}

export async function getViolationsReportRunById(id) {
  const doc = await ReportRun.findById(id).lean();
  if (!doc) return null;

  return {
    id: String(doc._id),
    name: doc.name,
    filters: doc.filters,
    snapshot: doc.snapshot,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

export async function exportViolationsReportRunCsv(id) {
  const doc = await ReportRun.findById(id).lean();
  if (!doc) return null;

  const ids = Array.isArray(doc.violationIds) ? doc.violationIds : [];

  const rows = await Violation.find({ _id: { $in: ids } })
    .sort({ createdAt: -1 })
    .lean();

  const header = [
    "title",
    "type",
    "status",
    "createdAt",
    "lat",
    "lng",
    "dms",
    "violations",
    "description",
  ];

  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escape(r.title),
        escape(r.type),
        escape(r.status),
        escape(r.createdAt),
        escape(r.location?.lat),
        escape(r.location?.lng),
        escape(r.location?.dms),
        escape(Array.isArray(r.violations) ? r.violations.join(" | ") : ""),
        escape(r.description),
      ].join(",")
    );
  }

  return lines.join("\n");
}

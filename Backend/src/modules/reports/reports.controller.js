import { getViolationsSummary, getViolationsCsv } from "./reports.service.js";

function normalizeDateToIsoStart(dateStr) {
  // Accept "YYYY-MM-DD" and convert to ISO string start-of-day
  if (!dateStr) return null;
  return `${dateStr}T00:00:00.000Z`;
}

function normalizeDateToIsoEnd(dateStr) {
  // end of day
  if (!dateStr) return null;
  return `${dateStr}T23:59:59.999Z`;
}

export async function violationsSummaryHandler(req, res, next) {
  try {
    const { from, to, status, category } = req.query;

    const data = await getViolationsSummary({
      from: from ? normalizeDateToIsoStart(from) : null,
      to: to ? normalizeDateToIsoEnd(to) : null,
      status: status || null,
      category: category || null,
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

function toCsv(rows) {
  const headers = [
    "id",
    "title",
    "description",
    "category",
    "status",
    "location_text",
    "lat_dms",
    "lng_dms",
    "latitude",
    "longitude",
    "created_at",
    "updated_at",
  ];

  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // wrap in quotes if contains comma/quote/newline
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];

  return lines.join("\n");
}

export async function violationsCsvHandler(req, res, next) {
  try {
    const { from, to, status, category } = req.query;

    const rows = await getViolationsCsv({
      from: from ? normalizeDateToIsoStart(from) : null,
      to: to ? normalizeDateToIsoEnd(to) : null,
      status: status || null,
      category: category || null,
    });

    const csv = toCsv(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="violations_report.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

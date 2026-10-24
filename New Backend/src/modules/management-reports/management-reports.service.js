// Management reports — docs/12 §7. Generated as PDF and CSV, on a schedule
// (in Sri Lanka time) or on demand. Every run is recorded — what, which
// period and scope, who asked, and each file's fingerprint — and listed
// under "Report runs". Generating is audited.

import { createHash, randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { scopeOf } from "#src/core/access/permissions.js";
import { roleInfo } from "#src/core/access/roles.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { forbidden, notFound, validationError } from "#src/core/errors.js";
import { scopeFor } from "../dashboard/dashboard.service.js";
import { dayStart, resolvePeriod } from "../dashboard/period.js";
import { Division, Station } from "../organisation/organisation.model.js";
import { REPORT_TYPES } from "./catalogue.js";
import { renderCsv } from "./csv.js";
import { renderPdf } from "./pdf.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {import("../dashboard/period.js").Period} Period */
/** @typedef {import("../dashboard/dashboard.service.js").Scope} Scope */

const DAY = 86_400_000;
const COLOMBO = 5.5 * 3_600_000;
/** Scheduled reports run at 06:00 Sri Lanka time (§7). */
const RUN_AT = 6 * 3_600_000;

const fileSchema = new mongoose.Schema(
  { key: String, size: Number, sha256: String },
  { _id: false },
);
const runSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    periodLabel: { type: String, required: true },
    /** national · division · station */
    scope: {
      kind: { type: String, required: true },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      label: { type: String, required: true },
    },
    /** scheduled · on_demand */
    trigger: { type: String, required: true },
    requestedBy: {
      type: new mongoose.Schema(
        { id: mongoose.Schema.Types.ObjectId, name: String },
        { _id: false },
      ),
      default: null,
    },
    /** done · failed */
    status: { type: String, required: true },
    files: { pdf: { type: fileSchema, default: null }, csv: { type: fileSchema, default: null } },
    error: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
// A scheduled report runs once per period.
runSchema.index(
  { type: 1, periodFrom: 1, "scope.kind": 1 },
  { unique: true, partialFilterExpression: { trigger: "scheduled" } },
);
runSchema.index({ createdAt: -1 });
runSchema.index({ "scope.id": 1, createdAt: -1 });

export const ReportRun = mongoose.model("ReportRun", runSchema, "report_runs");

/** @type {import("#src/core/storage.js").Storage | null} */
let storage = null;
/** @param {import("#src/core/storage.js").Storage} s */
export function configureReports(s) {
  storage = s;
}

// ── Periods ─────────────────────────────────────────────────────────────

const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Colombo",
});
const SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Colombo",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Colombo",
});

/** How a period reads in a report's title. @param {Date} from @param {Date} to */
function labelOf(from, to) {
  const last = new Date(to.getTime() - 1);
  if (to.getTime() - from.getTime() === DAY) return LONG.format(from);
  const local = new Date(from.getTime() + COLOMBO);
  const nextMonth = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - COLOMBO,
  );
  if (local.getUTCDate() === 1 && local.getUTCHours() === 0 && nextMonth.getTime() === to.getTime())
    return MONTH.format(from);
  return `${SHORT.format(from)} – ${SHORT.format(last)}`;
}

/** A period with the one before it, of the same length. @param {Date} from @param {Date} to @returns {Period} */
function periodOf(from, to) {
  const length = to.getTime() - from.getTime();
  return {
    key: `${from.toISOString()}..${to.toISOString()}`,
    from,
    to,
    prevFrom: new Date(from.getTime() - length),
    prevTo: from,
    bucket: length > 92 * DAY ? "month" : "day",
  };
}

/** The last complete day, Monday-to-Sunday week, or month before `now`. @param {"daily" | "weekly" | "monthly"} every @param {Date} now */
export function lastComplete(every, now) {
  const today = dayStart(now);
  if (every === "daily") return { from: new Date(today.getTime() - DAY), to: today, due: today };
  if (every === "weekly") {
    const weekday = new Date(today.getTime() + COLOMBO).getUTCDay(); // 0 Sunday
    const monday = new Date(today.getTime() - ((weekday + 6) % 7) * DAY);
    return { from: new Date(monday.getTime() - 7 * DAY), to: monday, due: monday };
  }
  const local = new Date(now.getTime() + COLOMBO);
  const first = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - COLOMBO);
  const previous = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - COLOMBO);
  return { from: previous, to: first, due: first };
}

// ── Scope and permission ────────────────────────────────────────────────

/** @param {Actor} actor */
const level = (actor) => scopeOf(actor.role, "managementReports.view");

/**
 * The scope a user asks for, within what they may see (D5), and its label.
 * @param {Actor} actor @param {{ divisionId?: string, stationId?: string }} q
 */
async function scopeAndLabel(actor, q) {
  const s = await scopeFor(
    /** @type {any} */ ({
      ...actor,
      // The report permission decides the level; the dashboard scope rules apply.
      role:
        level(actor) === "S"
          ? "station_oic"
          : level(actor) === "D"
            ? "division_supervisor"
            : "hq_admin",
    }),
    { period: "30d", divisionId: q.divisionId, stationId: q.stationId },
  );
  if (s.national)
    return { scope: s, record: { kind: "national", id: null, label: "All of Sri Lanka" } };
  if (s.stationIds?.length === 1 && (q.stationId || level(actor) === "S")) {
    const st = await Station.findById(s.stationIds[0], { name: 1 }).lean();
    return {
      scope: s,
      record: { kind: "station", id: s.stationIds[0], label: st?.name ?? "Station" },
    };
  }
  const divisionId = level(actor) === "D" ? actor.divisionId : q.divisionId;
  const d = divisionId ? await Division.findById(divisionId, { name: 1 }).lean() : null;
  return {
    scope: s,
    record: { kind: "division", id: d?._id ?? null, label: d ? `${d.name} division` : "Division" },
  };
}

/** Runs a user may see. @param {Actor} actor @returns {Promise<Record<string, any>>} */
async function runFilter(actor) {
  const l = level(actor);
  if (l === "N" || l === "R") return {};
  if (l === "D") {
    const stations = await Station.distinct("_id", { divisionId: actor.divisionId });
    return { "scope.id": { $in: [actor.divisionId, ...stations] } };
  }
  return { "scope.kind": "station", "scope.id": actor.stationId };
}

// ── Generating ──────────────────────────────────────────────────────────

/**
 * Builds the report, stores its PDF and CSV, and records the run.
 * @param {{ type: string, scope: Scope, record: { kind: string, id: any, label: string }, from: Date, to: Date,
 *   trigger: "scheduled" | "on_demand", by: { id: any, name: string } | null, ctx?: { ip?: string | null, userAgent?: string | null } }} input
 */
async function generate(input) {
  if (!storage) throw new Error("Report storage isn't configured.");
  const type = REPORT_TYPES[input.type];
  if (!type) throw validationError({ type: "Choose a report." });
  const period = periodOf(input.from, input.to);
  const periodLabel = labelOf(input.from, input.to);
  const run = new ReportRun({
    type: input.type,
    title: type.title,
    periodFrom: input.from,
    periodTo: input.to,
    periodLabel,
    scope: input.record,
    trigger: input.trigger,
    requestedBy: input.by,
    status: "done",
  });
  try {
    const sections = await type.build({ scope: input.scope, period, periodLabel });
    const doc = {
      title: type.title,
      subtitle: `${input.record.label} · ${periodLabel} · generated ${SHORT.format(new Date())} ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" })} Sri Lanka time${input.by ? ` by ${input.by.name}` : " (scheduled)"}`,
      sections,
    };
    run.files = {
      pdf: await store(run, "pdf", renderPdf(doc), "application/pdf"),
      csv: await store(run, "csv", renderCsv(doc), "text/csv; charset=utf-8"),
    };
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message.slice(0, 500) : "Failed";
  }
  await run.save();
  await recordAudit({
    actor: input.by
      ? { kind: "staff", id: input.by.id, name: input.by.name }
      : { kind: "system", id: null, name: "Report scheduler" },
    action: "management_reports.generated",
    summary: `${type.title}, ${input.record.label}, ${periodLabel}: ${run.status}${run.files?.pdf ? ` (PDF sha256 ${run.files.pdf.sha256?.slice(0, 16)}…)` : ""}`,
    target: { type: "report_run", id: String(run._id), label: type.title },
    source: input.ctx,
    places: input.record.kind === "station" ? [{ stationId: input.record.id }] : [],
  });
  return run;
}

/** @param {any} run @param {"pdf" | "csv"} ext @param {Buffer} data @param {string} contentType */
async function store(run, ext, data, contentType) {
  const key = `management-reports/${run._id}.${ext}`;
  const tmp = path.join(os.tmpdir(), `ev-report-${randomUUID()}.${ext}`);
  await writeFile(tmp, data);
  try {
    await /** @type {NonNullable<typeof storage>} */ (storage).putFile(key, tmp, contentType);
  } finally {
    await unlink(tmp).catch(() => {});
  }
  return { key, size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
}

/**
 * A report on demand. Read-only roles download reports but don't make them (S6).
 * @param {Actor} actor
 * @param {{ type: string, period: any, from?: string, to?: string, divisionId?: string, stationId?: string }} q
 * @param {{ ip?: string | null, userAgent?: string | null }} ctx
 */
export async function requestReport(actor, q, ctx) {
  const l = level(actor);
  if (!l || roleInfo(actor.role).readOnly)
    throw forbidden("Your role can read reports but not make them.");
  const type = REPORT_TYPES[q.type];
  if (!type) throw validationError({ type: "Choose a report." });
  const { scope, record } = await scopeAndLabel(actor, q);
  if (type.level === "national" && record.kind !== "national")
    throw validationError({ type: "This report covers the whole country only." });
  const p = resolvePeriod(q);
  const run = await generate({
    type: q.type,
    scope,
    record,
    from: p.from,
    to: p.to,
    trigger: "on_demand",
    by: { id: actor.userId, name: actor.name },
    ctx,
  });
  return runView(run.toObject());
}

/**
 * The scheduled reports (§7) at 06:00 Sri Lanka time, each once per period,
 * for the whole country. Run by the server every few minutes.
 * @param {Date} [now]
 */
export async function runScheduledReports(now = new Date()) {
  const scope = /** @type {Scope} */ ({
    kind: "command",
    stationIds: null,
    national: true,
    userId: new mongoose.Types.ObjectId(),
    role: "system",
  });
  let made = 0;
  for (const [key, type] of Object.entries(REPORT_TYPES)) {
    if (!type.schedule) continue;
    const { from, to, due } = lastComplete(type.schedule, now);
    if (now.getTime() < due.getTime() + RUN_AT) continue;
    if (
      await ReportRun.exists({
        type: key,
        periodFrom: from,
        "scope.kind": "national",
        trigger: "scheduled",
      })
    )
      continue;
    try {
      await generate({
        type: key,
        scope,
        record: { kind: "national", id: null, label: "All of Sri Lanka" },
        from,
        to,
        trigger: "scheduled",
        by: null,
      });
      made += 1;
    } catch (err) {
      // Another instance made it first (unique index): nothing to do.
      if (/** @type {any} */ (err)?.code !== 11000) throw err;
    }
  }
  return made;
}

// ── Reading ─────────────────────────────────────────────────────────────

/** @param {any} r */
const runView = (r) => ({
  id: String(r._id),
  type: r.type,
  title: r.title,
  periodLabel: r.periodLabel,
  periodFrom: r.periodFrom.toISOString(),
  periodTo: r.periodTo.toISOString(),
  scope: { kind: r.scope.kind, label: r.scope.label },
  trigger: r.trigger,
  requestedBy: r.requestedBy?.name ?? null,
  status: r.status,
  error: r.error ?? null,
  files: {
    pdf: r.files?.pdf ? { size: r.files.pdf.size, sha256: r.files.pdf.sha256 } : null,
    csv: r.files?.csv ? { size: r.files.csv.size, sha256: r.files.csv.sha256 } : null,
  },
  createdAt: r.createdAt.toISOString(),
});

/** The reports a user can make, and the runs they can see. @param {Actor} actor @param {{ type?: string, page: number, pageSize: number }} q */
export async function listReports(actor, { type, page, pageSize }) {
  const l = level(actor);
  if (!l) throw forbidden();
  const national = l === "N" || l === "R";
  const filter = { ...(await runFilter(actor)), ...(type ? { type } : {}) };
  const [rows, total] = await Promise.all([
    ReportRun.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ReportRun.countDocuments(filter),
  ]);
  return {
    types: Object.entries(REPORT_TYPES)
      .filter(([, t]) => national || t.level === "any")
      .map(([key, t]) => ({
        key,
        title: t.title,
        summary: t.summary,
        schedule: t.schedule,
        level: t.level,
      })),
    canRequest: !roleInfo(actor.role).readOnly,
    items: rows.map(runView),
    total,
    page,
    pageSize,
  };
}

/**
 * One run's file, for download.
 * @param {Actor} actor @param {string} id @param {"pdf" | "csv"} format
 */
export async function reportFile(actor, id, format) {
  if (!level(actor)) throw forbidden();
  if (!mongoose.isValidObjectId(id)) throw notFound("Report not found.");
  const run = await ReportRun.findOne({ _id: id, ...(await runFilter(actor)) }).lean();
  const file = run?.files?.[format];
  if (!run || !file?.key) throw notFound("Report not found.");
  const { stream } = await /** @type {NonNullable<typeof storage>} */ (storage).get(file.key);
  const name = `${run.type.replaceAll("_", "-")}-${run.periodFrom.toISOString().slice(0, 10)}.${format}`;
  return {
    stream,
    size: file.size ?? null,
    name,
    contentType: format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
  };
}

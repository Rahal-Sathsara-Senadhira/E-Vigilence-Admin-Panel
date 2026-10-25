// Data retention — docs/10 §6, §5.5. HQ previews what is due at any time;
// nothing is deleted until the schedule is confirmed by legal review and
// HQ turns retention on (D10-2, D10-8). Then it runs monthly (and on
// demand), each record in its own step: evidence files deleted, personal
// data replaced, and an audit entry naming the rule.
//
// Also here: a citizen who deletes their app account (§5.5) — their reports
// stay as police records, linked to an anonymous token instead of them.

import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { recordAudit } from "#src/core/audit/audit.js";
import { inTransaction } from "#src/core/db/connection.js";
import { conflict } from "#src/core/errors.js";
import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { Notice } from "../notices/index.js";
import { Report } from "../reports/report.model.js";
import { ReporterAccount } from "../reporters/index.js";
import { Payout } from "../rewards/payout.model.js";
import { RewardEntry } from "../rewards/reward.model.js";
import {
  anonymiseCase,
  anonymiseCourtCase,
  anonymiseNotice,
  anonymiseReport,
  anonymiseUnlinkedPeople,
  deleteFiles,
  evidenceOfCase,
  markEvidenceDeleted,
} from "./anonymise.js";
import { AccountDeletion, RetentionRun, RetentionSetting } from "./retention.model.js";
import { RULES } from "./rules.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */
/** @typedef {{ ip?: string | null, userAgent?: string | null }} RequestContext */
/** @typedef {import("mongoose").ClientSession} Session */

const SYSTEM = { kind: /** @type {const} */ ("system"), id: null, name: "Data retention" };
/** Records handled per rule in one run; the rest wait for the next. */
const PER_RUN = 500;
const COLOMBO = 5.5 * 3_600_000;

/** @type {import("#src/core/storage.js").Storage | null} */
let storage = null;
/** @param {import("#src/core/storage.js").Storage} s */
export function configureRetention(s) {
  storage = s;
}

// ── The switch ──────────────────────────────────────────────────────────

export async function retentionEnabled() {
  const v = await RetentionSetting.findOne().sort({ effectiveFrom: -1 }).lean();
  return Boolean(v?.enabled);
}

/**
 * Turns retention on (after the legal review) or off, with a reason.
 * @param {Actor} actor @param {{ enabled: boolean, reason: string }} input @param {RequestContext} ctx
 */
export async function setRetention(actor, input, ctx) {
  if ((await retentionEnabled()) === input.enabled)
    throw conflict("unchanged", `Retention is ${input.enabled ? "on" : "off"} already.`);
  await inTransaction(async (session) => {
    await RetentionSetting.create(
      [
        {
          effectiveFrom: new Date(),
          enabled: input.enabled,
          changedBy: actor.name,
          changedById: actor.userId,
          reason: input.reason,
        },
      ],
      { session },
    );
    await recordAudit(
      {
        actor: { kind: "staff", id: actor.userId, name: actor.name, role: actor.role },
        action: "retention.settings_changed",
        summary: `Data retention turned ${input.enabled ? "on" : "off"}: ${input.reason}`,
        target: { type: "retention", id: "settings", label: "Data retention" },
        source: ctx,
      },
      session,
    );
  });
  return overview();
}

// ── Preview and runs ────────────────────────────────────────────────────

/** What is due now under each rule, and what is held back (§6). @param {Date} [now] */
export async function preview(now = new Date()) {
  const rules = [];
  for (const rule of RULES) {
    const { due, held } = await rule.find(now);
    const view = (/** @type {import("./rules.js").Item} */ i) => ({
      id: String(i.id),
      number: i.number,
      since: i.since.toISOString(),
      reason: i.reason ?? null,
    });
    rules.push({
      key: rule.key,
      label: rule.label,
      keptFor: rule.keptFor,
      due: due.length,
      held: held.length,
      sample: due.slice(0, 20).map(view),
      heldSample: held.slice(0, 20).map(view),
    });
  }
  return { at: now.toISOString(), rules };
}

/** The switch, the preview and the latest runs, for the page. */
export async function overview() {
  const [enabled, history, runs, view] = await Promise.all([
    retentionEnabled(),
    RetentionSetting.find().sort({ effectiveFrom: -1 }).limit(20).lean(),
    RetentionRun.find().sort({ startedAt: -1 }).limit(12).lean(),
    preview(),
  ]);
  return {
    enabled,
    history: history.map((h) => ({
      at: h.effectiveFrom.toISOString(),
      enabled: h.enabled,
      by: h.changedBy,
      reason: h.reason,
    })),
    runs: runs.map((r) => ({
      id: String(r._id),
      trigger: r.trigger,
      by: r.by,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      results: r.results.map((x) => ({
        rule: x.rule,
        label: x.label,
        done: x.done,
        held: x.held,
        failed: x.failed,
        problems: x.problems ?? [],
      })),
    })),
    preview: view,
  };
}

/**
 * Applies one rule to one record: files first (outside the transaction —
 * storage can't roll back, and deleting twice is harmless), then the
 * records and the audit entry together.
 * @param {string} rule @param {string} label @param {any} id
 */
async function applyOne(rule, label, id) {
  const files = /** @type {NonNullable<typeof storage>} */ (storage);
  if (rule === "rejected_reports") {
    const r = await Report.findById(id, { evidenceIds: 1, reportNumber: 1 }).lean();
    if (!r) return;
    const gone = await deleteFiles(files, r.evidenceIds ?? []);
    await inTransaction(async (session) => {
      await markEvidenceDeleted(session, gone, label);
      await anonymiseReport(session, id, rule);
      await audit(session, "report", id, r.reportNumber, label, gone.length);
    });
    return;
  }
  if (rule === "court_cases") {
    const cc = await CourtCase.findById(id, { caseId: 1, courtRef: 1 }).lean();
    if (!cc) return;
    const c = await Case.findById(cc.caseId).lean();
    const gone = c ? await deleteFiles(files, await evidenceOfCase(c)) : [];
    await inTransaction(async (session) => {
      await markEvidenceDeleted(session, gone, label);
      /** @type {any[]} */
      const people = await anonymiseCourtCase(session, id, rule);
      if (c && c.status === "closed")
        people.push(...(await anonymiseCaseAndNotices(session, c._id, rule)));
      await anonymiseUnlinkedPeople(session, people);
      await audit(session, "court_case", id, cc.courtRef, label, gone.length);
    });
    return;
  }
  const c = await Case.findById(id).lean();
  if (!c) return;
  const gone = await deleteFiles(files, await evidenceOfCase(c));
  await inTransaction(async (session) => {
    await markEvidenceDeleted(session, gone, label);
    const people = await anonymiseCaseAndNotices(session, id, rule);
    await anonymiseUnlinkedPeople(session, people);
    await audit(session, "case", id, c.caseNumber, label, gone.length);
  });
}

/** A case, its reports and its notices. @param {Session} session @param {any} caseId @param {string} rule */
async function anonymiseCaseAndNotices(session, caseId, rule) {
  const people = await anonymiseCase(session, caseId, rule);
  const notices = await Notice.find({ caseId, retention: null }, { _id: 1 }, { session }).lean();
  for (const n of notices) people.push(...(await anonymiseNotice(session, n._id, rule)));
  return people;
}

/** @param {Session} session @param {string} type @param {any} id @param {string} label @param {string} rule @param {number} files */
async function audit(session, type, id, label, rule, files) {
  await recordAudit(
    {
      actor: SYSTEM,
      action: "retention.applied",
      summary: `${rule}: ${files} evidence file${files === 1 ? "" : "s"} deleted, personal data removed`,
      target: { type, id: String(id), label },
    },
    session,
  );
}

/**
 * One run over every rule, once retention is on.
 * @param {{ trigger: "monthly" | "manual", by: string }} who @param {Date} [now]
 */
export async function runRetention(who, now = new Date()) {
  if (!storage) throw new Error("Retention storage isn't configured.");
  if (!(await retentionEnabled()))
    throw conflict("off", "Data retention is off until the schedule is confirmed by legal review.");
  const run = await RetentionRun.create({
    trigger: who.trigger,
    by: who.by,
    startedAt: new Date(),
  });
  for (const rule of RULES) {
    const { due, held } = await rule.find(now);
    let done = 0;
    let failed = 0;
    /** @type {string[]} */
    const problems = [];
    for (const item of due.slice(0, PER_RUN)) {
      try {
        await applyOne(rule.key, rule.label, item.id);
        done += 1;
      } catch (err) {
        failed += 1;
        if (problems.length < 5)
          problems.push(`${item.number}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    run.results.push({
      rule: rule.key,
      label: rule.label,
      done,
      held: held.length,
      failed,
      problems,
    });
  }
  run.finishedAt = new Date();
  await run.save();
  return run.toObject();
}

/**
 * The monthly run: once a month, from the 1st at 03:00 Sri Lanka time,
 * while retention is on (§6).
 * @param {Date} [now]
 */
export async function runMonthlyRetention(now = new Date()) {
  if (!(await retentionEnabled())) return null;
  const local = new Date(now.getTime() + COLOMBO);
  const month = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - COLOMBO);
  if (now.getTime() < month.getTime() + 3 * 3_600_000) return null;
  if (await RetentionRun.exists({ trigger: "monthly", startedAt: { $gte: month } })) return null;
  return runRetention({ trigger: "monthly", by: "Monthly run" }, now);
}

// ── A citizen deletes their app account (§5.5) ──────────────────────────

/** A stable anonymous token for a deleted account. @param {string} userId */
const tokenOf = (userId) =>
  `deleted-${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;

/**
 * Reads accounts the app has deleted (`account_deletions`, written by the
 * app) and carries each out once: reports stay, linked to an anonymous
 * token; the reporter's name and phone go; unpaid points lapse; paid-out
 * history stays for audit under the token.
 */
export async function importAccountDeletions() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected.");
  const rows = await db.collection("account_deletions").find({}).limit(500).toArray();
  let done = 0;
  for (const row of rows) {
    const userId = row.userId ? String(row.userId) : null;
    if (!userId || (await AccountDeletion.exists({ userId }))) continue;
    await inTransaction((session) => forgetCitizen(session, userId));
    done += 1;
  }
  return done;
}

/** @param {Session} session @param {string} userId */
async function forgetCitizen(session, userId) {
  const token = tokenOf(userId);
  const now = new Date();
  await Report.updateMany(
    { "source.userId": userId },
    {
      $set: {
        "source.userId": token,
        "reporter.citizenId": token,
        "reporter.name": null,
        "reporter.phone": null,
      },
    },
    { session },
  );
  // Unpaid points lapse (docs/16 §10); anything set aside for a payout too.
  await RewardEntry.updateMany(
    { userId, status: { $in: ["pending", "confirmed"] } },
    {
      $set: { status: "expired", reason: "The account was deleted.", payoutId: null },
      $push: { history: { at: now, event: "account_deleted", by: SYSTEM.name, note: null } },
    },
    { session },
  );
  await Payout.updateMany(
    { userId, status: { $in: ["requested", "batched", "failed"] } },
    { $set: { status: "rejected", reason: "The account was deleted." } },
    { session },
  );
  await RewardEntry.updateMany({ userId }, { $set: { userId: token } }, { session });
  await Payout.updateMany({ userId }, { $set: { userId: token } }, { session });
  await ReporterAccount.deleteOne({ userId }, { session });
  await AccountDeletion.create([{ userId, token, at: now }], { session });
  await recordAudit(
    {
      actor: SYSTEM,
      action: "reporters.account_deleted",
      summary:
        "A citizen deleted their app account: reports kept under an anonymous token; unpaid points lapsed",
      target: { type: "reporter", id: token, label: token },
    },
    session,
  );
}

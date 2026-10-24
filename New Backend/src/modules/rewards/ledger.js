// The reward ledger — docs/16 §4, §5. Every move happens in the transaction
// of the change that causes it (a decision, a payment, a verdict), so points
// never disagree with the case. Each move tells the citizen in plain words
// on their report (docs/11 §5) and refreshes the balance the app shows.

import { Case } from "../cases/index.js";
import { OffenceVersion } from "../offences/offences.model.js";
import { publishUpdate } from "../reports/citizen-updates.js";
import { Report } from "../reports/report.model.js";
import { ReporterAccount } from "../reporters/index.js";
import { limitAt } from "../settings/settings.service.js";
import { checkReport } from "./checks.js";
import { Payout, PayoutBatch } from "./payout.model.js";
import { RewardEntry } from "./reward.model.js";
import { EVIDENCE_SHARE, LEAD_SHARE, casePoints, rulesAt } from "./rules.js";

/** @typedef {import("mongoose").ClientSession} Session */
/** @typedef {import("./reward.model.js").RewardEntryDocument} Entry */

const SYSTEM = "Rewards";
const DAY = 86_400_000;
/** Citizens are warned this long before confirmed points lapse (docs/09 §4). */
export const EXPIRY_WARNING_DAYS = 30;
const ENFORCEMENT = ["penalty_notice", "court", "warning"];
/** @type {Record<string, string>} */
const OUTCOME_WORDS = {
  penalty_notice: "Penalty notice",
  court: "Court referral",
  warning: "Warning",
};

/** What the citizen reads on the report for each state of its reward. */
export const LINES = {
  /** @param {number} p */
  pending: (p) => `${p} reward points pending. They are confirmed when the case is completed.`,
  held: () => "Your reward is being checked before it can be confirmed.",
  /** @param {number} p */
  confirmed: (p) => `${p} reward points confirmed and added to your balance.`,
  reversed: () => "The case outcome changed, so this reward was reversed.",
  /** @param {number} p */
  recovered: (p) =>
    `The case outcome changed. ${p} points already paid will be taken from your future rewards.`,
  /** @param {number} p */
  expired: (p) => `${p} reward points expired because they weren't paid out in time.`,
  duplicate: "Another report of this incident came first, so this one can't earn a reward.",
  fabricated: "Your pending rewards were cancelled after a report couldn't be accepted.",
};

/** A citizen report that can earn (not anonymous, from the app). @param {any} r */
const fromCitizen = (r) =>
  r.channel === "citizen_app" && r.reporter?.kind === "citizen" && Boolean(r.source?.userId);

/** @param {Entry} e @param {string} event @param {string} by @param {string | null} [note] */
function addEvent(e, event, by, note = null) {
  e.history.push({ at: new Date(), event, by, note });
}

/** The reward line for an entry's state — what the citizen reads now. @param {any} e */
export function lineFor(e) {
  if (e.kind === "recovery") return LINES.recovered(-e.points);
  if (e.status === "not_eligible") return e.reason ?? LINES.duplicate;
  if (e.hold && (e.status === "pending" || e.status === "confirmed")) return LINES.held();
  switch (e.status) {
    case "pending":
      return LINES.pending(e.points);
    case "confirmed":
      return LINES.confirmed(e.points);
    case "expired":
      return LINES.expired(e.points);
    case "reversed":
      return e.reason ?? LINES.reversed();
    default:
      return null;
  }
}

/** Writes the reward line on the citizen's report. @param {Session} session @param {any} e @param {string | null} [text] */
async function tell(session, e, text = lineFor(e)) {
  if (!text) return;
  const r = await Report.findById(
    e.reportId,
    { channel: 1, reportNumber: 1, source: 1 },
    { session },
  ).lean();
  if (!r) return;
  await publishUpdate(session, r, {
    type: "reward",
    title: "Reward",
    message: text,
    question: null,
  });
}

/**
 * The balance and latest lines the app shows (docs/11 §6). Held points count
 * as pending: they aren't the citizen's to spend yet.
 * @param {Session} session @param {string} userId
 */
export async function refreshAccount(session, userId) {
  const entries = await RewardEntry.find({ userId }, null, { session })
    .sort({ updatedAt: -1 })
    .lean();
  const soon = Date.now() + EXPIRY_WARNING_DAYS * DAY;
  const balance = {
    pending: 0,
    available: 0,
    inPayout: 0,
    paidOut: 0,
    expiringSoon: 0,
    updatedAt: new Date(),
  };
  for (const e of entries) {
    const held = Boolean(e.hold);
    if (e.status === "pending" || (e.status === "confirmed" && held)) balance.pending += e.points;
    else if (e.status === "confirmed" && e.payoutId) balance.inPayout += e.points;
    else if (e.status === "confirmed") {
      balance.available += e.points;
      if (e.kind === "award" && e.expiresAt && e.expiresAt.getTime() <= soon)
        balance.expiringSoon += e.points;
    } else if (e.status === "paid") balance.paidOut += e.points;
  }
  const ledger = entries.slice(0, 50).map((e) => ({
    reportNumber: e.reportNumber,
    points: e.points,
    status: e.hold && ["pending", "confirmed"].includes(e.status) ? "under_review" : e.status,
    message: lineFor(e),
    at: e.updatedAt,
  }));
  const payouts = (
    await Payout.find({ userId }, null, { session }).sort({ requestedAt: -1 }).limit(20).lean()
  ).map((p) => ({
    requestId: p.requestId,
    status: p.status,
    points: p.points,
    amount: p.amount,
    reference: p.reference ?? null,
    message: payoutLine(p),
    at: p.updatedAt,
  }));
  await ReporterAccount.updateOne(
    { userId },
    { $set: { balance, ledger, payouts } },
    { session, upsert: true, setDefaultsOnInsert: true },
  );
}

/** What the citizen reads about a payout request. @param {any} p */
function payoutLine(p) {
  switch (p.status) {
    case "requested":
      return `Rs ${p.amount} (${p.points} points) will be paid in the next weekly payout.${p.capped ? " The rest waits for next month's limit." : ""}`;
    case "batched":
      return `Your payout of Rs ${p.amount} is being processed.`;
    case "paid":
      return `Rs ${p.amount} paid. Reference ${p.reference}.`;
    case "failed":
      return `We couldn't pay Rs ${p.amount}: ${p.reason} Check your details in the app.`;
    default:
      return p.reason ?? "Your payout request wasn't approved.";
  }
}

/**
 * Takes a reversed entry out of the payout it was set aside for: the payout
 * shrinks, or is rejected if too little is left. Paid payouts aren't touched
 * (a paid entry is recovered instead).
 * @param {Session} session @param {Entry} e @param {string} by
 */
async function detachFromPayout(session, e, by) {
  const p = e.payoutId ? await Payout.findById(e.payoutId, null, { session }) : null;
  e.payoutId = null;
  if (!p || !["requested", "batched", "failed"].includes(p.status)) return;
  const rules = await rulesAt(p.requestedAt);
  p.entryIds = p.entryIds.filter((id) => String(id) !== String(e._id));
  p.points -= e.points;
  p.amount = Math.floor((p.points * rules.rupeesPer100Points) / 100);
  p.history.push({ at: new Date(), event: "reduced", by, note: `${e.reportNumber} reversed` });
  if (p.points < rules.minPayoutPoints)
    await closePayout(
      session,
      p,
      by,
      "Your available points changed after a case outcome changed. Ask again when you have enough.",
    );
  else await p.save({ session });
  await retotalBatch(session, p.batchId);
}

/**
 * Rejects a payout not yet paid and gives its points back.
 * @param {Session} session @param {any} p @param {string} by @param {string} reason
 */
async function closePayout(session, p, by, reason) {
  p.status = "rejected";
  p.reason = reason;
  p.history.push({ at: new Date(), event: "rejected", by, note: reason });
  await p.save({ session });
  await RewardEntry.updateMany(
    { _id: { $in: p.entryIds }, status: "confirmed" },
    { $set: { payoutId: null } },
    { session },
  );
}

/** A batch's totals after a payout in it changed. @param {Session} session @param {any} batchId */
async function retotalBatch(session, batchId) {
  if (!batchId) return;
  const b = await PayoutBatch.findById(batchId, null, { session });
  if (!b) return;
  const live = await Payout.find(
    { _id: { $in: b.payoutIds }, status: { $ne: "rejected" } },
    { points: 1, amount: 1 },
    { session },
  ).lean();
  b.points = live.reduce((sum, x) => sum + x.points, 0);
  b.amount = live.reduce((sum, x) => sum + x.amount, 0);
  await b.save({ session });
}

/**
 * Rejects a citizen's payouts not yet paid — their payouts were frozen or
 * their rewards ended (§7).
 * @param {Session} session @param {string} userId @param {string} by @param {string} reason
 */
export async function closeOpenPayouts(session, userId, by, reason) {
  const open = await Payout.find(
    { userId, status: { $in: ["requested", "batched", "failed"] } },
    null,
    { session },
  );
  for (const p of open) {
    await closePayout(session, p, by, reason);
    await retotalBatch(session, p.batchId);
  }
  return open.length;
}

/**
 * The case was decided (docs/16 §4, §5): each citizen report on it earns —
 * the lead report in full, a later report with its own evidence a quarter,
 * a plain duplicate nothing — subject to the checks of §3 and §7. A
 * warning's points are confirmed at once (D16-4). A report whose earlier
 * reward was reversed (dispute upheld, then decided again) earns afresh.
 * @param {Session} session @param {any} caseId
 */
export async function awardForCase(session, caseId) {
  const c = await Case.findById(caseId, null, { session }).lean();
  const outcome = c?.decision?.outcome?.outcome;
  if (!c?.decision || !outcome || !ENFORCEMENT.includes(outcome)) return 0;
  const reports = await Report.find({ _id: { $in: c.reportIds } }, null, { session })
    .sort({ receivedAt: 1 })
    .lean();
  if (!reports.some(fromCitizen)) return 0;

  const rules = await rulesAt(c.decision.at);
  const codes = c.decision.outcome.offenceCodes.length
    ? c.decision.outcome.offenceCodes
    : c.facts.offenceCodes;
  const offences = await OffenceVersion.find(
    { code: { $in: codes }, current: true },
    { code: 1, severity: 1 },
    { session },
  ).lean();
  const base = outcome === "warning" ? rules.warningPoints : casePoints(rules, offences);
  // The lead: the first report received with usable evidence (§5).
  const lead = reports.find((r) => r.evidenceIds.length > 0) ?? reports[0];

  let awarded = 0;
  for (const r of reports.filter(fromCitizen)) {
    const existing = await RewardEntry.findOne({ reportId: r._id, kind: "award" }, null, {
      session,
    });
    if (existing && existing.status !== "reversed") continue;
    const share =
      String(r._id) === String(lead?._id) ? LEAD_SHARE : r.evidenceIds.length ? EVIDENCE_SHARE : 0;
    const check = share
      ? await checkReport(session, c, r, rules)
      : /** @type {const} */ ({
          result: "not_eligible",
          message: LINES.duplicate,
          staff: "Duplicate report",
        });
    const now = new Date();
    const confirmed = outcome === "warning" && check.result !== "not_eligible";
    const fields = {
      userId: /** @type {string} */ (r.source?.userId),
      kind: "award",
      reportId: r._id,
      reportNumber: r.reportNumber,
      caseId: c._id,
      caseNumber: c.caseNumber,
      plate: c.facts.vehicleNumber ?? null,
      basePoints: base,
      share,
      points: check.result === "not_eligible" ? 0 : Math.round((base * share) / 100),
      status:
        check.result === "not_eligible" ? "not_eligible" : confirmed ? "confirmed" : "pending",
      reason: check.result === "not_eligible" ? check.message : null,
      hold: check.result === "held" ? { reason: check.staff, by: SYSTEM, at: now } : null,
      confirmedAt: confirmed ? now : null,
      expiresAt: confirmed ? await limitAt("rewards.points_expiry", now) : null,
      expiryWarnedAt: null,
    };
    const e = existing ?? new RewardEntry();
    e.set(fields);
    const note = check.result === "ok" ? `${OUTCOME_WORDS[outcome]}, share ${share}%` : check.staff;
    addEvent(e, check.result === "not_eligible" ? "not_eligible" : "earned", SYSTEM, note);
    if (check.result === "held") addEvent(e, "held", SYSTEM, check.staff);
    await e.save({ session });
    await tell(session, e);
    await refreshAccount(session, fields.userId);
    if (check.result !== "not_eligible") awarded += 1;
  }
  return awarded;
}

/** Entries of a case in some states. @param {Session} session @param {any} caseId @param {(typeof import("./reward.model.js").ENTRY_STATUSES)[number][]} statuses */
const caseEntries = (session, caseId, statuses) =>
  RewardEntry.find({ caseId, kind: "award", status: { $in: statuses } }, null, { session });

/**
 * The notice was paid or the court convicted: pending points are confirmed
 * (D16-2) and start their expiry period. Held points stay held.
 * @param {Session} session @param {any} caseId @param {string} why
 */
export async function confirmForCase(session, caseId, why) {
  const now = new Date();
  const expiresAt = await limitAt("rewards.points_expiry", now);
  const entries = await caseEntries(session, caseId, ["pending"]);
  for (const e of entries) {
    e.status = "confirmed";
    e.confirmedAt = now;
    e.expiresAt = expiresAt;
    addEvent(e, "confirmed", SYSTEM, why);
    await e.save({ session });
    await tell(session, e);
    await refreshAccount(session, e.userId);
  }
  return entries.length;
}

/**
 * A recorded receipt was reversed: the notice is unpaid again, so its
 * confirmed points go back to pending. Points already paid out stay paid.
 * @param {Session} session @param {any} caseId @param {string} why
 */
export async function unconfirmForCase(session, caseId, why) {
  const entries = await caseEntries(session, caseId, ["confirmed"]);
  for (const e of entries) {
    e.status = "pending";
    e.confirmedAt = null;
    e.expiresAt = null;
    addEvent(e, "unconfirmed", SYSTEM, why);
    await e.save({ session });
    await tell(session, e);
    await refreshAccount(session, e.userId);
  }
  return entries.length;
}

/**
 * The outcome changed (§4): notice withdrawn, acquittal, decision
 * overturned. Pending and confirmed points are reversed; points already paid
 * out are recovered from future rewards (§10) — never debited.
 * @param {Session} session @param {any} caseId @param {string} why
 */
export async function reverseForCase(session, caseId, why) {
  const entries = await caseEntries(session, caseId, ["pending", "confirmed", "paid"]);
  for (const e of entries) await reverseEntry(session, e, SYSTEM, why);
  return entries.length;
}

/**
 * Reverses one award; a paid one gets a recovery entry instead.
 * @param {Session} session @param {Entry} e @param {string} by @param {string} why
 * @param {string} [message] what the citizen reads (default: the outcome changed)
 */
export async function reverseEntry(session, e, by, why, message = LINES.reversed()) {
  if (e.status === "paid") {
    if (e.recoveredBy) return;
    const [recovery] = await RewardEntry.create(
      [
        {
          userId: e.userId,
          kind: "recovery",
          reportId: e.reportId,
          reportNumber: e.reportNumber,
          caseId: e.caseId,
          caseNumber: e.caseNumber,
          plate: e.plate,
          basePoints: e.basePoints,
          share: e.share,
          points: -e.points,
          status: "confirmed",
          confirmedAt: new Date(),
          history: [{ at: new Date(), event: "recovery", by, note: why }],
        },
      ],
      { session },
    );
    e.recoveredBy = recovery?._id ?? null;
    addEvent(e, "recovered", by, why);
    await e.save({ session });
    if (recovery) await tell(session, recovery);
  } else if (e.status === "pending" || e.status === "confirmed") {
    if (e.payoutId) await detachFromPayout(session, e, by);
    e.status = "reversed";
    e.reason = message;
    e.expiresAt = null;
    addEvent(e, "reversed", by, why);
    await e.save({ session });
    await tell(session, e);
  } else return;
  await refreshAccount(session, e.userId);
}

/**
 * Fabricated evidence (§7): the citizen's pending points are cancelled and
 * their payouts frozen for HQ to review; a second time ends their rewards.
 * Flagging the reporter stays with the triage rule (docs/02 §10: three false
 * or abusive reports in 90 days).
 * @param {Session} session @param {string} userId @param {string} reportNumber @param {string} by
 */
export async function penaliseFabricated(session, userId, reportNumber, by) {
  const pending = await RewardEntry.find({ userId, kind: "award", status: "pending" }, null, {
    session,
  });
  for (const e of pending)
    await reverseEntry(session, e, by, `Fabricated evidence on ${reportNumber}`, LINES.fabricated);
  const account = await ReporterAccount.findOne({ userId }, { rewards: 1 }, { session }).lean();
  const count = (account?.rewards?.fabricatedCount ?? 0) + 1;
  const now = new Date();
  await ReporterAccount.updateOne(
    { userId },
    {
      $set: {
        "rewards.fabricatedCount": count,
        "rewards.frozen": true,
        "rewards.excluded": count >= 2 || Boolean(account?.rewards?.excluded),
        "rewards.reason":
          count >= 2
            ? `Fabricated evidence again (${reportNumber}): excluded from rewards`
            : `Fabricated evidence (${reportNumber}): payouts frozen for review`,
        "rewards.changedAt": now,
        "rewards.changedBy": by,
      },
    },
    { session, upsert: true, setDefaultsOnInsert: true },
  );
  await closeOpenPayouts(
    session,
    userId,
    by,
    "Payouts are on hold while your account is reviewed.",
  );
  await refreshAccount(session, userId);
}

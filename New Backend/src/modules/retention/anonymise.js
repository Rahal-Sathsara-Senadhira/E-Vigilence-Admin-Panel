// What happens to each record at the end of retention (docs/10 §6): its
// evidence files are deleted (the record of each, with its fingerprint and
// custody log, stays), and the personal data in it is replaced. Counts,
// dates, offences and outcomes stay, for statistics.

import { Case } from "../cases/index.js";
import { CourtCase } from "../court/court.model.js";
import { Evidence } from "../evidence/index.js";
import { Notice } from "../notices/index.js";
import { Payment } from "../payments/payment.model.js";
import { Person } from "../registers/registers.model.js";
import { Report } from "../reports/report.model.js";

/** @typedef {import("mongoose").ClientSession} Session */
/** @typedef {import("#src/core/storage.js").Storage} Storage */

export const REMOVED = "(Removed at the end of the retention period.)";
const BY = "Data retention";

/**
 * Deletes the files of evidence items, outside any transaction (storage
 * isn't transactional): a file already gone is fine, so a retry is safe.
 * @param {Storage} storage @param {any[]} ids
 */
export async function deleteFiles(storage, ids) {
  const items = await Evidence.find(
    { _id: { $in: ids }, deletedAt: null },
    { originalKey: 1, viewKey: 1 },
  ).lean();
  for (const e of items) {
    await storage.remove(e.originalKey);
    if (e.viewKey !== e.originalKey) await storage.remove(e.viewKey);
  }
  return items.map((e) => e._id);
}

/** Marks evidence deleted, with the rule, in the custody log (§3.2). @param {Session} session @param {any[]} ids @param {string} rule */
export async function markEvidenceDeleted(session, ids, rule) {
  const now = new Date();
  await Evidence.updateMany(
    { _id: { $in: ids }, deletedAt: null },
    {
      $set: { deletedAt: now, deletedRule: rule },
      $push: { custody: { at: now, event: "deleted", by: BY, note: rule } },
    },
    { session },
  );
}

/** All evidence of a case and its reports. @param {any} c @param {Session} [session] */
export async function evidenceOfCase(c, session) {
  const reports = await Report.find(
    { _id: { $in: c.reportIds } },
    { evidenceIds: 1 },
    { session },
  ).lean();
  return [...(c.evidenceIds ?? []), ...reports.flatMap((r) => r.evidenceIds ?? [])];
}

/** @param {string} rule */
const mark = (rule) => ({ retention: { at: new Date(), rule } });

/** A report: who sent it and what they wrote go; what was reported stays. @param {Session} session @param {any} id @param {string} rule */
export async function anonymiseReport(session, id, rule) {
  await Report.updateOne(
    { _id: id },
    {
      $set: {
        "reporter.name": null,
        "reporter.phone": null,
        "reporter.citizenId": null,
        description: REMOVED,
        vehicleNumber: null,
        vehicleDescription: null,
        address: null,
        "triage.question": null,
        "triage.note": null,
        "triage.replies": [],
        ...mark(rule),
      },
    },
    { session },
  );
  // Reports from the app also lose the link to the citizen's account.
  await Report.updateOne(
    { _id: id, source: { $ne: null } },
    { $set: { "source.userId": null, "source.clientReportId": null } },
    { session },
  );
}

/** A case: the people in it and free text go; offences, dates and outcome stay. @param {Session} session @param {any} id @param {string} rule */
export async function anonymiseCase(session, id, rule) {
  const c = await Case.findById(id, null, { session });
  if (!c) return [];
  const people = [
    c.owner?.id,
    c.driver?.id,
    ...c.statements.map((s) => s.personId),
    ...c.recommendations.map((r) => r.addresseePerson?.id),
    c.decision?.outcome?.addresseePerson?.id,
  ].filter(Boolean);
  c.set({
    owner: null,
    driver: null,
    vehicle: null,
    "facts.vehicleNumber": null,
    "facts.address": null,
    noEvidenceReason: null,
  });
  for (const s of c.statements) s.set({ personId: null, name: "Removed", summary: REMOVED });
  for (const n of c.notes) n.text = REMOVED;
  /** @type {any[]} */
  const outcomes = [...c.recommendations, ...c.decisions.map((d) => d.outcome)];
  if (c.decision) outcomes.push(c.decision.outcome);
  for (const o of outcomes)
    o.set({ addresseePerson: null, justification: REMOVED, prosecutionSummary: null });
  c.set(mark(rule));
  await c.save({ session });
  for (const r of c.reportIds) await anonymiseReport(session, r, rule);
  return people;
}

/** A notice: the addressee's and the named driver's details go. @param {Session} session @param {any} id @param {string} rule */
export async function anonymiseNotice(session, id, rule) {
  const n = await Notice.findById(id, null, { session });
  if (!n) return [];
  const people = [n.addressee.personId];
  n.set({
    "addressee.name": "Removed",
    "addressee.address": "Removed",
    "addressee.phone": null,
    vehicle: { plate: null, description: null },
    place: null,
    ...mark(rule),
  });
  if (n.nomination) {
    /** @type {any} */ (n.nomination).set({
      driver: { name: "Removed", nic: null, licenceNumber: null, address: "Removed", phone: null },
      statement: null,
    });
  }
  if (n.dispute) n.dispute.explanation = REMOVED;
  await n.save({ session });
  await Payment.updateMany({ noticeId: n._id }, { $set: { payerName: null } }, { session });
  return people;
}

/** A court case: the accused's details and the prosecution's text go. @param {Session} session @param {any} id @param {string} rule */
export async function anonymiseCourtCase(session, id, rule) {
  const cc = await CourtCase.findById(id, null, { session });
  if (!cc) return [];
  const people = [cc.accused?.personId].filter(Boolean);
  if (cc.accused) /** @type {any} */ (cc.accused).set({ name: "Removed", address: null });
  cc.summary = REMOVED;
  for (const h of cc.hearings) h.notes = null;
  cc.set(mark(rule));
  await cc.save({ session });
  return people;
}

/** Whether a case, notice or court case still in retention names the person. @param {Session} session @param {string} id */
async function stillLinked(session, id) {
  const onCase = await Case.exists({
    retention: null,
    $or: [
      { "owner.id": id },
      { "driver.id": id },
      { "statements.personId": id },
      { "recommendations.addresseePerson.id": id },
    ],
  }).session(session);
  if (onCase) return true;
  if (await Notice.exists({ retention: null, "addressee.personId": id }).session(session))
    return true;
  return Boolean(
    await CourtCase.exists({ retention: null, "accused.personId": id }).session(session),
  );
}

/**
 * A person whose every case, notice and court case has been anonymised:
 * their details go too. The record stays so links don't break.
 * @param {Session} session @param {any[]} ids
 */
export async function anonymiseUnlinkedPeople(session, ids) {
  let done = 0;
  for (const id of new Set(ids.map(String))) {
    if (await stillLinked(session, id)) continue;
    const r = await Person.updateOne(
      { _id: id, anonymisedAt: null },
      {
        $set: {
          name: "Removed",
          nic: null,
          businessRegNo: null,
          licenceNumber: null,
          address: null,
          phone: null,
          changes: [],
          anonymisedAt: new Date(),
        },
      },
      { session },
    );
    done += r.modifiedCount;
  }
  return done;
}

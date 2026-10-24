// When points are recorded and removed — docs/08 §4. Each rule follows one
// audit action, in the change's own transaction (as rewards do).

import { onAuditRecorded } from "#src/core/audit/audit.js";
import { CourtCase } from "../court/court.model.js";
import { Notice, provideNoticePoints } from "../notices/index.js";
import {
  pointsOnNotice,
  recordForCourtCase,
  recordForNotice,
  removeFor,
} from "./demerit.service.js";

/** @typedef {import("#src/core/audit/audit.js").RecordedEntry} Entry */
/** @typedef {import("mongoose").ClientSession} Session */

const SYSTEM = "system";

/** A refund removes the points when the notice is no longer paid. @param {Entry} e @param {Session} s */
async function refunded(e, s) {
  const n = await Notice.findById(e.target.id, { status: 1 }, { session: s }).lean();
  if (n && n.status !== "paid") await removeFor(s, n._id, "Refunded", e.actor.name);
}

/** @type {Record<string, (e: Entry, session: Session) => Promise<unknown>>} */
const RULES = {
  // Paying accepts the offence (§4): recorded by the system.
  "payments.received": (e, s) => recordForNotice(s, e.target.id, SYSTEM),
  "payments.receipt_recorded": (e, s) => recordForNotice(s, e.target.id, SYSTEM),
  // The payment is undone: the points go.
  "payments.receipt_reversed": (e, s) =>
    removeFor(s, e.target.id, "Receipt reversed", e.actor.name),
  "payments.refunded": (e, s) => refunded(e, s),
  // Automatic refunds too — unless the notice stays paid (a double payment).
  "payments.refunded_automatically": (e, s) => refunded(e, s),
  // A conviction, recorded by the officer who confirmed it (§6).
  "court.verdict_confirmed": async (e, s) => {
    const cc = await CourtCase.findById(e.target.id, { verdict: 1 }, { session: s }).lean();
    if (cc?.verdict?.result === "convicted") await recordForCourtCase(s, cc._id, e.actor.name);
  },
  // An appeal changes the result: points follow it (§9).
  "court.appeal_decided": async (e, s) => {
    const cc = await CourtCase.findById(e.target.id, { appeal: 1 }, { session: s }).lean();
    if (cc?.appeal?.result !== "changed") return;
    if (cc.appeal.newVerdict === "convicted") await recordForCourtCase(s, cc._id, e.actor.name);
    else await removeFor(s, cc._id, `Appeal: ${cc.appeal.newVerdict}`, e.actor.name);
  },
};

onAuditRecorded(async (entry, session) => {
  const rule = RULES[entry.action];
  if (rule && entry.target.id) await rule(entry, session);
});

// The notice and the payment page show the points a notice carries (§8).
provideNoticePoints(pointsOnNotice);

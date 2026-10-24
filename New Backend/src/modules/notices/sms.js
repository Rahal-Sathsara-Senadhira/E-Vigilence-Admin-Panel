// SMS to addressees — docs/09 §5.4, D09-5: the notice number, reminders and
// payment receipts. Messages are queued in the outbox by the change that
// causes them (so a rolled-back change sends nothing); this job sends them.
//
// There is no SMS provider yet. The simulator stands in for one, as the
// payment simulator does (docs/07): it accepts any Sri Lankan mobile number
// and returns a reference, so the whole flow runs and can be checked.

import { randomUUID } from "node:crypto";
import { OutboxMessage } from "./notice.model.js";

/** The one sender name addressees see (docs/09 N5). */
export const SENDER = "Sri Lanka Police — E-Vigilance";

/**
 * @typedef {object} SmsGateway
 * @property {string} name
 * @property {(m: { from: string, to: string, text: string }) => Promise<{ ok: true, reference: string } | { ok: false, error: string }>} send
 */

const MOBILE = /^(?:\+94|0)7\d{8}$/;

/** @type {SmsGateway} */
export const smsSimulator = {
  name: "SMS simulator",
  async send({ to }) {
    if (!MOBILE.test(to.replace(/[\s-]/g, ""))) return { ok: false, error: "not_a_mobile_number" };
    return { ok: true, reference: `SMS-${randomUUID().slice(0, 8).toUpperCase()}` };
  },
};

let gateway = smsSimulator;
/** Replaces the gateway — a real provider later; failures in tests. @param {SmsGateway} g */
export function useSmsGateway(g) {
  gateway = g;
}

/**
 * Sends queued SMS, oldest first. A message cancelled meanwhile (the notice
 * was paid) stays cancelled. A number the gateway refuses is marked failed,
 * with the reason, for the station to see on the notice.
 * @param {number} [batch]
 */
export async function runSmsDispatch(batch = 100) {
  const queued = await OutboxMessage.find({ channel: "sms", status: "queued" })
    .sort({ createdAt: 1 })
    .limit(batch)
    .lean();
  let sent = 0;
  let failed = 0;
  for (const m of queued) {
    const r = await gateway.send({ from: SENDER, to: m.to, text: m.text ?? "" });
    const set = r.ok
      ? { status: "sent", sentAt: new Date(), sentBy: gateway.name, reference: r.reference }
      : { status: "failed", sentBy: gateway.name, error: r.error };
    const done = await OutboxMessage.updateOne({ _id: m._id, status: "queued" }, { $set: set });
    if (done.modifiedCount === 0) continue;
    if (r.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

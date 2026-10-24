// The shape of a payment in responses, with what the viewer may do (S3, S4).

import { scopeOf } from "#src/core/access/permissions.js";

const iso = (/** @type {any} */ d) => (d ? new Date(d).toISOString() : null);

/** @param {any} p @param {NonNullable<import("express").Request["auth"]>} actor */
export const paymentView = (p, actor) => ({
  id: String(p._id),
  reference: p.reference ?? null,
  channel: p.channel,
  method: p.method ?? null,
  status: p.status,
  failureReason: p.failureReason ?? null,
  noticeId: String(p.noticeId),
  noticeNumber: p.noticeNumber,
  caseId: String(p.caseId),
  amount: p.amount,
  payerName: p.payerName ?? null,
  receivedAt: iso(p.receivedAt),
  recordedBy: p.recordedBy?.name ?? null,
  receipt: p.receipt ? { number: p.receipt.number, paidOn: iso(p.receipt.paidOn) } : null,
  review: p.review
    ? {
        result: p.review.result,
        reason: p.review.reason ?? null,
        by: p.review.by?.name,
        at: iso(p.review.at),
      }
    : null,
  refund: p.refund
    ? {
        status: p.refund.status,
        reason: p.refund.reason,
        automatic: Boolean(p.refund.automatic),
        dueAt: iso(p.refund.dueAt),
        approvedBy: p.refund.approvedBy?.name ?? null,
        refundedAt: iso(p.refund.refundedAt),
        reference: p.refund.reference ?? null,
      }
    : null,
  flags: p.flags ?? [],
  createdAt: iso(p.createdAt),
  history: (p.history ?? []).map((/** @type {any} */ h) => ({
    at: iso(h.at),
    event: h.event,
    by: h.by,
    note: h.note ?? null,
  })),
  can: {
    review:
      scopeOf(actor.role, "payments.reviewReceipt") === "N" &&
      p.channel === "receipt" &&
      p.status === "succeeded" &&
      !p.review &&
      String(p.recordedBy?.id) !== String(actor.userId),
    approveRefund:
      scopeOf(actor.role, "payments.approveRefund") === "N" &&
      p.refund?.status === "due" &&
      p.refund?.preparedBy !== actor.name,
  },
});

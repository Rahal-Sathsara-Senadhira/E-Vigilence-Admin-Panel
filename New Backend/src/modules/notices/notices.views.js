// The shape of a notice in responses. The addressee's address is shown in
// full only to roles that may see people (docs/10 §5.3: town otherwise).

const iso = (/** @type {any} */ d) => (d ? new Date(d).toISOString() : null);
/** @param {string} a */
const townOf = (a) => a.split(",").at(-1)?.trim() ?? a;

/**
 * The next date that matters on a notice, for the clock on screens.
 * @param {any} n
 * @returns {{ kind: "post" | "reserve" | "due" | "final" | "review", at: string } | null}
 */
function nextDate(n) {
  if (n.status === "issued" && n.postBy) return { kind: "post", at: iso(n.postBy) ?? "" };
  if (n.status === "service_failed" && n.service?.reserveBy)
    return { kind: "reserve", at: iso(n.service.reserveBy) ?? "" };
  if (n.status === "served" && n.dueDate) return { kind: "due", at: iso(n.dueDate) ?? "" };
  if (n.status === "disputed" && n.dispute?.reviewBy)
    return { kind: "review", at: iso(n.dispute.reviewBy) ?? "" };
  if (n.status === "overdue" && n.finalDueDate && !n.courtProposedAt)
    return { kind: "final", at: iso(n.finalDueDate) ?? "" };
  return null;
}

/** @param {any} n @param {boolean} showPeople */
export const noticeRowView = (n, showPeople) => ({
  id: String(n._id),
  noticeNumber: n.noticeNumber,
  kind: n.kind,
  status: n.status,
  caseId: String(n.caseId),
  caseNumber: n.caseNumber,
  addressee: showPeople ? n.addressee.name : "Recorded",
  town: townOf(n.addressee.address),
  plate: n.vehicle?.plate ?? null,
  amount: n.amount ?? null,
  issuedAt: iso(n.issuedAt),
  dueDate: iso(n.dueDate),
  courtProposed: Boolean(n.courtProposedAt),
  next: nextDate(n),
});

/**
 * @param {any} n
 * @param {{ showPeople: boolean, outbox: any[], can: Record<string, boolean> }} extra
 */
export const noticeView = (n, { showPeople, outbox, can }) => ({
  ...noticeRowView(n, showPeople),
  addresseeDetail: {
    personId: showPeople ? String(n.addressee.personId) : null,
    name: showPeople ? n.addressee.name : "Recorded",
    role: n.addressee.role,
    type: n.addressee.type,
    address: showPeople ? n.addressee.address : townOf(n.addressee.address),
    phone: showPeople ? (n.addressee.phone ?? null) : null,
  },
  vehicle: n.vehicle ?? null,
  occurredAt: iso(n.occurredAt),
  place: n.place ?? null,
  offences: n.offences ?? [],
  issuedBy: n.issuedBy,
  postBy: iso(n.postBy),
  servedAt: iso(n.servedAt),
  reminderSentAt: iso(n.reminderSentAt),
  finalDueDate: iso(n.finalDueDate),
  courtProposedAt: iso(n.courtProposedAt),
  courtConfirmedBy: n.courtConfirmedBy ?? null,
  nomination: n.nomination
    ? {
        at: iso(n.nomination.at),
        via: n.nomination.via,
        recordedBy: n.nomination.recordedBy ?? null,
        driver: showPeople
          ? n.nomination.driver
          : { name: "Recorded", nic: null, licenceNumber: null, address: null, phone: null },
        statement: n.nomination.statement ?? null,
        review: n.nomination.review
          ? { ...n.nomination.review, at: iso(n.nomination.review.at) }
          : null,
        childNoticeId: n.nomination.childNoticeId ? String(n.nomination.childNoticeId) : null,
      }
    : null,
  dispute: n.dispute
    ? {
        at: iso(n.dispute.at),
        via: n.dispute.via,
        recordedBy: n.dispute.recordedBy ?? null,
        grounds: n.dispute.grounds,
        explanation: n.dispute.explanation,
        reviewBy: iso(n.dispute.reviewBy),
        review: n.dispute.review ? { ...n.dispute.review, at: iso(n.dispute.review.at) } : null,
      }
    : null,
  parentNoticeId: n.parentNoticeId ? String(n.parentNoticeId) : null,
  withdrawal: n.withdrawal
    ? { at: iso(n.withdrawal.at), by: n.withdrawal.by, reason: n.withdrawal.reason }
    : null,
  attempts: (n.service?.attempts ?? []).map((/** @type {any} */ a) => ({
    postedAt: iso(a.postedAt),
    postedBy: a.postedBy,
    address: showPeople ? a.address : townOf(a.address),
    sms: Boolean(a.smsTo),
    result: a.result,
    note: a.note ?? null,
  })),
  outbox: outbox.map((m) => ({
    channel: m.channel,
    kind: m.kind,
    status: m.status,
    createdAt: iso(m.createdAt),
    sentAt: iso(m.sentAt),
  })),
  history: (n.history ?? []).map((/** @type {any} */ e) => ({
    at: iso(e.at),
    event: e.event,
    by: e.by,
    note: e.note ?? null,
  })),
  can,
});

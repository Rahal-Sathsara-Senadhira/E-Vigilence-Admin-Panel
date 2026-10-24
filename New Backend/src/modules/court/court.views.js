// The shape of a court case in responses.

const iso = (/** @type {any} */ d) => (d ? new Date(d).toISOString() : null);

/**
 * The next date that matters, for the clock on screens (docs/06 §8).
 * @param {any} cc
 * @returns {{ kind: "prepare" | "file" | "hearing", at: string } | null}
 */
function nextDate(cc) {
  if (cc.status === "referred" && cc.prepareBy)
    return { kind: "prepare", at: iso(cc.prepareBy) ?? "" };
  if (cc.status === "approved" && cc.fileBy) return { kind: "file", at: iso(cc.fileBy) ?? "" };
  const pending = (cc.hearings ?? []).find((/** @type {any} */ h) => !h.outcome);
  if (["filed", "hearing"].includes(cc.status) && pending)
    return { kind: "hearing", at: iso(pending.date) ?? "" };
  return null;
}

/**
 * @param {any} cc
 * @param {{ showPeople: boolean, can: Record<string, boolean> | null }} extra
 */
export const courtCaseView = (cc, { showPeople, can }) => ({
  id: String(cc._id),
  courtRef: cc.courtRef,
  status: cc.status,
  route: cc.route,
  caseId: String(cc.caseId),
  caseNumber: cc.caseNumber,
  noticeId: cc.noticeId ? String(cc.noticeId) : null,
  noticeNumber: cc.noticeNumber ?? null,
  accused: cc.accused
    ? {
        personId: showPeople ? String(cc.accused.personId) : null,
        name: showPeople ? cc.accused.name : "Recorded",
        address: showPeople ? (cc.accused.address ?? null) : null,
      }
    : null,
  court: cc.courtId ? { id: String(cc.courtId), name: cc.courtName } : null,
  courtCaseNumber: cc.courtCaseNumber ?? null,
  charges: cc.charges ?? [],
  summary: cc.summary ?? null,
  prosecutingOfficer: cc.prosecutingOfficer?.name ?? null,
  preparedBy: cc.preparedBy?.name ?? null,
  approvedBy: cc.approvedBy?.name ?? null,
  filedAt: iso(cc.filedAt),
  hearings: (cc.hearings ?? []).map((/** @type {any} */ h) => ({
    date: iso(h.date),
    outcome: h.outcome ?? null,
    notes: h.notes ?? null,
    nextDate: iso(h.nextDate),
    recordedBy: h.recordedBy ?? null,
  })),
  postponements: cc.postponements ?? 0,
  flaggedToHq: Boolean(cc.flaggedToHq),
  verdict: cc.verdict
    ? {
        result: cc.verdict.result,
        date: iso(cc.verdict.date),
        sentence: cc.verdict.sentence ?? null,
        fineAmount: cc.verdict.fineAmount ?? null,
        fineReceiptNumber: cc.verdict.fineReceiptNumber ?? null,
        recordedBy: cc.verdict.recordedBy?.name ?? null,
        confirmedBy: cc.verdict.confirmedBy?.name ?? null,
        confirmedAt: iso(cc.verdict.confirmedAt),
      }
    : null,
  appeal: cc.appeal
    ? {
        reference: cc.appeal.reference,
        filedAt: iso(cc.appeal.filedAt),
        result: cc.appeal.result,
        newVerdict: cc.appeal.newVerdict ?? null,
        decidedAt: iso(cc.appeal.decidedAt),
      }
    : null,
  withdrawal: cc.withdrawal
    ? { at: iso(cc.withdrawal.at), by: cc.withdrawal.by, reason: cc.withdrawal.reason }
    : null,
  next: nextDate(cc),
  createdAt: iso(cc.createdAt),
  history: (cc.history ?? []).map((/** @type {any} */ h) => ({
    at: iso(h.at),
    event: h.event,
    by: h.by,
    note: h.note ?? null,
  })),
  can,
});

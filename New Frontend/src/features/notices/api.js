// Penalty notices and warning letters — server state (docs/05).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.js";

/**
 * @typedef {object} NoticeRow
 * @property {string} id
 * @property {string} noticeNumber
 * @property {"penalty" | "warning"} kind
 * @property {keyof typeof import("./lib/labels.js").NOTICE_STATUS_LABELS} status
 * @property {string} caseId
 * @property {string} caseNumber
 * @property {string} addressee
 * @property {string} town
 * @property {string | null} plate
 * @property {number | null} amount
 * @property {number | null} [demeritPoints]
 * @property {string} issuedAt
 * @property {string | null} dueDate
 * @property {boolean} courtProposed
 * @property {{ kind: "post" | "reserve" | "due" | "final" | "review", at: string } | null} next
 */

/**
 * @typedef {NoticeRow & {
 *   addresseeDetail: { personId: string | null, name: string, role: string, type: string, address: string, phone: string | null },
 *   vehicle: { plate: string | null, description: string | null } | null,
 *   occurredAt: string, place: string | null,
 *   offences: { code: string, name: string, legalReference: string, fine: number | null }[],
 *   issuedBy: string, postBy: string | null, servedAt: string | null, reminderSentAt: string | null,
 *   finalDueDate: string | null, courtProposedAt: string | null, courtConfirmedBy: string | null,
 *   withdrawal: { at: string, by: string, reason: string } | null,
 *   nomination: { at: string, via: "online" | "station", recordedBy: string | null,
 *     driver: { name: string, nic: string | null, licenceNumber: string | null, address: string | null, phone: string | null },
 *     statement: string | null, review: { result: "accepted" | "rejected", reason: string | null, by: string, at: string } | null,
 *     childNoticeId: string | null } | null,
 *   dispute: { at: string, via: "online" | "station", recordedBy: string | null, grounds: string, explanation: string,
 *     reviewBy: string, review: { result: "upheld" | "rejected", reasons: string, by: string, at: string } | null } | null,
 *   parentNoticeId: string | null,
 *   attempts: { postedAt: string, postedBy: string, address: string, sms: boolean, result: string, note: string | null }[],
 *   outbox: { channel: "post" | "sms", kind: string, status: string, createdAt: string, sentAt: string | null, error: string | null }[],
 *   history: { at: string, event: string, by: string, note: string | null }[],
 *   can: { post: boolean, serviceFailed: boolean, reserve: boolean, withdraw: boolean, confirmCourt: boolean,
 *     recordNomination: boolean, recordDispute: boolean, reviewNomination: boolean, reviewDispute: boolean, disputeReviewBlocked: boolean },
 * }} NoticeRecord
 */

/** @param {{ view: string, q?: string, kind?: string, page: number, pageSize?: number }} filters */
export const useNotices = (filters) =>
  useQuery({
    queryKey: ["notices", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: NoticeRow[], total: number, page: number, pageSize: number }>} */ (
        api("/notices", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

/** @param {string | null} id */
export const useNotice = (id) =>
  useQuery({
    queryKey: ["notices", "one", id],
    queryFn: () => /** @type {Promise<NoticeRecord>} */ (api(`/notices/${id}`)),
    enabled: Boolean(id),
  });

/** @param {string} id */
export const useNoticeDocument = (id) =>
  useQuery({
    queryKey: ["notices", "document", id],
    queryFn: () =>
      /** @type {Promise<{ noticeNumber: string, kind: "penalty" | "warning", status: string, issuedAt: string,
       *   addressee: { name: string, address: string }, vehicle: { plate: string | null, description: string | null } | null,
       *   occurredAt: string, place: string | null, offences: NoticeRecord["offences"], amount: number | null,
       *   servedAt: string | null, dueDate: string | null,
       *   station: { name: string, address: string | null, phone: string | null } | null, photoIds: string[] }>} */ (
        api(`/notices/${id}/document`)
      ),
  });

/** @param {{ status?: string, channel?: string }} filters */
export const useOutbox = (filters) =>
  useQuery({
    queryKey: ["notices", "outbox", filters],
    queryFn: () =>
      /** @type {Promise<{ items: { id: string, noticeId: string, noticeNumber: string, channel: "post" | "sms", kind: string, to: string, text: string | null, status: string, error: string | null, createdAt: string }[] }>} */ (
        api("/notices/outbox", { query: filters })
      ),
  });

/** One action on a notice; notices and cases refresh after. @param {string} id */
export function useNoticeAction(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ action: string, body?: object }} input */
    mutationFn: ({ action, body }) =>
      api(`/notices/${id}/${action}`, { method: "POST", body: body ?? {} }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notices"] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]),
  });
}

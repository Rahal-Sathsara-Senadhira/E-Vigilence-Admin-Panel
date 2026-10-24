// Payments — server state (docs/07).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "@/lib/api.js";

/**
 * @typedef {object} PaymentRecord
 * @property {string} id
 * @property {string | null} reference
 * @property {"online" | "receipt"} channel
 * @property {keyof typeof import("./lib/labels.js").METHOD_LABELS | null} method
 * @property {"pending" | "succeeded" | "failed" | "reversed"} status
 * @property {string | null} failureReason
 * @property {string} noticeId
 * @property {string} noticeNumber
 * @property {string} caseId
 * @property {number} amount
 * @property {string | null} payerName
 * @property {string | null} receivedAt
 * @property {string | null} recordedBy
 * @property {{ number: string, paidOn: string } | null} receipt
 * @property {{ result: "confirmed" | "reversed", reason: string | null, by: string, at: string } | null} review
 * @property {{ status: "due" | "refunded", reason: string, automatic: boolean, dueAt: string, approvedBy: string | null, refundedAt: string | null, reference: string | null } | null} refund
 * @property {string[]} flags
 * @property {string} createdAt
 * @property {{ at: string, event: string, by: string, note: string | null }[]} history
 * @property {{ review: boolean, approveRefund: boolean }} can
 */

/** @param {{ view: string, q?: string, page: number, pageSize?: number }} filters */
export const usePayments = (filters) =>
  useQuery({
    queryKey: ["payments", "list", filters],
    queryFn: () =>
      /** @type {Promise<{ items: PaymentRecord[], total: number, page: number, pageSize: number }>} */ (
        api("/payments", { query: { pageSize: 25, ...filters } })
      ),
    placeholderData: keepPreviousData,
  });

/** @param {string | null} id */
export const usePayment = (id) =>
  useQuery({
    queryKey: ["payments", "one", id],
    queryFn: () => /** @type {Promise<PaymentRecord>} */ (api(`/payments/${id}`)),
    enabled: Boolean(id),
  });

/** Review a receipt or approve a refund; payments, notices and cases refresh. @param {string} id */
export function usePaymentAction(id) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ action: "review" | "refund", body?: object }} input */
    mutationFn: ({ action, body }) =>
      api(`/payments/${id}/${action}`, { method: "POST", body: body ?? {} }),
    onSuccess: () =>
      Promise.all(
        ["payments", "notices", "cases"].map((k) =>
          queryClient.invalidateQueries({ queryKey: [k] }),
        ),
      ),
  });
}

/** Record a receipt, with its scan, for a notice. @param {string} noticeId */
export function useRecordReceipt(noticeId) {
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {{ file: File, fields: Record<string, string> }} input */
    mutationFn: ({ file, fields }) => apiUpload(`/payments/receipts/${noticeId}`, file, fields),
    onSuccess: () =>
      Promise.all(
        ["payments", "notices", "cases"].map((k) =>
          queryClient.invalidateQueries({ queryKey: [k] }),
        ),
      ),
  });
}

import type { NoticeDetail, NoticeListItem, OutboxMessageView, Paged } from "@ev/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";

export type NoticeView =
  "all" | "to_post" | "nominations" | "disputes" | "overdue" | "court_proposed" | "service_failed";

export const useNotices = (filter: { view: NoticeView; q?: string; page: number }) =>
  useQuery({
    queryKey: ["notices", filter],
    queryFn: () => api<Paged<NoticeListItem>>("/notices", { query: { ...filter, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

export const useNotice = (id: string) =>
  useQuery({ queryKey: ["notice", id], queryFn: () => api<NoticeDetail>(`/notices/${id}`) });

export const useCaseNotices = (caseId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["case-notices", caseId],
    queryFn: () => api<NoticeListItem[]>(`/cases/${caseId}/notices`),
    enabled,
  });

export const useOutbox = (page: number) =>
  useQuery({
    queryKey: ["outbox", page],
    queryFn: () => api<Paged<OutboxMessageView>>("/outbox", { query: { page, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

/** Posts one notice action and refreshes the notice, its case and the lists. */
export function useNoticeAction(notice: Pick<NoticeDetail, "id" | "caseId">, onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api<NoticeDetail & { summary: string }>(`/notices/${notice.id}/${path}`, {
        method: "POST",
        body: body ?? {},
      }),
    onSuccess: (res) => {
      for (const key of [
        ["notice", notice.id],
        ["notices"],
        ["case-notices", notice.caseId],
        ["case", notice.caseId],
        ["cases"],
        ["outbox"],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success(res.summary);
      onDone?.();
    },
  });
}

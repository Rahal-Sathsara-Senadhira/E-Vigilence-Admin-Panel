import type {
  CaseMatch,
  CustodyEventView,
  EvidenceView,
  OffenceView,
  Paged,
  ReportDetail,
  ReportListItem,
} from "@ev/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useOffences = (opts: { includeInactive?: boolean } = {}) =>
  useQuery({
    queryKey: ["offences", !!opts.includeInactive],
    queryFn: () =>
      api<OffenceView[]>("/offences", {
        query: { includeInactive: opts.includeInactive ? "true" : undefined },
      }),
    staleTime: 10 * 60_000,
  });

/** code → offence, for showing names next to codes. */
export function useOffenceMap() {
  const { data } = useOffences({ includeInactive: true });
  return new Map((data ?? []).map((o) => [o.code, o]));
}

export interface ReportsFilter {
  view: "queue" | "needs_info" | "station_review" | "pending_station" | "all";
  q?: string;
  channel?: string;
  status?: string;
  page: number;
}

export const useReports = (filter: ReportsFilter) =>
  useQuery({
    queryKey: ["reports", filter],
    queryFn: () => api<Paged<ReportListItem>>("/reports", { query: { ...filter, pageSize: 25 } }),
    placeholderData: keepPreviousData,
    refetchInterval: filter.view === "queue" ? 30_000 : false,
  });

export const useReport = (id: string) =>
  useQuery({ queryKey: ["report", id], queryFn: () => api<ReportDetail>(`/reports/${id}`) });

export const useMatches = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["report-matches", id],
    queryFn: () => api<CaseMatch[]>(`/reports/${id}/matches`),
    enabled,
  });

export const useReportEvidence = (reportId: string) =>
  useQuery({
    queryKey: ["evidence", reportId],
    queryFn: () => api<EvidenceView[]>("/evidence", { query: { reportId } }),
    // Videos are processed after upload; check again until they're ready.
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === "processing") ? 5_000 : false),
  });

export const useCustody = (evidenceId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["custody", evidenceId],
    queryFn: () => api<CustodyEventView[]>(`/evidence/${evidenceId}/custody`),
    enabled,
  });
